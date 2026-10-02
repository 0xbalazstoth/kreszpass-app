import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createEmptyCard, fsrs, generatorParameters, type Card } from 'ts-fsrs'
import { SignIcon } from '../../components/SignIcon'
import { GROUP_LABEL, SIGN_BY_CODE, SIGNS, signUrl, type SignGroup, type SignInfo } from '../../data/signs'
import { buildSignQuestion, pickDrillSigns, signRating, type SignQuestion } from '../../domain/signQuiz'
import type { SignResult, SignSession } from '../../domain/types'
import { db, getSettings } from '../../db'
import { formatSeconds, percent } from '../../lib/format'
import { href } from '../../lib/router'
import { pickRoadDrill, type RoadPlace } from './roadDrill'
import { RoadSignView } from './RoadSignView'

const scheduler = fsrs(generatorParameters({ enable_fuzz: true, enable_short_term: true }))

/** Válaszidő-sávok a táblafelismeréshez (ms) */
const FAST_MS = 1500
const OK_MS = 3500
const ANSWER_MS = 6000
/** Az utakon a tábla melletti elhaladás legrövidebb ideje (ms) */
const ROAD_MIN_MS = 3000

type Phase = 'intro' | 'flash' | 'answer' | 'feedback' | 'done'
type GroupFilter = SignGroup | 'all'
/** Táblakép: a tábla végig látszik, rögtön a válaszokkal; Az utakon: egy mentett útvonal valódi tábláit látod a helyükön, 3D-ben és a térképen */
type DrillMode = 'flash' | 'road'

const GROUPS: GroupFilter[] = ['all', ...(Object.keys(GROUP_LABEL) as SignGroup[])]

async function recordSign(code: string, correct: boolean, reactionMs: number | null) {
  const existing = await db.signCards.get(code)
  const card: Card = existing?.card ?? createEmptyCard<Card>(new Date())
  const next = scheduler.next(card, new Date(), signRating(correct, reactionMs)).card
  await db.signCards.put({ code, card: next })
}

