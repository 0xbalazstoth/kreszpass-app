import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { loadOsmForRoute } from '../../data/osmSource'
import { roadSignsAlongRoute } from '../../data/roadSigns'
import { signUrl, speedSignCode } from '../../data/signs'
import { generateSituations } from '../../data/situations'
import { db, situationsOf } from '../../db'
import { EVAL_CODES, MAX_FAULT_LINES } from '../../domain/evalCodes'
import { evaluateSession } from '../../domain/scoring'
import type { ExamSession, Situation } from '../../domain/types'
import { Fallback } from '../../components/scene3d'
import { MIRRORS } from '../../components/scene3d/driverView'
import { webglAvailable } from '../../components/scene3d/webgl'
import { Examiner, type Fault, type Guidance } from '../../sim/examiner/examiner'
import { buildInstructions } from '../../sim/examiner/navigation'
import { driveAttempts } from '../../sim/examiner/result'
import { BotDriver } from '../../sim/bot'
import { BotInput } from '../../sim/input/botInput'
import { KEY_HELP, KeyboardInput } from '../../sim/input/keyboard'
import { seedOf } from '../../sim/rng'
import { createSim, type Sim } from '../../sim/sim'
import { CENTER_F } from '../../sim/vehicle'
import { buildWorld } from '../../sim/world/build'
import { buildRoadGraph } from '../../sim/examiner/reroute'
import { buildJunctionModels, routeJunctionPasses } from '../../sim/traffic/junctions'
import { TrafficSystem } from '../../sim/traffic/traffic'
import { currentQuality } from '../../components/scene3d/quality'
import { href, navigate } from '../../lib/router'
import { speak, stopSpeaking } from './speech'

const SimScene = lazy(() => import('../../components/sim3d/SimScene'))

/** Gyakorlás: minden hiba azonnal megjelenik; vizsga: a vizsgabiztos csak a végén értékel; bemutató: a robot vezet */
type Style = 'practice' | 'exam' | 'demo'

/** A műszerfal és a figyelmeztetések állapota (másodpercenként néhányszor frissül, nem minden képkockán) */
interface Dash {
  kmh: number
  gear: 'D' | 'R'
  indicator: 'left' | 'right' | null
  hazard: boolean
  handbrake: boolean
  limit: number | null
  onKerb: boolean
  offRoad: boolean
  look: string
  t: number
  /** Megtett út az útvonalon / teljes hossz (m) */
  progress: number
  total: number
  guide: Guidance | null
}

function readDash(sim: Sim, ex: Examiner | null): Dash {
  const s = sim.state
  const c = s.car
  const centre: [number, number] = [c.x + Math.sin(c.heading) * CENTER_F, c.z - Math.cos(c.heading) * CENTER_F]
  const hit = sim.index.nearest(centre)
  return {
    kmh: Math.round(Math.abs(c.speed) * 3.6),
    gear: c.gear,
    indicator: c.indicator,
    hazard: c.hazard,
    handbrake: c.handbrake,
    limit: hit && hit.dist < hit.road.halfWidth + 3 ? hit.road.maxspeed : null,
    onKerb: s.onKerb,
    offRoad: s.offRoad,
    look: s.look,
    t: s.t,
    progress: ex?.progress.s ?? 0,
    total: sim.world.route.length,
    guide: ex?.guidance() ?? null,
  }
}

/** Távolság a panelen: közel „Most”, egyébként 10 m-re kerekítve, 1 km fölött km-ben */
function formatGuideDistance(m: number): string {
  if (m < 25) return 'Most'
  if (m >= 1000) return `${(m / 1000).toFixed(1).replace('.', ',')} km`
  return `${Math.round(m / 10) * 10} m`
}

const GUIDE_LABEL: Record<Guidance['kind'], string> = {
  left: 'Balra',
  right: 'Jobbra',
  straight: 'Egyenesen át',
  roundabout: 'Körforgalom',
  finish: 'Megállás jobbra',
  follow: 'Kövesse az utat',
}

