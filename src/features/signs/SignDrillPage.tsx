import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createEmptyCard, fsrs, generatorParameters, type Card } from 'ts-fsrs'
import { SignIcon } from '../../components/SignIcon'
import { GROUP_LABEL, SIGNS, signUrl, type SignGroup, type SignInfo } from '../../data/signs'
import { buildSignQuestion, pickDrillSigns, signRating, type SignQuestion } from '../../domain/signQuiz'
import type { SignResult, SignSession } from '../../domain/types'
import { db, getSettings } from '../../db'
import { formatSeconds, percent } from '../../lib/format'

const scheduler = fsrs(generatorParameters({ enable_fuzz: true, enable_short_term: true }))

/** Válaszidő-sávok a táblafelismeréshez (ms) */
const FAST_MS = 1500
const OK_MS = 3500
const ANSWER_MS = 6000

type Phase = 'intro' | 'flash' | 'answer' | 'feedback' | 'done'
type GroupFilter = SignGroup | 'all'

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
  const [flashMs, setFlashMs] = useState(1200)
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

  useEffect(() => {
    getSettings().then((s) => setFlashMs(s.signFlashMs))
    return () => window.clearTimeout(autoNext.current)
  }, [])

  const pool = group === 'all' ? SIGNS : SIGNS.filter((s) => s.group === group)
  const q = questions[idx] as SignQuestion | undefined

  function start(signs?: SignInfo[]) {
    const list = signs ?? pickDrillSigns(pool, dueCodes ?? [], count)
    // Minden táblaképet előre betöltünk, hogy a felvillanás pontos legyen
    for (const s of list) new Image().src = signUrl(s.code)
    // A zavaró válaszok a teljes táblakészletből jönnek, lehetőleg a tábla saját csoportjából
    setQuestions(list.map((s) => buildSignQuestion(s, SIGNS)))
    setResults([])
    setIdx(0)
    setChosen(null)
    sessionStart.current = Date.now()
    setPhase('flash')
  }

  // Felvillanás, majd a válaszlehetőségek
  useEffect(() => {
    if (phase !== 'flash') return
    const t = window.setTimeout(() => {
      answerStart.current = performance.now()
      setPhase('answer')
    }, flashMs)
    return () => window.clearTimeout(t)
  }, [phase, idx, flashMs])

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
      const session: SignSession = { id: crypto.randomUUID(), startedAt: sessionStart.current, finishedAt: Date.now(), group, results: all }
      void db.signSessions.put(session)
      setPhase('done')
      return
    }
    setIdx(idx + 1)
    setPhase('flash')
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
      } else if (phase === 'intro' && e.key === 'Enter') start()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  // ------------------------------------------------------------ bevezető és táblatár
  if (phase === 'intro') {
    const dueInPool = (dueCodes ?? []).filter((c) => pool.some((s) => s.code === c)).length
    return (
      <section className="signs">
        <div className="card intro-signs">
          <h1>Táblafelismerés</h1>
          <p>
            A tábla {formatSeconds(flashMs)} ideig látszik, utána választod ki a jelentését. Minél gyorsabban, annál jobb: a rosszul vagy
            lassan felismert táblák hamarabb visszajönnek.
          </p>
          <div className="chips" role="radiogroup" aria-label="Táblacsoport">
            {GROUPS.map((g) => (
              <button key={g} className={`btn small ${group === g ? 'active' : ''}`} onClick={() => setGroup(g)} role="radio" aria-checked={group === g}>
                {g === 'all' ? 'Mind' : GROUP_LABEL[g]}
              </button>
            ))}
          </div>
          <div className="actions">
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
            {dueInPool > 0 && <span className="badge">{dueInPool} esedékes ismétlés</span>}
          </div>
          <div className="actions">
            <button className="btn primary big" onClick={() => start()} autoFocus>
              Indítás
            </button>
          </div>
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
            <button className="btn primary" onClick={() => start()}>
              Új kör
            </button>
            {missed.length > 0 && (
              <button className="btn" onClick={() => start(missed)}>
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
  const showSign = phase === 'flash' || phase === 'feedback'
  return (
    <section className="signs drill">
      <header className="drive-top">
        <span className="badge">Táblák</span>
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
      <div className="flash-box">
        {showSign ? <img src={signUrl(q.target.code)} alt="" className="flash-sign" /> : <span className="flash-hidden">?</span>}
      </div>
      {phase === 'flash' && <p className="approaching">Figyelj!</p>}
      {phase !== 'flash' && (
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
      )}
    </section>
  )
}
