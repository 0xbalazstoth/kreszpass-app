import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CodeLink } from '../../components/CodeLink'
import { LOOK_LABEL } from '../../components/player/looks'
import { StepControls } from '../../components/player/StepControls'
import { revealStep } from '../../components/player/revealStep'
import { useStepPlayer } from '../../components/player/useStepPlayer'
import { Fallback, FaultScene3D } from '../../components/scene3d'
import { webglAvailable } from '../../components/scene3d/webgl'
import type { FaultStep, Lesson } from '../../domain/faults/types'
import { getSettings } from '../../db'
import { LessonClock } from './clock'
import { Dashboard } from './Dashboard'
import { FaultDiagram } from './FaultDiagram'
import { PHASE_LABEL } from './phases'

interface Props {
  lesson: Lesson
  /** A fejléc bal oldala (jelvény, cím) és a vissza-link */
  badge: ReactNode
  back: ReactNode
  /** A nézet fölötti szalag az aktuális lépéshez */
  banner: (step: FaultStep) => ReactNode
  allTitle: string
  /** Mutassa-e a lépéseknél a szerepüket (Helyzet / Hibás / Helyes) */
  phaseChips?: boolean
  /** Az oldalsáv alja (magyarázó kártya, előző/következő) */
  children?: ReactNode
}

/**
 * Egy lejátszható jelenet oldala: 3D nézet a vezetőülésből (vagy kívülről) és felülnézet, felcserélhetően, a
 * lejátszó gombjai, a műszerfal és a lépések listája. A hibakód-leckék és a forgalmi helyzetek is ezt használják.
 */
export function LessonPlayer({ lesson, badge, back, banner, allTitle, phaseChips = false, children }: Props) {
  const clock = useMemo(() => new LessonClock(lesson), [lesson])
  const { step, playing, speed, setSpeed, go } = useStepPlayer(clock, lesson.steps.length)
  const [mainView, setMainView] = useState<'scene' | 'map'>('scene')
  const [view3d, setView3d] = useState(true)
  const [chase, setChase] = useState(false)

  useEffect(() => {
    getSettings().then((s) => setView3d(s.view3d))
  }, [])
  // Lejátszás közben az aktív lépés a lépéslistán belül látható marad (mobilon a panel kicsi)
  const activeRef = useRef<HTMLLIElement>(null)
  useEffect(() => {
    if (activeRef.current) revealStep(activeRef.current)
  }, [step])

  const current = lesson.steps[step]
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
  const strip = banner(current)

  return (
    <section className="drive maneuver-page fault-page">
      <header className="drive-top">
        {badge}
        <span className="muted maneuver-title">{lesson.title}</span>
        <div className="progress" aria-hidden>
          <div style={{ width: `${((step + (playing ? 0 : 1)) / lesson.steps.length) * 100}%` }} />
        </div>
        {back}
      </header>

      <div className="drive-grid">
        <div className="drive-visual">
          {use3d ? (
            <>
              <div className={`pane ${mainView === 'scene' ? 'pane-main' : 'pane-inset'}`}>
                {scene}
                {mainView === 'scene' && strip}
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
                {mainView === 'map' && strip}
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
              {strip}
            </div>
          )}
        </div>

        <div className="drive-side maneuver-side">
          <div className="player-head">
            <StepControls step={step} count={lesson.steps.length} playing={playing} speed={speed} setSpeed={setSpeed} go={go} allTitle={allTitle} />
            <div className="maneuver-status">
              <span className="badge">👁 {looks.join(' → ')}</span>
            </div>
          </div>

          <Dashboard clock={clock} />

          <ol className="maneuver-steps">
            {lesson.steps.map((s, i) => (
              <li key={i} ref={i === step ? activeRef : undefined} className={`${i === step ? 'active' : i < step ? 'done' : ''} phase-${s.phase}`}>
                <button className="step-head" onClick={() => go(i, true)}>
                  <span className="step-no">{i + 1}</span>
                  {phaseChips && <span className={`phase-chip ${s.phase}`}>{PHASE_LABEL[s.phase]}</span>}
                  {s.title}
                </button>
                {i === step && (
                  <div className="step-body">
                    <ol>
                      {s.how.map((h) => (
                        <li key={h}>{h}</li>
                      ))}
                    </ol>
                    {s.mistakes && s.mistakes.length > 0 && (
                      <div className="mistakes">
                        <strong>Gyakori hibák</strong>
                        <ul>
                          {s.mistakes.map((x) => (
                            <li key={x.code + x.text}>
                              <CodeLink code={x.code} /> {x.text}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ol>

          {children}
        </div>
      </div>
    </section>
  )
}