export function SignDrillPage() {
  const [phase, setPhase] = useState<Phase>('intro')
  const [group, setGroup] = useState<GroupFilter>('all')
  const [count, setCount] = useState(20)
  const [view, setView] = useState({ approachMs: 2500, view3d: true, terrain: true })
  const [mode, setMode] = useState<DrillMode>('flash')
  /** A futó kör módja (a fülek váltása nem hat a folyamatban lévő körre) */
  const [drillMode, setDrillMode] = useState<DrillMode>('flash')
  const [routeChoice, setRouteChoice] = useState<string>('random')
  const [places, setPlaces] = useState<RoadPlace[]>([])
  const [roadStatus, setRoadStatus] = useState<string | null>(null)
  const [roadError, setRoadError] = useState<string | null>(null)
  /** Ha kevesebb valódi tábla van, mint amennyit kért: rövid megjegyzés az első táblánál */
  const [roadNote, setRoadNote] = useState<string | null>(null)
  const roadAbort = useRef<AbortController | null>(null)
  const [questions, setQuestions] = useState<SignQuestion[]>([])
  const [idx, setIdx] = useState(0)
  const [results, setResults] = useState<SignResult[]>([])
  const [chosen, setChosen] = useState<number | null>(null)
  const answerStart = useRef(0)
  const sessionStart = useRef(0)
  const timer = useRef<number | undefined>(undefined)
  const autoNext = useRef<number | undefined>(undefined)

  const dueCodes = useLiveQuery(async () => {
    const due = await db.signCards.where('card.due').belowOrEqual(new Date()).sortBy('card.due')
    return due.map((c) => c.code)
  }, [])

  const routes = useLiveQuery(() => db.routes.orderBy('updatedAt').reverse().toArray(), [])

  useEffect(() => {
    getSettings().then((s) => {
      setView({ approachMs: s.approachMs, view3d: s.view3d, terrain: s.terrain })
    })
    return () => {
      window.clearTimeout(autoNext.current)
      roadAbort.current?.abort()
    }
  }, [])

  const pool = group === 'all' ? SIGNS : SIGNS.filter((s) => s.group === group)
  const q = questions[idx] as SignQuestion | undefined

  function start(signs?: SignInfo[]) {
    const list = signs ?? pickDrillSigns(pool, dueCodes ?? [], count)
    begin(
      'flash',
      list.map((sign) => ({ sign })),
    )
  }

  /** Az utakon: egy (véletlen) útvonal valódi tábláinak egy véletlen szakasza; újrakezdéskor a megadott helyek */
  async function startRoad(again?: RoadPlace[]) {
    if (again) {
      setRoadNote(null)
      return begin('road', again.map((p) => ({ sign: SIGN_BY_CODE.get(p.sign.code)!, place: p })))
    }
    roadAbort.current?.abort()
    const ctrl = new AbortController()
    roadAbort.current = ctrl
    setRoadError(null)
    setRoadStatus('Táblák keresése az útvonalon…')
    try {
      const { places: found, available } = await pickRoadDrill(routeChoice, count, { signal: ctrl.signal, onStatus: setRoadStatus })
      if (ctrl.signal.aborted) return
      setRoadNote(
        found.length < count
          ? routeChoice === 'random'
            ? `A mentett útvonalaidon összesen ${available} valódi táblát találtam (${count} helyett). Több táblához vegyél fel új útvonalat, vagy futtasd az útvonalakon az Újrafelismerést.`
            : `Ezen az útvonalon ${available} valódi táblát találtam (${count} helyett). Válaszd a „Véletlen útvonal”-at, hogy több útvonalból álljon össze a kör.`
          : null,
      )
      if (!found.length) {
        setRoadError('Ezen az útvonalon nem találtam valódi táblát. Futtasd a helyzetfelismerést a szerkesztőben, vagy válassz másik útvonalat.')
        return
      }
      begin('road', found.map((p) => ({ sign: SIGN_BY_CODE.get(p.sign.code)!, place: p })))
    } catch (e) {
      if (!ctrl.signal.aborted) setRoadError(e instanceof Error ? e.message : String(e))
    } finally {
      if (!ctrl.signal.aborted) setRoadStatus(null)
    }
  }

  function begin(m: DrillMode, items: Array<{ sign: SignInfo; place?: RoadPlace }>) {
    // Minden táblaképet előre betöltünk, hogy a tábla a kérdéssel együtt jelenjen meg
    for (const { sign } of items) new Image().src = signUrl(sign.code)
    // A zavaró válaszok a teljes táblakészletből jönnek, lehetőleg a tábla saját csoportjából
    setQuestions(items.map(({ sign }) => buildSignQuestion(sign, SIGNS)))
    setPlaces(items.flatMap(({ place }) => (place ? [place] : [])))
    setDrillMode(m)
    setResults([])
    setIdx(0)
    setChosen(null)
    sessionStart.current = Date.now()
    showQuestion(m)
  }

  /** Táblaképnél a tábla és a válaszok egyszerre jelennek meg; az utakon előbb elhaladsz a tábla mellett */
  function showQuestion(m: DrillMode) {
    if (m === 'road') {
      setPhase('flash')
      return
    }
    answerStart.current = performance.now()
    setPhase('answer')
  }

  // Az utakon: elhaladás a tábla mellett, majd a válaszlehetőségek
  // Legalább 3 s, hogy a tábla mellett elhaladva el is lehessen olvasni
  const showMs = Math.max(view.approachMs, ROAD_MIN_MS)
  useEffect(() => {
    if (phase !== 'flash') return
    const t = window.setTimeout(() => {
      answerStart.current = performance.now()
      setPhase('answer')
    }, showMs)
    return () => window.clearTimeout(t)
  }, [phase, idx, showMs])

  // Időkorlát a válaszra
  useEffect(() => {
    if (phase !== 'answer') return
    timer.current = window.setTimeout(() => answer(null), ANSWER_MS)
    return () => window.clearTimeout(timer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, idx])

  function answer(i: number | null) {
    if (phase !== 'answer' || !q) return
    window.clearTimeout(timer.current)
    const rt = i === null ? null : Math.round(performance.now() - answerStart.current)
    const correct = i === q.correct
    const result: SignResult = { code: q.target.code, correct, reactionMs: rt }
    setResults((r) => [...r, result])
    setChosen(i)
    setPhase('feedback')
    void recordSign(q.target.code, correct, rt)
    if (correct) autoNext.current = window.setTimeout(() => next([...results, result]), 700)
  }

  function next(all: SignResult[] = results) {
    window.clearTimeout(autoNext.current)
    setChosen(null)
    if (idx + 1 >= questions.length) {
      const session: SignSession = {
        id: crypto.randomUUID(),
        startedAt: sessionStart.current,
        finishedAt: Date.now(),
        group: drillMode === 'road' ? 'road' : group,
        results: all,
      }
      void db.signSessions.put(session)
      setPhase('done')
      return
    }
    setIdx(idx + 1)
    showQuestion(drillMode)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase === 'answer' && q) {
        const n = Number(e.key)
        if (n >= 1 && n <= q.options.length) {
          e.preventDefault()
          answer(n - 1)
        }
      } else if (phase === 'feedback' && q && chosen !== q.correct && (e.key === 'Enter' || e.key === ' ')) {
        // Helyes válasz után magától lép tovább; itt csak a hibásnál kell Enter
        e.preventDefault()
        next()
      } else if (phase === 'intro' && e.key === 'Enter' && !roadStatus) {
        if (mode === 'road') void startRoad()
        else start()
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  // ------------------------------------------------------------ bevezető és táblatár
  if (phase === 'intro') {
    const dueInPool = (dueCodes ?? []).filter((c) => pool.some((s) => s.code === c)).length
    const countSelect = (
      <label className="inline">
        Táblák száma{' '}
        <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
          {[10, 20, 30].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
    )
    return (
      <section className="signs">
        <div className="card intro-signs">
          <h1>Táblafelismerés</h1>
          <div className="tabs" role="tablist" aria-label="Gyakorlás módja">
            <button role="tab" aria-selected={mode === 'flash'} className={`tab ${mode === 'flash' ? 'active' : ''}`} onClick={() => setMode('flash')}>
              Táblakép
            </button>
            <button role="tab" aria-selected={mode === 'road'} className={`tab ${mode === 'road' ? 'active' : ''}`} onClick={() => setMode('road')}>
              Az utakon
            </button>
          </div>
          {mode === 'flash' ? (
            <>
              <p>
                Látod a táblát, és kiválasztod a jelentését. Minél gyorsabban, annál jobb: a rosszul vagy lassan felismert táblák
                hamarabb visszajönnek.
              </p>
              <div className="chips" role="radiogroup" aria-label="Táblacsoport">
                {GROUPS.map((g) => (
                  <button key={g} className={`btn small ${group === g ? 'active' : ''}`} onClick={() => setGroup(g)} role="radio" aria-checked={group === g}>
                    {g === 'all' ? 'Mind' : GROUP_LABEL[g]}
                  </button>
                ))}
              </div>
              <div className="actions">
                {countSelect}
                {dueInPool > 0 && <span className="badge">{dueInPool} esedékes ismétlés</span>}
              </div>
              <div className="actions">
                <button className="btn primary big" onClick={() => start()} autoFocus>
                  Indítás
                </button>
              </div>
            </>
          ) : (
            <>
              <p>
                Egy mentett útvonalad valódi tábláit látod a helyükön: a 3D nézetben elhaladsz a tábla mellett, a térkép a valódi helyére
                repül. Amikor a tábla már mögötted van, választod ki a jelentését. A táblák az OpenStreetMap-adatokból és az útvonal
                ellenőrzött helyzeteiből jönnek, egy véletlen szakaszon, haladási sorrendben.
              </p>
              {routes && routes.length === 0 ? (
                <p className="hint">
                  Ehhez előbb vegyél fel egy útvonalat: <a href={href('route/new')}>Új útvonal</a>.
                </p>
              ) : (
                <>
                  <div className="actions">
                    <label className="inline">
                      Útvonal{' '}
                      <select value={routeChoice} onChange={(e) => setRouteChoice(e.target.value)} disabled={!!roadStatus}>
                        <option value="random">Véletlen útvonal</option>
                        {(routes ?? []).map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name || 'Névtelen útvonal'}
                          </option>
                        ))}
                      </select>
                    </label>
                    {countSelect}
                  </div>
                  <div className="actions">
                    <button className="btn primary big" onClick={() => void startRoad()} disabled={!!roadStatus} autoFocus>
                      {roadStatus ? 'Betöltés…' : 'Indítás'}
                    </button>
                  </div>
                  {roadStatus && <p className="muted">{roadStatus}</p>}
                  {roadError && <p className="status error">{roadError}</p>}
                </>
              )}
            </>
          )}
        </div>

        <div className="card">
          <h2>Táblatár</h2>
          <p className="hint">
            A táblák forrása a Wikimedia Commons. Magyar KRESZ táblák, közkincs (PD-HU-exempt). Egy táblára kattintva megnyílik a forrása.
          </p>
          {(Object.keys(GROUP_LABEL) as SignGroup[]).map((g) => (
            <details key={g} className="sign-group">
              <summary>
                {GROUP_LABEL[g]} ({SIGNS.filter((s) => s.group === g).length})
              </summary>
              <ul className="sign-grid">
                {SIGNS.filter((s) => s.group === g).map((s) => (
                  <li key={s.code}>
                    <a href={s.source} target="_blank" rel="noreferrer">
                      <SignIcon code={s.code} size={72} />
                      <span>{s.name}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </section>
    )
  }

  // ------------------------------------------------------------ összegzés
  if (phase === 'done') {
    const correct = results.filter((r) => r.correct)
    const times = correct.map((r) => r.reactionMs).filter((x): x is number => x !== null)
    const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null
    const missed = results.filter((r) => !r.correct).map((r) => SIGNS.find((s) => s.code === r.code)!)
    return (
      <section className="signs">
        <div className="card">
          <h1>Eredmény</h1>
          <div className="kpis">
            <div className="kpi">
              <span className="kpi-value">{percent(correct.length, results.length)}</span>
              <span className="kpi-label">
                helyes ({correct.length}/{results.length})
              </span>
            </div>
            <div className="kpi">
              <span className="kpi-value">{formatSeconds(avg)}</span>
              <span className="kpi-label">átlagos válaszidő</span>
            </div>
          </div>
          {missed.length > 0 && (
            <>
              <h2>Ezeket érdemes átnézni</h2>
              <ul className="sign-grid">
                {missed.map((s) => (
                  <li key={s.code}>
                    <SignIcon code={s.code} size={72} />
                    <span>{s.name}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="actions">
            <button className="btn primary" onClick={() => (drillMode === 'road' ? void startRoad() : start())}>
              Új kör
            </button>
            {missed.length > 0 && (
              <button
                className="btn"
                onClick={() =>
                  drillMode === 'road' ? void startRoad(places.filter((p) => missed.some((m) => m.code === p.sign.code))) : start(missed)
                }
              >
                Csak a hibásak
              </button>
            )}
            <button className="btn ghost" onClick={() => setPhase('intro')}>
              Vissza
            </button>
          </div>
        </div>
      </section>
    )
  }

  // ------------------------------------------------------------ gyakorlás
  if (!q) return null
  const place = drillMode === 'road' ? places[idx] : undefined
  const header = (
    <header className="drive-top">
      <span className="badge">{place ? 'Táblák az utakon' : 'Táblák'}</span>
      <span className="muted">
        {idx + 1} / {questions.length}
      </span>
      <div className="progress" aria-hidden>
        <div style={{ width: `${(idx / questions.length) * 100}%` }} />
      </div>
      <button className="btn small ghost" onClick={() => setPhase('intro')}>
        Kilépés
      </button>
    </header>
  )
  const questionBlock = phase !== 'flash' && (
    <div className="question">
      {phase === 'answer' && (
        <div
          className="timer"
          key={idx}
          aria-hidden
          style={{ '--ok': `${(FAST_MS / ANSWER_MS) * 100}%`, '--late': `${(OK_MS / ANSWER_MS) * 100}%` } as CSSProperties}
        >
          <div className="timer-fill" style={{ animationDuration: `${ANSWER_MS}ms` }} />
        </div>
      )}
      {place && phase === 'answer' && <p className="prompt">Milyen táblát láttál?</p>}
      <ol className="options">
        {q.options.map((o, i) => {
          const reveal = phase === 'feedback'
          const cls = reveal ? (i === q.correct ? 'correct' : chosen === i ? 'wrong' : '') : ''
          return (
            <li key={o}>
              <button className={`option ${cls}`} onClick={() => answer(i)} disabled={phase !== 'answer'}>
                <span className="key">{i + 1}</span>
                <span>{o}</span>
              </button>
            </li>
          )
        })}
      </ol>
      {phase === 'feedback' && place && (
        <div className="road-answer">
          <img src={signUrl(q.target.code)} alt="" />
          <span>{q.target.name}</span>
        </div>
      )}
      {phase === 'feedback' && chosen !== q.correct && (
        <div className="feedback bad">
          <strong>{chosen === null ? 'Lejárt az idő' : 'Nem ez'}</strong>
          <p>
            Ez a tábla: <b>{q.target.name}</b>
          </p>
          <button className="btn primary" onClick={() => next()} autoFocus>
            Tovább (Enter)
          </button>
        </div>
      )}
    </div>
  )

  if (place) {
    return (
      <section className="drive road-drill">
        {header}
        <div className="drive-grid">
          <RoadSignView
            key={idx}
            place={place}
            phase={phase === 'flash' ? 'flash' : phase === 'answer' ? 'answer' : 'feedback'}
            {...view}
            approachMs={showMs}
          />
          <div className="drive-side">
            {phase === 'flash' && <p className="approaching">Figyeld a táblát!</p>}
            {idx === 0 && roadNote && <p className="status warn">{roadNote}</p>}
            {questionBlock}
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="signs drill">
      {header}
      <div className="flash-box">
        <img src={signUrl(q.target.code)} alt="" className="flash-sign" />
      </div>
      {questionBlock}
    </section>
  )
}
