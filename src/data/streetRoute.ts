import type { LineString } from 'geojson'
import { metersBetween, type LngLat } from '../lib/geo'
import { isDrivableWay, isRoundaboutWay, type OsmData, type OsmWay } from './osm'

/**
 * Útvonal utcanevek (és útszámok) sorrendjéből, a vizsgaútvonalak szokásos megadása szerint
 * („Budaörsi út – Egér út – Beregszász út”). Az utcák találkozási pontjait (közös OSM-csomópont) keresi,
 * és pontosan ezeken az utcákon vezet végig, az egyirányú utcák menetirányát betartva.
 */

export interface StreetRoute {
  line: LineString
  /** Utcaváltások helye (ezek lesznek az útpontok) */
  junctions: LngLat[]
  lengthM: number
  /** Melyik OSM-utcanévre illeszkedett az egyes bejegyzés (pl. „Bécsi” → „Bécsi út”) */
  matched: string[]
}

/** Az útvonal elején és végén ennyit megyünk az első, illetve az utolsó utcán (m) */
const EXTEND_M = 300
/** Két utca között legfeljebb ilyen hosszú összekötő szakasz lehet (tér, csomóponti ág; m) */
const CONNECTOR_M = 400

/** Összekötő lehet: névtelen szakasz, csomóponti ág (_link), körforgalom, tér/körtér/körönd */
function isConnectorWay(w: OsmWay): boolean {
  const name = w.tags?.name ?? ''
  return !name || (w.tags?.highway ?? '').endsWith('_link') || isRoundaboutWay(w) || /(tér|körtér|körönd)$/iu.test(name)
}

// ---------------------------------------------------------------- bejegyzések, nevek

/** A megadott lista szétbontása: új sor, gondolatjel, nyíl, pontosvessző, vessző */
export function parseStreetList(text: string): string[] {
  return text
    .split(/\n|[–—→;,]|\s-\s|->/)
    .map((s) => s.trim().replace(/\s+/g, ' '))
    .filter((s) => s.length > 0)
}

const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bkrt\.?$/u, 'körút'],
  [/\brkp\.?$/u, 'rakpart'],
  [/\bsgt\.?$/u, 'sugárút'],
  [/\bltp\.?$/u, 'lakótelep'],
  [/\bu\.?$/u, 'utca'],
  [/\bstny\.?$/u, 'sétány'],
]

