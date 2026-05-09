let CELL = 24

const TOTAL_GRID_COLS = 27
const GRID_ROWS = 5

const GLYPHS: Record<string, string[]> = {
  '0': ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'],
  '1': ['.X.', '.X.', '.X.', '.X.', 'XXX'],
  '2': ['XXX', '..X', 'XXX', 'X..', 'XXX'],
  '3': ['XXX', '..X', 'XXX', '..X', 'XXX'],
  '4': ['X.X', 'X.X', 'XXX', '..X', '..X'],
  '5': ['XXX', 'X..', 'XXX', '..X', 'XXX'],
  '6': ['XXX', 'X..', 'XXX', 'X.X', 'XXX'],
  '7': ['XXX', '..X', '..X', '.X.', '.X.'],
  '8': ['XXX', 'X.X', 'XXX', 'X.X', 'XXX'],
  '9': ['XXX', 'X.X', 'XXX', '..X', 'XXX'],
  ':': ['.', 'X', '.', 'X', '.'],
}

// Layout for "HH:MM:SS" — digits are 3 cols wide, colon is 1 col wide, 1 col gap between each
const CHAR_SLOTS = [
  { startCol: 0,  hue: 340 }, // 0: H tens  (pink-red)
  { startCol: 4,  hue: 340 }, // 1: H units
  { startCol: 8,  hue:  50 }, // 2: :       (golden)
  { startCol: 10, hue: 240 }, // 3: M tens  (blue-violet)
  { startCol: 14, hue: 240 }, // 4: M units
  { startCol: 18, hue:  50 }, // 5: :       (golden)
  { startCol: 20, hue: 140 }, // 6: S tens  (mint-green)
  { startCol: 24, hue: 140 }, // 7: S units
]

type SlotSrc = { timeIdx: number } | { fixed: string }
const SLOT_SRC: SlotSrc[] = [
  { timeIdx: 0 }, { timeIdx: 1 }, { fixed: ':' },
  { timeIdx: 2 }, { timeIdx: 3 }, { fixed: ':' },
  { timeIdx: 4 }, { timeIdx: 5 },
]

interface FlowerCell {
  px: number
  py: number
  bloom: number
  target: number
  petalPhase: number
  petalCount: number
  swayOffset: number
  hue: number
  slotIdx: number
  ox: number      // position offset from final pos (spiral travel)
  oy: number
  spinDir: number // +1 or -1 — clockwise vs counter-clockwise spiral
  hoverSpin: number  // angular velocity from mouse touch
  hoverPhase: number // accumulated extra rotation
  hoverScale: number // extra scale when hovered
  prevNear: boolean  // was mouse near last frame
}

interface BgFlower {
  x: number
  y: number
  phase: number
  hue: number
  r: number
  hoverSpin: number
  hoverPhase: number
  prevNear: boolean
}

function getTimeDigits(): string[] {
  const d = new Date()
  return (
    String(d.getHours()).padStart(2, '0') +
    String(d.getMinutes()).padStart(2, '0') +
    String(d.getSeconds()).padStart(2, '0')
  ).split('')
}

function getDisplayChars(digits: string[]): string[] {
  return SLOT_SRC.map(src => ('fixed' in src ? src.fixed : digits[src.timeIdx]!))
}

function drawPetal(p: any, angle: number, dist: number, len: number, w: number) {
  p.push()
  p.translate(Math.cos(angle) * dist, Math.sin(angle) * dist)
  p.rotate(angle)
  p.rectMode(p.CENTER)
  p.rect(0, 0, len, w)
  p.pop()
}

function drawFlower(
  p: any,
  cx: number,
  cy: number,
  hue: number,
  hueMod: number,
  petalCount: number,
  petalPhase: number,
  swayOffset: number,
  scale: number,
  alpha: number,
  extraPhase = 0,
  lightness = 68,
  windFactor = 0.4,
) {
  if (scale < 0.008) return

  const t = p.frameCount * 0.02
  const reach = CELL * 0.44 * scale
  const pLen = reach * 0.78
  const pW = reach * 0.40
  const dist = reach * 0.61

  p.push()
  p.translate(cx, cy)
  p.noStroke()

  for (let i = 0; i < petalCount; i++) {
    const base = (Math.PI * 2 * i / petalCount) + petalPhase + extraPhase
    const sway = Math.sin(t + swayOffset + i * 1.1) * (0.07 + windFactor * 0.12)
    const angle = base + sway
    const pH = ((hue + hueMod + i * 12) % 360 + 360) % 360
    p.fill(`hsla(${pH}, 85%, ${lightness}%, ${alpha})`)
    drawPetal(p, angle, dist, pLen, pW)
  }

  p.pop()
}