/** Az útbaigazító panel nyila */
function GuideIcon({ g }: { g: Guidance }) {
  const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (g.kind) {
    case 'left':
    case 'right':
      return (
        <svg viewBox="0 0 64 64" aria-hidden style={g.kind === 'right' ? { transform: 'scaleX(-1)' } : undefined}>
          <path d="M40 58 V30 Q40 22 32 22 H14" {...stroke} />
          <path d="M24 10 L12 22 L24 34" {...stroke} />
        </svg>
      )
    case 'roundabout':
      return (
        <svg viewBox="0 0 64 64" aria-hidden>
          <circle cx="32" cy="30" r="13" {...stroke} />
          <path d="M32 58 V43" {...stroke} />
          <text x="32" y="36" textAnchor="middle" fontSize="18" fontWeight="800" fill="currentColor">
            {g.exit ?? ''}
          </text>
        </svg>
      )
    case 'finish':
      return (
        <svg viewBox="0 0 64 64" aria-hidden>
          <path d="M18 58 V8" {...stroke} />
          <path d="M18 10 H48 L40 20 L48 30 H18" fill="currentColor" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
        </svg>
      )
    default:
      return (
        <svg viewBox="0 0 64 64" aria-hidden>
          <path d="M32 58 V10" {...stroke} />
          <path d="M18 24 L32 10 L46 24" {...stroke} />
        </svg>
      )
  }
}

const LOOK_LABEL: Record<string, string> = {
  shoulder_left: 'Hátranézel a bal vállad fölött',
  shoulder_right: 'Hátranézel a jobb vállad fölött',
  mirror_left: 'Bal tükör',
  mirror_right: 'Jobb tükör',
  mirror_inner: 'Belső tükör',
}

/** Egy gyakorló módú hibaüzenet ennyi ideig látszik (s) */
const TOAST_S = 7

