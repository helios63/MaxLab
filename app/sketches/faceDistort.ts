// Selfie face distortion: uses the phone's front camera + MediaPipe's
// FaceDetector to locate face keypoints (eyes, nose, mouth), then jitters
// small tiles around a couple of randomly-chosen features at a time — as if
// the sound itself were tugging the face around. Louder input means bigger
// jitter and faster feature-switching; there's no hard-edged region, each
// tile's displacement fades smoothly to zero at its edge so nothing reads as
// a visible clip shape. A separate soft color wash over the whole viewport
// shifts blue (quiet) to red (loud).

import type { FaceDetector as FaceDetectorType } from '@mediapipe/tasks-vision'

const FFT_SIZE = 256
const SMOOTHING = 0.8
const VOLUME_SMOOTHING = 0.85 // how much the displayed volume lags the raw reading, so it swells/settles instead of jittering every frame
const DETECT_EVERY_MS = 90 // face detector runs on a timer rather than every draw frame — plenty responsive, much cheaper
const KEYPOINT_LERP = 0.3 // per-keypoint smoothing — detector output jitters a few px per frame

const TILE_SIZE = 10 // px, size of each warp tile
const MAX_TILE_AMPLITUDE = 42 // px of tile displacement at full volume
const MIN_FEATURE_LIFE_MS = 280
const MAX_FEATURE_LIFE_MS = 900

// BlazeFace short-range keypoint order: right eye, left eye, nose tip, mouth
// center, right ear, left ear. Ears are skipped — too far off-face to read
// as "the face" moving. Radius factors are deliberately generous (a good
// chunk of the face, not a pinprick) since the smoothstep falloff already
// tapers each region to nothing well before its edge.
const FEATURE_KEYPOINTS = [
  { index: 0, radiusFactor: 0.36 }, // right eye
  { index: 1, radiusFactor: 0.36 }, // left eye
  { index: 2, radiusFactor: 0.3 },  // nose
  { index: 3, radiusFactor: 0.46 }, // mouth
] as const

interface Keypoint { x: number, y: number }

interface WobbleFeature {
  cx: number
  cy: number
  radius: number
  phase: number
  freq: number
  ampMul: number
  bornMs: number
  lifeMs: number
}

type Stage = 'idle' | 'requesting' | 'ready' | 'denied'

