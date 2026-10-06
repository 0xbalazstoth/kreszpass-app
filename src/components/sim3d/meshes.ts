import { BufferAttribute, BufferGeometry, Matrix4, ShapeUtils, Vector2 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { chunkOf } from '../../sim/world/build'
import { halfWidthAt } from '../../sim/world/lanes'
import { pavedCore } from '../../sim/world/roadIndex'
import type { XZ } from '../../sim/world/project'
import { inPoly, type Poly } from '../../sim/world/streets'
import type { SimBuilding, World } from '../../sim/world/types'
import { TILE_M, worldBox, type SurfaceName } from '../scene3d/materials'

/**
 * A szimulátor világának rajzolható hálói. Minden felület kb. 150 m-es darabokra (chunk) bontva, darabonként és
 * anyagonként egyetlen hálóba összefűzve: így kevés a rajzolási hívás, és a távoli darabok egyszerűen elrejthetők.
 * A burkolat UV-koordinátái a világ méterei (a textúra mindenhol valódi méretű, az átfedések nem látszanak).
 */

export const PAVEMENT_H = 0.15

class Builder {
  pos: number[] = []
  nor: number[] = []
  uv: number[] = []
  private tile: number

  constructor(tile: number) {
    this.tile = tile
  }

  /** Vízszintes háromszög (felfelé néző) */
  tri(a: XZ, b: XZ, c: XZ, y: number) {
    // Az óramutatóval ellentétes sorrend felülről nézve (a három.js-ben a z dél felé nő): ellenőrizzük, és szükség esetén fordítjuk
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    const pts = cross < 0 ? [a, b, c] : [a, c, b]
    for (const p of pts) {
      this.pos.push(p[0], y, p[1])
      this.nor.push(0, 1, 0)
      this.uv.push(p[0] / this.tile, -p[1] / this.tile)
    }
  }

  /** Vízszintes sokszög (lyukakkal) háromszögekre bontva */
  poly(p: Poly, y: number) {
    const contour = p.outer.map(([x, z]) => new Vector2(x, z))
    const holes = p.holes.map((h) => h.map(([x, z]) => new Vector2(x, z)))
    const all = [...p.outer, ...p.holes.flat()]
    for (const [a, b, c] of ShapeUtils.triangulateShape(contour, holes)) this.tri(all[a], all[b], all[c], y)
  }

  quad(q: readonly XZ[], y: number) {
    this.tri(q[0], q[1], q[2], y)
    this.tri(q[0], q[2], q[3], y)
  }

  disc(c: XZ, r: number, y: number, n = 20) {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2
      const a1 = ((i + 1) / n) * Math.PI * 2
      this.tri(c, [c[0] + Math.cos(a0) * r, c[1] + Math.sin(a0) * r], [c[0] + Math.cos(a1) * r, c[1] + Math.sin(a1) * r], y)
    }
  }

  /** Függőleges fal a–b között y0..y1 magasságban, a megadott oldal felé néző normálissal */
  wall(a: XZ, b: XZ, y0: number, y1: number, toward: XZ) {
    const dx = b[0] - a[0]
    const dz = b[1] - a[1]
    let nx = -dz
    let nz = dx
    if (nx * (toward[0] - a[0]) + nz * (toward[1] - a[1]) < 0) {
      nx = -nx
      nz = -nz
    }
    const len = Math.hypot(nx, nz) || 1
    nx /= len
    nz /= len
    const L = Math.hypot(dx, dz)
    const v = (p: XZ, y: number, u: number) => {
      this.pos.push(p[0], y, p[1])
      this.nor.push(nx, 0, nz)
      this.uv.push(u / this.tile, y / this.tile)
    }
    // Két háromszög; a (0, 1, 2) sorrend normálisa a (−dz, dx) irány: ha a kívánt normális ellentétes, megfordítjuk
    const flip = nx * -dz + nz * dx < 0
    const quad: Array<[XZ, number, number]> = [
      [a, y0, 0],
      [b, y0, L],
      [b, y1, L],
      [a, y1, 0],
    ]
    const order = flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]
    for (const i of order) v(quad[i][0], quad[i][1], quad[i][2])
  }

  geometry(): BufferGeometry | null {
    if (!this.pos.length) return null
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3))
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nor), 3))
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2))
    g.computeBoundingSphere()
    return g
  }
}