/** Utcanév összehasonlításhoz: kisbetű, rövidítések kiírva, felesleges írásjelek nélkül */
export function normalizeStreetName(name: string): string {
  let s = name.toLocaleLowerCase('hu').trim().replace(/\s+/g, ' ')
  for (const [re, full] of ABBREVIATIONS) s = s.replace(re, full)
  return s.replace(/[.„”"]/g, '').trim()
}

/** Útszám felismerése: „1-es út”, „10”, „M0”, „M1-es autópálya”, „4. sz. főút” → „1”, „10”, „M0”, „M1”, „4” */
export function roadNumber(entry: string): string | null {
  const m = /^(m\s?\d{1,2}|\d{1,4})\.?(\s*-?\s*[a-záéíóöőúüű]{1,3})?(\s*sz(ámú|\.)?)?(\s*(főút|út|autópálya|autóút|számú út))?$/iu.exec(entry.trim())
  return m ? m[1].replace(/\s/g, '').toUpperCase() : null
}

// ---------------------------------------------------------------- utak illesztése

interface Entry {
  label: string
  ways: Set<number>
  matched: string
}

function matchEntries(entries: string[], ways: OsmWay[]): Entry[] {
  const byName = new Map<string, { display: string; ids: number[] }>()
  for (const w of ways) {
    const name = w.tags?.name
    if (!name) continue
    const key = normalizeStreetName(name)
    const e = byName.get(key) ?? { display: name, ids: [] }
    e.ids.push(w.id)
    byName.set(key, e)
  }
  return entries.map((label) => {
    const ref = roadNumber(label)
    if (ref) {
      const ids = ways.filter((w) => (w.tags?.ref ?? '').split(';').some((r) => r.replace(/\s/g, '').toUpperCase() === ref)).map((w) => w.id)
      if (!ids.length) throw new Error(`Nem találom a térképadatokban a(z) ${ref}. számú utat („${label}”).`)
      return { label, ways: new Set(ids), matched: `${ref}. számú út` }
    }
    const key = normalizeStreetName(label)
    const exact = byName.get(key)
    if (exact) return { label, ways: new Set(exact.ids), matched: exact.display }
    // Hiányos név: pl. „Bécsi” → „Bécsi út”, ha egyértelmű
    const prefix = [...byName.entries()].filter(([k]) => k.startsWith(key + ' ') || k.startsWith(key))
    if (prefix.length === 1) return { label, ways: new Set(prefix[0][1].ids), matched: prefix[0][1].display }
    if (prefix.length > 1) {
      const names = prefix.slice(0, 6).map(([, v]) => v.display)
      throw new Error(`„${label}” több utcára is illik: ${names.join(', ')}${prefix.length > 6 ? '…' : ''}. Írd ki a teljes nevet.`)
    }
    throw new Error(`Nem találom a térképadatokban: „${label}”. Ellenőrizd az utca nevét és a települést.`)
  })
}

// ---------------------------------------------------------------- úthálózat

export interface Edge {
  to: number
  len: number
  way: number
}

export interface Graph {
  out: Map<number, Edge[]>
  /** Minden szomszédság irány nélkül (a kezdő szakasz visszafelé kereséséhez) */
  inc: Map<number, Edge[]>
  coord: Map<number, LngLat>
  waysAt: Map<number, Set<number>>
  /** Összekötőként használható utak */
  connector: Set<number>
}

function isOneway(w: OsmWay): 1 | -1 | 0 {
  const v = w.tags?.oneway
  if (v === '-1') return -1
  if (v === 'yes' || v === '1' || v === 'true' || isRoundaboutWay(w)) return 1
  return 0
}

export function buildGraph(ways: OsmWay[]): Graph {
  const g: Graph = { out: new Map(), inc: new Map(), coord: new Map(), waysAt: new Map(), connector: new Set() }
  const push = (m: Map<number, Edge[]>, k: number, e: Edge) => {
    const list = m.get(k)
    if (list) list.push(e)
    else m.set(k, [e])
  }
  for (const w of ways) {
    if (isConnectorWay(w)) g.connector.add(w.id)
    const dir = isOneway(w)
    w.nodes.forEach((id, i) => {
      const p = w.geometry[i]
      if (p) g.coord.set(id, [p.lon, p.lat])
      const set = g.waysAt.get(id) ?? new Set<number>()
      set.add(w.id)
      g.waysAt.set(id, set)
    })
    for (let i = 0; i < w.nodes.length - 1; i++) {
      const a = w.nodes[i]
      const b = w.nodes[i + 1]
      const pa = w.geometry[i]
      const pb = w.geometry[i + 1]
      if (!pa || !pb) continue
      const len = metersBetween([pa.lon, pa.lat], [pb.lon, pb.lat])
      if (dir >= 0) {
        push(g.out, a, { to: b, len, way: w.id })
        push(g.inc, b, { to: a, len, way: w.id })
      }
      if (dir <= 0) {
        push(g.out, b, { to: a, len, way: w.id })
        push(g.inc, a, { to: b, len, way: w.id })
      }
    }
  }
  return g
}

/** Egyszerű bináris kupac a Dijkstra-kereséshez */
export class Heap<T> {
  private items: Array<{ k: number; v: T }> = []
  get size() {
    return this.items.length
  }
  push(k: number, v: T) {
    const a = this.items
    a.push({ k, v })
    for (let i = a.length - 1; i > 0; ) {
      const p = (i - 1) >> 1
      if (a[p].k <= a[i].k) break
      ;[a[p], a[i]] = [a[i], a[p]]
      i = p
    }
  }
  pop(): { k: number; v: T } | undefined {
    const a = this.items
    const top = a[0]
    const last = a.pop()
    if (a.length && last) {
      a[0] = last
      for (let i = 0; ; ) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < a.length && a[l].k < a[m].k) m = l
        if (r < a.length && a[r].k < a[m].k) m = r
        if (m === i) break
        ;[a[m], a[i]] = [a[i], a[m]]
        i = m
      }
    }
    return top
  }
}

