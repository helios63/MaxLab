let SIZE = 4
const SIZE_DIVISOR = 100

const FONT: Record<string, string[]> = {
  I: ['XXX', '.X.', '.X.', '.X.', 'XXX'],
  L: ['X..', 'X..', 'X..', 'X..', 'XXX'],
  P: ['XX.', 'X.X', 'XX.', 'X..', 'X..'],
  E: ['XXX', 'X..', 'XX.', 'X..', 'XXX'],
  U: ['X.X', 'X.X', 'X.X', 'X.X', '.X.'],
  T: ['XXX', '.X.', '.X.', '.X.', '.X.'],
  ' ': ['..', '..', '..', '..', '..'],
}

const TEXT = ''

interface Pixel { x: number; y: number }
interface DrawnPixel extends Pixel { color: string }

function buildTextPixels(canvasW: number, canvasH: number): Pixel[] {
  const letters = TEXT.split('')
  const totalCols = letters.reduce((sum, l, i) =>
    sum + FONT[l]![0]!.length + (i < letters.length - 1 ? 1 : 0), 0)
  const startX = Math.round((canvasW - totalCols * SIZE) / 2)
  const startY = Math.round(canvasH / 4 - (5 * SIZE) / 2)
  const pixels: Pixel[] = []
  let cx = startX
  for (const letter of letters) {
    const glyph = FONT[letter]!
    for (let row = 0; row < glyph.length; row++)
      for (let col = 0; col < glyph[row]!.length; col++)
        if (glyph[row]![col] === 'X') pixels.push({ x: cx + col * SIZE, y: startY + row * SIZE })
    cx += (glyph[0]!.length + 1) * SIZE
  }
  return pixels
}

function drawText(p: any, pixels: Pixel[]) {
  p.fill('oklch(57.7% 0.245 27.325)')
  p.noStroke()
  for (const px of pixels) p.rect(px.x, px.y, SIZE, SIZE)
}

function resolveLetters(sq: Square, pixels: Pixel[]) {
  for (const px of pixels) {
    const overlapX = Math.min(sq.x + SIZE, px.x + SIZE) - Math.max(sq.x, px.x)
    const overlapY = Math.min(sq.y + SIZE, px.y + SIZE) - Math.max(sq.y, px.y)
    if (overlapX <= 0 || overlapY <= 0) continue
    if (overlapX < overlapY) {
      sq.x += sq.x < px.x ? -overlapX : overlapX
      sq.vx = -sq.vx * sq.restitution
    } else {
      sq.y += sq.y < px.y ? -overlapY : overlapY
      sq.vy = -sq.vy * sq.restitution
    }
  }
}

interface Square {
  x: number; y: number; vx: number; vy: number
  gravity: number; restitution: number; friction: number; color: string
  angle: number; av: number
}

function buildPyramidPixels(canvasW: number, canvasH: number): Pixel[] {
  const rows = Math.floor(canvasH * 0.35 / SIZE)
  const pyramidTop = canvasH - rows * SIZE
  const pixels: Pixel[] = []
  for (let r = 0; r < rows; r++) {
    const y = pyramidTop + r * SIZE
    const leftX = Math.round(canvasW / 2 - (r + 0.5) * SIZE)
    for (let c = 0; c < 2 * r + 1; c++) {
      pixels.push({ x: leftX + c * SIZE, y })
    }
  }
  return pixels
}

function spawnSquare(p: any, baseHue: number): Square {
  return {
    x: p.width / 2 - SIZE / 2,
    y: 0,
    vx: p.random(-1.5, 1.5),
    vy: p.random(0.5, 2),
    gravity: p.random(0.05, 0.6),
    restitution: p.random(0.4, 0.95),
    friction: p.random(0.96, 1.0),
    color: `oklch(90.1% 0.076 70.697)`,
    angle: p.random(p.TWO_PI),
    av: 0,
  }
}

function stepSquare(sq: Square, p: any) {
  sq.vy += sq.gravity
  sq.x += sq.vx
  sq.y += sq.vy

  if (sq.x <= 0) {
    sq.x = 0
    sq.vx = Math.abs(sq.vx) * sq.restitution
  } else if (sq.x + SIZE >= p.width) {
    sq.x = p.width - SIZE
    sq.vx = -Math.abs(sq.vx) * sq.restitution
  }

  // spin driven by horizontal velocity, with slight lag for natural feel
  sq.av += (sq.vx * 0.05 - sq.av) * 0.15
  sq.angle += sq.av

  if (sq.y + SIZE >= p.height) {
    sq.y = p.height - SIZE
    sq.vy = -Math.abs(sq.vy) * sq.restitution
    sq.vx *= sq.friction
    if (Math.abs(sq.vy) < 0.4) sq.vy = 0
  } else if (sq.y <= 0) {
    sq.y = 0
    sq.vy = Math.abs(sq.vy) * sq.restitution
  }
}


