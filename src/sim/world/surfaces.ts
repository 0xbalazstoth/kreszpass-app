import * as clipperLib from 'js-angusj-clipper/web'
import type { XZ } from './project'
import type { Poly } from './streets'
import type { StreetSurfaces } from './types'

/**
 * Az utcafelületek utómunkája (Angus Johnson Clipper könyvtára WebAssemblyként, MIT/Boost):
 * - a kereszteződésekben a szegély sarkai lekerekítve (a valóságban kb. 5–6 m-es ívvel), és ahol a kereszteződés
 *   után keskenyebb az út, a szegély nem lépcsőzetesen, hanem ívben szűkül; a járda követi az új szegélyt;
 * - minden felület 50 m-es csempékre vágva, hogy a pont-a-sokszögben vizsgálat és a rajzolás darabolása gyors legyen.
 */

/** Centiméteres egész koordináták a Clippernek */
const S = 100
const TILE_M = 50
/** A szegély ívének sugara és a járda szélessége az ív mentén (m) */
const KERB_R = 5.5
const WALK_W = 1.6
/** Csak a kereszteződések ennyi méteres környezetében kerekítünk (a középszigetek, szűk közök máshol maradnak) */
const NEAR_JUNCTION = 14

type Path = Array<{ x: number; y: number }>
let lib: clipperLib.ClipperLibWrapper | null = null

/** A Clipper (WebAssembly) betöltése; nélküle a felületek kerekítés és csempézés nélkül maradnak */
export async function initSurfaces(): Promise<boolean> {
  if (lib) return true
  try {
    lib = await clipperLib.loadNativeClipperLibInstanceAsync(clipperLib.NativeClipperLibRequestedFormat.WasmWithAsmJsFallback)
  } catch (e) {
    console.warn('A Clipper nem tölthető be', e)
  }
  return !!lib
}

const area = (p: Path) => {
  let a = 0
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j].x + p[i].x) * (p[j].y - p[i].y)
  return a / 2
}

const boundsOf = (p: Path): [number, number, number, number] => {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const q of p) {
    x0 = Math.min(x0, q.x)
    y0 = Math.min(y0, q.y)
    x1 = Math.max(x1, q.x)
    y1 = Math.max(y1, q.y)
  }
  return [x0, y0, x1, y1]
}

const toPath = (pts: XZ[]): Path => pts.map(([x, z]) => ({ x: Math.round(x * S), y: Math.round(z * S) }))

function toPaths(polys: Poly[]): Path[] {
  const out: Path[] = []
  for (const p of polys) {
    const outer = toPath(p.outer)
    if (area(outer) < 0) outer.reverse()
    out.push(outer)
    for (const h of p.holes) {
      const hp = toPath(h)
      if (area(hp) > 0) hp.reverse()
      out.push(hp)
    }
  }
  return out
}

function inRing(x: number, y: number, ring: Path): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** Clipper-eredmény → sokszögek: a pozitív irányítású utak a külső gyűrűk, a negatívak a lyukak */
function fromPaths(paths: Path[]): Poly[] {
  const outers: Array<{ path: Path; area: number; holes: XZ[][] }> = []
  const holes: Path[] = []
  // A külső gyűrűk irányítása a legnagyobb gyűrűé (a lyukaké ellentétes)
  let sign = 1
  let biggest = 0
  for (const p of paths) {
    const a = area(p)
    if (Math.abs(a) > biggest) {
      biggest = Math.abs(a)
      sign = Math.sign(a) || 1
    }
  }
  for (const p of paths) {
    if (p.length < 3) continue
    const a = area(p) * sign
    if (Math.abs(a) < 0.01 * S * S) continue
    if (a > 0) outers.push({ path: p, area: a, holes: [] })
    else holes.push(p)
  }
  outers.sort((a, b) => a.area - b.area)
  const xz = (p: Path): XZ[] => p.map((q) => [q.x / S, q.y / S] as XZ)
  for (const h of holes) {
    const o = outers.find((x) => inRing(h[0].x, h[0].y, x.path))
    if (o) o.holes.push(xz(h))
  }
  return outers.map((o) => {
    const outer = xz(o.path)
    const xs = outer.map((p) => p[0])
    const zs = outer.map((p) => p[1])
    return { outer, holes: o.holes, bbox: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)] }
  })
}

function clip(c: clipperLib.ClipperLibWrapper, type: clipperLib.ClipType, a: Path[], b: Path[] = []): Path[] {
  if (!a.length) return []
  return c.clipToPaths({
    clipType: type,
    subjectInputs: [{ data: a, closed: true }],
    clipInputs: b.length ? [{ data: b }] : [],
    subjectFillType: clipperLib.PolyFillType.NonZero,
    clipFillType: clipperLib.PolyFillType.NonZero,
  }) as Path[]
}

function inflate(c: clipperLib.ClipperLibWrapper, paths: Path[], m: number): Path[] {
  if (!paths.length) return []
  return c.offsetToPaths({ delta: m * S, offsetInputs: [{ data: paths, joinType: clipperLib.JoinType.Round, endType: clipperLib.EndType.ClosedPolygon }], arcTolerance: 5 }) as Path[]
}