// ---------------------------------------------------------------- kiterjesztés az elején és a végén

function bearing(a: LngLat, b: LngLat): number {
  const kx = Math.cos((a[1] * Math.PI) / 180)
  return Math.atan2((b[0] - a[0]) * kx, b[1] - a[1])
}

function turnAngle(prev: LngLat, at: LngLat, next: LngLat): number {
  let d = Math.abs(bearing(prev, at) - bearing(at, next))
  if (d > Math.PI) d = 2 * Math.PI - d
  return d
}

/**
 * Továbbhaladás egy utcán legfeljebb `maxLen` méterig, mindig a legegyenesebb folytatással.
 * `edges` az irányított szomszédság (előre: out, visszafelé: inc), `from` ahonnan érkeztünk.
 */
function walk(g: Graph, edgesOf: Map<number, Edge[]>, start: number, first: Edge, ways: Set<number>, maxLen: number): { nodes: number[]; len: number } {
  const nodes = [first.to]
  let len = first.len
  let prev = start
  let cur = first.to
  const seen = new Set([start, cur])
  while (len < maxLen) {
    const pc = g.coord.get(prev)
    const cc = g.coord.get(cur)
    const options = (edgesOf.get(cur) ?? []).filter((e) => ways.has(e.way) && !seen.has(e.to))
    if (!options.length || !pc || !cc) break
    const next = options.reduce((best, e) => {
      const nb = g.coord.get(e.to)
      const bb = g.coord.get(best.to)
      if (!nb || !bb) return best
      return turnAngle(pc, cc, nb) < turnAngle(pc, cc, bb) ? e : best
    })
    // Éles fordulónál (pl. egy másik azonos nevű utcaágra) megállunk
    const nc = g.coord.get(next.to)
    if (nc && turnAngle(pc, cc, nc) > Math.PI * 0.6) break
    nodes.push(next.to)
    seen.add(next.to)
    len += next.len
    prev = cur
    cur = next.to
  }
  return { nodes, len }
}

/** A leghosszabb (legfeljebb maxLen) folytatás az utcán a csomópontból; `avoid` felé nem indulunk */
function extend(g: Graph, edgesOf: Map<number, Edge[]>, at: number, ways: Set<number>, avoid: number | null, maxLen: number): number[] {
  const firsts = (edgesOf.get(at) ?? []).filter((e) => ways.has(e.way) && e.to !== avoid)
  let best: { nodes: number[]; len: number } = { nodes: [], len: 0 }
  for (const f of firsts) {
    const r = walk(g, edgesOf, at, f, ways, maxLen)
    if (r.len > best.len + 1) best = r
  }
  return best.nodes
}

// ---------------------------------------------------------------- javaslat, ha két utca nem találkozik

/** Legfeljebb ilyen hosszú kerülőt keresünk a javaslathoz (m) */
const SUGGEST_M = 5000

/**
 * A legrövidebb szabályos (egyirányúságot betartó) út bármely úton az első utca elért csomópontjaiból a következő
 * utcáig; a közbülső utcák nevei (sorrendben, a két utcát és a névtelen szakaszokat kihagyva).
 */
function suggestConnection(g: Graph, ways: OsmWay[], from: number[], target: Set<number>, skip: string[]): string[] {
  const nameOf = new Map(ways.map((w) => [w.id, w.tags?.name ?? '']))
  const dist = new Map<number, number>()
  const back = new Map<number, { from: number; way: number }>()
  const h = new Heap<number>()
  for (const id of from) {
    dist.set(id, 0)
    h.push(0, id)
  }
  let end: number | null = null
  while (h.size) {
    const top = h.pop()
    if (!top || top.k > (dist.get(top.v) ?? Infinity)) continue
    if ([...(g.waysAt.get(top.v) ?? [])].some((w) => target.has(w)) && !from.includes(top.v)) {
      end = top.v
      break
    }
    for (const e of g.out.get(top.v) ?? []) {
      const c = top.k + e.len
      if (c > SUGGEST_M || c >= (dist.get(e.to) ?? Infinity)) continue
      dist.set(e.to, c)
      back.set(e.to, { from: top.v, way: e.way })
      h.push(c, e.to)
    }
  }
  const names: string[] = []
  for (let x = end; x !== null && back.has(x); ) {
    const step = back.get(x)
    if (!step) break
    const name = nameOf.get(step.way) ?? ''
    if (name && !skip.includes(name) && names[0] !== name) names.unshift(name)
    x = step.from
  }
  return names
}