export interface ChunkMeshes {
  key: string
  centre: XZ
  /** A darab legtávolabbi pontja a középponttól (a láthatóság vizsgálatához) */
  radius: number
  asphalt: BufferGeometry | null
  pavement: BufferGeometry | null
  kerb: BufferGeometry | null
  paint: BufferGeometry | null
  /** Homlokzatok anyagonként */
  walls: Array<{ facade: Facade; geometry: BufferGeometry }>
  roofs: BufferGeometry | null
  windows: WindowSlot[]
  shops: WindowSlot[]
}

export interface WindowSlot {
  x: number
  y: number
  z: number
  rotY: number
}

export type Facade = { name: SurfaceName; tint?: string }

/** A ház homlokzata a színe és helye alapján: többnyire színezett vakolat, néha tégla */
function facadeOf(b: SimBuilding): Facade {
  let h = 0
  const key = `${b.color}${Math.round(b.x)}${Math.round(b.z)}`
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0
  const r = Math.abs(h) % 10
  if (r < 2) return { name: 'brick' }
  if (r < 4) return { name: 'plaster_rough', tint: b.color }
  if (r < 5) return { name: 'plaster_grey' }
  return { name: 'plaster', tint: b.color }
}

const BAY_M = 3.3
const FLOOR_M = 3.2

