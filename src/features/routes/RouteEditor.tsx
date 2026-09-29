import { useLiveQuery } from 'dexie-react-hooks'
import type { LineString } from 'geojson'
import { useEffect, useMemo, useRef, useState } from 'react'
import { MapView, type MapPin } from '../../components/MapView'
import { SceneView } from '../../components/SceneView'
import { approachFrames, fetchSigns, mergeSigns } from '../../data/mapillary'
import { fetchOsmForRoute } from '../../data/overpass'
import { parseTrackFile, snapToRoads } from '../../data/routing'
import { generateSituations, placeOnRoute } from '../../data/situations'
import { allPromptVariants, KIND_LABEL, TURN_LABEL } from '../../domain/questions'
import type { Route, Situation, SituationKind, Turn } from '../../domain/types'
import { db, getSettings, replaceSituations, situationsOf } from '../../db'
import { formatDistance } from '../../lib/format'
import { RouteGeom, type LngLat } from '../../lib/geo'
import { href, navigate } from '../../lib/router'
import { KIND_COLOR, KIND_ORDER } from './kinds'

type Mode = 'select' | 'waypoints' | 'situation'

interface Props {
  routeId: string
}

export function RouteEditor({ routeId: param }: Props) {
  const isNew = param === 'new'
  const [routeId] = useState(() => (isNew ? crypto.randomUUID() : param))
  const [name, setName] = useState('')
  const [examRouteId, setExamRouteId] = useState('')
  const [waypoints, setWaypoints] = useState<LngLat[]>([])
  const [line, setLine] = useState<LineString | null>(null)
  const [createdAt, setCreatedAt] = useState(() => Date.now())
  const [loadedFromDb, setLoadedFromDb] = useState(isNew)
  const [dirty, setDirty] = useState(false)
  const [mode, setMode] = useState<Mode>(isNew ? 'waypoints' : 'select')
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [onlyReview, setOnlyReview] = useState(false)
  const [confirmRegen, setConfirmRegen] = useState(false)
  const [coverage, setCoverage] = useState<Record<string, number>>({})
  const [token, setToken] = useState('')
  const [fitKey, setFitKey] = useState('init')
  const fileInput = useRef<HTMLInputElement>(null)

  const liveSituations = useLiveQuery(() => situationsOf(routeId), [routeId])
  const situations = useMemo(() => liveSituations ?? [], [liveSituations])

  useEffect(() => {
    getSettings().then((s) => setToken(s.mapillaryToken))
    if (isNew) return
    db.routes.get(routeId).then((r) => {
      if (!r) {
        setError('Nincs ilyen útvonal')
        return
      }
      setName(r.name)
      setExamRouteId(r.examRouteId ?? '')
      setWaypoints(r.waypoints)
      setLine(r.line)
      setCreatedAt(r.createdAt)
      setLoadedFromDb(true)
      setFitKey(`loaded-${r.id}`)
    })
  }, [isNew, routeId])

  const length = useMemo(() => {
    try {
      return line ? new RouteGeom(line).length : 0
    } catch {
      return 0
    }
  }, [line])

  const visible = onlyReview ? situations.filter((s) => s.needsReview) : situations
  const reviewCount = situations.filter((s) => s.needsReview).length
  const selected = situations.find((s) => s.id === selectedId) ?? null

  const pins: MapPin[] = useMemo(
    () =>
      situations.map((s, i) => ({
        id: s.id,
        lngLat: [s.lng, s.lat],
        label: String(i + 1),
        color: KIND_COLOR[s.kind],
        selected: s.id === selectedId,
      })),
    [situations, selectedId],
  )

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label)
    setError(null)
    setStatus(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  function onMapClick(p: LngLat) {
    if (mode === 'waypoints') {
      setWaypoints((w) => [...w, p])
      setDirty(true)
    } else if (mode === 'situation') {
      if (!line) {
        setError('Előbb készítsd el az útvonal vonalát')
        return
      }
      const base: Situation = {
        id: crypto.randomUUID(),
        routeId,
        d: 0,
        lng: p[0],
        lat: p[1],
        bearing: 0,
        kind: 'equal',
        turn: 'straight',
        needsReview: false,
        source: 'manual',
      }
      const s = placeOnRoute(line, base, p)
      db.situations.put(s).then(() => setSelectedId(s.id))
    }
  }

  async function save(): Promise<LineString> {
    if (!line || line.coordinates.length < 2) throw new Error('Előbb készítsd el az útvonal vonalát (útra illesztés, egyenes vonal vagy import)')
    const route: Route = {
      id: routeId,
      name: name.trim() || 'Névtelen útvonal',
      examRouteId: examRouteId.trim() || undefined,
      line,
      waypoints,
      createdAt,
      updatedAt: Date.now(),
    }
    await db.transaction('rw', [db.routes, db.situations], async () => {
      await db.routes.put(route)
      // Ha a vonal változott, a meglévő helyzeteket újra az útvonalra vetítjük
      const existing = await db.situations.where('routeId').equals(routeId).toArray()
      if (existing.length) await db.situations.bulkPut(existing.map((s) => placeOnRoute(line, s, [s.lng, s.lat])))
    })
    setDirty(false)
    if (isNew) history.replaceState(null, '', href(`route/${routeId}`))
    return line
  }

  const onSave = () => run('Mentés…', async () => {
    await save()
    setStatus('Elmentve')
  })

  const onSnap = () =>
    run('Útra illesztés…', async () => {
      const l = await snapToRoads(waypoints)
      setLine(l)
      setDirty(true)
      setMode('select')
      setStatus(`Útra illesztve: ${formatDistance(new RouteGeom(l).length)}`)
    })

  const onStraight = () => {
    if (waypoints.length < 2) {
      setError('Legalább két útpont kell')
      return
    }
    setLine({ type: 'LineString', coordinates: waypoints })
    setDirty(true)
  }

  const onImport = (file: File) =>
    run('Importálás…', async () => {
      const l = parseTrackFile(file.name, await file.text())
      setLine(l)
      setWaypoints([])
      if (!name) setName(file.name.replace(/\.(gpx|kml)$/i, ''))
      setDirty(true)
      setFitKey(`import-${Date.now()}`)
      setStatus(`Importálva: ${formatDistance(new RouteGeom(l).length)}`)
    })

  const onGenerate = () =>
    run('Helyzetek felismerése az OpenStreetMap-ből…', async () => {
      setConfirmRegen(false)
      const l = await save()
      const osm = await fetchOsmForRoute(l)
      const list = generateSituations(l, osm, { routeId })
      await replaceSituations(routeId, list)
      setCoverage({})
      const review = list.filter((s) => s.needsReview).length
      setStatus(`${list.length} helyzet felismerve, ebből ${review} kézi ellenőrzést igényel.`)
    })

  const onMapillarySigns = () =>
    run('Mapillary táblák lekérése…', async () => {
      const l = await save()
      const signs = await fetchSigns(token, l)
      const added = mergeSigns(l, situations, signs, routeId)
      await db.situations.bulkPut(added)
      setStatus(`${signs.length} felismert táblából ${added.length} új helyzet került be (mind ellenőrizendő).`)
    })

  const onCoverage = () =>
    run('Utcakép lefedettség ellenőrzése…', async () => {
      const l = await save()
      const result: Record<string, number> = {}
      const queue = [...situations]
      const worker = async () => {
        for (let s = queue.shift(); s; s = queue.shift()) {
          try {
            result[s.id] = (await approachFrames(token, l, s)).length
          } catch (e) {
            if (e instanceof Error && e.message.includes('token')) throw e
            result[s.id] = 0
          }
          setCoverage({ ...result })
        }
      }
      await Promise.all([worker(), worker(), worker()])
      const withImages = Object.values(result).filter((n) => n > 0).length
      setStatus(`${situations.length} helyzetből ${withImages}-hoz van Mapillary utcakép.`)
    })

  const update = (s: Situation, patch: Partial<Situation>) => db.situations.update(s.id, patch)
  const remove = async (s: Situation) => {
    await db.situations.delete(s.id)
    await db.cards.delete(s.id)
    if (selectedId === s.id) setSelectedId(null)
  }

  if (!loadedFromDb && !error) return <p className="muted">Betöltés…</p>

  const cursor = mode === 'select' ? '' : 'crosshair'
  const preview = selected ? allPromptVariants(selected) : []

  return (
    <section className="editor">
      <div className="editor-map">
        <MapView
          line={line}
          waypoints={waypoints}
          pins={pins}
          onMapClick={onMapClick}
          onPinClick={(id) => {
            setSelectedId(id)
            document.getElementById(`sit-${id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
          }}
          fitKey={fitKey}
          focus={selected ? { lngLat: [selected.lng, selected.lat], zoom: 18, key: selected.id } : null}
          cursor={cursor}
        />
        <div className="map-toolbar" role="toolbar" aria-label="Térképes eszközök">
          <button className={`btn ${mode === 'select' ? 'active' : ''}`} onClick={() => setMode('select')}>
            Kijelölés
          </button>
          <button className={`btn ${mode === 'waypoints' ? 'active' : ''}`} onClick={() => setMode('waypoints')}>
            Útpontok
          </button>
          <button className={`btn ${mode === 'situation' ? 'active' : ''}`} onClick={() => setMode('situation')} disabled={!line}>
            Helyzet hozzáadása
          </button>
        </div>
      </div>

      <aside className="editor-panel">
        <a href={href('')} className="back">
          ← Útvonalak
        </a>
        <div className="field-row">
          <label>
            Név
            <input value={name} onChange={(e) => (setName(e.target.value), setDirty(true))} placeholder="pl. Óbuda, 3-as útvonal" />
          </label>
          <label>
            Vizsgaútvonal-azonosító
            <input value={examRouteId} onChange={(e) => (setExamRouteId(e.target.value), setDirty(true))} placeholder="nem kötelező" />
          </label>
        </div>

        <details open={!line} className="panel-block">
          <summary>
            <strong>1. Útvonal</strong> {line ? `· ${formatDistance(length)}` : ''} {waypoints.length ? `· ${waypoints.length} útpont` : ''}
          </summary>
          <p className="hint">
            Az <b>Útpontok</b> módban kattints a térképre a vizsgaútvonal mentén, majd illeszd az utakra. Minél sűrűbbek az útpontok,
            annál pontosabban követi a valódi útvonalat. GPX vagy KML fájl is importálható.
          </p>
          <div className="actions">
            <button className="btn" onClick={() => (setWaypoints((w) => w.slice(0, -1)), setDirty(true))} disabled={!waypoints.length}>
              Utolsó útpont vissza
            </button>
            <button className="btn" onClick={() => (setWaypoints([]), setDirty(true))} disabled={!waypoints.length}>
              Útpontok törlése
            </button>
            <button className="btn primary" onClick={onSnap} disabled={waypoints.length < 2 || !!busy}>
              Útra illesztés
            </button>
            <button className="btn" onClick={onStraight} disabled={waypoints.length < 2}>
              Egyenes szakaszok
            </button>
            <button className="btn" onClick={() => fileInput.current?.click()}>
              GPX/KML import
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".gpx,.kml,application/gpx+xml,application/vnd.google-earth.kml+xml"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onImport(f)
                e.target.value = ''
              }}
            />
          </div>
        </details>

        <div className="panel-block">
          <strong>2. Helyzetek</strong>
          <p className="hint">
            A felismerés az OpenStreetMap táblái, lámpái, zebrái és úttípusai alapján dolgozik. Ahol nincs tábla az adatokban, az
            úttípusból következtet: ezeket <span className="badge warn">ellenőrizendő</span> jelöli. Nézd át őket, és javítsd a valóságnak
            megfelelően.
          </p>
          <div className="actions">
            {confirmRegen ? (
              <span className="confirm">
                A meglévő {situations.length} helyzet és kézi javításaik felülíródnak.{' '}
                <button className="btn danger" onClick={onGenerate}>
                  Újragenerálás
                </button>{' '}
                <button className="btn" onClick={() => setConfirmRegen(false)}>
                  Mégse
                </button>
              </span>
            ) : (
              <button
                className="btn primary"
                disabled={!line || !!busy}
                onClick={() => (situations.length ? setConfirmRegen(true) : onGenerate())}
              >
                {situations.length ? 'Újrafelismerés' : 'Helyzetek felismerése'}
              </button>
            )}
            <button className="btn" onClick={onSave} disabled={!line || !!busy}>
              Mentés{dirty ? ' *' : ''}
            </button>
          </div>
          {token ? (
            <div className="actions">
              <button className="btn" onClick={onCoverage} disabled={!situations.length || !!busy}>
                Utcakép lefedettség
              </button>
              <button className="btn" onClick={onMapillarySigns} disabled={!line || !!busy}>
                Mapillary táblák hozzáadása
              </button>
            </div>
          ) : (
            <p className="hint">
              Utcaképhez adj meg ingyenes Mapillary tokent a <a href={href('settings')}>Beállításokban</a>. Nélküle a gyakorlás
              felülnézeti vázlattal működik.
            </p>
          )}
        </div>

        {busy && <p className="status busy">{busy}</p>}
        {status && <p className="status ok">{status}</p>}
        {error && <p className="status error">{error}</p>}

        {situations.length > 0 && (
          <div className="panel-block">
            <div className="list-head">
              <strong>
                {situations.length} helyzet{reviewCount ? `, ${reviewCount} ellenőrizendő` : ''}
              </strong>
              <label className="check">
                <input type="checkbox" checked={onlyReview} onChange={(e) => setOnlyReview(e.target.checked)} /> csak ellenőrizendők
              </label>
            </div>
            <ol className="sit-list">
              {visible.map((s) => {
                const idx = situations.indexOf(s) + 1
                return (
                  <li
                    key={s.id}
                    id={`sit-${s.id}`}
                    className={`sit ${s.id === selectedId ? 'selected' : ''}`}
                    onClick={() => setSelectedId(s.id)}
                  >
                    <div className="sit-head">
                      <span className="dot" style={{ background: KIND_COLOR[s.kind] }}>
                        {idx}
                      </span>
                      <span className="muted">{formatDistance(s.d)}</span>
                      {s.needsReview && <span className="badge warn">ellenőrizendő</span>}
                      {s.source !== 'osm' && <span className="badge">{s.source === 'manual' ? 'kézi' : 'Mapillary'}</span>}
                      {coverage[s.id] !== undefined && (
                        <span className={`badge ${coverage[s.id] ? 'good' : ''}`}>{coverage[s.id] ? `${coverage[s.id]} kép` : 'nincs kép'}</span>
                      )}
                    </div>
                    <div className="sit-fields">
                      <select value={s.kind} onChange={(e) => update(s, { kind: e.target.value as SituationKind })} aria-label="Típus">
                        {KIND_ORDER.map((k) => (
                          <option key={k} value={k}>
                            {KIND_LABEL[k]}
                          </option>
                        ))}
                      </select>
                      {s.kind !== 'speed_change' && s.kind !== 'crossing' && s.kind !== 'roundabout' && (
                        <select value={s.turn} onChange={(e) => update(s, { turn: e.target.value as Turn })} aria-label="Irány">
                          {(['straight', 'left', 'right'] as Turn[]).map((t) => (
                            <option key={t} value={t}>
                              {TURN_LABEL[t]}
                            </option>
                          ))}
                        </select>
                      )}
                      {s.kind === 'speed_change' && (
                        <label className="inline">
                          <input
                            type="number"
                            min={10}
                            max={130}
                            step={10}
                            value={s.speedTo ?? ''}
                            onChange={(e) => update(s, { speedTo: Number(e.target.value) || undefined })}
                          />{' '}
                          km/h
                        </label>
                      )}
                      {s.needsReview && (
                        <button className="btn small" onClick={(e) => (e.stopPropagation(), update(s, { needsReview: false }))}>
                          Rendben
                        </button>
                      )}
                      <button className="btn small ghost" onClick={(e) => (e.stopPropagation(), remove(s))} aria-label="Helyzet törlése">
                        Törlés
                      </button>
                    </div>
                    {s.note && <p className="hint">{s.note}</p>}
                    {s.id === selectedId && preview.length > 0 && (
                      <div className="sit-preview">
                        <SceneView scene={preview[preview.length - 1].scene} />
                        <ul>
                          {preview.map((p) => (
                            <li key={p.id}>{p.title}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>
            <div className="actions">
              <a className="btn" href={href(`drive/${routeId}?mode=practice`)} onClick={(e) => (dirty ? (e.preventDefault(), save().then(() => navigate(`drive/${routeId}?mode=practice`))) : undefined)}>
                Gyakorlás indítása
              </a>
              <a className="btn primary" href={href(`drive/${routeId}?mode=exam`)} onClick={(e) => (dirty ? (e.preventDefault(), save().then(() => navigate(`drive/${routeId}?mode=exam`))) : undefined)}>
                Próbavizsga
              </a>
            </div>
          </div>
        )}
      </aside>
    </section>
  )
}