function resolveCollisions(squares: Square[]) {
  for (let i = 0; i < squares.length; i++) {
    for (let j = i + 1; j < squares.length; j++) {
      const a = squares[i]!
      const b = squares[j]!

      const overlapX = Math.min(a.x + SIZE, b.x + SIZE) - Math.max(a.x, b.x)
      const overlapY = Math.min(a.y + SIZE, b.y + SIZE) - Math.max(a.y, b.y)

      if (overlapX <= 0 || overlapY <= 0) continue

      const e = (a.restitution + b.restitution) / 2

      if (overlapX < overlapY) {
        const half = overlapX / 2
        if (a.x < b.x) { a.x -= half; b.x += half }
        else            { a.x += half; b.x -= half }
        const impulse = (1 + e) * (b.vx - a.vx) / 2
        a.vx += impulse; b.vx -= impulse
      } else {
        const half = overlapY / 2
        if (a.y < b.y) { a.y -= half; b.y += half }
        else            { a.y += half; b.y -= half }
        const impulse = (1 + e) * (b.vy - a.vy) / 2
        a.vy += impulse; b.vy -= impulse
      }
    }
  }
}

export default function bouncingSquare(container: HTMLElement) {
  return (p: any) => {
    const squares: Square[] = []
    const drawnPixels: DrawnPixel[] = []
    let lastSpawn = 0
    let pyramidPixels: Pixel[]
    let textPixels: Pixel[]
    let drawColor = ''
    let baseHue = 220

    function addDrawnPixel(mx: number, my: number) {
      const gx = Math.floor(mx / SIZE) * SIZE
      const gy = Math.floor(my / SIZE) * SIZE
      if (gx < 0 || gy < 0 || gx + SIZE > p.width || gy + SIZE > p.height) return
      if (drawnPixels.some(dp => dp.x === gx && dp.y === gy)) return
      drawnPixels.push({ x: gx, y: gy, color: drawColor })
    }

    p.resetDrawings = () => {
      drawnPixels.length = 0
    }

    p.setHue = (hue: number) => {
      baseHue = hue
    }

    p.setup = () => {
      p.createCanvas(container.offsetWidth, container.offsetHeight)
      SIZE = Math.round(Math.min(p.width, p.height) / SIZE_DIVISOR)
      pyramidPixels = buildPyramidPixels(p.width, p.height)
      textPixels = buildTextPixels(p.width, p.height)
      squares.push(spawnSquare(p, baseHue))
    }

    p.mousePressed = () => {
      drawColor = `hsl(${p.random(190, 250)}, ${p.random(60, 100)}%, ${p.random(35, 65)}%)`
      addDrawnPixel(p.mouseX, p.mouseY)
    }

    p.mouseDragged = () => {
      addDrawnPixel(p.mouseX, p.mouseY)
    }

    p.draw = () => {
      p.background('oklch(82.8% 0.111 230.318)')
      drawText(p, textPixels)

      if (p.millis() - lastSpawn >= 50) {
        squares.push(spawnSquare(p, baseHue))
        lastSpawn = p.millis()
      }

      for (const sq of squares) stepSquare(sq, p)
      for (const sq of squares) resolveLetters(sq, pyramidPixels)
      for (const sq of squares) resolveLetters(sq, textPixels)
      for (const sq of squares) resolveLetters(sq, drawnPixels)
      resolveCollisions(squares)
      for (const sq of squares) resolveLetters(sq, pyramidPixels)
      for (const sq of squares) resolveLetters(sq, drawnPixels)

      p.fill('oklch(62.7% 0.194 149.214)')
      p.noStroke()
      for (const px of pyramidPixels) p.rect(px.x, px.y, SIZE, SIZE)

      p.noStroke()
      for (const dp of drawnPixels) {
        p.fill(dp.color)
        p.rect(dp.x, dp.y, SIZE, SIZE)
      }

      for (const sq of squares) {
        p.push()
        p.translate(sq.x + SIZE / 2, sq.y + SIZE / 2)
        p.rotate(sq.angle)
        p.fill(sq.color)
        p.noStroke()
        p.rect(-SIZE / 2, -SIZE / 2, SIZE, SIZE)
        p.pop()
      }
    }
  }
}
