import { useLiveQuery } from 'dexie-react-hooks'
import type { LineString } from 'geojson'
import { useEffect, useMemo, useRef, useState } from 'react'
import { MapView, type MapPin } from '../../components/MapView'
import { SceneView } from '../../components/SceneView'
import { SignIcon } from '../../components/SignIcon'
import { approachFrames, fetchSigns, mergeSigns } from '../../data/mapillary'
import { loadOsmForRoute } from '../../data/osmSource'
import { parseTrackFile, snapToRoads } from '../../data/routing'
import { signForSituation } from '../../data/signs'
import { normalizeStreetName } from '../../data/streetRoute'
import { cleanRows, routeFromStreets } from '../../data/streetRouteSource'
import { randomRouteIn } from '../../data/randomRouteSource'
import { generateSituations, placeOnRoute } from '../../data/situations'
import { allPromptVariants, KIND_LABEL, TURN_LABEL } from '../../domain/questions'
import type { RoundaboutInfo, Route, Situation, SituationKind, Turn } from '../../domain/types'
import { db, getSettings, replaceSituations, situationsOf } from '../../db'
import { formatDistance } from '../../lib/format'
import { RouteGeom, type LngLat } from '../../lib/geo'
import { href, navigate } from '../../lib/router'
import { KIND_COLOR, KIND_ORDER } from './kinds'
import { newRow, type EditableRow } from './streetRows'
import { StreetRowsEditor } from './StreetRowsEditor'
import { attemptsBySituation, HEALTH_COLOR, HEALTH_LABEL, situationHealth } from '../../domain/progress'

type Mode = 'select' | 'waypoints' | 'situation'

interface Props {
  routeId: string
}

/** Csak kereszteződésnél van értelme a kanyarodási iránynak */
const TURN_KINDS = new Set<SituationKind>(['stop', 'give_way', 'priority', 'equal', 'signals'])

