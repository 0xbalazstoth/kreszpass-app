import type { LineString } from 'geojson'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { MapView, type FlyAlong, type MapPin } from '../../components/MapView'
import { SceneView } from '../../components/SceneView'
import { DriveScene } from '../../components/scene3d'
import { preloadScene3D } from '../../components/scene3d/load'
import { approachFrames, type MlImage } from '../../data/mapillary'
import { EVAL_CODES } from '../../domain/evalCodes'
import { buildPrompts, KIND_LABEL, type Prompt } from '../../domain/questions'
import { classifyAnswer } from '../../domain/scoring'
import type { Attempt, ExamSession, Mode, Route, Settings, Situation } from '../../domain/types'
import { db, getSettings, situationsOf } from '../../db'
import { formatSeconds } from '../../lib/format'
import { RouteGeom, type LngLat } from '../../lib/geo'
import { href, navigate } from '../../lib/router'
import { sceneMapPins } from './mapSigns'
import { dueSituations, recordReview, worstOutcome } from './review'
import { speak, stopSpeaking, useVoiceAnswers, voiceSupported } from './speech'

interface Step {
  situation: Situation
  prompt: Prompt
  /** A helyzet első kérdése-e (ekkor van közeledés) */
  firstOfSituation: boolean
  lastOfSituation: boolean
}

type Phase = 'loading' | 'empty' | 'intro' | 'approach' | 'question' | 'feedback' | 'saving'

const MODE_LABEL: Record<Mode, string> = { practice: 'Gyakorlás', exam: 'Próbavizsga', review: 'Ismétlés' }
/** Legfeljebb ennyit várunk az utcaképekre a közeledés elején */
const FRAME_WAIT_MS = 1200

/** Első személyű kamera-út a térképen: a helyzet előtti 150 m, 5 méterenként */
function flyPathFor(line: LineString, s: Situation, durationMs: number): FlyAlong | null {
  try {
    const geom = new RouteGeom(line)
    const end = Math.max(0, s.d - 14)
    const begin = Math.max(0, s.d - 150)
    if (end - begin < 10) return null
    const path: LngLat[] = []
    const bearings: number[] = []
    for (let d = begin; d <= end; d += 5) {
      path.push(geom.pointAt(d))
      bearings.push(geom.bearingAt(d, 15))
    }
    return { path, bearings, durationMs, key: s.id }
  } catch {
    return null
  }
}

/** Utcaképek gyorsítótára a munkamenet idejére */
const frameCache = new Map<string, Promise<MlImage[]>>()
function framesFor(token: string, line: LineString, s: Situation): Promise<MlImage[]> {
  const key = `${s.id}:${s.d}`
  let p = frameCache.get(key)
  if (!p) {
    p = approachFrames(token, line, s)
      .then((frames) => {
        for (const f of frames) new Image().src = f.url
        return frames
      })
      .catch(() => [])
    frameCache.set(key, p)
  }
  return p
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))])
}

interface Props {
  routeId: string | null
  mode: Mode
}