function drawBgFlower(p: any, bf: BgFlower, t: number, hueMod: number, extraPhase = 0, lightness = 60, windFactor = 0.4) {
  const sway = Math.sin(t * 0.9 + bf.phase) * (0.14 + windFactor * 0.18)
  const pLen = bf.r * 0.78
  const pW = bf.r * 0.40
  const dist = bf.r * 0.61

  p.push()
  p.translate(bf.x, bf.y)
  p.noStroke()

  for (let i = 0; i < 5; i++) {
    const angle = (Math.PI * 2 * i / 5) + bf.phase + sway + extraPhase
    const pH = ((bf.hue + hueMod + i * 12) % 360 + 360) % 360
    p.fill(`hsla(${pH}, 70%, ${lightness}%, 0.22)`)
    drawPetal(p, angle, dist, pLen, pW)
  }

  p.pop()
}

function getSkyColor(hours: number): string {
  // [hour, r, g, b] — piecewise linear through the day
  const stops: [number, number, number, number][] = [
    [0,    4,   6,  38],  // midnight — deep navy
    [5,    8,  12,  55],  // pre-dawn  — dark navy
    [6,  240,  90,  50],  // sunrise   — orange-red
    [7,  255, 170,  90],  // early morning — golden
    [8,   80, 155, 230],  // morning   — light blue
    [12,  45, 130, 255],  // noon      — bright sky blue
    [17,  75, 148, 240],  // afternoon — blue
    [18, 255, 155,  70],  // golden hour
    [19, 235,  70,  80],  // sunset    — deep orange-pink
    [20,  35,  20,  90],  // dusk      — purple-blue
    [22,   4,   6,  38],  // night
    [24,   4,   6,  38],  // midnight (wraps)
  ]

  const h = ((hours % 24) + 24) % 24
  let i = stops.findIndex(s => s[0]! > h) - 1
  if (i < 0) i = 0

  const [h0, r0, g0, b0] = stops[i]!
  const [h1, r1, g1, b1] = stops[i + 1]!
  const t = (h - h0) / (h1 - h0)
  return `rgb(${Math.round(r0 + (r1 - r0) * t)},${Math.round(g0 + (g1 - g0) * t)},${Math.round(b0 + (b1 - b0) * t)})`
}

// Returns 0 at night, 1 at midday — used to darken flowers during the day for contrast
function getDayBrightness(hours: number): number {
  const stops: [number, number][] = [
    [0, 0], [5, 0], [7, 0.5], [9, 1], [17, 1], [18.5, 0.5], [20, 0], [24, 0],
  ]
  const h = ((hours % 24) + 24) % 24
  let i = stops.findIndex(s => s[0]! > h) - 1
  if (i < 0) i = 0
  const [h0, v0] = stops[i]!
  const [h1, v1] = stops[i + 1]!
  return v0 + (v1 - v0) * (h - h0) / (h1 - h0)
}