/** A körforgalom adatai; kézzel felvettnél egy négyágú kör 2. kijárata */
function ringInfo(s: Situation): RoundaboutInfo {
  return s.roundabout ?? { exit: 2, exits: 4, lanes: 1, turn: 'straight' }
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
  const abortRef = useRef<AbortController | null>(null)
  const [cancellable, setCancellable] = useState(false)
  const [streetRows, setStreetRows] = useState<EditableRow[]>(() => [newRow(), newRow()])
  const [randomPlace, setRandomPlace] = useState('')
  const [randomKm, setRandomKm] = useState(10)
  /** Az utolsó véletlen útvonal helye: amíg nincs más módosítás, egy kattintással kérhető másik */
  const [randomOf, setRandomOf] = useState<string | null>(null)

  const liveSituations = useLiveQuery(() => situationsOf(routeId), [routeId])
  const situations = useMemo(() => liveSituations ?? [], [liveSituations])
  const sessions = useLiveQuery(() => db.sessions.toArray(), [])
  const [byResult, setByResult] = useState(false)
  const health = useMemo(() => {
    const by = attemptsBySituation((sessions ?? []).flatMap((x) => x.attempts))
    return new Map(situations.map((s) => [s.id, situationHealth(by.get(s.id) ?? [])]))
  }, [sessions, situations])
  const practised = [...health.values()].some((h) => h.status !== 'new')

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
      if (r.streets?.length) setStreetRows([...r.streets.map((x) => newRow(x.town, x.street)), newRow()])
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
        // Eredmény szerinti színezésnél piros = gyenge, sárga = bizonytalan, zöld = jól megy
        color: byResult ? HEALTH_COLOR[health.get(s.id)?.status ?? 'new'] : KIND_COLOR[s.kind],
        selected: s.id === selectedId,
        sign: byResult ? undefined : signForSituation(s),
      })),
    [situations, selectedId, byResult, health],
  )

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label)
    setError(null)
    setStatus(null)
    try {
      await fn()
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') setStatus('Megszakítva. A már letöltött szakaszok megmaradtak.')
      else setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
      abortRef.current = null
      setCancellable(false)
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
      // Az utcalista is megmarad, hogy később javítható legyen
      streets: streetRows.filter((x) => x.street.trim()).map(({ town, street }) => ({ town: town.trim(), street: street.trim() })),
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

  const onStreets = () =>
    run('Utcák keresése…', async () => {
      const ctrl = new AbortController()
      abortRef.current = ctrl
      setCancellable(true)
      const r = await routeFromStreets(streetRows, { signal: ctrl.signal, onStatus: setBusy })
      setLine(r.line)
      setWaypoints(r.junctions)
      setDirty(true)
      setMode('select')
      setFitKey(`streets-${Date.now()}`)
      const typed = cleanRows(streetRows)
      const renamed = r.matched.filter((m, i) => normalizeStreetName(m) !== normalizeStreetName(typed[i]?.street ?? ''))
      setStatus(
        `Útvonal az utcákból: ${formatDistance(r.lengthM)}, ${r.matched.length} utca, ${r.junctions.length} kanyarodás.` +
          (renamed.length ? ` Értelmezve: ${renamed.join(', ')}.` : '') +
          ' Most jöhet a helyzetfelismerés.',
      )
    })

  const onRandom = () =>
    run('Véletlen útvonal…', async () => {
      const ctrl = new AbortController()
      abortRef.current = ctrl
      setCancellable(true)
      const place = randomPlace.trim()
      setRandomOf(null)
      const r = await randomRouteIn(place, randomKm * 1000, { signal: ctrl.signal, onStatus: setBusy })
      setLine(r.line)
      setWaypoints(r.junctions)
      // Az utcalista a vizsgaútvonalak szokásos leírása: a település az első sorban, utána csak az utcák
      setStreetRows([...r.streets.map((street, i) => newRow(i === 0 ? place : '', street)), newRow()])
      if (!name.trim() || name === `Véletlen útvonal, ${randomOf}`) setName(`Véletlen útvonal, ${place}`)
      setRandomOf(place)
      setDirty(true)
      setMode('select')
      setFitKey(`random-${Date.now()}`)
      setStatus(
        `Véletlen útvonal (${r.placeName.split(',')[0]}): ${formatDistance(r.lengthM)}, ${r.streets.length} utca. ` +
          'Ha jó, jöhet a helyzetfelismerés.',
      )
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
    run('Térképadatok betöltése…', async () => {
      setConfirmRegen(false)
      const l = await save()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      setCancellable(true)
      const loaded = await loadOsmForRoute(l, {
        signal: ctrl.signal,
        onProgress: ({ done, total, source, status }) =>
          setBusy(
            source === 'local'
              ? `Helyi térképadatok betöltése${total > 1 ? `: ${Math.min(done, total)}/${total}` : ''}…`
              : `OpenStreetMap-szerver (a helyi adatokon kívüli rész): ${Math.min(done + 1, total)}/${total}. szakasz…` +
                  (status ? ` (${status})` : ''),
          ),
      })
      setCancellable(false)
      setBusy('Helyzetek felismerése…')
      const list = generateSituations(l, loaded.data, { routeId })
      await replaceSituations(routeId, list)
      setCoverage({})
      const review = list.filter((s) => s.needsReview).length
      const source = loaded.remoteChunks
        ? loaded.localChunks
          ? 'helyi adatcsomag + OpenStreetMap-szerver'
          : 'OpenStreetMap-szerver (nincs helyi adat erre a területre)'
        : `helyi OpenStreetMap-adatcsomag, ${loaded.dataDate?.slice(0, 10) ?? ''}`
      setStatus(`${list.length} helyzet felismerve, ebből ${review} kézi ellenőrzést igényel. Forrás: ${source}.`)
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
          <div className="streets">
            <strong>Véletlen útvonal</strong>
            <p className="hint">
              Gyakorláshoz: körút egy település vagy kerület utcáin, ugyanoda ér vissza, ahonnan indult. Nagy területen (pl. egész
              Budapest) minden kattintás a város más részére visz.
            </p>
            <div className="random-route">
              <label>
                Hol?
                <input
                  value={randomPlace}
                  onChange={(e) => setRandomPlace(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && randomPlace.trim() && !busy && onRandom()}
                  placeholder="pl. Újpest, Budapest XI. kerület, Szeged"
                />
              </label>
              <label>
                Hossz
                <select value={randomKm} onChange={(e) => setRandomKm(Number(e.target.value))}>
                  {[5, 10, 15].map((km) => (
                    <option key={km} value={km}>
                      kb. {km} km
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="actions">
              <button className="btn primary" onClick={onRandom} disabled={!!busy || !randomPlace.trim()}>
                Véletlen útvonal
              </button>
            </div>
          </div>
          <div className="streets">
            <strong>Utcák alapján</strong>
            <p className="hint">
              Soronként a vizsgaútvonal egy utcája vagy útja, sorrendben (útszám is lehet: „1-es út”, „M0”). A települést elég az első
              sorban megadni: az üresen hagyott a fölötte lévőé, csak akkor írd be újra, ha az útvonal másik településre vagy kerületbe
              ér. Enter új sort nyit; egy egész lista is beilleszthető.
            </p>
            <StreetRowsEditor rows={streetRows} onChange={(r) => (setStreetRows(r), setDirty(true))} disabled={!!busy} />
            <div className="actions">
              <button className="btn primary" onClick={onStreets} disabled={!!busy || cleanRows(streetRows).length < 2}>
                Útvonal az utcákból
              </button>
            </div>
          </div>
        </details>

        <div className="panel-block">
          <strong>2. Helyzetek</strong>
          <p className="hint">
            A felismerés az apphoz csomagolt, helyi OpenStreetMap-adatokból dolgozik (táblák, lámpák, zebrák, úttípusok). Ahol nincs tábla az adatokban, az
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

        {busy && (
          <div className="status busy busy-row">
            <span>{busy}</span>
            {cancellable && (
              <button className="btn small" onClick={() => abortRef.current?.abort()}>
                Mégse
              </button>
            )}
          </div>
        )}
        {status && <p className="status ok">{status}</p>}
        {randomOf && !busy && situations.length === 0 && (
          <div className="actions">
            <button className="btn" onClick={onRandom}>
              Másik véletlen útvonal
            </button>
          </div>
        )}
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
              {practised && (
                <label className="check">
                  <input type="checkbox" checked={byResult} onChange={(e) => setByResult(e.target.checked)} /> eredményeim a térképen
                </label>
              )}
            </div>
            <ol className="sit-list">
              {visible.map((s) => {
                const idx = situations.indexOf(s) + 1
                const h = health.get(s.id)?.status ?? 'new'
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
                      <SignIcon code={signForSituation(s)} size={26} />
                      {s.signs
                        ?.filter((c) => c !== signForSituation(s))
                        .map((c) => (
                          <SignIcon key={c} code={c} size={20} />
                        ))}
                      <span className="muted">{formatDistance(s.d)}</span>
                      {h !== 'new' && (
                        <span className="badge health" style={{ borderColor: HEALTH_COLOR[h] }}>
                          <span className="health-dot" style={{ background: HEALTH_COLOR[h] }} />
                          {HEALTH_LABEL[h]}
                        </span>
                      )}
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
                      {TURN_KINDS.has(s.kind) && (
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
                      {s.kind === 'roundabout' && (
                        <span className="ring-fields" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="number"
                            min={1}
                            max={8}
                            value={ringInfo(s).exit}
                            onChange={(e) => update(s, { roundabout: { ...ringInfo(s), exit: Math.max(1, Number(e.target.value) || 1) } })}
                            aria-label="Hányadik kijárat"
                          />
                          . kijárat a
                          <input
                            type="number"
                            min={2}
                            max={8}
                            value={ringInfo(s).exits}
                            onChange={(e) => update(s, { roundabout: { ...ringInfo(s), exits: Math.max(2, Number(e.target.value) || 2) } })}
                            aria-label="Kijáratok száma"
                          />
                          -ből
                          <select
                            value={ringInfo(s).lanes}
                            onChange={(e) => update(s, { roundabout: { ...ringInfo(s), lanes: Number(e.target.value) } })}
                            aria-label="Körpálya sávjai"
                          >
                            <option value={1}>egysávos</option>
                            <option value={2}>kétsávos</option>
                          </select>
                        </span>
                      )}
                      {s.kind === 'tram_stop' && (
                        <select
                          value={s.transit?.island === undefined ? '' : s.transit.island ? 'yes' : 'no'}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) =>
                            update(s, {
                              transit: { kind: 'tram', island: e.target.value === '' ? undefined : e.target.value === 'yes' },
                              needsReview: e.target.value === '' ? s.needsReview : false,
                            })
                          }
                          aria-label="Járdasziget"
                        >
                          <option value="">járdasziget: nem tudom</option>
                          <option value="yes">van járdasziget</option>
                          <option value="no">nincs járdasziget</option>
                        </select>
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