// ---------------------------------------------------------------- útvonal

export function buildStreetRoute(entryLabels: string[], osm: OsmData): StreetRoute {
  if (entryLabels.length < 2) throw new Error('Legalább két utcát adj meg, sorrendben (pl. „Budaörsi út, Egér út”).')
  const ways = osm.elements.filter((e): e is OsmWay => e.type === 'way' && isDrivableWay(e) && e.geometry?.length >= 2)
  const entries = matchEntries(entryLabels, ways)
  const g = buildGraph(ways)
  const n = entries.length
  const onEntry = (node: number, k: number) => {
    const set = g.waysAt.get(node)
    if (!set) return false
    for (const w of set) if (entries[k].ways.has(w)) return true
    return false
  }

  // Rétegzett Dijkstra: a k. rétegben csak a k. utca útjain lehet haladni; utcaváltás közös csomópontban.
  // Az állapot része, hogy az adott utcán haladtunk-e már: a 2. utcától kezdve mindegyiken ténylegesen végig kell
  // menni egy darabot (különben egy hármas csomópontban „átugorhatna” egy utcát, vagy behajtana egy egyirányú
  // utcába a menetiránnyal szemben). A csomópont-azonosító negatív (alakpont) vagy nagyon nagy is lehet: szöveges kulcs.
  type State = [node: number, layer: number, moved: 0 | 1]
  const key = ([node, layer, moved]: State) => `${node}|${layer}|${moved}`
  const parse = (k: string): State => {
    const [a, b, c] = k.split('|')
    return [Number(a), Number(b), c === '1' ? 1 : 0]
  }
  const dist = new Map<string, number>()
  const prev = new Map<string, string>()
  /** Összekötő szakasz csomópontjai egy utcaváltásnál (az állapothoz, ahová vezet) */
  const viaOf = new Map<string, number[]>()
  const heap = new Heap<State>()

  /**
   * Két egymást követő utca gyakran nem közös csomópontban találkozik, hanem egy rövid, más nevű szakaszon át:
   * osztott pályás út csomóponti ága, névtelen összekötő, körforgalom vagy tér (pl. Móricz Zsigmond körtér).
   * Ezeken legfeljebb CONNECTOR_M méteren át is átléphetünk a következő utcára; más nevű utcán nem, hogy a
   * listából kimaradt utcát ne „egészítse ki” csendben.
   */
  const connectorCache = new Map<string, Array<{ to: number; cost: number; via: number[] }>>()
  function connectorsFrom(start: number, nextLayer: number) {
    const ck = `${start}|${nextLayer}`
    const cached = connectorCache.get(ck)
    if (cached) return cached
    const found: Array<{ to: number; cost: number; via: number[] }> = []
    const best = new Map<number, number>([[start, 0]])
    const back = new Map<number, number>()
    const h = new Heap<number>()
    h.push(0, start)
    while (h.size) {
      const top = h.pop()
      if (!top || top.k > (best.get(top.v) ?? Infinity)) continue
      const u = top.v
      if (u !== start && onEntry(u, nextLayer)) {
        const via: number[] = []
        for (let x = back.get(u); x !== undefined && x !== start; x = back.get(x)) via.unshift(x)
        found.push({ to: u, cost: top.k, via })
        continue
      }
      for (const e of g.out.get(u) ?? []) {
        if (!g.connector.has(e.way)) continue
        const c = top.k + e.len
        if (c > CONNECTOR_M || c >= (best.get(e.to) ?? Infinity)) continue
        best.set(e.to, c)
        back.set(e.to, u)
        h.push(c, e.to)
      }
    }
    connectorCache.set(ck, found)
    return found
  }
  for (const w of ways) {
    if (!entries[0].ways.has(w.id)) continue
    for (const id of w.nodes) {
      // Az első utcán bárhonnan indulhatunk (az elejét később meghosszabbítjuk)
      const k = key([id, 0, 1])
      if (!dist.has(k)) {
        dist.set(k, 0)
        heap.push(0, [id, 0, 1])
      }
    }
  }
  let goal: string | null = null
  let reached = 0
  while (heap.size) {
    const top = heap.pop()
    if (!top) break
    const [node, layer, moved] = top.v
    const k = key(top.v)
    if (top.k > (dist.get(k) ?? Infinity)) continue
    if (moved) reached = Math.max(reached, layer)
    if (layer === n - 1 && moved) {
      goal = k
      break
    }
    const relax = (s: State, cost: number, via: number[] = []) => {
      const tk = key(s)
      if (cost < (dist.get(tk) ?? Infinity)) {
        dist.set(tk, cost)
        prev.set(tk, k)
        if (via.length) viaOf.set(tk, via)
        else viaOf.delete(tk)
        heap.push(cost, s)
      }
    }
    if (moved && layer < n - 1) {
      // Utcaváltás: a csomópont a következő utcán is rajta van, és ezen az utcán már haladtunk
      if (onEntry(node, layer + 1)) relax([node, layer + 1, 0], top.k)
      // Vagy rövid összekötő szakaszon (tér, csomóponti ág, körforgalom) át érjük el a következő utcát
      for (const c of connectorsFrom(node, layer + 1)) relax([c.to, layer + 1, 0], top.k + c.cost, c.via)
    }
    for (const e of g.out.get(node) ?? []) if (entries[layer].ways.has(e.way)) relax([e.to, layer, 1], top.k + e.len)
  }
  if (goal === null) {
    const a = entries[reached]
    const b = entries[Math.min(reached + 1, n - 1)]
    const from = [...dist.keys()].map(parse).filter(([, layer, moved]) => layer === reached && moved === 1).map(([node]) => node)
    const via = suggestConnection(g, ways, from, b.ways, [a.matched, b.matched])
    throw new Error(
      `„${a.label}” és „${b.label}” nem találkozik a megadott sorrendben (vagy csak egyirányú utcán, a menetiránnyal szemben lehetne).` +
        (via.length ? ` Közöttük a(z) ${via.map((v) => `„${v}”`).join(', ')} vezet át: add meg ${via.length > 1 ? 'ezeket' : 'ezt'} is.` : ' Adj meg közöttük egy utcát.'),
    )
  }

  // Útvonal visszaállítása
  const states: State[] = []
  for (let k: string | undefined = goal; k !== undefined; k = prev.get(k)) states.push(parse(k))
  states.reverse()
  const pathNodes: number[] = []
  const junctions: LngLat[] = []
  for (let i = 0; i < states.length; i++) {
    const [node, layer] = states[i]
    if (i > 0 && states[i - 1][1] !== layer) {
      // Utcaváltás: közös csomópont, vagy összekötő szakasz a két utca között
      pathNodes.push(...(viaOf.get(key(states[i])) ?? []))
      const c = g.coord.get(node)
      if (c) junctions.push(c)
      if (node === pathNodes[pathNodes.length - 1]) continue
    }
    pathNodes.push(node)
  }

  // Az első utcán visszafelé, az utolsón előre haladunk még egy darabot
  const startNode = pathNodes[0]
  const before = extend(g, g.inc, startNode, entries[0].ways, pathNodes[1] ?? null, EXTEND_M).reverse()
  const endNode = pathNodes[pathNodes.length - 1]
  const after = extend(g, g.out, endNode, entries[n - 1].ways, pathNodes[pathNodes.length - 2] ?? null, EXTEND_M)
  const all = [...before, ...pathNodes, ...after]

  const coords: LngLat[] = []
  for (const id of all) {
    const c = g.coord.get(id)
    if (c && !(coords.length && coords[coords.length - 1][0] === c[0] && coords[coords.length - 1][1] === c[1])) coords.push(c)
  }
  if (coords.length < 2) throw new Error('Az útvonal túl rövid lett. Ellenőrizd az utcák sorrendjét.')
  let lengthM = 0
  for (let i = 1; i < coords.length; i++) lengthM += metersBetween(coords[i - 1], coords[i])
  return { line: { type: 'LineString', coordinates: coords }, junctions, lengthM, matched: entries.map((e) => e.matched) }
}
