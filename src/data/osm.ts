/** Az Overpass API `out body geom` válaszának általunk használt része */

export type Tags = Record<string, string>

export interface OsmNode {
  type: 'node'
  id: number
  lat: number
  lon: number
  tags?: Tags
}

export interface OsmWay {
  type: 'way'
  id: number
  nodes: number[]
  geometry: { lat: number; lon: number }[]
  tags?: Tags
}

export interface OsmData {
  elements: Array<OsmNode | OsmWay | { type: 'relation'; id: number }>
}

/** Autóval járható úttípusok (a szervizutakat szándékosan kihagyjuk: túl sok zajt adnak) */
export const DRIVABLE = new Set([
  'motorway',
  'motorway_link',
  'trunk',
  'trunk_link',
  'primary',
  'primary_link',
  'secondary',
  'secondary_link',
  'tertiary',
  'tertiary_link',
  'unclassified',
  'residential',
  'living_street',
  'road',
])

const RANK: Record<string, number> = {
  motorway: 7,
  trunk: 6,
  primary: 5,
  secondary: 4,
  tertiary: 3,
  unclassified: 2,
  road: 2,
  residential: 1,
  living_street: 0,
}

export function highwayRank(highway: string | undefined): number {
  if (!highway) return -1
  return RANK[highway.replace(/_link$/, '')] ?? -1
}

export function isDrivableWay(w: OsmWay): boolean {
  const t = w.tags ?? {}
  return DRIVABLE.has(t.highway ?? '') && t.area !== 'yes' && t.access !== 'no'
}

export function isRoundaboutWay(w: OsmWay | undefined): boolean {
  const j = w?.tags?.junction
  return j === 'roundabout' || j === 'circular'
}

/** OSM maxspeed → km/h (magyar alapértelmezésekkel) */
export function parseMaxspeed(tags: Tags | undefined): number | null {
  if (!tags) return null
  const raw = tags.maxspeed ?? tags['maxspeed:forward']
  if (raw) {
    const n = parseInt(raw, 10)
    if (!Number.isNaN(n)) return n
    const named: Record<string, number> = {
      'HU:urban': 50,
      'HU:rural': 90,
      'HU:trunk': 110,
      'HU:motorway': 130,
      'HU:living_street': 20,
      walk: 20,
    }
    if (raw in named) return named[raw]
  }
  if (tags.highway === 'living_street') return 20
  return null
}
