import { useLiveQuery } from 'dexie-react-hooks'
import { CodeLink } from '../../components/CodeLink'
import { EVAL_BLOCKS, EVAL_CODES, MAX_FAULT_LINES } from '../../domain/evalCodes'
import { hazardDistance } from '../../domain/hazards'
import { KIND_LABEL } from '../../domain/questions'
import { compareCodes, evaluateSession } from '../../domain/scoring'
import type { Outcome } from '../../domain/types'
import { db } from '../../db'
import { formatDate, formatDistance, formatSeconds, percent } from '../../lib/format'
import { driveSpotDistance } from '../../sim/examiner/result'
import { href } from '../../lib/router'

const OUTCOME_LABEL: Record<Outcome, string> = {
  ok: 'időben',
  late: 'késve',
  slow: 'lassan',
  wrong: 'hibás',
  timeout: 'nem válaszolt',
}

function Tally({ n }: { n: number }) {
  return <span className="tally" aria-label={`${n} jelölés`}>{'|'.repeat(n)}</span>
}

export function ExamSheet({ sessionId }: { sessionId: string }) {
  const data = useLiveQuery(async () => {
    const session = await db.sessions.get(sessionId)
    if (!session) return { session: null }
    const route = session.routeId ? await db.routes.get(session.routeId) : undefined
    const situations = await db.situations.bulkGet([...new Set(session.attempts.map((a) => a.situationId))])
    return { session, route, situations: new Map(situations.filter(Boolean).map((s) => [s!.id, s!])) }
  }, [sessionId])

  if (!data) return <p className="muted">Betöltés…</p>
  const { session } = data
  if (!session) return <p className="status error">Nincs ilyen munkamenet.</p>
  const { route, situations } = data as Required<typeof data>
  const result = evaluateSession(session.attempts)
  const isExam = session.mode === 'exam'

  return (
    <section className="sheet">
      <div className="page-head no-print">
        <a href={route ? href(`route/${route.id}`) : href('')} className="back">
          ← {route ? route.name : 'Útvonalak'}
        </a>
        <div className="actions">
          {route && (
            <a className="btn" href={href(session.mode === 'drive' ? `sim/${route.id}` : `drive/${route.id}?mode=${session.mode}`)}>
              Újra
            </a>
          )}
          <button className="btn" onClick={() => print()}>
            Nyomtatás
          </button>
        </div>
      </div>

      <div className="sheet-paper">
        <header className="sheet-header">
          <div>
            <h1>Forgalmi vizsga minősítő lap</h1>
            <p className="muted">
              Szimuláció · {isExam ? 'próbavizsga' : session.mode === 'practice' ? 'gyakorlás' : session.mode === 'tour' ? 'teljes útvonal' : session.mode === 'drive' ? 'vezetés' : 'ismétlés'} · Megengedett hibavonalak
              száma: {MAX_FAULT_LINES}
            </p>
          </div>
          <div className={`verdict ${result.passed ? 'pass' : 'fail'}`}>
            <span>{result.passed ? 'Megfelelt' : 'Nem felelt meg'}</span>
          </div>
        </header>

        <dl className="sheet-meta">
          <div>
            <dt>Vizsgaútvonal</dt>
            <dd>
              {route?.name ?? 'Vegyes (ismétlés)'}
              {route?.examRouteId ? ` · ${route.examRouteId}` : ''}
            </dd>
          </div>
          <div>
            <dt>Dátum</dt>
            <dd>{formatDate(session.startedAt)}</dd>
          </div>
          <div>
            <dt>Hibavonalak száma</dt>
            <dd className={result.faultLines > MAX_FAULT_LINES ? 'bad' : ''}>{result.faultLines}</dd>
          </div>
          <div>
            <dt>Sikertelenséget okozó hibák</dt>
            <dd className={result.fatal.length ? 'bad' : ''}>{result.fatal.length ? result.fatal.join(', ') : 'nincs'}</dd>
          </div>
          {session.mode !== 'drive' && (
            <>
              <div>
                <dt>Helyes válaszok</dt>
                <dd>
                  {result.correct} / {result.answered} ({percent(result.correct, result.answered)})
                </dd>
              </div>
              <div>
                <dt>Átlagos reakcióidő</dt>
                <dd>{formatSeconds(result.avgReactionMs)}</dd>
              </div>
            </>
          )}
        </dl>

        <div className="sheet-grid">
          {EVAL_BLOCKS.map((b) => (
            <div key={b.block} className={`sheet-block ${b.block === 8 ? 'fatal' : ''}`}>
              <h3>
                {b.block}. {b.title}
              </h3>
              <ul>
                {b.items.map((item) =>
                  'maneuver' in item ? (
                    <li key={item.maneuver} className="maneuver na">
                      <span className="circle" /> <b>{item.maneuver}</b> – {item.text}
                    </li>
                  ) : (
                    <li
                      key={item.code}
                      className={`${result.marks[item.code] ? 'marked' : ''} ${item.simulable ? '' : 'na'}`}
                      title={item.simulable ? undefined : 'A szimulátor ezt nem tudja mérni (járműkezelés)'}
                    >
                      <span className="box">{result.marks[item.code] ? <Tally n={result.marks[item.code]} /> : null}</span>
                      <span className="text">{item.text}</span>
                      <span className="code">{item.code}</span>
                    </li>
                  ),
                )}
              </ul>
            </div>
          ))}
        </div>
        <p className="hint">
          A halványan szedett tételeket (járműkezelés, manőverek) a szimulátor nem méri: ezeket csak valódi vezetésen lehet gyakorolni.
        </p>
      </div>

      <div className="card">
        <h2>Részletek</h2>
        <div className="table-wrap">
          <table className="attempts">
            <thead>
              <tr>
                <th>#</th>
                <th>Hely</th>
                <th>Helyzet</th>
                <th>Kérdés</th>
                <th>Eredmény</th>
                <th>Idő</th>
                <th>Kód</th>
              </tr>
            </thead>
            <tbody>
              {session.attempts.map((a, i) => {
                const s = situations.get(a.situationId)
                // A váratlan helyzetek nincsenek eltárolva: a helyük az azonosítóban van
                const hazardD = s ? null : hazardDistance(a.situationId)
                // A vezetés közben, helyzeten kívül elkövetett hibák: a helyük az azonosítóban van
                const driveD = s ? null : driveSpotDistance(a.situationId)
                return (
                  <tr key={i} className={a.codes.some((c) => EVAL_CODES[c]?.fatal) ? 'bad' : a.codes.length ? 'meh' : ''}>
                    <td>{i + 1}</td>
                    <td>{s ? formatDistance(s.d) : hazardD !== null ? formatDistance(hazardD) : driveD !== null ? formatDistance(driveD) : '–'}</td>
                    <td>{s ? KIND_LABEL[s.kind] : hazardD !== null ? KIND_LABEL.hazard : driveD !== null ? 'Vezetés közben' : 'törölt helyzet'}</td>
                    <td>{a.promptTitle ?? a.promptId}</td>
                    <td>{OUTCOME_LABEL[a.outcome]}</td>
                    <td>{formatSeconds(a.reactionMs)}</td>
                    <td>
                      {[...a.codes].sort(compareCodes).map((c) => (
                        <CodeLink key={c} code={c} />
                      ))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
