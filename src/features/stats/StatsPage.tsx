import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { MapView, type MapPin } from '../../components/MapView'
import { EVAL_CODES } from '../../domain/evalCodes'
import { signForSituation, SIGN_BY_CODE } from '../../data/signs'
import { SignIcon } from '../../components/SignIcon'
import { KIND_LABEL } from '../../domain/questions'
import { evaluateSession } from '../../domain/scoring'
import type { Attempt, SignSession } from '../../domain/types'
import { db } from '../../db'
import { formatDate, formatDistance, formatSeconds, percent } from '../../lib/format'
import { href } from '../../lib/router'

const MODE_LABEL = { practice: 'gyakorlás', exam: 'próbavizsga', review: 'ismétlés' } as const

function errorColor(rate: number | null): string {
  if (rate === null) return '#9ca3af'
  if (rate < 0.2) return '#15803d'
  if (rate < 0.5) return '#d97706'
  return '#b91c1c'
}

export function StatsPage() {
  const sessions = useLiveQuery(() => db.sessions.orderBy('startedAt').reverse().toArray(), [])
  const routes = useLiveQuery(() => db.routes.toArray(), [])
  const cards = useLiveQuery(() => db.cards.toArray(), [])
  const signSessions = useLiveQuery(() => db.signSessions.orderBy('startedAt').reverse().limit(50).toArray(), [])
  const signCards = useLiveQuery(() => db.signCards.toArray(), [])
  const [routeId, setRouteId] = useState<string>('')
  const [selected, setSelected] = useState<string | null>(null)
  const [now] = useState(() => Date.now())
  const situations = useLiveQuery(() => (routeId ? db.situations.where('routeId').equals(routeId).toArray() : []), [routeId])

  const allAttempts = useMemo(() => (sessions ?? []).flatMap((s) => s.attempts), [sessions])

  const codeCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of allAttempts) for (const c of a.codes) m.set(c, (m.get(c) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [allAttempts])

  const bySituation = useMemo(() => {
    const m = new Map<string, Attempt[]>()
    for (const a of allAttempts) m.set(a.situationId, [...(m.get(a.situationId) ?? []), a])
    return m
  }, [allAttempts])

  if (!sessions || !routes || !cards || !signSessions || !signCards) return <p className="muted">Betöltés…</p>

  const exams = sessions.filter((s) => s.mode === 'exam')
  const passed = exams.filter((s) => evaluateSession(s.attempts).passed).length
  const due = cards.filter((c) => new Date(c.card.due).getTime() <= now).length
  const routeName = (id: string | null) => routes.find((r) => r.id === id)?.name ?? (id ? 'törölt útvonal' : 'vegyes')
  const route = routes.find((r) => r.id === routeId)

  const pins: MapPin[] = (situations ?? []).map((s) => {
    const list = bySituation.get(s.id) ?? []
    const rate = list.length ? list.filter((a) => a.outcome !== 'ok').length / list.length : null
    return {
      id: s.id,
      lngLat: [s.lng, s.lat],
      label: rate === null ? '' : String(Math.round(rate * 100)),
      color: errorColor(rate),
      selected: s.id === selected,
      sign: signForSituation(s),
    }
  })
  const sel = situations?.find((s) => s.id === selected)
  const selAttempts = sel ? (bySituation.get(sel.id) ?? []) : []

  return (
    <section className="stats">
      <h1>Statisztika</h1>
      <div className="kpis">
        <div className="card kpi">
          <span className="kpi-value">{sessions.length}</span>
          <span className="kpi-label">munkamenet</span>
        </div>
        <div className="card kpi">
          <span className="kpi-value">
            {passed} / {exams.length}
          </span>
          <span className="kpi-label">sikeres próbavizsga</span>
        </div>
        <div className="card kpi">
          <span className="kpi-value">{percent(allAttempts.filter((a) => a.outcome === 'ok').length, allAttempts.length)}</span>
          <span className="kpi-label">időben helyes válasz</span>
        </div>
        <div className="card kpi">
          <span className="kpi-value">{due}</span>
          <span className="kpi-label">esedékes ismétlés</span>
          {due > 0 && (
            <a className="btn small primary" href={href('review')}>
              Ismétlés
            </a>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Hibatérkép</h2>
        <p className="hint">
          Útvonalanként mutatja, hol hibázol a legtöbbet. A szám a hibás vagy késői válaszok aránya százalékban. Zöld: 20% alatt,
          sárga: 50% alatt, piros: afölött.
        </p>
        <select value={routeId} onChange={(e) => (setRouteId(e.target.value), setSelected(null))} aria-label="Útvonal">
          <option value="">Válassz útvonalat…</option>
          {routes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        {route && (
          <div className="stats-map">
            <MapView line={route.line} pins={pins} fitKey={route.id} onPinClick={setSelected} />
            {sel && (
              <div className="card stats-detail">
                <strong>
                  {KIND_LABEL[sel.kind]} · {formatDistance(sel.d)}
                </strong>
                <p className="muted">
                  {selAttempts.length} válasz, átlag {formatSeconds(avg(selAttempts.map((a) => a.reactionMs)))}
                </p>
                <ul>
                  {topCodes(selAttempts).map(([c, n]) => (
                    <li key={c}>
                      <code>{c}</code> ×{n} {EVAL_CODES[c]?.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <SignStats sessions={signSessions} dueSigns={signCards.filter((c) => new Date(c.card.due).getTime() <= now).length} />

      <div className="card">
        <h2>Leggyakoribb hibakódok</h2>
        {codeCounts.length === 0 ? (
          <p className="muted">Még nincs hibád. Indíts egy gyakorlást!</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Kód</th>
                  <th>Hányszor</th>
                  <th>Leírás</th>
                </tr>
              </thead>
              <tbody>
                {codeCounts.slice(0, 15).map(([c, n]) => (
                  <tr key={c} className={EVAL_CODES[c]?.fatal ? 'bad' : ''}>
                    <td>
                      <code>{c}</code>
                    </td>
                    <td className="num">{n}</td>
                    <td>{EVAL_CODES[c]?.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Munkamenetek</h2>
        {sessions.length === 0 ? (
          <p className="muted">Még nincs befejezett munkamenet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Dátum</th>
                  <th>Útvonal</th>
                  <th>Mód</th>
                  <th>Helyes</th>
                  <th>Átlagidő</th>
                  <th>Hibavonal</th>
                  <th>Eredmény</th>
                </tr>
              </thead>
              <tbody>
                {sessions.slice(0, 30).map((s) => {
                  const r = evaluateSession(s.attempts)
                  return (
                    <tr key={s.id}>
                      <td>
                        <a href={href(`sheet/${s.id}`)}>{formatDate(s.startedAt)}</a>
                      </td>
                      <td>{routeName(s.routeId)}</td>
                      <td>{MODE_LABEL[s.mode]}</td>
                      <td className="num">{percent(r.correct, r.answered)}</td>
                      <td className="num">{formatSeconds(r.avgReactionMs)}</td>
                      <td className="num">{r.faultLines}</td>
                      <td>
                        <span className={`badge ${r.passed ? 'good' : 'bad'}`}>{r.passed ? 'megfelelt' : 'nem felelt meg'}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}

function SignStats({ sessions, dueSigns }: { sessions: SignSession[]; dueSigns: number }) {
  const all = sessions.flatMap((s) => s.results)
  const missCount = new Map<string, number>()
  for (const r of all) if (!r.correct) missCount.set(r.code, (missCount.get(r.code) ?? 0) + 1)
  const worst = [...missCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  return (
    <div className="card">
      <h2>Táblafelismerés</h2>
      {sessions.length === 0 ? (
        <p className="muted">
          Még nem gyakoroltál táblákat. <a href={href('signs')}>Táblák gyakorlása</a>
        </p>
      ) : (
        <>
          <p className="muted">
            {sessions.length} kör, {percent(all.filter((r) => r.correct).length, all.length)} helyes, átlagos válaszidő{' '}
            {formatSeconds(avg(all.filter((r) => r.correct).map((r) => r.reactionMs)))}
            {dueSigns > 0 && (
              <>
                {' · '}
                <a href={href('signs')}>{dueSigns} esedékes tábla</a>
              </>
            )}
          </p>
          {worst.length > 0 && (
            <ul className="sign-grid compact">
              {worst.map(([code, n]) => (
                <li key={code}>
                  <SignIcon code={code} size={48} />
                  <span>
                    {SIGN_BY_CODE.get(code)?.name} <b>×{n}</b>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

function avg(xs: Array<number | null>): number | null {
  const v = xs.filter((x): x is number => x !== null)
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null
}

function topCodes(list: Attempt[]): Array<[string, number]> {
  const m = new Map<string, number>()
  for (const a of list) for (const c of a.codes) m.set(c, (m.get(c) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
}
