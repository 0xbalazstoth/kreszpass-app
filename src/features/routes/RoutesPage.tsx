import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, deleteRoute } from '../../db'
import { attemptsBySituation, HEALTH_COLOR, HEALTH_LABEL, routeReadiness, weakest, type Health } from '../../domain/progress'
import { formatDistance } from '../../lib/format'
import { RouteGeom } from '../../lib/geo'
import { href } from '../../lib/router'

export function RoutesPage() {
  const routes = useLiveQuery(() => db.routes.orderBy('updatedAt').reverse().toArray(), [])
  const situations = useLiveQuery(() => db.situations.toArray(), [])
  const cards = useLiveQuery(() => db.cards.toArray(), [])
  const sessions = useLiveQuery(() => db.sessions.toArray(), [])
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [now] = useState(() => Date.now())

  if (!routes || !situations || !cards || !sessions) return <p className="muted">Betöltés…</p>
  const by = attemptsBySituation(sessions.flatMap((x) => x.attempts))

  return (
    <section>
      <div className="page-head">
        <h1>Vizsgaútvonalak</h1>
        <a className="btn primary" href={href('route/new')}>
          Új útvonal
        </a>
      </div>

      {routes.length === 0 && (
        <div className="empty">
          <h2>Még nincs útvonalad</h2>
          <p>
            Rajzold be a vizsgaútvonalat a térképen, vagy importáld GPX/KML fájlból. A program az OpenStreetMap-adatokból
            felismeri a kereszteződéseket, táblákat, lámpákat és zebrákat, és kérdéseket készít belőlük.
          </p>
          <a className="btn primary" href={href('route/new')}>
            Első útvonal létrehozása
          </a>
        </div>
      )}

      <ul className="route-list">
        {routes.map((r) => {
          const own = situations.filter((s) => s.routeId === r.id)
          const review = own.filter((s) => s.needsReview).length
          const due = cards.filter((c) => c.routeId === r.id && new Date(c.card.due).getTime() <= now).length
          const ready = routeReadiness(own, by)
          const weak = weakest(own, by, 10).length
          let len = 0
          try {
            len = new RouteGeom(r.line).length
          } catch {
            len = 0
          }
          return (
            <li key={r.id} className="card route-card">
              <div className="route-card-main">
                <h2>{r.name || 'Névtelen útvonal'}</h2>
                <p className="muted">
                  {r.examRouteId ? `Azonosító: ${r.examRouteId} · ` : ''}
                  {formatDistance(len)} · {own.length} helyzet
                  {review > 0 && <span className="badge warn">{review} ellenőrizendő</span>}
                  {due > 0 && <span className="badge">{due} esedékes ismétlés</span>}
                </p>
                {own.length > 0 && <ReadinessBar percent={ready.percent} counts={ready.counts} />}
              </div>
              <div className="actions">
                <a className="btn" href={href(`route/${r.id}`)}>
                  Szerkesztés
                </a>
                <a className={`btn ${own.length ? '' : 'disabled'}`} href={own.length ? href(`drive/${r.id}?mode=practice`) : undefined}>
                  Gyakorlás
                </a>
                <a className={`btn primary ${own.length ? '' : 'disabled'}`} href={own.length ? href(`drive/${r.id}?mode=exam`) : undefined}>
                  Próbavizsga
                </a>
                <a
                  className={`btn ${own.length ? '' : 'disabled'}`}
                  href={own.length ? href(`drive/${r.id}?mode=tour`) : undefined}
                  title="A teljes útvonal folyamatosan, a vizsgabiztos hangos utasításaival"
                >
                  Teljes útvonal
                </a>
                {weak > 0 && (
                  <a className="btn" href={href(`drive/${r.id}?mode=practice&focus=weak`)} title="A leggyengébb helyzetek gyakorlása">
                    Gyenge pontok ({weak})
                  </a>
                )}
                {confirmDelete === r.id ? (
                  <span className="confirm">
                    Biztosan törlöd?{' '}
                    <button className="btn danger" onClick={() => deleteRoute(r.id).then(() => setConfirmDelete(null))}>
                      Igen, törlés
                    </button>{' '}
                    <button className="btn" onClick={() => setConfirmDelete(null)}>
                      Mégse
                    </button>
                  </span>
                ) : (
                  <button className="btn ghost" onClick={() => setConfirmDelete(r.id)}>
                    Törlés
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

const HEALTH_ORDER: Health[] = ['good', 'meh', 'bad', 'new']

/** Vizsga-felkészültség: a helyzetek pontszámainak átlaga, és hány helyzet milyen állapotú */
function ReadinessBar({ percent, counts }: { percent: number; counts: Record<Health, number> }) {
  return (
    <div className="readiness">
      <div className="readiness-head">
        <strong>Felkészültség: {percent}%</strong>
        <span className="muted">
          {HEALTH_ORDER.filter((h) => counts[h] > 0)
            .map((h) => `${counts[h]} ${HEALTH_LABEL[h]}`)
            .join(' · ')}
        </span>
      </div>
      <div className="readiness-bar" aria-hidden>
        {HEALTH_ORDER.map((h) => (counts[h] > 0 ? <span key={h} style={{ flexGrow: counts[h], background: HEALTH_COLOR[h] }} /> : null))}
      </div>
    </div>
  )
}
