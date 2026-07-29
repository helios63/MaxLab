// Mic-reactive square waves: listens to the device microphone and spawns
// square "pixels" at the center of the canvas that fly outward like a sound
// wave rippling out. The spectrum is split into three bands (bass/mid/treble)
// that each behave differently — bass throws big slow warm blocks, mid throws
// mid-sized green/yellow ones, treble throws small fast cool sparks that spin
// and render hollow — so loud low sounds and loud high sounds read visibly
// differently instead of everything looking the same. A sudden spike in a
// band (an onset, e.g. a kick or a clap) fires an evenly-spaced ring burst of
// extra-large squares instead of the usual scattered trickle.

const FFT_SIZE = 512
const SMOOTHING = 0.75
const VOLUME_THRESHOLD = 0.05 // ignores quiet room tone/background noise, only reacts to deliberate sound
const AMBIENT_SPAWN_EVERY = 3 // frames between ambient spawns per band, so sustained sound doesn't flood every frame at 60fps
const MAX_WAVES = 1000
const TRAIL_ALPHA = 40 // low alpha background overlay instead of a hard clear, so squares leave a brief trail
const MAX_SIZE_MUL = 5 // cap on how many times a square's spawn size it can grow to, so it never balloons to fill the viewport
const FADE_START_RATIO = 0.35 // squares start fading this fraction of the way to the edge, so they vanish well before reaching it
const ONSET_RATIO = 2 // band energy must exceed its rolling average by this factor to count as an onset
const ONSET_MARGIN = 0.07
const ONSET_COOLDOWN_FRAMES = 14 // minimum gap between bursts on the same band, so one loud moment doesn't retrigger every frame while it decays

interface Band {
  key: 'bass' | 'mid' | 'treble'
  minHz: number
  maxHz: number
  hueBase: number
  hueRange: number
  sizeMul: number
  speedMul: number
  spin: number
  hollow: boolean
  maxAmbient: number
  binStart: number
  binEnd: number
}

// Hz ranges follow typical audio-EQ band splits (not even fractions of the
// FFT's linearly-spaced bins — most musical/vocal energy sits under 2kHz, so
// slicing bins evenly would dump nearly everything into "bass").
const BANDS: Band[] = [
  { key: 'bass',   minHz: 20,   maxHz: 250,   hueBase: 5,   hueRange: 25, sizeMul: 2.4,  speedMul: 0.75, spin: 0.01, hollow: false, maxAmbient: 1, binStart: 0, binEnd: 0 },
  { key: 'mid',    minHz: 250,  maxHz: 2000,  hueBase: 80,  hueRange: 50, sizeMul: 1.2,  speedMul: 1.15, spin: 0.03, hollow: false, maxAmbient: 1, binStart: 0, binEnd: 0 },
  { key: 'treble', minHz: 2000, maxHz: 16000, hueBase: 195, hueRange: 90, sizeMul: 0.55, speedMul: 1.7,  spin: 0.09, hollow: true,  maxAmbient: 2, binStart: 0, binEnd: 0 },
]

interface WaveSquare {
  angle: number
  radius: number
  speed: number
  size: number
  maxSize: number
  growth: number
  rot: number
  spin: number
  hue: number
  sat: number
  light: number
  alpha: number
  hollow: boolean
}

type MicState = 'idle' | 'requesting' | 'ready' | 'denied'