export default function timeFlowers(container: HTMLElement) {
  return (p: any) => {
    const cellMap = new Map<string, FlowerCell>()
    let bgFlowers: BgFlower[] = []
    let hueMod = 0
    let pulse = 0
    let lastMinute = -1
    let lastSecond = -1
    let enterTimer = 0
    let pendingChars: string[] | null = null
    let pendingSlots: number[] = []
    let currentChars: string[] = []

    function buildCells() {
      cellMap.clear()
      const offX = (p.width - TOTAL_GRID_COLS * CELL) / 2
      const offY = (p.height - GRID_ROWS * CELL) / 2

      for (let si = 0; si < CHAR_SLOTS.length; si++) {
        const { startCol, hue } = CHAR_SLOTS[si]!
        const src = SLOT_SRC[si]!
        const ch = 'fixed' in src ? src.fixed : '0'
        const glyphWidth = GLYPHS[ch]![0]!.length

        for (let row = 0; row < GRID_ROWS; row++) {
          for (let col = 0; col < glyphWidth; col++) {
            const gx = startCol + col
            const key = `${gx}_${row}`
            if (!cellMap.has(key)) {
              cellMap.set(key, {
                px: offX + gx * CELL + CELL / 2,
                py: offY + row * CELL + CELL / 2,
                bloom: 0,
                target: 0,
                petalPhase: p.random(Math.PI * 2),
                petalCount: Math.floor(p.random(5, 8)),
                swayOffset: p.random(Math.PI * 2),
                hue,
                slotIdx: si,
                ox: 0, oy: 0,
                spinDir: 1,
                hoverSpin: 0,
                hoverPhase: 0,
                hoverScale: 0,
                prevNear: false,
              })
            }
          }
        }
      }
    }

    function buildBgFlowers() {
      bgFlowers = Array.from({ length: 45 }, () => ({
        x: p.random(p.width),
        y: p.random(p.height),
        phase: p.random(Math.PI * 2),
        hue: p.random(360),
        r: p.random(6, 16),
        hoverSpin: 0,
        hoverPhase: 0,
        prevNear: false,
      }))
    }

    function applyCharsForSlots(slots: number[], chars: string[]) {
      for (const si of slots) {
        const { startCol } = CHAR_SLOTS[si]!
        for (const cell of cellMap.values()) {
          if (cell.slotIdx === si) cell.target = 0
        }
        const ch = chars[si]!
        const glyph = GLYPHS[ch]
        if (!glyph) continue
        for (let row = 0; row < GRID_ROWS; row++) {
          const rowStr = glyph[row]!
          for (let col = 0; col < rowStr.length; col++) {
            if (rowStr[col] === 'X') {
              const cell = cellMap.get(`${startCol + col}_${row}`)
              if (cell) cell.target = 1
            }
          }
        }
      }
    }

    function applyAllChars(chars: string[]) {
      applyCharsForSlots(Array.from({ length: CHAR_SLOTS.length }, (_, i) => i), chars)
    }

    function triggerExit(slots: number[]) {
      for (const cell of cellMap.values()) {
        if (slots.includes(cell.slotIdx)) cell.target = 0
      }
    }

    function triggerEntry(chars: string[], slots: number[]) {
      applyCharsForSlots(slots, chars)
      for (const cell of cellMap.values()) {
        if (!slots.includes(cell.slotIdx) || cell.target !== 1) continue
        // Start from outside the canvas, radially away from center
        const angle = Math.atan2(cell.py - p.height / 2, cell.px - p.width / 2)
          + (Math.random() - 0.5) * 0.8
        const d = Math.max(p.width, p.height) * 1.5
        cell.ox = Math.cos(angle) * d
        cell.oy = Math.sin(angle) * d
        cell.spinDir = Math.random() > 0.5 ? 1 : -1
        cell.bloom = 0.01
      }
    }

    p.resetDrawings = () => {
      for (const cell of cellMap.values()) {
        cell.petalPhase = p.random(Math.PI * 2)
        cell.petalCount = Math.floor(p.random(5, 8))
        cell.swayOffset = p.random(Math.PI * 2)
      }
      buildBgFlowers()
    }

    p.setHue = (hue: number) => {
      hueMod = hue
    }

    p.mousePressed = () => {
      bgFlowers.push({
        x: p.mouseX,
        y: p.mouseY,
        phase: p.random(Math.PI * 2),
        hue: p.random(360),
        r: p.random(10, 22),
        hoverSpin: (p.random() > 0.5 ? 1 : -1) * p.random(0.3, 0.6),
        hoverPhase: 0,
        prevNear: false,
      })
    }

    p.setup = () => {
      p.createCanvas(container.offsetWidth, container.offsetHeight)
      CELL = Math.floor(p.width * 0.88 / TOTAL_GRID_COLS)
      buildCells()
      buildBgFlowers()
      const now = new Date()
      currentChars = getDisplayChars(getTimeDigits())
      applyAllChars(currentChars)
      for (const cell of cellMap.values()) cell.bloom = cell.target
      lastMinute = now.getHours() * 60 + now.getMinutes()
      lastSecond = now.getSeconds()
    }

    p.draw = () => {
      const now = new Date()
      const skyHours = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600
      p.background(getSkyColor(skyHours))
      const dayB = getDayBrightness(skyHours)
      const flowerL = Math.round(82 - dayB * 36)   // 82% night → 46% noon
      const bgFlowerL = Math.round(75 - dayB * 33) // 75% night → 42% noon

      const t = p.frameCount * 0.02
      const mx = p.mouseX
      const my = p.mouseY

      // Wind: slowly evolving direction and strength via Perlin noise
      const windT = p.frameCount * 0.0022
      const windAngle = p.noise(windT) * Math.PI * 3.5
      const windStr = p.noise(windT + 71) * 0.55 + 0.18
      const windDx = Math.cos(windAngle) * windStr
      const windDy = Math.sin(windAngle) * windStr * 0.28

      for (const bf of bgFlowers) {
        // Drift in wind — larger flowers catch more wind
        const drift = bf.r / 13
        bf.x += windDx * drift
        bf.y += windDy * drift
        // Wrap at canvas edges so flowers re-enter from the other side
        const margin = bf.r * 3
        if (bf.x < -margin) bf.x += p.width + margin * 2
        if (bf.x > p.width + margin) bf.x -= p.width + margin * 2
        if (bf.y < -margin) bf.y += p.height + margin * 2
        if (bf.y > p.height + margin) bf.y -= p.height + margin * 2

        const near = Math.hypot(mx - bf.x, my - bf.y) < bf.r * 2.5
        if (near && !bf.prevNear) bf.hoverSpin += (p.random() > 0.5 ? 1 : -1) * p.random(0.18, 0.38)
        if (near) bf.hoverSpin += (p.random() - 0.5) * 0.012
        bf.prevNear = near
        bf.hoverPhase += bf.hoverSpin
        bf.hoverSpin *= 0.91
        drawBgFlower(p, bf, t, hueMod, bf.hoverPhase, bgFlowerL, windStr)
      }

      const sec = now.getSeconds()
      const min = now.getHours() * 60 + now.getMinutes()

      if (sec !== lastSecond) {
        lastSecond = sec
        for (const cell of cellMap.values()) {
          cell.hue = ((cell.hue + p.random(-8, 8)) % 360 + 360) % 360
        }
        for (const bf of bgFlowers) {
          bf.hue = ((bf.hue + p.random(-8, 8)) % 360 + 360) % 360
        }
        const newChars = getDisplayChars(getTimeDigits())

        applyCharsForSlots([6, 7], newChars)

        if (min !== lastMinute) {
          lastMinute = min
          pulse = 1.0
          const changedSlots = [0, 1, 3, 4].filter(si => newChars[si] !== currentChars[si])
          if (changedSlots.length > 0) {
            triggerExit(changedSlots)
            pendingChars = newChars
            pendingSlots = changedSlots
            enterTimer = 32
          }
        }

        currentChars = newChars
      }
      pulse *= 0.88

      if (enterTimer > 0) {
        enterTimer--
        if (enterTimer === 0 && pendingChars) {
          triggerEntry(pendingChars, pendingSlots)
          pendingChars = null
          pendingSlots = []
        }
      }

      // Spiral constants: rotate offset vector a few degrees per frame while decaying
      const spinSpeed = 0.065 // radians per frame
      const spinCos = Math.cos(spinSpeed)
      const spinSin = Math.sin(spinSpeed)
      const decay = 0.93

      for (const cell of cellMap.values()) {
        cell.bloom += (cell.target - cell.bloom) * 0.08

        // Rotate ox/oy by spinDir * spinSpeed then scale toward zero — logarithmic spiral
        if (cell.ox !== 0 || cell.oy !== 0) {
          const sd = cell.spinDir
          const rx = (cell.ox * spinCos - cell.oy * (spinSin * sd)) * decay
          const ry = (cell.ox * (spinSin * sd) + cell.oy * spinCos) * decay
          cell.ox = rx
          cell.oy = ry
        }

        const dx = mx - cell.px
        const dy = my - cell.py
        const near = Math.hypot(dx, dy) < CELL * 1.1 && cell.bloom > 0.1
        if (near && !cell.prevNear) cell.hoverSpin += (p.random() > 0.5 ? 1 : -1) * p.random(0.15, 0.32)
        if (near) cell.hoverSpin += (p.random() - 0.5) * 0.014
        cell.prevNear = near
        cell.hoverPhase += cell.hoverSpin
        cell.hoverSpin *= 0.90
        const targetHoverScale = near ? 0.14 : 0
        cell.hoverScale += (targetHoverScale - cell.hoverScale) * 0.14

        if (cell.bloom < 0.008) continue

        // Subtle per-flower wind wobble so each clock flower sways slightly
        const wobX = windDx * 3.2 * Math.sin(t * 0.34 + cell.swayOffset)
        const wobY = windDy * 2.0 * Math.cos(t * 0.27 + cell.swayOffset * 0.8)

        const scale = (cell.bloom + cell.hoverScale) * (1 + pulse * 0.18)
        drawFlower(
          p,
          cell.px + cell.ox + wobX,
          cell.py + cell.oy + wobY,
          cell.hue, hueMod,
          cell.petalCount, cell.petalPhase, cell.swayOffset,
          scale, cell.bloom,
          cell.hoverPhase, flowerL, windStr,
        )
      }
    }
  }
}
