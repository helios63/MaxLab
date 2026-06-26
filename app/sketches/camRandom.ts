// Camera snapshot physics: grabs a frame every 2s, wraps it in a random mask shape,
// and drops it as a Matter.js rigid body that falls and stacks at the bottom.

import Matter from 'matter-js'

type MaskShape = 'circle' | 'square' | 'rounded-square' | 'triangle' | 'diamond' | 'hexagon'

interface CamBody {
  body: Matter.Body
  mask: MaskShape
  image: HTMLCanvasElement | null
  size: number
  alpha: number
  fallbackHue: number
}

function triVerts(r: number) {
  const s32 = Math.sqrt(3) / 2
  return [
    { x: 0, y: -r },
    { x: r * s32, y: r / 2 },
    { x: -r * s32, y: r / 2 },
  ]
}

function hexVerts(r: number) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = Math.PI / 2 + (i * Math.PI * 2) / 6
    return { x: r * Math.cos(a), y: r * Math.sin(a) }
  })
}

function buildShapePath(ctx: CanvasRenderingContext2D, mask: MaskShape, half: number) {
  ctx.beginPath()
  switch (mask) {
    case 'circle':
      ctx.arc(0, 0, half, 0, Math.PI * 2)
      break
    case 'square':
      ctx.rect(-half, -half, half * 2, half * 2)
      break
    case 'rounded-square': {
      const r = half * 0.4
      ctx.moveTo(-half + r, -half)
      ctx.lineTo(half - r, -half)
      ctx.arcTo(half, -half, half, -half + r, r)
      ctx.lineTo(half, half - r)
      ctx.arcTo(half, half, half - r, half, r)
      ctx.lineTo(-half + r, half)
      ctx.arcTo(-half, half, -half, half - r, r)
      ctx.lineTo(-half, -half + r)
      ctx.arcTo(-half, -half, -half + r, -half, r)
      ctx.closePath()
      break
    }
    case 'triangle': {
      const v = triVerts(half)
      ctx.moveTo(v[0]!.x, v[0]!.y)
      ctx.lineTo(v[1]!.x, v[1]!.y)
      ctx.lineTo(v[2]!.x, v[2]!.y)
      ctx.closePath()
      break
    }
    case 'diamond':
      ctx.moveTo(0, -half)
      ctx.lineTo(half, 0)
      ctx.lineTo(0, half)
      ctx.lineTo(-half, 0)
      ctx.closePath()
      break
    case 'hexagon': {
      const v = hexVerts(half)
      ctx.moveTo(v[0]!.x, v[0]!.y)
      for (let i = 1; i < v.length; i++) ctx.lineTo(v[i]!.x, v[i]!.y)
      ctx.closePath()
      break
    }
  }
}

