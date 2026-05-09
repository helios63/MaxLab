// Physics clock: large shapes = hours, medium = minutes, small = seconds
// Each type gets a random hue; seconds reset each minute. Removed bodies dissolve.
// Physics powered by Matter.js for accurate polygon collision.

import Matter from 'matter-js'

type ShapeType = 'circle' | 'square' | 'rounded-square' | 'cross' | 'triangle' | 'rounded-triangle'
const ALL_SHAPES: ShapeType[] = ['circle', 'square', 'rounded-square', 'cross', 'triangle', 'rounded-triangle']

interface ShapeBody {
  body: Matter.Body
  shape: ShapeType
  colorH: number; colorS: number; colorL: number
  alpha: number; size: number; num: number
}

interface Snapshot {
  x: number; y: number; angle: number
  shape: ShapeType
  colorH: number; colorS: number; colorL: number
  alpha: number; size: number; num: number
}

// Equilateral triangle with centroid at origin, circumradius r (pointing up)
function triVerts(r: number) {
  const s32 = Math.sqrt(3) / 2
  return [
    { x: 0,       y: -r      },
    { x:  r * s32, y:  r / 2 },
    { x: -r * s32, y:  r / 2 },
  ]
}

export default function timePhysics(container: HTMLElement) {
  return (p: any) => {
    const engine = Matter.Engine.create({ enableSleeping: true })
    engine.gravity.y = 1.5

    const hours: ShapeBody[] = []
    const minutes: ShapeBody[] = []
    const seconds: ShapeBody[] = []
    const dissolving: Snapshot[] = []

    let hHue = 0, mHue = 0, sHue = 0
    let lastH = -1, lastM = -1, lastS = -1
    const spawnQueue: Array<() => void> = []
    let lastSpawnMs = 0
    const SPAWN_INTERVAL = 55

    const rndHue = (): number => Math.floor(p.random(360))
    const rndShape = (): ShapeType => p.random(ALL_SHAPES)

    // ── Gyroscope gravity (mobile only) ──────────────────────────────────
    const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    let orientationHandler: ((e: DeviceOrientationEvent) => void) | null = null

    function setupGyroscope() {
      if (!isMobile) return

      orientationHandler = (event: DeviceOrientationEvent) => {
        const gamma = event.gamma ?? 0   // left/right tilt: -90..90
        const beta  = event.beta  ?? 90  // front/back tilt: -180..180 (~90 when upright)
        engine.gravity.x = (gamma / 90) * 2
        engine.gravity.y = Math.sin((beta * Math.PI) / 180) * 2
      }

      const startListening = () =>
        window.addEventListener('deviceorientation', orientationHandler!)

      if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        // iOS 13+: permission must be requested after a user gesture
        container.addEventListener('touchstart', () => {
          ;(DeviceOrientationEvent as any)
            .requestPermission()
            .then((state: string) => { if (state === 'granted') startListening() })
            .catch(() => {})
        }, { once: true })
      } else if ('DeviceOrientationEvent' in window) {
        startListening()
      }
    }

    function sizeFor(type: 'h' | 'm' | 's'): number {
      const base = Math.min(p.width, p.height)
      if (type === 'h') return Math.max(180, base * 0.062)
      if (type === 'm') return Math.max(70, base * 0.037)
      return Math.max(40, base * 0.012)
    }

    function makeMatterBody(type: 'h' | 'm' | 's', x: number, y: number, shape: ShapeType, size: number): Matter.Body {
      const half = size / 2
      const arm = size * 0.28
      const density = type === 'h' ? 0.006 : type === 'm' ? 0.003 : 0.001
      const opts: any = {
        density,
        restitution: p.random(0.1, 0.4),
        friction: p.random(0.4, 0.8),
        frictionAir: 0.025,
        sleepThreshold: 60,
      }
      switch (shape) {
        case 'circle':
          return Matter.Bodies.circle(x, y, half, opts)
        case 'square':
          return Matter.Bodies.rectangle(x, y, size, size, opts)
        case 'rounded-square':
          return Matter.Bodies.rectangle(x, y, size, size, { ...opts, chamfer: { radius: size * 0.25 } })
        case 'cross': {
          const hBar = Matter.Bodies.rectangle(x, y, size, arm * 2)
          const vBar = Matter.Bodies.rectangle(x, y, arm * 2, size)
          return Matter.Body.create({ ...opts, parts: [hBar, vBar] })
        }
        case 'triangle':
        case 'rounded-triangle':
          return Matter.Bodies.fromVertices(x, y, triVerts(half) as any, opts)
      }
    }

    function makeShapeBody(type: 'h' | 'm' | 's', num: number): ShapeBody {
      const size = sizeFor(type)
      const half = size / 2
      const shape = rndShape()
      const hue = type === 'h' ? hHue : type === 'm' ? mHue : sHue
      const x = p.random(half + 5, p.width - half - 5)
      const y = -half - p.random(0, 80)
      const body = makeMatterBody(type, x, y, shape, size)
      Matter.Body.setAngularVelocity(body, p.random(-0.05, 0.05))
      Matter.World.add(engine.world, body)
      return {
        body, shape,
        colorH: hue + p.random(-22, 22),
        colorS: p.random(60, 100),
        colorL: p.random(38, 68),
        alpha: 1, size, num,
      }
    }

    function dissolveArray(arr: ShapeBody[]) {
      for (const sb of arr) {
        dissolving.push({
          x: sb.body.position.x,
          y: sb.body.position.y,
          angle: sb.body.angle,
          shape: sb.shape,
          colorH: sb.colorH, colorS: sb.colorS, colorL: sb.colorL,
          alpha: 1, size: sb.size, num: sb.num,
        })
        Matter.World.remove(engine.world, sb.body)
      }
      arr.length = 0
    }

    function queueSpawns(type: 'h' | 'm' | 's', count: number) {
      const arr = type === 'h' ? hours : type === 'm' ? minutes : seconds
      for (let i = 0; i < count; i++) {
        const t = type, a = arr, n = i + 1
        spawnQueue.push(() => a.push(makeShapeBody(t, n)))
      }
    }

    function initFromTime() {
      dissolveArray(hours)
      dissolveArray(minutes)
      dissolveArray(seconds)
      spawnQueue.length = 0
      hHue = rndHue(); mHue = rndHue(); sHue = rndHue()
      const now = new Date()
      const h = now.getHours(), m = now.getMinutes(), s = now.getSeconds()
      if (h > 0) queueSpawns('h', h)
      if (m > 0) queueSpawns('m', m)
      if (s > 0) queueSpawns('s', s)
      lastH = h; lastM = m; lastS = s
    }

    function setupWalls() {
      Matter.World.add(engine.world, [
        Matter.Bodies.rectangle(p.width / 2, p.height + 25, p.width * 2, 50, { isStatic: true }),
        Matter.Bodies.rectangle(-25, p.height / 2, 50, p.height * 2, { isStatic: true }),
        Matter.Bodies.rectangle(p.width + 25, p.height / 2, 50, p.height * 2, { isStatic: true }),
      ])
    }

    // ── Drawing ──────────────────────────────────────────────────────────

    function drawShapeVisual(shape: ShapeType, size: number) {
      const s = size, h = s / 2, arm = s * 0.28
      switch (shape) {
        case 'circle':
          p.ellipse(0, 0, s, s); break
        case 'square':
          p.rect(-h, -h, s, s); break
        case 'rounded-square':
          p.rect(-h, -h, s, s, s * 0.25); break
        case 'cross':
          p.rect(-h, -arm, s, arm * 2)
          p.rect(-arm, -h, arm * 2, s)
          break
        case 'triangle':
        case 'rounded-triangle': {
          const v = triVerts(h)
          p.triangle(v[0]!.x, v[0]!.y, v[1]!.x, v[1]!.y, v[2]!.x, v[2]!.y)
          break
        }
      }
    }

    function drawAt(x: number, y: number, angle: number, shape: ShapeType, size: number, colorH: number, colorS: number, colorL: number, alpha: number, num: number) {
      p.push()
      p.translate(x, y)
      p.rotate(angle)
      p.fill(`hsla(${colorH}, ${colorS}%, ${colorL}%, ${alpha})`)
      p.noStroke()
      drawShapeVisual(shape, size)
      p.fill(`rgba(10, 10, 18, ${alpha})`)
      p.textAlign(p.CENTER, p.CENTER)
      p.textStyle(p.BOLD)
      p.textSize(size * 0.38)
      p.text(num, 0, size * 0.04)
      p.pop()
    }

    // ── Main loop ────────────────────────────────────────────────────────

    p.setup = () => {
      p.createCanvas(container.offsetWidth, container.offsetHeight)
      p.frameRate(60)
      setupWalls()
      initFromTime()
      setupGyroscope()
    }

    p.resetDrawings = () => initFromTime()
    p.setHue = (_: number) => {}

    p.draw = () => {
      const now = new Date()
      const h = now.getHours(), m = now.getMinutes(), s = now.getSeconds()

      if (s !== lastS) {
        if (s === 0) { dissolveArray(seconds); sHue = rndHue() }
        else seconds.push(makeShapeBody('s', seconds.length + 1))
        lastS = s
      }
      if (m !== lastM) {
        if (m === 0) { dissolveArray(minutes); mHue = rndHue() }
        else minutes.push(makeShapeBody('m', minutes.length + 1))
        lastM = m
      }
      if (h !== lastH) {
        if (h === 0) { dissolveArray(hours); hHue = rndHue() }
        else hours.push(makeShapeBody('h', hours.length + 1))
        lastH = h
      }

      if (spawnQueue.length > 0 && p.millis() - lastSpawnMs >= SPAWN_INTERVAL) {
        spawnQueue.shift()!()
        lastSpawnMs = p.millis()
      }

      Matter.Engine.update(engine, 1000 / 60)

      for (let i = dissolving.length - 1; i >= 0; i--) {
        dissolving[i]!.alpha -= 0.025
        if (dissolving[i]!.alpha <= 0) dissolving.splice(i, 1)
      }

      p.background(10, 10, 18)
      for (const d of dissolving) {
        drawAt(d.x, d.y, d.angle, d.shape, d.size, d.colorH, d.colorS, d.colorL, d.alpha, d.num)
      }
      for (const sb of [...hours, ...minutes, ...seconds]) {
        const pos = sb.body.position
        drawAt(pos.x, pos.y, sb.body.angle, sb.shape, sb.size, sb.colorH, sb.colorS, sb.colorL, sb.alpha, sb.num)
      }
    }
  }
}
