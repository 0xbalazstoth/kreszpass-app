import type { LineString } from 'geojson'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { MapView, type FlyAlong, type MapPin } from '../../components/MapView'
import { SceneView } from '../../components/SceneView'
import { DriveScene } from '../../components/scene3d'
import { preloadScene3D } from '../../components/scene3d/load'
import { approachFrames, type MlImage } from '../../data/mapillary'
import { describeExpected, expectedActions, scoreActions, type ActionEvent, type ActionKind, type ActionResult } from '../../domain/actions'
import { EVAL_CODES } from '../../domain/evalCodes'
import { EXAMINER_LEAD_M, examinerLine } from '../../domain/examiner'
import { isGenerated, withHazards } from '../../domain/hazards'
import { attemptsBySituation, weakest } from '../../domain/progress'
import { buildPrompts, KIND_LABEL, type Prompt } from '../../domain/questions'
import { classifyAnswer } from '../../domain/scoring'
import type { Attempt, ExamSession, Mode, Route, Settings, Situation } from '../../domain/types'
import { db, getSettings, saveSettings, situationsOf } from '../../db'
import { formatSeconds } from '../../lib/format'
import { href, navigate } from '../../lib/router'
import { flyPath } from './fly'
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

const MODE_LABEL: Record<Mode, string> = { practice: 'Gyakorlás', exam: 'Próbavizsga', review: 'Ismétlés', tour: 'Teljes útvonal' }
/** Legfeljebb ennyit várunk az utcaképekre a közeledés elején */
const FRAME_WAIT_MS = 1200
/** Mozdulatok billentyűi: M = tükör, nyilak = index, szóköz / lefelé nyíl = fék */
const ACTION_KEYS: Record<string, ActionKind> = {
  m: 'mirror',
  M: 'mirror',
  ArrowLeft: 'indicator_left',
  ArrowRight: 'indicator_right',
  ' ': 'brake',
  ArrowDown: 'brake',
}
/** Mozdulat-gyakorlásnál legalább ennyi idő kell a tükörre, indexre, fékre */
const ACTION_APPROACH_MS = 5000
/** Teljes útvonalon egy szakasz legfeljebb ennyi ideig tart (hosszú egyenesek) */
const TOUR_MAX_MS = 45_000
/** A térképes repülés a helyzet előtt ennyivel áll meg (m) */
const STOP_BEFORE_M = 14

/**
 * A közeledés terve: honnan (útvonal-távolság, m) és mennyi ideig tart.
 * Teljes útvonalon az előző helyzettől folyamatosan halad a beállított sebességgel.
 */
function approachPlan(step: Step, prevD: number | null, settings: Settings, mode: Mode, actions: boolean): { fromD: number; durationMs: number } {
  const s = step.situation
  let durationMs = settings.approachMs
  let fromD = s.d - 150
  if (mode === 'tour') {
    fromD = Math.max(0, (prevD ?? 0) + (prevD === null ? 0 : 2))
    const dist = Math.max(0, s.d - STOP_BEFORE_M - fromD)
    durationMs = Math.min(TOUR_MAX_MS, Math.max(settings.approachMs, (dist / (settings.tourSpeedKmh / 3.6)) * 1000))
  }
  if (actions && expectedActions(s)) durationMs = Math.max(durationMs, ACTION_APPROACH_MS)
  return { fromD, durationMs }
}

/** Első személyű kamera-út a térképen: alapból a helyzet előtti 150 m, a megállási pontig */
function flyPathFor(line: LineString, s: Situation, durationMs: number, fromD = s.d - 150): FlyAlong | null {
  return flyPath(line, fromD, s.d - STOP_BEFORE_M, durationMs, s.id)
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
  /** 'weak': csak a leggyengébb helyzetek */
  focus?: 'weak'
}

/** Gyenge pontok gyakorlásakor ennyi helyzet jön */
const WEAK_COUNT = 10

