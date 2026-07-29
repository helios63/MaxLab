// 3D liquid bubbler: a transparent rounded-rectangle case (flat front/back
// panels, shallow depth) holding deep-blue "liquid" (packed, cohesive
// spheres). Sealed reservoir chambers sit at the top and bottom of the case;
// each has a narrow throat in its floor/ceiling so the pool can only escape
// one drop at a time. Paddle wheels sit right under each reservoir's throat
// and physically gate it: liquid rests on top of a paddle until it rotates
// clear, releasing a single drop onto the cascade of full-width ramps
// below, which zigzag past a third, purely decorative wheel at the case's
// midpoint before funneling into the opposite reservoir. Drag to tumble
// the object; flip (button/double-click/space) rolls it upside down and the
// liquid re-settles through gravity redirected into the object's local
// frame. Gravity and damping are tuned heavy and slow, as if the whole
// object were submerged, so the liquid drifts rather than bounces.

interface Particle {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  r: number
  nb: number
}

interface Baffle {
  p1: { x: number, y: number }
  p2: { x: number, y: number }
  thickness: number
  zHalf: number
  angle: number
  length: number
  cx: number
  cy: number
}

interface Wheel {
  x: number
  y: number
  r: number
  innerR: number
  paddles: number
  thickness: number
  zHalf: number
  angle: number
  spin: number
}

const HALF_W = 125    // shell half-width (x)
const HALF_H = 260    // shell half-height (y)
const HALF_D = 32     // shell half-depth (z) - "a bit of depth"
const CORNER_R = 30   // radius of the shell's rounded corners (xy plane)
const WALL = 3        // wall margin for collisions
const N_PARTICLES = 320
const BASE_R = 6.2
const G_STRENGTH = 0.16      // slow, heavy gravity - liquid moving through water
const SUBSTEPS = 2
const COHESION_RANGE = 3.3   // multiple of combined radius
const COHESION_STRENGTH = 0.004
const PACK_FACTOR = 0.92     // lets spheres overlap a bit so the mass reads as liquid, not marbles
const RESTITUTION = 0.12     // barely bounces - impacts get absorbed like a viscous fluid
const FRICTION = 0.9
const VISCOSITY = 0.96       // drag applied every substep
const IDLE_SPIN = 0.0018

function rotAxis(v: { x: number, y: number, z: number }, axis: 'x' | 'y' | 'z', a: number) {
  const c = Math.cos(a), s = Math.sin(a)
  if (axis === 'x') return { x: v.x, y: v.y * c - v.z * s, z: v.y * s + v.z * c }
  if (axis === 'y') return { x: v.x * c + v.z * s, y: v.y, z: -v.x * s + v.z * c }
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c, z: v.z }
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60)       { r = c; g = x; b = 0 }
  else if (h < 120) { r = x; g = c; b = 0 }
  else if (h < 180) { r = 0; g = c; b = x }
  else if (h < 240) { r = 0; g = x; b = c }
  else if (h < 300) { r = x; g = 0; b = c }
  else              { r = c; g = 0; b = x }
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}

function makeBaffle(p1: { x: number, y: number }, p2: { x: number, y: number }, thickness: number, zHalf: number): Baffle {
  return {
    p1, p2, thickness, zHalf,
    angle: Math.atan2(p2.y - p1.y, p2.x - p1.x),
    length: Math.hypot(p2.x - p1.x, p2.y - p1.y),
    cx: (p1.x + p2.x) / 2,
    cy: (p1.y + p2.y) / 2,
  }
}

// Inner (collision) half-extents of the shell's sharp rounded-rect box, in
// the xy plane, after removing the wall margin and the corner radius.
const SHELL_BX = HALF_W - WALL - CORNER_R
const SHELL_BY = HALF_H - WALL - CORNER_R

// Outer (visual) half-extents used to build the rounded-rect outline that
// the shell mesh is extruded from.
const SHELL_OUTER_BX = HALF_W - CORNER_R
const SHELL_OUTER_BY = HALF_H - CORNER_R

// The shell's side walls only curve near the top/bottom corners; away from
// those corners (where every static baffle below lives) the true inner
// collision boundary is just the wall margin in from the case, not the
// corner-radius-shrunken box above. Baffles that meet the side walls use
// this so they butt straight up against the glass with no visible gap.
const FLAT_BX = HALF_W - WALL