export default function faceDistort(container: HTMLElement) {
  return (p: any) => {
    const originalRemove = p.remove.bind(p)

    let stage: Stage = 'idle'
    let errorMessage = ''

    let videoEl: HTMLVideoElement | null = null
    let stream: MediaStream | null = null

    let audioCtx: AudioContext | null = null
    let analyser: AnalyserNode | null = null
    let freqData: Uint8Array | null = null
    let volume = 0 // smoothed 0..1

    let faceDetector: FaceDetectorType | null = null
    let lastDetectMs = 0
    let hasFace = false
    let smoothedKeypoints: Keypoint[] | null = null

    const activeFeatures: WobbleFeature[] = []
    let nextFeatureAtMs = 0

    // Offscreen canvas the mirrored video frame is drawn to once per frame,
    // so both the plain draw and the warped tiles sample the same pixels
    // without re-touching the <video> element twice.
    const frame = document.createElement('canvas')
    const frameCtx = frame.getContext('2d')!

    async function start() {
      if (stage !== 'idle') return
      stage = 'requesting'
      try {
        videoEl = document.createElement('video')
        videoEl.autoplay = true
        videoEl.muted = true
        videoEl.playsInline = true
        videoEl.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none'
        container.appendChild(videoEl)

        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        })
        videoEl.srcObject = stream
        await videoEl.play()

        audioCtx = new AudioContext()
        const source = audioCtx.createMediaStreamSource(stream)
        analyser = audioCtx.createAnalyser()
        analyser.fftSize = FFT_SIZE
        analyser.smoothingTimeConstant = SMOOTHING
        source.connect(analyser)
        freqData = new Uint8Array(analyser.frequencyBinCount)

        const { FilesetResolver, FaceDetector } = await import('@mediapipe/tasks-vision')
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm',
        )
        faceDetector = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
            // CPU, not GPU: MediaPipe's WebGL delegate is flaky on a lot of
            // phone GPUs/mobile browsers and fails detection silently —
            // CPU is slower but actually detects a face reliably.
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          minDetectionConfidence: 0.5,
        })

        stage = 'ready'
      } catch (err) {
        errorMessage = err instanceof Error ? err.message : String(err)
        stage = 'denied'
      }
    }

    function readVolume() {
      if (!analyser || !freqData) return
      analyser.getByteFrequencyData(freqData)
      // Voice and room sound live mostly in the lower half of the spectrum;
      // averaging the full range dilutes it with near-silent high bins and
      // never reads as "loud" even when shouting, so only that band counts.
      const bandEnd = Math.max(1, Math.floor(freqData.length * 0.5))
      let sum = 0
      for (let i = 0; i < bandEnd; i++) sum += freqData[i]!
      const raw = sum / bandEnd / 255
      // Gentle perceptual curve + gain so normal speaking volume lands well
      // into the visible range instead of needing a shout to register.
      const boosted = Math.min(1, Math.pow(raw, 0.6) * 1.8)
      volume = volume * VOLUME_SMOOTHING + boosted * (1 - VOLUME_SMOOTHING)
    }

    function coverTransform(srcW: number, srcH: number, dstW: number, dstH: number) {
      const scale = Math.max(dstW / srcW, dstH / srcH)
      const dx = (dstW - srcW * scale) / 2
      const dy = (dstH - srcH * scale) / 2
      return { scale, dx, dy }
    }

    // Maps the detector's video-pixel-space keypoints into the mirrored,
    // cover-fit canvas coordinates the frame is actually drawn at, and
    // smooths them so tiles don't shake with per-frame detector jitter.
    function detectFace(nowMs: number) {
      if (!faceDetector || !videoEl || !videoEl.videoWidth) return
      if (nowMs - lastDetectMs < DETECT_EVERY_MS) return
      lastDetectMs = nowMs

      let det
      try {
        det = faceDetector.detectForVideo(videoEl, nowMs).detections[0]
      } catch {
        // A transient inference failure shouldn't permanently wedge
        // detection — just skip this round and try again next timer tick.
        return
      }
      hasFace = !!det
      if (!det) return

      const vw = videoEl.videoWidth
      const vh = videoEl.videoHeight
      const { scale, dx, dy } = coverTransform(vw, vh, p.width, p.height)

      const canvasPoints = det.keypoints.map((kp) => {
        // Mirror horizontally in source-video space before applying the cover transform.
        const mirroredX = vw - kp.x * vw
        return { x: mirroredX * scale + dx, y: kp.y * vh * scale + dy }
      })

      if (!smoothedKeypoints || smoothedKeypoints.length !== canvasPoints.length) {
        smoothedKeypoints = canvasPoints
      } else {
        smoothedKeypoints = smoothedKeypoints.map((prev, i) => ({
          x: p.lerp(prev.x, canvasPoints[i]!.x, KEYPOINT_LERP),
          y: p.lerp(prev.y, canvasPoints[i]!.y, KEYPOINT_LERP),
        }))
      }
    }

    // Draws the mirrored, cover-fit camera frame into the offscreen canvas.
    function updateFrameCanvas() {
      if (!videoEl || !videoEl.videoWidth) return
      if (frame.width !== p.width || frame.height !== p.height) {
        frame.width = p.width
        frame.height = p.height
      }
      const { scale, dx, dy } = coverTransform(videoEl.videoWidth, videoEl.videoHeight, p.width, p.height)
      frameCtx.save()
      frameCtx.translate(dx + videoEl.videoWidth * scale, dy)
      frameCtx.scale(-scale, scale)
      frameCtx.drawImage(videoEl, 0, 0)
      frameCtx.restore()
    }

    function faceScale(): number {
      if (!smoothedKeypoints || smoothedKeypoints.length < 4) return Math.min(p.width, p.height) * 0.3
      const eyeDist = p.dist(smoothedKeypoints[0]!.x, smoothedKeypoints[0]!.y, smoothedKeypoints[1]!.x, smoothedKeypoints[1]!.y)
      return eyeDist * 2.4 // rough face width from inter-eye distance
    }

    // Randomly swaps which face feature(s) are currently jittering — mouth
    // one moment, an eye the next — so the distortion reads as parts of the
    // face moving rather than one static warped blob. Cadence and odds of a
    // second concurrent feature both scale with volume.
    function scheduleFeatures(nowMs: number) {
      for (let i = activeFeatures.length - 1; i >= 0; i--) {
        if (nowMs - activeFeatures[i]!.bornMs > activeFeatures[i]!.lifeMs) activeFeatures.splice(i, 1)
      }

      if (!hasFace || !smoothedKeypoints || nowMs < nextFeatureAtMs) return

      const size = faceScale()
      const count = volume > 0.55 && p.random() < 0.35 ? 2 : 1
      for (let n = 0; n < count; n++) {
        const feature = p.random(FEATURE_KEYPOINTS)
        const kp = smoothedKeypoints[feature.index]
        if (!kp) continue
        activeFeatures.push({
          cx: kp.x,
          cy: kp.y,
          radius: size * feature.radiusFactor,
          phase: p.random(p.TWO_PI),
          freq: p.random(0.5, 1.1),
          ampMul: p.random(0.7, 1.3),
          bornMs: nowMs,
          lifeMs: p.random(MIN_FEATURE_LIFE_MS, MAX_FEATURE_LIFE_MS),
        })
      }
      while (activeFeatures.length > 3) activeFeatures.shift()

      nextFeatureAtMs = nowMs + p.random(180, 500) / (0.4 + volume)
    }

    // Displaces a grid of small tiles around each active feature. Each
    // tile's offset fades to zero via a smoothstep falloff on distance from
    // the feature center, so there is no hard edge anywhere — low-weight
    // tiles are simply skipped, leaving the already-drawn plain frame
    // underneath (identical to what a zero offset would have drawn).
    function drawDistortion(t: number) {
      if (activeFeatures.length === 0) return
      const ctx = p.drawingContext as CanvasRenderingContext2D

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const f of activeFeatures) {
        minX = Math.min(minX, f.cx - f.radius)
        minY = Math.min(minY, f.cy - f.radius)
        maxX = Math.max(maxX, f.cx + f.radius)
        maxY = Math.max(maxY, f.cy + f.radius)
      }
      const left = Math.max(0, Math.floor(minX / TILE_SIZE) * TILE_SIZE)
      const top = Math.max(0, Math.floor(minY / TILE_SIZE) * TILE_SIZE)
      const right = Math.min(p.width, Math.ceil(maxX / TILE_SIZE) * TILE_SIZE)
      const bottom = Math.min(p.height, Math.ceil(maxY / TILE_SIZE) * TILE_SIZE)

      for (let ty = top; ty < bottom; ty += TILE_SIZE) {
        for (let tx = left; tx < right; tx += TILE_SIZE) {
          const ccx = tx + TILE_SIZE / 2
          const ccy = ty + TILE_SIZE / 2

          let bestWeight = 0
          let bestOx = 0
          let bestOy = 0
          for (const f of activeFeatures) {
            const dx0 = ccx - f.cx
            const dy0 = ccy - f.cy
            const dist = Math.hypot(dx0, dy0)
            const w = Math.max(0, 1 - dist / f.radius)
            const weight = w * w * (3 - 2 * w) // smoothstep easing
            if (weight <= bestWeight) continue
            const amp = MAX_TILE_AMPLITUDE * volume * f.ampMul
            const ang = t * f.freq * 6 + f.phase
            bestWeight = weight
            bestOx = Math.cos(ang + dy0 * 0.06) * amp * weight
            bestOy = Math.sin(ang * 0.8 + dx0 * 0.06) * amp * weight * 0.6
          }

          if (bestWeight <= 0.02) continue
          ctx.drawImage(
            frame,
            tx, ty, TILE_SIZE, TILE_SIZE,
            tx + bestOx, ty + bestOy, TILE_SIZE, TILE_SIZE,
          )
        }
      }
    }

    // Soft full-viewport color push: "difference" blend so it reads as a
    // color shift rather than a flat tint, blue (quiet) -> red (loud).
    function drawColorWash() {
      const ctx = p.drawingContext as CanvasRenderingContext2D
      const hue = p.lerp(220, 0, volume)
      ctx.save()
      ctx.globalCompositeOperation = 'difference'
      ctx.globalAlpha = 0.12 + volume * 0.33
      ctx.fillStyle = `hsl(${hue}, 85%, 50%)`
      ctx.fillRect(0, 0, p.width, p.height)
      ctx.restore()
    }

    function drawPrompt(message: string) {
      p.background(6, 6, 10)
      p.noStroke()
      p.fill(255, 255, 255, 230)
      p.textAlign(p.CENTER, p.CENTER)
      p.textSize(Math.max(14, Math.min(p.width, p.height) * 0.032))
      p.text(message, p.width / 2, p.height / 2)
    }

    p.setup = () => {
      p.createCanvas(container.offsetWidth, container.offsetHeight)
      p.frameRate(60)
    }

    p.mousePressed = () => { start() }
    p.touchStarted = () => { start() }

    p.resetDrawings = () => {
      smoothedKeypoints = null
      activeFeatures.length = 0
      nextFeatureAtMs = 0
    }
    p.setHue = (_: number) => {}

    p.draw = () => {
      if (stage !== 'ready' || !videoEl || !videoEl.videoWidth) {
        const message = stage === 'requesting'
          ? 'requesting camera + microphone…'
          : stage === 'denied'
            ? `camera/mic access failed — ${errorMessage || 'reload to try again'}`
            : 'tap to start the selfie camera'
        drawPrompt(message)
        return
      }

      readVolume()
      updateFrameCanvas()
      detectFace(p.millis())
      scheduleFeatures(p.millis())

      const ctx = p.drawingContext as CanvasRenderingContext2D
      ctx.drawImage(frame, 0, 0)

      drawDistortion(p.millis() / 1000)
      drawColorWash()
    }

    p.remove = () => {
      stream?.getTracks().forEach(t => t.stop())
      audioCtx?.close()
      faceDetector?.close()
      originalRemove()
    }
  }
}
