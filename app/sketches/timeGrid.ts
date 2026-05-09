// Three transparent grids overlapping — H (24 cells), M (60), S (60)
// Each variable picks a random hue when its counter loops back to 0

const H_COLS = 4,  H_ROWS = 6   // 4×6  = 24 hours
const M_COLS = 10, M_ROWS = 6   // 10×6 = 60 minutes
const S_COLS = 6,  S_ROWS = 10  // 6×10 = 60 seconds

const H_ALPHA = 0.42
const M_ALPHA = 0.38
const S_ALPHA = 0.32

export default function timeGrid(container: HTMLElement) {
  return (p: any) => {
    let hHue = 0, mHue = 0, sHue = 0
    let lastH = -1, lastM = -1, lastS = -1

    const rndHue = () => Math.floor(p.random(360))

    p.resetDrawings = () => {
      hHue = rndHue(); mHue = rndHue(); sHue = rndHue()
    }
    p.setHue = (_: number) => {}

    p.mousePressed = () => {
      hHue = rndHue(); mHue = rndHue(); sHue = rndHue()
    }

    p.setup = () => {
      p.createCanvas(container.offsetWidth, container.offsetHeight)
      p.frameRate(60)
      hHue = rndHue(); mHue = rndHue(); sHue = rndHue()
    }

    p.draw = () => {
      const now = new Date()
      const h = now.getHours()
      const m = now.getMinutes()
      const s = now.getSeconds()
      const ms = now.getMilliseconds()

      // Pick new hue when each counter loops back to 0
      if (h !== lastH) { if (lastH > 0 && h === 0) hHue = rndHue(); lastH = h }
      if (m !== lastM) { if (lastM > 0 && m === 0) mHue = rndHue(); lastM = m }
      if (s !== lastS) { if (lastS > 0 && s === 0) sHue = rndHue(); lastS = s }

      // Sub-unit fractional progress for smooth animation
      const sFrac = ms / 1000
      const mFrac = (s + sFrac) / 60
      const hFrac = (m * 60 + s + sFrac) / 3600

      const cW = p.width
      const cH = p.height

      p.background(0)

      const hw = cW / H_COLS, hh = cH / H_ROWS
      const mw = cW / M_COLS, mh = cH / M_ROWS
      const sw = cW / S_COLS, sh = cH / S_ROWS

      // Additive blending — overlapping areas mix colors additively
      p.blendMode(p.ADD)
      p.noStroke()

      // Hours layer: cells 0..h, current cell fades in over the hour
      for (let i = 0; i <= h; i++) {
        const a = (i < h ? 1 : hFrac) * H_ALPHA
        if (a < 0.005) continue
        p.fill(`hsla(${hHue},100%,55%,${a})`)
        p.rect((i % H_COLS) * hw, Math.floor(i / H_COLS) * hh, hw, hh)
      }

      // Minutes layer: cells 0..m, current cell fades in over the minute
      for (let i = 0; i <= m; i++) {
        const a = (i < m ? 1 : mFrac) * M_ALPHA
        if (a < 0.005) continue
        p.fill(`hsla(${mHue},100%,55%,${a})`)
        p.rect((i % M_COLS) * mw, Math.floor(i / M_COLS) * mh, mw, mh)
      }

      // Seconds layer: cells 0..s, current cell fades in over the second
      for (let i = 0; i <= s; i++) {
        const a = (i < s ? 1 : sFrac) * S_ALPHA
        if (a < 0.005) continue
        p.fill(`hsla(${sHue},100%,55%,${a})`)
        p.rect((i % S_COLS) * sw, Math.floor(i / S_COLS) * sh, sw, sh)
      }

      // Subtle labels — value in the bottom-right corner of each variable's current cell
      p.blendMode(p.BLEND)
      p.noStroke()
      p.textFont('monospace')
      p.textAlign(p.RIGHT, p.BOTTOM)

      const pad = 6

      p.textSize(30)
      p.fill(255, 55)
      p.text(h, (h % H_COLS + 1) * hw - pad, (Math.floor(h / H_COLS) + 1) * hh - pad)

      p.textSize(20)
      p.fill(255, 50)
      p.text(m, (m % M_COLS + 1) * mw - pad, (Math.floor(m / M_COLS) + 1) * mh - pad)

      p.textSize(10)
      p.fill(255, 45)
      p.text(s, (s % S_COLS + 1) * sw - pad, (Math.floor(s / S_COLS) + 1) * sh - pad)
    }
  }
}