export default function soundSquares(container: HTMLElement) {
  return (p: any) => {
    const originalRemove = p.remove.bind(p)

    let cell = 8
    const waves: WaveSquare[] = []
    const bandAvg: Record<Band['key'], number> = { bass: -1, mid: -1, treble: -1 }
    const bandCooldown: Record<Band['key'], number> = { bass: 0, mid: 0, treble: 0 }

    let stream: MediaStream | null = null
    let audioCtx: AudioContext | null = null
    let analyser: AnalyserNode | null = null
    let freqData: Uint8Array | null = null
    let micState: MicState = 'idle'

    async function startMic() {
      if (micState !== 'idle') return
      micState = 'requesting'
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        audioCtx = new AudioContext()
        const source = audioCtx.createMediaStreamSource(stream)
        analyser = audioCtx.createAnalyser()
        analyser.fftSize = FFT_SIZE
        analyser.smoothingTimeConstant = SMOOTHING
        source.connect(analyser)
        freqData = new Uint8Array(analyser.frequencyBinCount)

        const hzPerBin = audioCtx.sampleRate / 2 / analyser.frequencyBinCount
        for (const band of BANDS) {
          band.binStart = Math.max(0, Math.floor(band.minHz / hzPerBin))
          band.binEnd = Math.min(analyser.frequencyBinCount, Math.ceil(band.maxHz / hzPerBin))
        }

        micState = 'ready'
      } catch {
        micState = 'denied'
      }
    }

    function bandEnergy(data: Uint8Array, band: Band): number {
      let sum = 0
      for (let i = band.binStart; i < band.binEnd; i++) sum += data[i]!
      return sum / (band.binEnd - band.binStart) / 255
    }

    // Detects a sudden spike over the band's own rolling average (an onset,
    // e.g. a kick or a clap) rather than reacting to raw loudness, so a
    // sustained loud band doesn't just keep bursting every frame. A cooldown
    // further limits it to one burst per moment instead of retriggering on
    // every frame while the spike decays back toward the average.
    function detectOnset(key: Band['key'], energy: number): boolean {
      const avg = bandAvg[key]
      if (avg < 0) {
        bandAvg[key] = energy
        return false
      }
      const onset = bandCooldown[key] <= 0 && energy > avg * ONSET_RATIO + ONSET_MARGIN
      bandAvg[key] = avg * 0.9 + energy * 0.1
      bandCooldown[key] = Math.max(0, bandCooldown[key] - 1)
      if (onset) bandCooldown[key] = ONSET_COOLDOWN_FRAMES
      return onset
    }

    function spawnWave(band: Band, energy: number, angle: number, burst: boolean) {
      const sizeVariance = p.random(0.6, 1.6)
      const intensity = burst ? 1.6 : 0.8
      const size = cell * band.sizeMul * sizeVariance * (0.8 + energy * intensity)
      waves.push({
        angle,
        radius: cell,
        speed: (burst ? 3 : 1.2) * band.speedMul + energy * (burst ? 9 : 5),
        size,
        maxSize: size * MAX_SIZE_MUL,
        growth: p.random(-0.015, 0.01),
        rot: p.random(p.TWO_PI),
        spin: band.spin * p.random(0.6, 1.4) * (p.random() < 0.5 ? -1 : 1),
        hue: band.hueBase + p.random(band.hueRange),
        sat: 65 + p.random(20),
        light: 45 + energy * 25,
        alpha: 255,
        hollow: band.hollow,
      })
    }

    function spawnFromAudio() {
      const data = freqData!
      const ambientTick = p.frameCount % AMBIENT_SPAWN_EVERY === 0
      for (const band of BANDS) {
        const energy = bandEnergy(data, band)
        const onset = detectOnset(band.key, energy)

        if (ambientTick && energy > VOLUME_THRESHOLD) {
          const count = Math.min(band.maxAmbient, Math.ceil(energy * band.maxAmbient))
          for (let i = 0; i < count; i++) spawnWave(band, energy, p.random(p.TWO_PI), false)
        }

        if (onset) {
          // Evenly-spaced ring (with a little jitter) so a burst reads as one
          // coherent wavefront pulse instead of more random scatter.
          const burstCount = 6 + Math.round(energy * 10)
          for (let i = 0; i < burstCount; i++) {
            const angle = (i / burstCount) * p.TWO_PI + p.random(-0.15, 0.15)
            spawnWave(band, energy, angle, true)
          }
        }
      }
      while (waves.length > MAX_WAVES) waves.shift()
    }

    function stepAndDrawWaves() {
      const cx = p.width / 2
      const cy = p.height / 2
      const maxRadius = Math.hypot(p.width, p.height) / 2 + cell
      const fadeStart = maxRadius * FADE_START_RATIO

      for (let i = waves.length - 1; i >= 0; i--) {
        const w = waves[i]!
        w.radius += w.speed
        w.size = Math.min(w.maxSize, Math.max(2, w.size * (1 + w.growth)))
        w.rot += w.spin
        if (w.radius > fadeStart) {
          w.alpha -= 255 * (w.speed / (maxRadius - fadeStart))
        }
        if (w.radius > maxRadius || w.alpha <= 0) {
          waves.splice(i, 1)
          continue
        }
        const x = cx + Math.cos(w.angle) * w.radius
        const y = cy + Math.sin(w.angle) * w.radius
        const gx = Math.round(x / cell) * cell
        const gy = Math.round(y / cell) * cell

        p.push()
        p.translate(gx, gy)
        p.rotate(w.rot)
        if (w.hollow) {
          p.noFill()
          p.stroke(`hsla(${w.hue}, ${w.sat}%, ${w.light}%, ${w.alpha / 255})`)
          p.strokeWeight(Math.max(1, w.size * 0.12))
        } else {
          p.noStroke()
          p.fill(`hsla(${w.hue}, ${w.sat}%, ${w.light}%, ${w.alpha / 255})`)
        }
        p.rect(-w.size / 2, -w.size / 2, w.size, w.size)
        p.pop()
      }
    }

    function drawPrompt() {
      const pulse = 0.6 + 0.4 * Math.sin(p.frameCount * 0.05)
      p.noStroke()
      p.fill(255, 255, 255, micState === 'requesting' ? 150 : 220 * pulse)
      p.textAlign(p.CENTER, p.CENTER)
      p.textSize(Math.max(14, Math.min(p.width, p.height) * 0.03))
      const message = micState === 'requesting'
        ? 'requesting microphone access…'
        : micState === 'denied'
          ? 'microphone access denied — reload to try again'
          : 'click or tap anywhere to enable the microphone'
      p.text(message, p.width / 2, p.height / 2)
    }

    p.setup = () => {
      p.createCanvas(container.offsetWidth, container.offsetHeight)
      cell = Math.max(4, Math.round(Math.min(p.width, p.height) / 100))
      p.frameRate(60)
    }

    p.mousePressed = () => { startMic() }
    p.touchStarted = () => { startMic() }

    p.resetDrawings = () => { waves.length = 0 }

    let wasReady = false

    p.draw = () => {
      p.noStroke()
      const isReady = micState === 'ready' && analyser && freqData
      if (isReady) {
        // On the very first ready frame, hard-clear instead of the usual
        // translucent trail — otherwise the last opaque prompt frame lingers
        // as a ghost, since a single low-alpha overlay barely dents it.
        if (!wasReady) p.background(8, 8, 14)
        else { p.fill(8, 8, 14, TRAIL_ALPHA); p.rect(0, 0, p.width, p.height) }
        analyser.getByteFrequencyData(freqData)
        spawnFromAudio()
        stepAndDrawWaves()
      } else {
        p.background(8, 8, 14)
        drawPrompt()
      }
      wasReady = !!isReady
    }

    p.remove = () => {
      stream?.getTracks().forEach(t => t.stop())
      audioCtx?.close()
      originalRemove()
    }
  }
}
