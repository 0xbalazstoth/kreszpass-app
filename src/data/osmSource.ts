import type { LineString } from 'geojson'
import { mergeOsm, type OsmData } from './osm'
import { fetchLocalOsm, inCoverage, loadLocalIndex } from './osmLocal'
import { fetchOverpassChunk, OverpassError, sleep, splitRoute } from './overpass'

export interface OsmProgress {
  done: number
  total: number
  source: 'local' | 'overpass'
  status?: string
}

export interface OsmLoadResult {
  data: OsmData
  /** Szakaszok, amelyek a helyi adatcsomagból jöttek */
  localChunks: number
  /** Szakaszok, amelyek az Overpass szerverről (a helyi csomagon kívül) */
  remoteChunks: number
  /** A helyi adatcsomag dátuma, ha volt */
  dataDate?: string
}

/**
 * Az útvonal menti OSM-adatok. Elsősorban a helyi (az apphoz csomagolt, `npm run osm`-mel készült)
 * csempékből dolgozik, amelyek gyorsak és megbízhatók. Csak a lefedetlen szakaszokra (pl. határon túl)
 * kérdezi az Overpass szervert, türelmes újrapróbálással.
 */
export async function loadOsmForRoute(
  line: LineString,
  opts: { force?: boolean; signal?: AbortSignal; onProgress?: (p: OsmProgress) => void } = {},
): Promise<OsmLoadResult> {
  const index = await loadLocalIndex()
  if (index && inCoverage(line, index)) {
    // A teljes útvonal a helyi csomagban van: egyetlen menetben, szakaszolás nélkül
    const data = await fetchLocalOsm(line, index, {
      signal: opts.signal,
      onProgress: (done, total) => opts.onProgress?.({ done, total, source: 'local' }),
    })
    return { data, localChunks: 1, remoteChunks: 0, dataDate: index.dataDate }
  }

  const chunks = splitRoute(line)
  const parts: OsmData[] = []
  let localChunks = 0
  let remoteChunks = 0
  let requested = false
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    if (index && inCoverage(chunk, index)) {
      opts.onProgress?.({ done: i, total: chunks.length, source: 'local' })
      parts.push(await fetchLocalOsm(chunk, index, { signal: opts.signal }))
      localChunks++
      continue
    }
    opts.onProgress?.({ done: i, total: chunks.length, source: 'overpass' })
    try {
      // Két szerverkérés között kis szünet, hogy ne ütközzünk a kérésenkénti korlátba
      if (requested) await sleep(700, opts.signal)
      const { data, fromCache } = await fetchOverpassChunk(chunk, {
        force: opts.force,
        signal: opts.signal,
        onStatus: (status) => opts.onProgress?.({ done: i, total: chunks.length, source: 'overpass', status }),
      })
      if (!fromCache) requested = true
      parts.push(data)
      remoteChunks++
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e
      const detail = e instanceof Error ? e.message : String(e)
      throw new OverpassError(
        `Az útvonal egy része kívül esik a helyi térképadatokon, és az OpenStreetMap-szerver most túlterhelt ` +
          `(${i}/${chunks.length} szakasz kész). A kész szakaszok megmaradtak: próbáld újra egy-két perc múlva. (${detail})`,
      )
    }
  }
  opts.onProgress?.({ done: chunks.length, total: chunks.length, source: remoteChunks ? 'overpass' : 'local' })
  return { data: mergeOsm(parts), localChunks, remoteChunks, dataDate: index?.dataDate }
}