export function FreeDrivePage({ routeId }: { routeId: string }) {
  const [sim, setSim] = useState<Sim | null>(null)
  const [situations, setSituations] = useState<Situation[]>([])
  const [status, setStatus] = useState('Útvonal betöltése…')
  const [error, setError] = useState<string | null>(null)
  const [style, setStyle] = useState<Style | null>(null)
  const [pausedUi, setPausedUi] = useState(false)
  const [chaseUi, setChaseUi] = useState(false)
  const [voice, setVoice] = useState(true)
  const [dash, setDash] = useState<Dash | null>(null)
  const [message, setMessage] = useState<{ text: string; t: number; untilS?: number } | null>(null)
  const [faults, setFaults] = useState<Fault[]>([])
  const [ended, setEnded] = useState<{ aborted: boolean; reason?: string } | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const paused = useRef(true)
  const chase = useRef(false)
  const voiceRef = useRef(true)
  const examiner = useRef<Examiner | null>(null)
  const [demoInput, setDemoInput] = useState<BotInput | null>(null)
  const startedAt = useRef(0)
  const input = useMemo(() => new KeyboardInput(), [])

  // Betöltés: útvonal, helyi térképadatok, helyzetek és táblák, majd a világ felépítése
  useEffect(() => {
    const ctrl = new AbortController()
    ;(async () => {
      const route = await db.routes.get(routeId)
      if (!route) throw new Error('Nincs ilyen útvonal.')
      setStatus('Térképadatok betöltése…')
      // Megszakító jel nélkül: a csempéket közös gyorsítótár tárolja, egy megszakított betöltés ne rontsa el a következőt
      const osm = await loadOsmForRoute(route.line)
      if (ctrl.signal.aborted) return
      setStatus('A város felépítése…')
      await new Promise((r) => setTimeout(r, 0))
      const stored = await situationsOf(route.id)
      const sits = stored.length ? stored : generateSituations(route.line, osm.data, { routeId: route.id })
      const signs = roadSignsAlongRoute(route.line, osm.data, sits)
      const world = buildWorld(osm.data, route.line, { seed: seedOf(route.id), routeSigns: signs.map(({ code, d }) => ({ code, d })) })
      if (ctrl.signal.aborted) return
      const s = createSim(world)
      // Élő forgalom: minden vezetésnél más (véletlen mag), a sűrűség a 3D minőség szerint
      const models = buildJunctionModels(world)
      const q = currentQuality()
      const traffic = new TrafficSystem(world, buildRoadGraph(world), s.index, models, routeJunctionPasses(world, models), {
        seed: Math.floor(Math.random() * 1e9),
        cars: q === 'low' ? 5 : q === 'medium' ? 8 : 12,
        peds: q === 'low' ? 4 : q === 'medium' ? 8 : 12,
        directors: true,
      })
      s.traffic = traffic
      const ex = new Examiner(world, s.index, buildInstructions(world, sits, s.index))
      ex.traffic = traffic
      examiner.current = ex
      setSituations(stored)
      setSim(s)
    })().catch((e) => {
      if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : String(e))
    })
    return () => {
      ctrl.abort()
      stopSpeaking()
    }
  }, [routeId])

  useEffect(() => input.attach(window), [input])

  // Ha a lap a háttérbe kerül (másik fül, alkalmazás), a vezetés szünetel
  useEffect(() => {
    const onHide = () => {
      if (document.hidden && style && !ended && !paused.current) {
        paused.current = true
        setPausedUi(true)
        stopSpeaking()
      }
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [style, ended])

  // Műszerfal, utasítások, hibák és a felület gombjai (szünet, nézet) – 10 Hz
  useEffect(() => {
    if (!sim) return
    let lastMsg: { text: string; t: number; untilS?: number } | null = null
    const id = window.setInterval(() => {
      for (const u of input.takeUi()) {
        if (u === 'Escape' && style && !ended) {
          paused.current = !paused.current
          setPausedUi(paused.current)
          if (paused.current) stopSpeaking()
        }
        if (u === 'KeyV') {
          chase.current = !chase.current
          setChaseUi(chase.current)
        }
      }
      const ex = examiner.current
      setDash(readDash(sim, ex))
      if (!ex) return
      if (ex.message && ex.message !== lastMsg) {
        lastMsg = ex.message
        setMessage(ex.message)
        if (voiceRef.current) speak(ex.message.text)
      }
      setFaults((f) => (f.length === ex.faults.length ? f : [...ex.faults]))
      if (ex.end && !ended) {
        paused.current = true
        setEnded(ex.end.kind === 'failed' ? { aborted: false, reason: ex.end.reason } : { aborted: false })
      }
    }, 100)
    return () => window.clearInterval(id)
  }, [sim, input, style, ended])

  // A vezetés mentése a végén (minősítő lap, statisztika)
  useEffect(() => {
    const ex = examiner.current
    // A bemutató nem a vezető teljesítménye: nem mentjük
    if (!ended || !ex || savedId || !sim || style === 'demo') return
    const session: ExamSession = {
      id: crypto.randomUUID(),
      routeId,
      mode: 'drive',
      startedAt: startedAt.current,
      finishedAt: Date.now(),
      attempts: driveAttempts(situations, ex.faults, ex.progress.s, Date.now()),
    }
    void db.sessions.put(session).then(() => setSavedId(session.id))
  }, [ended, savedId, sim, situations, routeId, style])

  const start = (s: Style) => {
    setStyle(s)
    const ex = examiner.current
    if (s === 'demo' && sim && ex) setDemoInput(new BotInput(new BotDriver(sim.world, sim.index, ex.instructions, { careful: true, traffic: sim.traffic }), sim, ex))
    startedAt.current = Date.now()
    paused.current = false
    setPausedUi(false)
  }
  const resume = () => {
    paused.current = false
    setPausedUi(false)
  }
  const finishNow = () => {
    paused.current = true
    setPausedUi(false)
    stopSpeaking()
    setEnded({ aborted: true })
  }
  const toggleVoice = () => {
    voiceRef.current = !voiceRef.current
    setVoice(voiceRef.current)
    if (!voiceRef.current) stopSpeaking()
  }

  if (error)
    return (
      <div className="sim-page sim-message">
        <p className="status error">{error}</p>
        <a className="btn" href={href('')}>
          Vissza az útvonalakhoz
        </a>
      </div>
    )
  if (!webglAvailable())
    return (
      <div className="sim-page sim-message">
        <p className="status error">A vezetéshez 3D grafika (WebGL) kell, ez a böngésző nem támogatja.</p>
      </div>
    )

  const lookingBack = dash?.look.startsWith('shoulder')
  const now = dash?.t ?? 0
  const toasts = style !== 'exam' ? faults.filter((f) => now - f.t < TOAST_S).slice(-3) : []
  const result = ended ? evaluateSession(driveAttempts(situations, faults, dash?.progress ?? 0, 0)) : null

  return (
    <div className="sim-page">
      {sim ? (
        <Fallback fallback={<p className="status error sim-message">A 3D nézet nem indult el.</p>}>
          <Suspense fallback={<p className="sim-message muted">3D betöltése…</p>}>
            <SimScene sim={sim} input={demoInput ?? input} paused={paused} chase={chase} onFrame={() => examiner.current?.update(sim.state)} />
          </Suspense>
        </Fallback>
      ) : (
        <p className="sim-message muted">{status}</p>
      )}

      {sim && dash && !chaseUi && !lookingBack && (
        <>
          <svg className="cockpit" viewBox="0 0 1000 160" preserveAspectRatio="none" aria-hidden>
            <path d="M0 160 L0 112 Q500 70 1000 112 L1000 160 Z" fill="#161a21" />
          </svg>
          {MIRRORS.map((m) => (
            <div
              key={m.id}
              className={`mirror-frame ${dash.look === m.id ? 'active' : ''}`}
              style={{ left: `${m.rect.left * 100}%`, bottom: `${m.rect.bottom * 100}%`, width: `${m.rect.w * 100}%`, height: `${m.rect.h * 100}%` }}
              aria-hidden
            />
          ))}
        </>
      )}

      {sim && dash && (
        <div className="sim-hud">
          {message && (message.untilS !== undefined ? dash.progress < message.untilS + 2 || now - message.t < 2 : now - message.t < 7) && (
            <div className="sim-examiner" aria-live="polite">
              <span className="sim-examiner-who">Vizsgabiztos</span>
              {message.text}
            </div>
          )}
          <div className="sim-progress" aria-hidden>
            <div style={{ width: `${Math.min(100, (dash.progress / Math.max(1, dash.total)) * 100)}%` }} />
          </div>
          <button className="sim-voice" onClick={toggleVoice} title={voice ? 'Hang kikapcsolása' : 'Hang bekapcsolása'} aria-label={voice ? 'Hang kikapcsolása' : 'Hang bekapcsolása'}>
            {voice ? '🔊' : '🔇'}
          </button>
          <div className="sim-dash">
            <span className={`sim-arrow ${dash.indicator === 'left' || dash.hazard ? 'on' : ''}`} aria-label="bal index">
              ◀
            </span>
            <span className="sim-speed">
              <b>{dash.kmh}</b> km/h
            </span>
            <span className={`sim-arrow ${dash.indicator === 'right' || dash.hazard ? 'on' : ''}`} aria-label="jobb index">
              ▶
            </span>
            <span className={`sim-gear ${dash.gear === 'R' ? 'rev' : ''}`}>{dash.gear}</span>
            {dash.handbrake && <span className="sim-tell">(P) kézifék</span>}
            {dash.hazard && <span className="sim-tell">vészvillogó</span>}
            {dash.limit && <img className="sim-limit" src={signUrl(speedSignCode(dash.limit))} alt={`${dash.limit} km/h`} />}
          </div>
          {dash.guide && (
            <div className={`sim-guide ${dash.guide.detour ? 'detour' : ''}`} aria-live="off">
              <GuideIcon g={dash.guide} />
              <div>
                {dash.guide.detour && <small>Vissza az útvonalra</small>}
                <b>{dash.guide.kind === 'follow' ? GUIDE_LABEL.follow : formatGuideDistance(dash.guide.distance)}</b>
                <span>
                  {dash.guide.kind === 'follow'
                    ? formatGuideDistance(dash.guide.distance)
                    : dash.guide.kind === 'roundabout' && dash.guide.exit
                      ? `Körforgalom, ${dash.guide.exit}. kijárat`
                      : GUIDE_LABEL[dash.guide.kind]}
                  {dash.guide.street && dash.guide.kind !== 'follow' ? ` · ${dash.guide.street}` : ''}
                </span>
              </div>
            </div>
          )}
          {LOOK_LABEL[dash.look] && <div className="sim-look">{LOOK_LABEL[dash.look]}</div>}
          {(dash.onKerb || dash.offRoad) && <div className="sim-warn">{dash.onKerb ? 'Szegély! A kerék a járdán van.' : 'Letértél az útról.'}</div>}
          {toasts.length > 0 && (
            <ul className="sim-toasts" aria-live="polite">
              {toasts.map((f, i) => (
                <li key={`${f.t}-${i}`} className={f.code.startsWith('8/') ? 'fatal' : ''}>
                  <code>{f.code}</code> {f.note}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {sim && !style && (
        <div className="sim-overlay">
          <div className="card sim-card">
            <h2>Vezetés</h2>
            <p>
              A valódi útvonaladon vezetsz, a vizsgabiztos mondja az irányt. A járda mellől indulsz, behúzott kézifékkel: nézz a bal
              tükörbe és hátra a vállad fölött, indexelj balra, engedd ki a kéziféket, és indulj. A végén a vizsgabiztos kéri, hogy állj
              meg jobbra a járda mellett.
            </p>
            <dl className="key-help">
              {KEY_HELP.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <div className="actions">
              <button className="btn primary big" onClick={() => start('practice')} autoFocus>
                Gyakorlás
              </button>
              <button className="btn big" onClick={() => start('exam')}>
                Vizsga
              </button>
              <button className="btn big" onClick={() => start('demo')} title="A robotsofőr végigvezet: figyeld, mikor néz tükörbe, indexel, lassít">
                Bemutató
              </button>
              <a className="btn" href={href('')}>
                Kilépés
              </a>
            </div>
            <p className="muted">
              Gyakorlásnál minden hibát azonnal kiírunk; vizsgán, mint a valóságban, csak a végén értékelünk. A bemutatóban a robotsofőr vezet
              hibátlanul: figyeld, mikor néz a tükörbe, indexel és lassít.
            </p>
          </div>
        </div>
      )}

      {sim && style && pausedUi && !ended && (
        <div className="sim-overlay">
          <div className="card sim-card">
            <h2>Szünet</h2>
            <dl className="key-help">
              {KEY_HELP.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <div className="actions">
              <button className="btn primary big" onClick={resume} autoFocus>
                Folytatás
              </button>
              <button className="btn" onClick={finishNow}>
                Befejezés és értékelés
              </button>
              <a className="btn" href={href('')}>
                Kilépés
              </a>
            </div>
          </div>
        </div>
      )}

      {ended && result && (
        <div className="sim-overlay">
          <div className="card sim-card sim-result">
            <h2>{ended.aborted ? 'Befejezted a vezetést' : ended.reason ? `Vége: ${ended.reason}` : 'Vége a vizsgának'}</h2>
            <p className={`verdict-line ${result.passed && !ended.aborted ? 'pass' : 'fail'}`}>
              {ended.aborted
                ? `Az útvonal ${Math.round(((dash?.progress ?? 0) / Math.max(1, dash?.total ?? 1)) * 100)}%-át tetted meg.`
                : result.passed
                  ? 'Megfelelt'
                  : 'Nem felelt meg'}{' '}
              · {result.fatal.length ? `${result.fatal.length} kizáró hiba` : 'nincs kizáró hiba'} · {result.faultLines}/{MAX_FAULT_LINES} hibavonal
            </p>
            {faults.length === 0 ? (
              <p>Hibátlan vezetés.</p>
            ) : (
              <ol className="sim-fault-list">
                {faults.map((f, i) => (
                  <li key={i} className={f.code.startsWith('8/') ? 'fatal' : ''}>
                    <code title={EVAL_CODES[f.code]?.text}>{f.code}</code> <b>{Math.round(f.s)} m</b> · {f.note}
                    <span className="muted"> ({EVAL_CODES[f.code]?.text})</span>
                  </li>
                ))}
              </ol>
            )}
            <div className="actions">
              {savedId && (
                <button className="btn primary" onClick={() => navigate(`sheet/${savedId}`)}>
                  Minősítő lap
                </button>
              )}
              <button className="btn" onClick={() => location.reload()}>
                Újra
              </button>
              <a className="btn" href={href('')}>
                Útvonalak
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