export function buildChunks(world: World): ChunkMeshes[] {
  const by = new Map<
    string,
    { asphalt: Builder; pavement: Builder; kerb: Builder; paint: Builder; walls: Map<string, { facade: Facade; list: BufferGeometry[] }>; roofs: BufferGeometry[]; windows: WindowSlot[]; shops: WindowSlot[]; sx: number; sz: number; n: number; box: [number, number, number, number] }
  >()
  const chunk = (p: XZ) => {
    const key = chunkOf(p)
    let c = by.get(key)
    if (!c) {
      c = {
        asphalt: new Builder(TILE_M.asphalt),
        pavement: new Builder(TILE_M.pavement),
        kerb: new Builder(TILE_M.kerb),
        paint: new Builder(2),
        walls: new Map(),
        roofs: [],
        windows: [],
        shops: [],
        sx: 0,
        sz: 0,
        n: 0,
        box: [Infinity, Infinity, -Infinity, -Infinity] as [number, number, number, number],
      }
      by.set(key, c)
    }
    c.sx += p[0]
    c.sz += p[1]
    c.n++
    return c
  }
  /** Egy sokszög darabja (a befoglaló téglalapja szerint), a darab kiterjedését is bővítve */
  const chunkFor = (poly: Poly) => {
    const c = chunk([(poly.bbox[0] + poly.bbox[2]) / 2, (poly.bbox[1] + poly.bbox[3]) / 2])
    c.box = [Math.min(c.box[0], poly.bbox[0]), Math.min(c.box[1], poly.bbox[1]), Math.max(c.box[2], poly.bbox[2]), Math.max(c.box[3], poly.bbox[3])]
    return c
  }
  /** Kiemelt felület (járda, szegélysáv): a teteje és a szélein a függőleges szegély (a csempék vágásvonalán nem) */
  const raised = (poly: Poly, top: (c: ReturnType<typeof chunk>) => Builder, side: (c: ReturnType<typeof chunk>) => Builder) => {
    const c = chunkFor(poly)
    top(c).poly(poly, PAVEMENT_H)
    const onCut = (a: XZ, b: XZ) => (a[0] === b[0] && Math.abs(a[0] / 50 - Math.round(a[0] / 50)) < 1e-6) || (a[1] === b[1] && Math.abs(a[1] / 50 - Math.round(a[1] / 50)) < 1e-6)
    for (const ring of [poly.outer, ...poly.holes])
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]
        const b = ring[(i + 1) % ring.length]
        const len = Math.hypot(b[0] - a[0], b[1] - a[1])
        if (len < 0.02 || onCut(a, b)) continue
        // A fal kifelé (a felülettől elfelé) néz
        const nx = -(b[1] - a[1]) / len
        const nz = (b[0] - a[0]) / len
        const m: XZ = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
        const out = inPoly([m[0] + nx * 0.05, m[1] + nz * 0.05], poly) ? -1 : 1
        side(c).wall(a, b, 0, PAVEMENT_H, [m[0] + nx * out, m[1] + nz * out])
      }
  }

  // Valósághű utcageometria (osm2streets): sokszögekből; különben az egyszerű szalagok, körök, négyszögek
  const st = world.streets
  if (st) {
    for (const p of st.asphalt) chunkFor(p).asphalt.poly(p, 0)
    for (const p of st.pavement) raised(p, (c) => c.pavement, (c) => c.kerb)
    for (const p of st.kerbs) raised(p, (c) => c.kerb, (c) => c.kerb)
    for (const p of st.paint) chunkFor(p).paint.poly(p, 0.012)
  }

  // Úttest: szakaszonként egy négyszög, a töréspontokon és a kereszteződésekben kitöltő kör
  for (const r of st ? [] : world.roads) {
    const tapered = r.hwStart !== undefined || r.hwEnd !== undefined
    for (let i = 0; i < r.pts.length - 1; i++) {
      const a = r.pts[i]
      const b = r.pts[i + 1]
      const len = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (len < 0.01) continue
      const rx = -(b[1] - a[1]) / len
      const rz = (b[0] - a[0]) / len
      // Kiszélesedő útnál rövid darabokban, hogy a szélesség folyamatosan változzon
      const n = tapered ? Math.max(1, Math.ceil(len / 6)) : 1
      for (let k = 0; k < n; k++) {
        const t0 = k / n
        const t1 = (k + 1) / n
        const p0: XZ = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0]
        const p1: XZ = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1]
        const w0 = halfWidthAt(r, r.cum[i] + len * t0)
        const w1 = halfWidthAt(r, r.cum[i] + len * t1)
        const q: XZ[] = [
          [p0[0] + rx * w0, p0[1] + rz * w0],
          [p1[0] + rx * w1, p1[1] + rz * w1],
          [p1[0] - rx * w1, p1[1] - rz * w1],
          [p0[0] - rx * w0, p0[1] - rz * w0],
        ]
        chunk([(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2]).asphalt.quad(q, 0)
      }
      if (i > 0) chunk(a).asphalt.disc(a, halfWidthAt(r, r.cum[i]), 0, 12)
    }
  }
  for (const j of st ? [] : world.junctions) {
    const c = chunk(j.at)
    c.asphalt.disc(j.at, pavedCore(j), 0.001, 28)
    for (const tri of j.fillets) c.asphalt.tri(tri[0], tri[1], tri[2], 0.001)
  }

  // Járda: a teteje és az úttest felőli szegélykő-fal
  for (const p of st ? [] : world.pavements) {
    const c = chunk([(p.quad[0][0] + p.quad[2][0]) / 2, (p.quad[0][1] + p.quad[2][1]) / 2])
    c.pavement.quad(p.quad, PAVEMENT_H)
    // A szegély fala az úttest felé néz (a négyszög belseje felől kifelé, a 3–4. sarok felől az 1–2. felé)
    const toward: XZ = [p.kerb[0][0] * 2 - p.quad[3][0], p.kerb[0][1] * 2 - p.quad[3][1]]
    c.kerb.wall(p.kerb[0], p.kerb[1], 0, PAVEMENT_H, toward)
  }

  // Burkolati jelek
  for (const m of world.markings) {
    const fx = Math.sin(m.heading)
    const fz = -Math.cos(m.heading)
    const rx = Math.cos(m.heading)
    const rz = Math.sin(m.heading)
    const l = m.length / 2
    const w = m.width / 2
    const at = (f: number, r: number): XZ => [m.at[0] + fx * f + rx * r, m.at[1] + fz * f + rz * r]
    chunk(m.at).paint.quad([at(l, -w), at(l, w), at(-l, w), at(-l, -w)], 0.012)
  }

  // Házak: falak homlokzat szerint összefűzve, tető, ablakok a két hosszabb (utcai és udvari) homlokzaton
  const mat = new Matrix4()
  for (const b of world.buildings) {
    const c = chunk([b.x, b.z])
    const facade = facadeOf(b)
    const tile = TILE_M[facade.name]
    const box = worldBox(b.w, b.h, b.d, tile)
    mat.makeRotationY(b.rotY).setPosition(b.x, b.h / 2, b.z)
    box.applyMatrix4(mat)
    const key = `${facade.name}|${facade.tint ?? ''}`
    const w = c.walls.get(key) ?? { facade, list: [] }
    w.list.push(box.index ? box.toNonIndexed() : box)
    c.walls.set(key, w)
    const roof = worldBox(b.w + 0.3, 0.3, b.d + 0.3, 4)
    mat.makeRotationY(b.rotY).setPosition(b.x, b.h + 0.15, b.z)
    roof.applyMatrix4(mat)
    c.roofs.push(roof.index ? roof.toNonIndexed() : roof)
    // Ablakok: a helyi ±X oldalakon (az épület utca felőli és hátsó homlokzata)
    const floors = Math.max(1, Math.floor((b.h - 0.8) / FLOOR_M))
    const cols = Math.floor(b.d / BAY_M)
    const cos = Math.cos(b.rotY)
    const sin = Math.sin(b.rotY)
    for (const side of [1, -1]) {
      for (let k = 0; k < cols; k++) {
        const along = -b.d / 2 + (b.d / cols) * (k + 0.5)
        for (let fl = 0; fl < floors; fl++) {
          const lx = side * (b.w / 2)
          // Helyi (lx, along) → világ (a three.js Y körüli forgatása szerint)
          const x = b.x + lx * cos + along * sin
          const z = b.z - lx * sin + along * cos
          const slot = { x, z, y: fl === 0 ? 1.55 : fl * FLOOR_M + 1.75, rotY: b.rotY + (side === 1 ? Math.PI / 2 : -Math.PI / 2) }
          if (fl === 0) c.shops.push(slot)
          else c.windows.push(slot)
        }
      }
    }
  }

  const out: ChunkMeshes[] = []
  for (const [key, c] of by) {
    const centre: XZ = [c.sx / c.n, c.sz / c.n]
    const radius = Number.isFinite(c.box[0])
      ? Math.max(...[c.box[0], c.box[2]].flatMap((x) => [c.box[1], c.box[3]].map((z) => Math.hypot(x - centre[0], z - centre[1]))))
      : 0
    out.push({
      key,
      centre,
      radius,
      asphalt: c.asphalt.geometry(),
      pavement: c.pavement.geometry(),
      kerb: c.kerb.geometry(),
      paint: c.paint.geometry(),
      walls: [...c.walls.values()].map((w) => ({ facade: w.facade, geometry: mergeGeometries(w.list) ?? w.list[0] })),
      roofs: c.roofs.length ? mergeGeometries(c.roofs) : null,
      windows: c.windows,
      shops: c.shops,
    })
  }
  return out
}

/** A háló anyagainak felszabadítása (a közös anyagokat nem) */
export function disposeChunks(chunks: ChunkMeshes[]): void {
  for (const c of chunks) {
    for (const g of [c.asphalt, c.pavement, c.kerb, c.paint, c.roofs]) g?.dispose()
    for (const w of c.walls) w.geometry.dispose()
  }
}