export function DrivePage({ routeId, mode, focus }: Props) {
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
  // Mozdulat-gyakorlás (tükör, index, fék) és a teljes útvonal vizsgabiztosa
  const [actionsOn, setActionsOn] = useState(false)
  const [examinerOn, setExaminerOn] = useState(true)
  const [pressed, setPressed] = useState<ActionKind[]>([])
  const [actionResult, setActionResult] = useState<{ situationId: string; result: ActionResult; expected: string } | null>(null)
  /** Teljes útvonalon a 3D jelenet csak a helyzet előtti utolsó szakaszon jelenik meg */
  const [sceneShown, setSceneShown] = useState(true)
  const actionEvents = useRef<ActionEvent[]>([])
  const approachStart = useRef(0)
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
        if (focus === 'weak') {
          const sessions = await db.sessions.toArray()
          list = weakest(list, attemptsBySituation(sessions.flatMap((x) => x.attempts)), WEAK_COUNT)
        } else list = withHazards(list, r.line, r.id, st.hazards)
      }
      const built: Step[] = []
      for (const s of list) {
        const prompts = buildPrompts(s)
        prompts.forEach((p, i) => built.push({ situation: s, prompt: p, firstOfSituation: i === 0, lastOfSituation: i === prompts.length - 1 }))
      }
      if (cancelled) return
      setSettings(st)
      setActionsOn(st.actionDrill)
      setExaminerOn(st.examinerVoice)
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
  }, [routeId, mode, focus])

  const step = steps[idx] as Step | undefined
  const line = step ? lines[step.situation.routeId] : undefined
  const token = settings?.mapillaryToken ?? ''
  const prevD = idx > 0 && steps[idx - 1].situation.routeId === step?.situation.routeId ? steps[idx - 1].situation.d : null
  const plan = useMemo(
    () => (step && settings ? approachPlan(step, prevD, settings, mode, actionsOn) : null),
    [step, prevD, settings, mode, actionsOn],
  )
  /** Ennél a helyzetnél van-e mozdulat-gyakorlás */
  const drill = actionsOn && step?.firstOfSituation ? expectedActions(step.situation, step.prompt.scene) : null

  // ------------------------------------------------ Közeledés
  useEffect(() => {
    if (phase !== 'approach' || !step || !settings || !plan) return
    let cancelled = false
    const timers: number[] = []
    const duration = plan.durationMs
    const s = step.situation
    // A következő helyzet képeit előre betöltjük
    const next = steps.slice(idx + 1).find((x) => x.firstOfSituation)
    if (token && next && lines[next.situation.routeId]) void framesFor(token, lines[next.situation.routeId], next.situation)

    actionEvents.current = []
    approachStart.current = performance.now()
    setPressed([])
    setActionResult(null)

    if (mode === 'tour') {
      // Hosszú szakaszon a térkép vezet, a 3D jelenet a helyzet előtti utolsó szakaszon jelenik meg
      setSceneShown(false)
      setMainView('map')
      timers.push(
        window.setTimeout(() => {
          if (cancelled) return
          setSceneShown(true)
          setMainView('scene')
        }, Math.max(0, duration - settings.approachMs)),
      )
      const say = examinerOn ? examinerLine(s, idx === 0) : null
      if (say) {
        // Mint a vizsgán: kb. 120 m-rel a kereszteződés előtt szól
        const dist = Math.max(0, s.d - STOP_BEFORE_M - plan.fromD)
        const delay = Math.max(0, ((dist - EXAMINER_LEAD_M) / (settings.tourSpeedKmh / 3.6)) * 1000)
        timers.push(window.setTimeout(() => !cancelled && speak(say), idx === 0 ? 0 : delay))
      }
    }

    // A 3D jelenet és a térképes repülés ugyanennyi ideig tart, utána jön a kérdés
    timers.push(
      window.setTimeout(() => {
        if (cancelled) return
        const exp = drill
        if (exp) {
          const result = scoreActions(exp, actionEvents.current, duration)
          setActionResult({ situationId: s.id, result, expected: describeExpected(exp) })
          setAttempts((prev) => [
            ...prev,
            {
              situationId: s.id,
              promptId: 'actions',
              promptTitle: 'Mozdulatok (tükör, index, fék)',
              reactionMs: null,
              chosen: null,
              outcome: result.outcome,
              codes: result.codes,
              at: Date.now(),
            },
          ])
        }
        setPhase('question')
      }, duration),
    )
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
    // A közeledés a fázis és a lépés változásakor indul; a drill és a terv ebből következik
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, step, settings, token, line, idx, steps, lines])

  /** Egy mozdulat rögzítése (billentyű vagy gomb) */
  const act = useCallback((kind: ActionKind) => {
    actionEvents.current.push({ kind, t: performance.now() - approachStart.current })
    setPressed((p) => [...p.filter((k) => !(k.startsWith('indicator') && kind.startsWith('indicator'))), kind])
  }, [])

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
      // A váratlan helyzetek nincsenek eltárolva, ezért ismétlésre sem kerülnek
      if (step.lastOfSituation && !isGenerated(step.situation)) {
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
      if (phase === 'approach' && drill) {
        const kind = ACTION_KEYS[e.key]
        if (kind) {
          e.preventDefault()
          if (!e.repeat) act(kind)
        }
      } else if (phase === 'question' && step) {
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
    () => (step && line && plan ? flyPathFor(line, step.situation, plan.durationMs, plan.fromD) : null),
    // Helyzetenként egyszer repülünk
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [situationId, line, plan?.durationMs, plan?.fromD],
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
          {focus === 'weak' ? 'Gyenge pontok' : MODE_LABEL[mode]}
          {route ? `: ${route.name}` : ''}
        </h1>
        {focus === 'weak' && (
          <p className="hint">A korábbi válaszaid alapján a leggyengébb {situationCount} helyzet jön, az útvonal sorrendjében.</p>
        )}
        {mode === 'tour' ? (
          <p>
            Végigvezetünk a teljes útvonalon, {settings.tourSpeedKmh} km/h-val, megszakítás nélkül: a térkép a valódi útvonalon halad, a
            vizsgabiztos hangosan mondja az irányt, mint a vizsgán. Minden helyzetnél megállsz, a 3D nézetben körülnézel, és időre
            válaszolsz. {situationCount} helyzet, {steps.length} kérdés.
          </p>
        ) : (
          <p>
            {situationCount} helyzet, {steps.length} kérdés. Minden helyzet előtt „közeledsz”
            {settings.view3d ? ' a 3D nézetben' : ' a vázlaton'}, közben a térkép a valódi útvonaladon repül végig
            {token ? ' (Mapillary utcaképekkel, ha vannak)' : ''}. Utána a kérdésre időre kell válaszolnod.
          </p>
        )}
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
            <input
              type="checkbox"
              checked={actionsOn}
              onChange={(e) => {
                setActionsOn(e.target.checked)
                void saveSettings({ actionDrill: e.target.checked })
              }}
            />{' '}
            Mozdulatok gyakorlása: kereszteződés előtt tükör (<kbd>M</kbd>), index (<kbd>←</kbd> <kbd>→</kbd>), fékezés (<kbd>Szóköz</kbd>). A
            sorrendet és az időzítést a minősítő lap szerint értékeljük (4/4, 4/5, 6/8, 8/6, 8/30).
          </label>
          {mode === 'tour' && (
            <label className="check">
              <input
                type="checkbox"
                checked={examinerOn}
                onChange={(e) => {
                  setExaminerOn(e.target.checked)
                  void saveSettings({ examinerVoice: e.target.checked })
                }}
              />{' '}
              A vizsgabiztos hangos utasításai („A következő kereszteződésnél forduljon balra.”)
            </label>
          )}
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

  // Teljes útvonalon a 3D jelenet a helyzet előtti utolsó szakaszon indul; mozdulat-gyakorlásnál a hosszabb közeledéshez igazodik
  const sceneMs = mode === 'tour' ? t.approachMs : (plan?.durationMs ?? t.approachMs)
  const sceneVisible = mode !== 'tour' || phase !== 'approach' || sceneShown
  // A körforgalom második (kihajtási) kérdésénél a körpályán, íven haladunk a kijárat elé
  const sceneAnimated = step.firstOfSituation || step.prompt.scene.roundabout?.phase === 'exit'
  const scenePane = (
    <div className={`pane ${mainView === 'scene' ? 'pane-main' : 'pane-inset'}`}>
      {sceneVisible ? (
        <DriveScene
          key={idx}
          scene={step.prompt.scene}
          animate={sceneAnimated}
          approachMs={sceneMs}
          enabled={t.view3d}
        />
      ) : (
        <div className="scene-wait">A 3D nézet a következő helyzet előtt jelenik meg</div>
      )}
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
          {phase === 'approach' && drill && <ActionBar pressed={pressed} onAct={act} />}
        </div>

        <div className="drive-side">
          {phase === 'approach' && <p className="approaching">Közeledés…</p>}
          {phase === 'approach' && drill && (
            <p className="hint">
              Most végezd el a mozdulatokat: tükör <kbd>M</kbd>, index <kbd>←</kbd> <kbd>→</kbd>, fékezés <kbd>Szóköz</kbd>.
            </p>
          )}
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
              {phase === 'feedback' &&
                (mode !== 'exam' || t.examFeedback) &&
                actionResult &&
                actionResult.situationId === step.situation.id &&
                step.firstOfSituation && <ActionFeedback result={actionResult.result} expected={actionResult.expected} />}
              {phase === 'feedback' && mode !== 'exam' && last && <Feedback attempt={last.attempt} prompt={last.prompt} onNext={() => advance()} />}
              {phase === 'feedback' && mode === 'exam' && last && <Feedback attempt={last.attempt} compact hidden={!t.examFeedback} onNext={() => advance()} />}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

const ACTION_BUTTONS: Array<{ kind: ActionKind; label: string; key: string }> = [
  { kind: 'mirror', label: 'Tükör', key: 'M' },
  { kind: 'indicator_left', label: '◀ Index', key: '←' },
  { kind: 'brake', label: 'Fék', key: 'Szóköz' },
  { kind: 'indicator_right', label: 'Index ▶', key: '→' },
]

/** Mozdulatok gombjai (érintőképernyőre is); a bekapcsolt index villog */
function ActionBar({ pressed, onAct }: { pressed: ActionKind[]; onAct: (k: ActionKind) => void }) {
  return (
    <div className="action-bar" role="group" aria-label="Mozdulatok">
      {ACTION_BUTTONS.map((b) => (
        <button
          key={b.kind}
          className={`act ${pressed.includes(b.kind) ? 'on' : ''} ${b.kind.startsWith('indicator') ? 'indicator' : ''}`}
          // A gomb ne vegye el a fókuszt, különben a szóköz újra „megnyomná”
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onAct(b.kind)}
        >
          {b.label} <kbd>{b.key}</kbd>
        </button>
      ))}
    </div>
  )
}

/** A mozdulatok értékelése a helyzet első kérdése után */
function ActionFeedback({ result, expected }: { result: ActionResult; expected: string }) {
  const cls = result.outcome === 'ok' ? 'good' : result.outcome === 'wrong' ? 'bad' : 'meh'
  return (
    <div className={`feedback ${cls} action-feedback`}>
      <strong>Mozdulatok: {result.outcome === 'ok' ? 'hibátlan' : 'hibás'}</strong>
      <p className="muted">Helyesen: {expected}</p>
      {result.notes.map((n) => (
        <p key={n}>{n}</p>
      ))}
      {result.codes.map((c) => (
        <p key={c} className="code-line">
          <code>{c}</code> {EVAL_CODES[c]?.text}
          {EVAL_CODES[c]?.fatal && <span className="badge bad">bukás</span>}
        </p>
      ))}
    </div>
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