const RAMP_ZHALF = 26      // ramps/funnels span nearly the full (shallow) shell depth
const WALL_ZHALF = HALF_D - WALL // reservoir floors/ceilings must seal the full depth
const RAMP_MARGIN = 3      // small endpoint inset so an angled ramp's flat end-cap doesn't poke past the curved shell wall - used on a ramp's *high* (starting) end, which sits flush against the glass
const RAMP_DRAIN_GAP = 18  // wider inset used on a ramp's *low* (finishing) end - without it the ramp meets the wall almost flush and traps liquid in the corner instead of letting it fall past into the next stage
const RES_WALL_Y = 150     // y of the reservoir floor/ceiling, mirrored top & bottom
const GAP_HALF = 11        // half-width of the throat left open in each reservoir wall - just wide enough for one drop
const BAFFLE_THICKNESS = 5 // thin hard-surface profile for walls/ramps/funnels

// Reservoir floor/ceiling: a wall across the full width with a narrow throat
// left open at the center, so the pooled liquid can only drain through a
// single small opening instead of pouring out all at once.
const STATIC_BAFFLES: Baffle[] = [
  makeBaffle({ x: -FLAT_BX, y: -RES_WALL_Y }, { x: -GAP_HALF, y: -RES_WALL_Y }, BAFFLE_THICKNESS, WALL_ZHALF),
  makeBaffle({ x: GAP_HALF, y: -RES_WALL_Y }, { x: FLAT_BX, y: -RES_WALL_Y }, BAFFLE_THICKNESS, WALL_ZHALF),
  makeBaffle({ x: -FLAT_BX, y: RES_WALL_Y }, { x: -GAP_HALF, y: RES_WALL_Y }, BAFFLE_THICKNESS, WALL_ZHALF),
  makeBaffle({ x: GAP_HALF, y: RES_WALL_Y }, { x: FLAT_BX, y: RES_WALL_Y }, BAFFLE_THICKNESS, WALL_ZHALF),

  // Cascade: four ramps zigzagging liquid across the case as it falls, two
  // above the midline wheel and two below it. Each ramp's high end sits
  // flush against the glass (RAMP_MARGIN); its low end is pulled well clear
  // of the opposite wall (RAMP_DRAIN_GAP) so liquid can actually drop past
  // it into the next leg of the cascade instead of pooling in the corner.
  // Vertical spacing is also chosen so each ramp's midline crossing clears
  // the midline wheel's (and the top/bottom wheels') paddle radius.
  makeBaffle({ x: -FLAT_BX + RAMP_MARGIN, y: -111 }, { x: FLAT_BX - RAMP_DRAIN_GAP, y: -71 }, BAFFLE_THICKNESS, RAMP_ZHALF),
  makeBaffle({ x: FLAT_BX - RAMP_MARGIN, y: -55 }, { x: -FLAT_BX + RAMP_DRAIN_GAP, y: -15 }, BAFFLE_THICKNESS, RAMP_ZHALF),
  makeBaffle({ x: -FLAT_BX + RAMP_MARGIN, y: 15 }, { x: FLAT_BX - RAMP_DRAIN_GAP, y: 55 }, BAFFLE_THICKNESS, RAMP_ZHALF),
  makeBaffle({ x: FLAT_BX - RAMP_MARGIN, y: 68 }, { x: -FLAT_BX + RAMP_DRAIN_GAP, y: 108 }, BAFFLE_THICKNESS, RAMP_ZHALF),

  // Funnel: a shallow V, also spanning the full width, that gathers the
  // cascade back toward the lower reservoir's throat.
  makeBaffle({ x: -FLAT_BX + RAMP_MARGIN, y: 118 }, { x: -GAP_HALF, y: 140 }, BAFFLE_THICKNESS, RAMP_ZHALF),
  makeBaffle({ x: FLAT_BX - RAMP_MARGIN, y: 118 }, { x: GAP_HALF, y: 140 }, BAFFLE_THICKNESS, RAMP_ZHALF),
]