export default function camRandom(container: HTMLElement) {
  return (p: any) => {
    const engine = Matter.Engine.create({ enableSleeping: true })
    engine.gravity.y = 1.5

    const bodies: CamBody[] = []
    let videoEl: HTMLVideoElement | null = null
    let cameraReady = false
    let mediaStream: MediaStream | null = null
    let facingMode: 'environment' | 'user' = 'environment'
    let lastCaptureMs = -500 // triggers an immediate spawn on first frame
    const CAPTURE_INTERVAL = 500
    const MAX_BODIES = 28

    const ALL_MASKS: MaskShape[] = ['circle', 'square', 'rounded-square', 'triangle', 'diamond', 'hexagon']

    async function setupCamera() {
      videoEl = document.createElement('video')
      videoEl.autoplay = true
      videoEl.muted = true
      videoEl.playsInline = true
      videoEl.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none'
      container.appendChild(videoEl)

      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        videoEl.srcObject = mediaStream
        await videoEl.play()
        cameraReady = true
      } catch {
        // Camera denied or unavailable — shapes render with solid-color fallback
      }
    }

    async function switchCamera() {
      const next: 'environment' | 'user' = facingMode === 'environment' ? 'user' : 'environment'
      cameraReady = false
      mediaStream?.getTracks().forEach(t => t.stop())
      if (!videoEl) return
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { exact: next }, width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        videoEl.srcObject = mediaStream
        await videoEl.play()
        facingMode = next
        cameraReady = true
      } catch {
        // Device doesn't have that camera — restore previous stream
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
          })
          videoEl.srcObject = mediaStream
          await videoEl.play()
          cameraReady = true
        } catch { /* give up */ }
      }
    }

    function captureFrame(): HTMLCanvasElement | null {
      if (!cameraReady || !videoEl || !videoEl.videoWidth || !videoEl.videoHeight) return null
      const MAX = 512
      const aspect = videoEl.videoWidth / videoEl.videoHeight
      const w = aspect >= 1 ? MAX : Math.round(MAX * aspect)
      const h = aspect >= 1 ? Math.round(MAX / aspect) : MAX
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d')!.drawImage(videoEl, 0, 0, w, h)
      return canvas
    }

    function makeMatterBody(mask: MaskShape, x: number, y: number, size: number): Matter.Body {
      const half = size / 2
      const opts: any = {
        restitution: p.random(0.1, 0.45),
        friction: p.random(0.3, 0.7),
        frictionAir: 0.018,
        density: 0.004,
        sleepThreshold: 60,
      }
      switch (mask) {
        case 'circle':
          return Matter.Bodies.circle(x, y, half, opts)
        case 'square':
          return Matter.Bodies.rectangle(x, y, size, size, opts)
        case 'rounded-square':
          return Matter.Bodies.rectangle(x, y, size, size, { ...opts, chamfer: { radius: size * 0.2 } })
        case 'triangle':
          return Matter.Bodies.fromVertices(x, y, triVerts(half) as any, opts)
        case 'diamond':
          return Matter.Bodies.fromVertices(
            x, y,
            [{ x: 0, y: -half }, { x: half, y: 0 }, { x: 0, y: half }, { x: -half, y: 0 }] as any,
            opts,
          )
        case 'hexagon':
          return Matter.Bodies.fromVertices(x, y, hexVerts(half) as any, opts)
      }
    }

    function spawnBody() {
      if (bodies.length >= MAX_BODIES) {
        Matter.World.remove(engine.world, bodies.shift()!.body)
        // Wake all sleeping bodies so they react to the removed support
        for (const cb of bodies) {
          if (cb.body.isSleeping) Matter.Sleeping.set(cb.body, false)
        }
      }

      const size = p.random(80, Math.min(p.width, p.height) * 0.32)
      const mask = p.random(ALL_MASKS) as MaskShape
      const x = p.random(size / 2 + 10, p.width - size / 2 - 10)
      const y = -size / 2 - 10

      const body = makeMatterBody(mask, x, y, size)
      Matter.Body.setAngularVelocity(body, p.random(-0.05, 0.05))
      Matter.World.add(engine.world, body)

      bodies.push({
        body, mask,
        image: captureFrame(),
        size, alpha: 1,
        fallbackHue: p.random(360),
      })
    }

    function drawCamBody(cb: CamBody) {
      const ctx = p.drawingContext as CanvasRenderingContext2D
      const { x, y } = cb.body.position
      const half = cb.size / 2

      // Image clipped to shape
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(cb.body.angle)
      ctx.globalAlpha = cb.alpha
      buildShapePath(ctx, cb.mask, half)
      ctx.clip()

      if (cb.image) {
        const aspect = cb.image.width / cb.image.height
        const dw = aspect >= 1 ? cb.size * aspect : cb.size
        const dh = aspect >= 1 ? cb.size : cb.size / aspect
        ctx.drawImage(cb.image, -dw / 2, -dh / 2, dw, dh)
      } else {
        ctx.fillStyle = `hsl(${cb.fallbackHue}, 65%, 45%)`
        ctx.fillRect(-half, -half, cb.size, cb.size)
      }
      ctx.restore()

      // White border on top of the image
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(cb.body.angle)
      ctx.globalAlpha = cb.alpha * 0.55
      // ctx.strokeStyle = 'rgba(255,255,255,0.7)'
      // ctx.lineWidth = 2.5
      buildShapePath(ctx, cb.mask, half)
      ctx.stroke()
      ctx.restore()
    }

    function setupWalls() {
      Matter.World.add(engine.world, [
        Matter.Bodies.rectangle(p.width / 2, p.height + 25, p.width * 2, 50, { isStatic: true }),
        Matter.Bodies.rectangle(-25, p.height / 2, 50, p.height * 2, { isStatic: true }),
        Matter.Bodies.rectangle(p.width + 25, p.height / 2, 50, p.height * 2, { isStatic: true }),
      ])
    }

    p.setup = () => {
      p.createCanvas(container.offsetWidth, container.offsetHeight)
      p.frameRate(60)
      setupWalls()
      setupCamera()
    }

    p.switchCamera = () => { switchCamera() }

    p.resetDrawings = () => {
      for (const cb of bodies) Matter.World.remove(engine.world, cb.body)
      bodies.length = 0
      lastCaptureMs = -CAPTURE_INTERVAL
    }

    p.setHue = (_: number) => {}

    p.draw = () => {
      if (p.millis() - lastCaptureMs >= CAPTURE_INTERVAL) {
        spawnBody()
        lastCaptureMs = p.millis()
      }

      Matter.Engine.update(engine, 1000 / 60)

      // Remove bodies that fell far below the viewport
      for (let i = bodies.length - 1; i >= 0; i--) {
        if (bodies[i]!.body.position.y > p.height + 300) {
          Matter.World.remove(engine.world, bodies[i]!.body)
          bodies.splice(i, 1)
        }
      }

      p.background(10, 10, 18)
      for (const cb of bodies) drawCamBody(cb)
    }
  }
}
