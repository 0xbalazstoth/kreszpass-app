import { DrivePage } from './features/drive/DrivePage'
import { FreeDrivePage } from './features/drive/FreeDrivePage'
import { ExamSheet } from './features/exam-sheet/ExamSheet'
import { FaultPage } from './features/faults/FaultPage'
import { FaultsPage } from './features/faults/FaultsPage'
import { ManeuverPage } from './features/maneuvers/ManeuverPage'
import { ManeuversPage } from './features/maneuvers/ManeuversPage'
import { RouteEditor } from './features/routes/RouteEditor'
import { RoutesPage } from './features/routes/RoutesPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { SignDrillPage } from './features/signs/SignDrillPage'
import { StatsPage } from './features/stats/StatsPage'
import type { Mode } from './domain/types'
import { href, useHashRoute } from './lib/router'

const NAV: { path: string; label: string; short?: string; match: string[] }[] = [
  { path: '', label: 'Útvonalak', match: ['', 'route', 'drive', 'sim', 'sheet'] },
  { path: 'review', label: 'Ismétlés', match: ['review'] },
  { path: 'signs', label: 'Táblák', match: ['signs'] },
  { path: 'maneuvers', label: 'Manőverek', match: ['maneuvers'] },
  { path: 'eval', label: 'Minősítő lap', short: 'Lap', match: ['eval'] },
  { path: 'stats', label: 'Statisztika', match: ['stats'] },
  { path: 'settings', label: 'Beállítások', match: ['settings'] },
]

export default function App() {
  const { parts, query } = useHashRoute()
  const [page = '', arg] = parts
  const fullBleed = page === 'route' || page === 'drive' || page === 'sim' || page === 'review' || ((page === 'maneuvers' || page === 'eval') && !!arg)

  let content
  switch (page) {
    case '':
      content = <RoutesPage />
      break
    case 'route':
      content = <RouteEditor key={arg} routeId={arg ?? 'new'} />
      break
    case 'drive': {
      const m = query.get('mode')
      const mode: Mode = m === 'exam' ? 'exam' : m === 'tour' ? 'tour' : 'practice'
      const focus = query.get('focus') === 'weak' ? 'weak' : undefined
      content = <DrivePage key={`${arg}-${mode}-${location.hash}`} routeId={arg ?? null} mode={mode} focus={focus} />
      break
    }
    case 'sim':
      content = arg ? <FreeDrivePage key={arg} routeId={arg} /> : null
      break
    case 'review':
      content = <DrivePage key="review" routeId={null} mode="review" />
      break
    case 'sheet':
      content = arg ? <ExamSheet sessionId={arg} /> : null
      break
    case 'signs':
      content = <SignDrillPage />
      break
    case 'maneuvers':
      content = arg ? <ManeuverPage key={arg} id={arg} /> : <ManeuversPage />
      break
    case 'eval':
      content = arg ? <FaultPage key={arg} slug={arg} /> : <FaultsPage />
      break
    case 'stats':
      content = <StatsPage />
      break
    case 'settings':
      content = <SettingsPage />
      break
    default:
      content = (
        <p>
          Nincs ilyen oldal. <a href={href('')}>Vissza</a>
        </p>
      )
  }

  return (
    <div className="app">
      <header className="topbar no-print">
        <a className="brand" href={href('')}>
          <img src="favicon.svg" alt="" width={28} height={28} />
          KreszPass
        </a>
        <nav>
          {NAV.map((n) => (
            <a key={n.path} href={href(n.path)} className={n.match.includes(page) ? 'active' : ''} aria-label={n.short ? n.label : undefined}>
              {n.short ? (
                <>
                  <span className="nav-long">{n.label}</span>
                  <span className="nav-short">{n.short}</span>
                </>
              ) : (
                n.label
              )}
            </a>
          ))}
        </nav>
      </header>
      <main className={fullBleed ? 'full' : 'narrow'}>{content}</main>
    </div>
  )
}