function buildRoundedRectOutline(bx: number, by: number, r: number, segs: number) {
  const pts: { x: number, y: number }[] = []
  const corners = [
    { cx: bx, cy: -by, a0: -Math.PI / 2, a1: 0 },
    { cx: bx, cy: by, a0: 0, a1: Math.PI / 2 },
    { cx: -bx, cy: by, a0: Math.PI / 2, a1: Math.PI },
    { cx: -bx, cy: -by, a0: Math.PI, a1: 3 * Math.PI / 2 },
  ]
  for (const c of corners) {
    for (let i = 0; i <= segs; i++) {
      const a = c.a0 + (c.a1 - c.a0) * (i / segs)
      pts.push({ x: c.cx + Math.cos(a) * r, y: c.cy + Math.sin(a) * r })
    }
  }
  return pts
}

const SHELL_OUTLINE = buildRoundedRectOutline(SHELL_OUTER_BX, SHELL_OUTER_BY, CORNER_R, 8)

// Paddles are radial blades; a particle resting above the throat is
// supported by whichever blade is currently pointing up, and drops through
// the moment that blade rotates clear - one drop per blade, timed by spin.
function wheelBaffles(w: Wheel): Baffle[] {
  const list: Baffle[] = []
  for (let i = 0; i < w.paddles; i++) {
    const a = w.angle + (i / w.paddles) * Math.PI * 2
    const p1 = { x: w.x + Math.cos(a) * w.innerR, y: w.y + Math.sin(a) * w.innerR }
    const p2 = { x: w.x + Math.cos(a) * w.r, y: w.y + Math.sin(a) * w.r }
    list.push(makeBaffle(p1, p2, w.thickness, w.zHalf))
  }
  return list
}