/** 50 m-es csempékre vágás (egy-egy darab a csempéje határain belül marad) */
function tiled(c: clipperLib.ClipperLibWrapper, paths: Path[]): Poly[] {
  const T = TILE_M * S
  const by = new Map<string, Path[]>()
  for (const p of paths) {
    if (p.length < 3) continue
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const q of p) {
      x0 = Math.min(x0, q.x)
      y0 = Math.min(y0, q.y)
      x1 = Math.max(x1, q.x)
      y1 = Math.max(y1, q.y)
    }
    for (let x = Math.floor(x0 / T); x <= Math.floor(x1 / T); x++)
      for (let y = Math.floor(y0 / T); y <= Math.floor(y1 / T); y++) {
        const k = `${x},${y}`
        const list = by.get(k)
        if (list) list.push(p)
        else by.set(k, [p])
      }
  }
  const out: Poly[] = []
  for (const [k, list] of by) {
    const [x, y] = k.split(',').map(Number)
    // Ami teljesen a csempén belül van, vágás nélkül kerül bele (a kis jelek, sávdarabok többsége)
    const inside = list.every((p) => {
      const b = boundsOf(p)
      return b[0] >= x * T && b[2] <= (x + 1) * T && b[1] >= y * T && b[3] <= (y + 1) * T
    })
    if (inside) {
      out.push(...fromPaths(list))
      continue
    }
    const rect: Path = [
      { x: x * T, y: y * T },
      { x: (x + 1) * T, y: y * T },
      { x: (x + 1) * T, y: (y + 1) * T },
      { x: x * T, y: (y + 1) * T },
    ]
    out.push(...fromPaths(clip(c, clipperLib.ClipType.Intersection, list, [rect])))
  }
  return out
}

export function finishSurfaces(st0: StreetSurfaces): StreetSurfaces {
  let st = st0
  const c = lib
  if (!c) return st0
  const { Union, Difference, Intersection } = clipperLib.ClipType
  // Kis szigetek (pl. a minikörforgalom közepe, terelősziget), amelyeket minden oldalról úttest vesz körül: járhatók
  // (a valóságban alacsonyak, átjárhatók), az úttest részei
  const raisedAll = clip(c, Union, toPaths([...st.pavement, ...st.kerbs]))
  const around = inflate(c, toPaths(st.asphalt), 0.5)
  // A külső gyűrűk irányítása a legnagyobb gyűrűé
  const outerSign = Math.sign(raisedAll.reduce((best, p) => (Math.abs(area(p)) > Math.abs(best) ? area(p) : best), 0)) || 1
  const islands = raisedAll.filter((p) => {
    if (area(p) * outerSign <= 0 || Math.abs(area(p)) > 300 * S * S) return false
    // (a széle mentén pontatlan illeszkedés miatt: legfeljebb 15%-a lóghat ki az úttest mellől)
    const b = boundsOf(p)
    const near = around.filter((q) => {
      const r = boundsOf(q)
      return r[2] >= b[0] && r[0] <= b[2] && r[3] >= b[1] && r[1] <= b[3]
    })
    const rest = clip(c, Difference, [p], near).reduce((a, q) => a + Math.abs(area(q)), 0)
    return rest < 0.15 * Math.abs(area(p))
  })
  const raised = islands.length ? clip(c, Difference, raisedAll, islands) : raisedAll
  st = { ...st, asphalt: [...st.asphalt, ...fromPaths(islands)], pavement: fromPaths(clip(c, Difference, toPaths(st.pavement), islands)), kerbs: fromPaths(clip(c, Difference, toPaths(st.kerbs), islands)) }
  // A járható úttest: a sávok és a kereszteződések, a járdasarkok nélkül
  const asphalt0 = clip(c, Difference, toPaths(st.asphalt), raised)
  // Zárás (kifelé, majd ugyanannyival befelé tolva): a homorú sarkok és lépcsők ívvel kitöltődnek
  const closed = inflate(c, inflate(c, asphalt0, KERB_R), -KERB_R)
  const zone = inflate(c, toPaths(st.junctions), NEAR_JUNCTION)
  const fill = clip(c, Intersection, clip(c, Difference, closed, asphalt0), zone)
  const asphalt = clip(c, Union, [...asphalt0, ...fill])
  // A járda az új szegély mentén körbefut (csak ahol eddig is járda volt)
  const wrap = clip(c, Intersection, clip(c, Difference, inflate(c, fill, WALK_W), asphalt), inflate(c, raised, WALK_W))
  const pavement = clip(c, Difference, [...toPaths(st.pavement), ...wrap], asphalt)
  const kerbs = clip(c, Difference, toPaths(st.kerbs), asphalt)
  const junctions = clip(c, Union, [...toPaths(st.junctions), ...fill])
  return {
    asphalt: tiled(c, asphalt),
    junctions: tiled(c, junctions),
    pavement: tiled(c, pavement),
    kerbs: tiled(c, kerbs),
    // A festés (az osm2streets sávjain) vágás nélkül, csak csempékre osztva
    paint: tiled(c, toPaths(st.paint)),
  }
}
