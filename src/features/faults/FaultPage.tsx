import { Suspense, useEffect, useMemo, useState } from 'react'
import { LOOK_LABEL } from '../../components/player/looks'
import { StepControls } from '../../components/player/StepControls'
import { useStepPlayer } from '../../components/player/useStepPlayer'
import { Fallback, FaultScene3D } from '../../components/scene3d'
import { webglAvailable } from '../../components/scene3d/webgl'
import { EVAL_CODES } from '../../domain/evalCodes'
import { codeSlug, FAULT_LESSONS, lessonByCode, slugCode } from '../../domain/faults'
import type { Phase } from '../../domain/faults/types'
import { getSettings } from '../../db'
import { href } from '../../lib/router'
import { LessonClock } from './clock'
import { Dashboard } from './Dashboard'
import { FaultDiagram } from './FaultDiagram'

const PHASE_LABEL: Record<Phase, string> = { setup: 'Helyzet', wrong: 'Hibás', right: 'Helyes' }

export function FaultPage({ slug }: { slug: string }) {
  const code = slugCode(slug)
  const lesson = lessonByCode(code)
  const evalCode = EVAL_CODES[code]
  const clock = useMemo(() => (lesson ? new LessonClock(lesson) : null), [lesson])
  const { step, playing, speed, setSpeed, go } = useStepPlayer(clock, lesson?.steps.length ?? 0)
  const [mainView, setMainView] = useState<'scene' | 'map'>('scene')
  const [view3d, setView3d] = useState(true)
  const [chase, setChase] = useState(false)

  useEffect(() => {
    getSettings().then((s) => setView3d(s.view3d))
  }, [])

  if (!lesson || !clock || !evalCode) {
    return (
      <p className="status error">
        Ehhez a kódhoz nincs bemutató. <a href={href('eval')}>Vissza</a>
      </p>
    )
  }

  const current = lesson.steps[step]
  const index = FAULT_LESSONS.indexOf(lesson)
  const prev = FAULT_LESSONS[index - 1]
  const next = FAULT_LESSONS[index + 1]
  const diagram = <FaultDiagram clock={clock} step={step} className="maneuver-live" />
  const use3d = view3d && webglAvailable()
  const scene = use3d ? (
    <Fallback fallback={diagram}>
      <Suspense fallback={diagram}>
        <FaultScene3D lesson={lesson} frameNow={() => clock.now()} chase={chase} />
      </Suspense>
    </Fallback>
  ) : (
    diagram
  )
  const looks = (current.look ?? [[0, clock.states[step].look]]).map(([, l]) => LOOK_LABEL[l])

  const banner = (
    <div className={`phase-banner ${current.phase}`} aria-live="polite">
      <strong>{PHASE_LABEL[current.phase]}</strong>
      {current.phase === 'wrong' && (
        <span>
          <code>{lesson.code}</code> {evalCode.text}
        </span>
      )}
      {current.phase !== 'wrong' && <span>{current.title}</span>}
    </div>
  )

  return (
    <section className="drive maneuver-page fault-page">
      <header className="drive-top">
        <span className={`badge ${evalCode.fatal ? 'fatal' : ''}`}>{lesson.code}</span>
        <span className="muted maneuver-title">{lesson.title}</span>
        <div className="progress" aria-hidden>
          <div style={{ width: `${((step + (playing ? 0 : 1)) / lesson.steps.length) * 100}%` }} />
        </div>
        <a className="btn small ghost" href={href('eval')}>
          Minősítő lap
        </a>
      </header>

      <div className="drive-grid">
        <div className="drive-visual">
          {use3d ? (
            <>
              <div className={`pane ${mainView === 'scene' ? 'pane-main' : 'pane-inset'}`}>
                {scene}
                {mainView === 'scene' && banner}
                {mainView === 'scene' && (
                  <button className="pane-view btn small" onClick={() => setChase(!chase)}>
                    {chase ? 'Vezetőülés' : 'Kívülről'}
                  </button>
                )}
                {mainView !== 'scene' && (
                  <button className="pane-swap" onClick={() => setMainView('scene')} aria-label="3D nézet nagyban">
                    ⤢
                  </button>
                )}
              </div>
              <div className={`pane ${mainView === 'map' ? 'pane-main' : 'pane-inset'} diagram-pane`}>
                {diagram}
                {mainView === 'map' && banner}
                {mainView !== 'map' && (
                  <button className="pane-swap" onClick={() => setMainView('map')} aria-label="Felülnézet nagyban">
                    ⤢
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="pane pane-main diagram-pane">
              {diagram}
              {banner}
            </div>
          )}
        </div>

        <div className="drive-side maneuver-side">
          <StepControls step={step} count={lesson.steps.length} playing={playing} speed={speed} setSpeed={setSpeed} go={go} allTitle="A helyzet, a hibás és a helyes megoldás egymás után" />

          <Dashboard clock={clock} />
          <div className="maneuver-status">
            <span className="badge">👁 {looks.join(' → ')}</span>
          </div>

          <ol className="maneuver-steps">
            {lesson.steps.map((s, i) => (
              <li key={i} className={`${i === step ? 'active' : i < step ? 'done' : ''} phase-${s.phase}`}>
                <button className="step-head" onClick={() => go(i, true)}>
                  <span className="step-no">{i + 1}</span>
                  <span className={`phase-chip ${s.phase}`}>{PHASE_LABEL[s.phase]}</span>
                  {s.title}
                </button>
                {i === step && (
                  <div className="step-body">
                    <ol>
                      {s.how.map((h) => (
                        <li key={h}>{h}</li>
                      ))}
                    </ol>
                  </div>
                )}
              </li>
            ))}
          </ol>

          <div className="card exam-box">
            <h2>A minősítő lapon</h2>
            <p>
              <code>{evalCode.code}</code> {evalCode.text}
            </p>
            <p className="muted">
              {evalCode.fatal
                ? 'A 8. blokk hibája: egyetlen ilyen hiba is sikertelen vizsgát jelent.'
                : 'Hibavonal: önmagában nem buktat, de a lapon a megengedett hibavonalak száma 10.'}
            </p>
            <p className="muted">{lesson.summary}</p>
          </div>

          <nav className="fault-nav">
            {prev ? (
              <a className="btn small" href={href(`eval/${codeSlug(prev.code)}`)}>
                ◀ {prev.code}
              </a>
            ) : (
              <span />
            )}
            {next && (
              <a className="btn small" href={href(`eval/${codeSlug(next.code)}`)}>
                {next.code} ▶
              </a>
            )}
          </nav>
        </div>
      </div>
    </section>
  )
}