export default function liquidBubbler(container: HTMLElement) {
  return (p: any) => {
    const particles: Particle[] = []
    // Pairs of particles currently touching, recomputed every physics
    // substep. A lone particle (no join) reads as a discrete bubble; any
    // particle with a join gets rendered as fused, blobby liquid instead.
    let joins: [Particle, Particle][] = []
    let liquidHue = 224 // deep blue

    // Three wheels on the vertical centerline: one gating each reservoir's
    // throat (top/bottom, mirrored), plus a smaller purely decorative one at
    // the case's midpoint that the cascade zigzags around.
    const wheels: Wheel[] = [
      { x: 0, y: -(RES_WALL_Y - 24 - 3), r: 24, innerR: 5, paddles: 5, thickness: 5, zHalf: 24, angle: 0, spin: 0.0018 },
      { x: 0, y: RES_WALL_Y - 24 - 3, r: 24, innerR: 5, paddles: 4, thickness: 5, zHalf: 24, angle: 0, spin: -0.0016 },
      { x: 0, y: 0, r: 15, innerR: 4, paddles: 3, thickness: 4, zHalf: 18, angle: 0, spin: 0.003 },
    ]

    let rotX = -0.15
    let rotY = 0.4
    let rotZ = 0
    let rotZTarget = 0
    let dragging = false
    let lastMX = 0, lastMY = 0
    let spinVX = 0, spinVY = 0
    let idleTimer = 0
    let camDist = 480

    function spawnParticles() {
      particles.length = 0
      for (let i = 0; i < N_PARTICLES; i++) {
        particles.push({
          x: p.random(-(SHELL_BX - 8), SHELL_BX - 8),
          y: p.random(-SHELL_BY + 8, -RES_WALL_Y - 8),
          z: p.random(-(HALF_D - 15), HALF_D - 15),
          vx: 0, vy: 0, vz: 0,
          r: BASE_R * p.random(0.85, 1.15),
          nb: 0,
        })
      }
    }

    function localGravity() {
      let g = { x: 0, y: 1, z: 0 }
      g = rotAxis(g, 'y', -rotY)
      g = rotAxis(g, 'x', -rotX)
      g = rotAxis(g, 'z', -rotZ)
      return g
    }

    function resolveShell(part: Particle) {
      // Rounded-rect containment in the xy plane, via the signed distance to
      // a sharp box (SHELL_BX, SHELL_BY) offset outward by CORNER_R.
      const qx = Math.abs(part.x) - SHELL_BX
      const qy = Math.abs(part.y) - SHELL_BY
      const ox = Math.max(qx, 0), oy = Math.max(qy, 0)
      const outLen = Math.hypot(ox, oy)
      const inTerm = Math.min(Math.max(qx, qy), 0)
      const violation = outLen + inTerm - (CORNER_R - part.r)
      if (violation > 0) {
        let nx: number, ny: number
        if (outLen > 1e-6) {
          nx = (Math.sign(part.x) * ox) / outLen
          ny = (Math.sign(part.y) * oy) / outLen
        } else if (qx > qy) {
          nx = Math.sign(part.x) || 1; ny = 0
        } else {
          nx = 0; ny = Math.sign(part.y) || 1
        }
        part.x -= nx * violation
        part.y -= ny * violation
        const vn = part.vx * nx + part.vy * ny
        if (vn > 0) {
          part.vx -= nx * vn * (1 + RESTITUTION)
          part.vy -= ny * vn * (1 + RESTITUTION)
        }
        part.vx *= FRICTION; part.vy *= FRICTION; part.vz *= FRICTION
      }

      // Flat front/back panels give the shell its shallow depth.
      const halfD = HALF_D - WALL
      if (part.z - part.r < -halfD) {
        part.z = -halfD + part.r
        if (part.vz < 0) part.vz *= -RESTITUTION
        part.vx *= FRICTION; part.vy *= FRICTION
      }
      if (part.z + part.r > halfD) {
        part.z = halfD - part.r
        if (part.vz > 0) part.vz *= -RESTITUTION
        part.vx *= FRICTION; part.vy *= FRICTION
      }
    }

    function resolveBaffle(part: Particle, b: Baffle) {
      const dx = part.x - b.p1.x, dy = part.y - b.p1.y
      const ex = b.p2.x - b.p1.x, ey = b.p2.y - b.p1.y
      const len2 = ex * ex + ey * ey
      let t = len2 > 0 ? (dx * ex + dy * ey) / len2 : 0
      t = Math.min(1, Math.max(0, t))
      const cpx = b.p1.x + ex * t
      const cpy = b.p1.y + ey * t
      const cpz = Math.min(b.zHalf, Math.max(-b.zHalf, part.z))

      const ddx = part.x - cpx
      const ddy = part.y - cpy
      const ddz = part.z - cpz
      const dist = Math.hypot(ddx, ddy, ddz)
      const minDist = part.r + b.thickness / 2
      if (dist < minDist) {
        const inv = dist > 0.0001 ? 1 / dist : 0
        const nx = dist > 0.0001 ? ddx * inv : 0
        const ny = dist > 0.0001 ? ddy * inv : 1
        const nz = dist > 0.0001 ? ddz * inv : 0
        const overlap = minDist - dist
        part.x += nx * overlap
        part.y += ny * overlap
        part.z += nz * overlap
        const vn = part.vx * nx + part.vy * ny + part.vz * nz
        if (vn < 0) {
          part.vx -= nx * vn * (1 + RESTITUTION)
          part.vy -= ny * vn * (1 + RESTITUTION)
          part.vz -= nz * vn * (1 + RESTITUTION)
        }
        part.vx *= FRICTION; part.vy *= FRICTION; part.vz *= FRICTION
      }
    }

    function pairwiseInteractions() {
      for (const part of particles) part.nb = 0
      joins.length = 0
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i]!
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j]!
          const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z
          const d2 = dx * dx + dy * dy + dz * dz
          const minDist = (a.r + b.r) * PACK_FACTOR
          const range = minDist * COHESION_RANGE
          if (d2 > range * range) continue
          const d = Math.sqrt(d2) || 0.0001
          const nx = dx / d, ny = dy / d, nz = dz / d
          if (d < minDist) {
            const push = (minDist - d) * 0.5
            a.x -= nx * push; a.y -= ny * push; a.z -= nz * push
            b.x += nx * push; b.y += ny * push; b.z += nz * push
            a.nb++; b.nb++
            joins.push([a, b])
          } else {
            const pull = COHESION_STRENGTH * (1 - (d - minDist) / (range - minDist))
            a.vx += nx * pull; a.vy += ny * pull; a.vz += nz * pull
            b.vx -= nx * pull; b.vy -= ny * pull; b.vz -= nz * pull
          }
        }
      }
    }

    function stepPhysics() {
      for (const w of wheels) w.angle += w.spin
      const baffles = [...STATIC_BAFFLES, ...wheels.flatMap(wheelBaffles)]
      const g = localGravity()
      const dt = 1 / SUBSTEPS
      for (let s = 0; s < SUBSTEPS; s++) {
        for (const part of particles) {
          const nAngle = p.noise(part.x * 0.02, part.y * 0.02, p.frameCount * 0.006 + part.r) * p.TWO_PI * 2
          const nLift = p.noise(part.x * 0.02 + 50, part.z * 0.02 + 50, p.frameCount * 0.006) - 0.5
          part.vx += (g.x * G_STRENGTH + Math.cos(nAngle) * 0.03) * dt
          part.vy += (g.y * G_STRENGTH + nLift * 0.05) * dt
          part.vz += (g.z * G_STRENGTH + Math.sin(nAngle) * 0.03) * dt

          part.vx *= VISCOSITY; part.vy *= VISCOSITY; part.vz *= VISCOSITY

          part.x += part.vx * dt
          part.y += part.vy * dt
          part.z += part.vz * dt

          resolveShell(part)
          for (const b of baffles) resolveBaffle(part, b)
        }
        pairwiseInteractions()
      }
    }

    // Drawn last: nearer glass fragments legitimately depth-test in front of
    // the liquid (giving a natural "seen through tinted glass" blend), while
    // farther fragments behind an already-drawn particle are correctly
    // depth-rejected instead of painting over it.
    function drawShell() {
      p.push()
      p.noStroke()
      p.fill(195, 220, 255, 45)

      // Side wall: the rounded-rect outline extruded across the shell's depth.
      p.beginShape(p.TRIANGLE_STRIP)
      for (const pt of SHELL_OUTLINE) {
        p.vertex(pt.x, pt.y, -HALF_D)
        p.vertex(pt.x, pt.y, HALF_D)
      }
      p.endShape()

      // Front and back panels.
      p.fill(195, 220, 255, 55)
      p.beginShape(p.TRIANGLE_FAN)
      p.vertex(0, 0, -HALF_D)
      for (const pt of SHELL_OUTLINE) p.vertex(pt.x, pt.y, -HALF_D)
      p.endShape()
      p.beginShape(p.TRIANGLE_FAN)
      p.vertex(0, 0, HALF_D)
      for (let i = SHELL_OUTLINE.length - 1; i >= 0; i--) {
        const pt = SHELL_OUTLINE[i]!
        p.vertex(pt.x, pt.y, HALF_D)
      }
      p.endShape()

      // Glassy edge highlights tracing the rounded-rect rim, front and back.
      p.noFill()
      p.stroke(255, 255, 255, 90)
      p.strokeWeight(2.5)
      p.beginShape()
      for (const pt of SHELL_OUTLINE) p.vertex(pt.x, pt.y, -HALF_D)
      p.endShape(p.CLOSE)
      p.beginShape()
      for (const pt of SHELL_OUTLINE) p.vertex(pt.x, pt.y, HALF_D)
      p.endShape(p.CLOSE)
      p.pop()
    }

    function drawBaffleList(list: Baffle[], r: number, g: number, b: number, a: number) {
      p.push()
      p.noStroke()
      p.fill(r, g, b, a)
      for (const bf of list) {
        p.push()
        p.translate(bf.cx, bf.cy, 0)
        p.rotateZ(bf.angle)
        p.box(bf.length, bf.thickness, bf.zHalf * 2)
        p.pop()
      }
      p.pop()
    }

    function drawWheels() {
      for (const w of wheels) {
        drawBaffleList(wheelBaffles(w), 225, 220, 205, 210)
        p.push()
        p.noStroke()
        p.fill(210, 205, 190, 230)
        p.translate(w.x, w.y, 0)
        p.sphere(w.innerR + 2, 8, 6)
        p.pop()
      }
    }

    // Fills the gap between two touching particles with a short cylinder so
    // the pair reads as one continuous blob instead of two overlapping
    // marbles. No end caps - the spheres themselves close off both ends.
    function drawBlobLink(a: Particle, b: Particle) {
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z
      const dist = Math.hypot(dx, dy, dz)
      if (dist < 0.0001) return
      const ux = dx / dist, uy = dy / dist, uz = dz / dist
      const axisX = uz, axisZ = -ux
      const axisLen = Math.hypot(axisX, axisZ)
      const radius = Math.min(a.r, b.r) * 0.88
      p.push()
      p.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
      if (axisLen > 1e-6) {
        p.rotate(Math.acos(p.constrain(uy, -1, 1)), [axisX, 0, axisZ])
      } else if (uy < 0) {
        p.rotateX(Math.PI)
      }
      p.cylinder(radius, dist * 1.05, 6, 1, false, false)
      p.pop()
    }

    function drawParticles() {
      const [r, g, b] = hslToRgb(liquidHue, 0.85, 0.5)
      p.noStroke()

      // Blobby connective tissue between touching particles, drawn first so
      // the spheres blend seamlessly over the seam.
      p.ambientMaterial(r, g, b)
      p.emissiveMaterial(r * 0.3, g * 0.3, b * 0.3)
      p.specularMaterial(25)
      p.shininess(1)
      for (const [a, bp] of joins) drawBlobLink(a, bp)

      for (const part of particles) {
        if (part.nb > 0) {
          // Fused into the liquid mass: flat and matte with no glossy
          // highlight, and smoother-subdivided so the merged surface reads
          // as one continuous blob rather than a cluster of glinting marbles.
          p.ambientMaterial(r, g, b)
          p.emissiveMaterial(r * 0.3, g * 0.3, b * 0.3)
          p.specularMaterial(25)
          p.shininess(1)
        } else {
          // Alone: read as a discrete bubble with a bright specular highlight.
          p.ambientMaterial(r, g, b)
          p.emissiveMaterial(r * 0.45, g * 0.45, b * 0.45)
          p.specularMaterial(255)
          p.shininess(60)
        }
        const swell = 1 + Math.min(part.nb, 6) * 0.07
        p.push()
        p.translate(part.x, part.y, part.z)
        p.sphere(part.r * swell, part.nb > 0 ? 12 : 8, part.nb > 0 ? 10 : 6)
        p.pop()
      }
    }

    p.setup = () => {
      p.createCanvas(container.offsetWidth, container.offsetHeight, p.WEBGL)
      p.frameRate(60)
      p.noiseSeed(p.random(10000))
      spawnParticles()
    }

    p.mousePressed = () => {
      if (p.mouseX < 0 || p.mouseX > p.width || p.mouseY < 0 || p.mouseY > p.height) return
      dragging = true
      lastMX = p.mouseX; lastMY = p.mouseY
      spinVX = 0; spinVY = 0
      idleTimer = 0
    }

    p.mouseDragged = () => {
      if (!dragging) return
      const dx = p.mouseX - lastMX
      const dy = p.mouseY - lastMY
      spinVY = dx * 0.004
      spinVX = -dy * 0.004
      rotY += spinVY
      rotX += spinVX
      lastMX = p.mouseX; lastMY = p.mouseY
    }

    p.mouseReleased = () => { dragging = false }

    p.doubleClicked = () => { rotZTarget += Math.PI }
    p.flip = () => { rotZTarget += Math.PI }

    p.keyPressed = () => {
      if (p.key === ' ') { rotZTarget += Math.PI; return false }
    }

    p.mouseWheel = (e: { delta: number }) => {
      camDist = p.constrain(camDist + e.delta * 0.5, 260, 900)
      return false
    }

    p.resetDrawings = () => { spawnParticles() }
    p.setHue = (hue: number) => { liquidHue = hue }

    p.draw = () => {
      p.background(8, 10, 16)

      if (!dragging) {
        rotX += spinVX
        rotY += spinVY
        spinVX *= 0.94
        spinVY *= 0.94
        idleTimer++
        if (idleTimer > 90 && Math.abs(spinVX) < 0.0005 && Math.abs(spinVY) < 0.0005) {
          rotY += IDLE_SPIN
        }
      }
      rotZ += (rotZTarget - rotZ) * 0.07

      stepPhysics()

      p.ambientLight(110, 120, 150)
      p.pointLight(255, 255, 255, 200, -300, 350)
      p.pointLight(190, 210, 255, -250, 250, -200)

      p.camera(0, 0, camDist, 0, 0, 0, 0, 1, 0)

      p.push()
      p.rotateY(rotY)
      p.rotateX(rotX)
      p.rotateZ(rotZ)

      drawWheels()
      drawBaffleList(STATIC_BAFFLES, 255, 255, 255, 180)
      drawParticles()
      drawShell()

      p.pop()
    }
  }
}