export function DrivePage({ routeId, mode }: Props) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [settings, setSettings] = useState<Settings | null>(null)
  const [route, setRoute] = useState<Route | null>(null)
  const [lines, setLines] = useState<Record<string, LineString>>({})
  const [steps, setSteps] = useState<Step[]>([])
  const [reviewCount, setReviewCount] = useState(0)
  const [idx, setIdx] = useState(0)
  const [frames, setFrames] = useState<MlImage[]>([])
  const [frameIdx, setFrameIdx] = useState(0)
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [last, setLast] = useState<{ attempt: Attempt; prompt: Prompt } | null>(null)
  const [readAloud, setReadAloud] = useState(false)
  const [voice, setVoice] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [mainView, setMainView] = useState<'scene' | 'map'>('scene')
  const questionStart = useRef(0)
  const timeoutRef = useRef<number | undefined>(undefined)
  const startedAt = useRef(Date.now())
  const sessionId = useRef(crypto.randomUUID())

  // ------------------------------------------------ Betöltés
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const st = await getSettings()
      let list: Situation[]
      const lineMap: Record<string, LineString> = {}
      if (mode === 'review') {
        list = await dueSituations(25)
        const routes = await db.routes.bulkGet([...new Set(list.map((s) => s.routeId))])
        for (const r of routes) if (r) lineMap[r.id] = r.line
      } else {
        const r = routeId ? await db.routes.get(routeId) : undefined
        if (!r) throw new Error('Nincs ilyen útvonal')
        if (!cancelled) setRoute(r)
        lineMap[r.id] = r.line
        list = await situationsOf(r.id)
      }
      const built: Step[] = []
      for (const s of list) {
        const prompts = buildPrompts(s)
        prompts.forEach((p, i) => built.push({ situation: s, prompt: p, firstOfSituation: i === 0, lastOfSituation: i === prompts.length - 1 }))
      }
      if (cancelled) return
      setSettings(st)
      setLines(lineMap)
      setSteps(built)
      setReviewCount(list.filter((s) => s.needsReview).length)
      if (st.view3d) preloadScene3D()
      setPhase(built.length ? 'intro' : 'empty')
    })().catch((e) => {
      if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e))
    })
    return () => {
      cancelled = true
    }
  }, [routeId, mode])

  const step = steps[idx] as Step | undefined
  const line = step ? lines[step.situation.routeId] : undefined
  const token = settings?.mapillaryToken ?? ''

  // ------------------------------------------------ Közeledés
  useEffect(() => {
    if (phase !== 'approach' || !step || !settings) return
    let cancelled = false
    const timers: number[] = []
    const duration = settings.approachMs
    // A következő helyzet képeit előre betöltjük
    const next = steps.slice(idx + 1).find((s) => s.firstOfSituation)
    if (token && next && lines[next.situation.routeId]) void framesFor(token, lines[next.situation.routeId], next.situation)

    // A 3D jelenet és a térképes repülés ugyanennyi ideig tart, utána jön a kérdés
    timers.push(window.setTimeout(() => !cancelled && setPhase('question'), duration))
    if (token && line) {
      const began = performance.now()
      void withTimeout(framesFor(token, line, step.situation), Math.min(FRAME_WAIT_MS, duration / 2), []).then((fr) => {
        if (cancelled) return
        setFrames(fr)
        setFrameIdx(0)
        const remaining = Math.max(0, duration - (performance.now() - began))
        fr.forEach((_, i) => timers.push(window.setTimeout(() => !cancelled && setFrameIdx(i), (i * remaining) / fr.length)))
      })
    } else setFrames([])
    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
    }
  }, [phase, step, settings, token, line, idx, steps, lines])

  // ------------------------------------------------ Válasz
  const answer = useCallback(
    (chosen: number | null) => {
      if (phase !== 'question' || !step || !settings) return
      window.clearTimeout(timeoutRef.current)
      const rt = chosen === null ? null : Math.round(performance.now() - questionStart.current)
      const c = classifyAnswer(step.prompt, chosen, rt, settings)
      const attempt: Attempt = {
        situationId: step.situation.id,
        promptId: step.prompt.id,
        promptTitle: step.prompt.title,
        reactionMs: rt,
        chosen,
        outcome: c.outcome,
        codes: c.codes,
        at: Date.now(),
      }
      const all = [...attempts, attempt]
      setAttempts(all)
      setLast({ attempt, prompt: step.prompt })
      if (step.lastOfSituation) {
        const mine = all.filter((a) => a.situationId === step.situation.id)
        const w = worstOutcome(mine)
        void recordReview(step.situation, w.outcome, w.reactionMs, settings)
      }
      // Minden módban a „Tovább” gombra (Enter) lép tovább, magától soha
      setPhase('feedback')
    },
    // advance szándékosan kimarad: mindig a friss attempts listát kapja
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase, step, settings, attempts, mode],
  )

  // Időzítő és felolvasás a kérdés megjelenésekor
  useEffect(() => {
    if (phase !== 'question' || !step || !settings) return
    questionStart.current = performance.now()
    if (readAloud) speak(`${step.prompt.title}. ${step.prompt.text}`)
    timeoutRef.current = window.setTimeout(() => answer(null), settings.timeoutMs)
    return () => window.clearTimeout(timeoutRef.current)
    // Csak a kérdés megjelenésekor indul
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, idx])

  async function finish(all: Attempt[]) {
    setPhase('saving')
    stopSpeaking()
    const session: ExamSession = {
      id: sessionId.current,
      routeId: mode === 'review' ? null : routeId,
      mode,
      startedAt: startedAt.current,
      finishedAt: Date.now(),
      attempts: all,
    }
    await db.sessions.put(session)
    navigate(`sheet/${session.id}`)
  }

  /** Kilépés: vizsgán a lap kiértékelése, gyakorlásnál a megválaszolt részt elmentjük */
  async function exit() {
    if (mode === 'exam') return finish(attempts)
    stopSpeaking()
    if (attempts.length) {
      await db.sessions.put({
        id: sessionId.current,
        routeId: mode === 'review' ? null : routeId,
        mode,
        startedAt: startedAt.current,
        finishedAt: Date.now(),
        attempts,
      })
    }
    navigate(route ? `route/${route.id}` : '')
  }

  function advance(all: Attempt[] = attempts) {
    const nextIdx = idx + 1
    if (nextIdx >= steps.length) {
      void finish(all)
      return
    }
    setIdx(nextIdx)
    setLast(null)
    if (steps[nextIdx].firstOfSituation) {
      setFrames([])
      setPhase('approach')
    } else setPhase('question')
  }

  function start() {
    startedAt.current = Date.now()
    setIdx(0)
    setAttempts([])
    setFrames([])
    setPhase('approach')
  }

  // ------------------------------------------------ Billentyűzet
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
      if (phase === 'question' && step) {
        const n = Number(e.key)
        if (n >= 1 && n <= step.prompt.options.length) {
          e.preventDefault()
          answer(n - 1)
        }
      } else if (phase === 'feedback' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault()
        advance()
      } else if (phase === 'intro' && e.key === 'Enter') start()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  useVoiceAnswers(
    voice && (phase === 'approach' || phase === 'question' || phase === 'feedback'),
    (n) => {
      if (step && n <= step.prompt.options.length) answer(n - 1)
    },
    (msg) => {
      setVoiceError(msg)
      setVoice(false)
    },
  )

  useEffect(() => () => stopSpeaking(), [])

  const position = useMemo(
    () => (step ? { lngLat: [step.situation.lng, step.situation.lat] as [number, number], bearing: step.situation.bearing } : null),
    [step],
  )

  // A térképen csak az aktuális kérdés táblái, ugyanott, ahol a 3D jelenetben állnak
  const pins = useMemo<MapPin[]>(() => (step && line ? sceneMapPins(line, step.situation, step.prompt.scene) : []), [step, line])

  const situationId = step?.situation.id
  const fly = useMemo(
    () => (step && line && settings ? flyPathFor(line, step.situation, settings.approachMs) : null),
    // Helyzetenként egyszer repülünk
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [situationId, line, settings?.approachMs],
  )

  // ------------------------------------------------ Megjelenítés
  if (loadError) return <p className="status error">{loadError}</p>
  if (phase === 'loading' || !settings) return <p className="muted">Betöltés…</p>

  if (phase === 'empty')
    return (
      <div className="empty">
        <h2>{mode === 'review' ? 'Most nincs esedékes ismétlés' : 'Ezen az útvonalon még nincs helyzet'}</h2>
        <p>
          {mode === 'review'
            ? 'A gyakorlás során rosszul vagy lassan megválaszolt helyzetek itt jönnek vissza, amikor esedékesek.'
            : 'Nyisd meg a szerkesztőt, és futtasd a helyzetfelismerést.'}
        </p>
        <a className="btn primary" href={routeId && mode !== 'review' ? href(`route/${routeId}`) : href('')}>
          {mode === 'review' ? 'Útvonalak' : 'Szerkesztő'}
        </a>
      </div>
    )

  if (phase === 'intro') {
    const situationCount = new Set(steps.map((s) => s.situation.id)).size
    return (
      <section className="intro card">
        <h1>
          {MODE_LABEL[mode]}
          {route ? `: ${route.name}` : ''}
        </h1>
        <p>
          {situationCount} helyzet, {steps.length} kérdés. Minden helyzet előtt „közeledsz”
          {settings.view3d ? ' a 3D nézetben' : ' a vázlaton'}, közben a térkép a valódi útvonaladon repül végig
          {token ? ' (Mapillary utcaképekkel, ha vannak)' : ''}. Utána a kérdésre időre kell válaszolnod.
        </p>
        <ul className="rules">
          <li>
            <b>{formatSeconds(settings.okMs)}</b> alatt helyes válasz: nincs hiba.
          </li>
          <li>
            <b>{formatSeconds(settings.lateMs)}</b> alatt: <code>6/4</code> „kissé késve, de helyesen reagál”.
          </li>
          <li>
            Utána: <code>6/2</code> „a közlekedési helyzetet lassan ismeri fel”.
          </li>
          <li>
            <b>{formatSeconds(settings.timeoutMs)}</b> után vagy rossz válasznál: a lap megfelelő, többnyire 8-as (bukást okozó) kódja.
          </li>
        </ul>
        {mode === 'exam' && (
          <p>
            {settings.examFeedback
              ? 'Próbavizsgán minden válasz után látod, helyes volt-e (magyarázat nélkül), és a „Tovább” gombbal (Enter) mész a következő helyzetre. A végén megkapod a kitöltött minősítő lapot.'
              : 'Próbavizsgán nincs közbenső visszajelzés. A végén megkapod a kitöltött minősítő lapot.'}{' '}
            <a href={href('settings')}>Beállítás</a>
          </p>
        )}
        {reviewCount > 0 && route && (
          <p className="status warn">
            {reviewCount} helyzet még ellenőrizendő a szerkesztőben. Ezeknél a kérdés típusa téves lehet.{' '}
            <a href={href(`route/${route.id}`)}>Ellenőrzés</a>
          </p>
        )}
        <div className="toggles">
          <label className="check">
            <input type="checkbox" checked={readAloud} onChange={(e) => setReadAloud(e.target.checked)} /> Kérdések felolvasása
          </label>
          {voiceSupported && (
            <label className="check">
              <input type="checkbox" checked={voice} onChange={(e) => (setVoice(e.target.checked), setVoiceError(null))} /> Hangos válasz
              (mondd ki a sorszámot: „egy”, „kettő”…)
            </label>
          )}
        </div>
        {voiceError && <p className="status error">{voiceError}</p>}
        <p className="hint">Billentyűzettel: 1–4 a válaszokhoz, Enter a továbblépéshez.</p>
        <div className="actions">
          <button className="btn primary big" onClick={start} autoFocus>
            Indítás
          </button>
          <a className="btn" href={route ? href(`route/${route.id}`) : href('')}>
            Vissza
          </a>
        </div>
      </section>
    )
  }

  if (!step) return null
  const showQuestion = phase === 'question' || phase === 'feedback'
  const photo = frames.length > 0 && step.firstOfSituation ? frames[Math.min(frameIdx, frames.length - 1)] : frames.at(-1)
  const progress = `${idx + 1} / ${steps.length}`
  const t = settings

  const scenePane = (
    <div className={`pane ${mainView === 'scene' ? 'pane-main' : 'pane-inset'}`}>
      <DriveScene key={idx} scene={step.prompt.scene} animate={step.firstOfSituation} approachMs={t.approachMs} enabled={t.view3d} />
      {mainView !== 'scene' && (
        <button className="pane-swap" onClick={() => setMainView('scene')} aria-label="3D nézet nagyban">
          ⤢
        </button>
      )}
    </div>
  )
  const mapPane = (
    <div className={`pane ${mainView === 'map' ? 'pane-main' : 'pane-inset'}`}>
      {line && (
        <MapView
          className="drive-map"
          line={line}
          pins={pins}
          showPinCircles={false}
          quiet
          position={position}
          interactive={false}
          terrain={t.terrain}
          flyAlong={fly}
          focus={fly ? null : { lngLat: [step.situation.lng, step.situation.lat], zoom: 18, bearing: step.situation.bearing, pitch: 70, key: step.situation.id }}
        />
      )}
      {photo && (
        <figure className="photo">
          <img src={photo.url} alt="Utcakép a helyzet előtt" />
          <figcaption>
            Utcakép: Mapillary közreműködők{photo.capturedAt ? `, ${new Date(photo.capturedAt).getFullYear()}` : ''} · CC BY-SA
          </figcaption>
        </figure>
      )}
      {mainView !== 'map' && (
        <button className="pane-swap" onClick={() => setMainView('map')} aria-label="Térkép nagyban">
          ⤢
        </button>
      )}
    </div>
  )

  return (
    <section className="drive">
      <header className="drive-top">
        <span className="badge">{MODE_LABEL[mode]}</span>
        <span className="muted">
          {progress} · {KIND_LABEL[step.situation.kind]}
        </span>
        <div className="progress" aria-hidden>
          <div style={{ width: `${(idx / steps.length) * 100}%` }} />
        </div>
        <button className="btn small ghost" onClick={() => exit()}>
          {mode === 'exam' ? 'Befejezés' : 'Kilépés'}
        </button>
      </header>

      <div className="drive-grid">
        <div className="drive-visual">
          {scenePane}
          {mapPane}
        </div>

        <div className="drive-side">
          {phase === 'approach' && <p className="approaching">Közeledés…</p>}
          {showQuestion && (
            <div className="question">
              <h2>{step.prompt.title}</h2>
              <p>{step.prompt.text}</p>
              {phase === 'question' && (
                <div
                  className="timer"
                  key={idx}
                  aria-hidden
                  style={{ '--ok': `${(t.okMs / t.timeoutMs) * 100}%`, '--late': `${(t.lateMs / t.timeoutMs) * 100}%` } as CSSProperties}
                >
                  <div className="timer-fill" style={{ animationDuration: `${t.timeoutMs}ms` }} />
                  <span className="tick" style={{ left: `${(t.okMs / t.timeoutMs) * 100}%` }} />
                  <span className="tick" style={{ left: `${(t.lateMs / t.timeoutMs) * 100}%` }} />
                </div>
              )}
              <ol className="options">
                {step.prompt.options.map((o, i) => {
                  const chosen = last?.attempt.chosen === i
                  const reveal = phase === 'feedback' && (mode !== 'exam' || t.examFeedback)
                  const cls = reveal ? (o.correct ? 'correct' : chosen ? 'wrong' : '') : chosen ? 'picked' : ''
                  return (
                    <li key={i}>
                      <button className={`option ${cls}`} onClick={() => answer(i)} disabled={phase !== 'question'}>
                        <span className="key">{i + 1}</span>
                        <span>{o.text}</span>
                        {reveal && !o.correct && o.code && <code className="opt-code">{o.code}</code>}
                      </button>
                    </li>
                  )
                })}
              </ol>
              {phase === 'feedback' && mode !== 'exam' && last && <Feedback attempt={last.attempt} prompt={last.prompt} onNext={() => advance()} />}
              {phase === 'feedback' && mode === 'exam' && last && <Feedback attempt={last.attempt} compact hidden={!t.examFeedback} onNext={() => advance()} />}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

const OUTCOME_TITLE: Record<Attempt['outcome'], string> = {
  ok: 'Helyes, időben',
  late: 'Helyes, de kissé késve',
  slow: 'Helyes, de lassan',
  wrong: 'Hibás válasz',
  timeout: 'Nem válaszoltál időben',
}

/**
 * Visszajelzés a válasz után. Próbavizsgán (compact) csak az eredmény és a kód, magyarázat nélkül;
 * ha a visszajelzés ki van kapcsolva (hidden), csak annyi, hogy a válasz rögzítve.
 */
function Feedback({ attempt, prompt, onNext, compact, hidden }: { attempt: Attempt; prompt?: Prompt; onNext: () => void; compact?: boolean; hidden?: boolean }) {
  const next = (
    <button className="btn primary" onClick={onNext} autoFocus>
      Tovább (Enter)
    </button>
  )
  if (hidden)
    return (
      <div className="feedback-hidden">
        <p className="muted">Rögzítve.</p>
        {next}
      </div>
    )
  const good = attempt.outcome === 'ok'
  return (
    <div className={`feedback ${good ? 'good' : attempt.outcome === 'late' || attempt.outcome === 'slow' ? 'meh' : 'bad'}`}>
      <strong>
        {OUTCOME_TITLE[attempt.outcome]}
        {attempt.reactionMs !== null && ` · ${formatSeconds(attempt.reactionMs)}`}
      </strong>
      {attempt.codes.map((c) => (
        <p key={c} className="code-line">
          <code>{c}</code> {EVAL_CODES[c]?.text}
          {EVAL_CODES[c]?.fatal && <span className="badge bad">bukás</span>}
        </p>
      ))}
      {!compact && prompt && (
        <div className="feedback-body">
          <SceneView scene={prompt.scene} className="feedback-scene" />
          <p>{prompt.explanation}</p>
        </div>
      )}
      {next}
    </div>
  )
}
