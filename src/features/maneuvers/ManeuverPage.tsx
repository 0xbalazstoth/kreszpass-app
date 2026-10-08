import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { LOOK_LABEL } from '../../components/player/looks'
import { StepControls } from '../../components/player/StepControls'
import { revealStep } from '../../components/player/revealStep'
import { useStepPlayer } from '../../components/player/useStepPlayer'
import { Wheel } from '../../components/player/Wheel'
import { Fallback, ManeuverScene3D } from '../../components/scene3d'
import { webglAvailable } from '../../components/scene3d/webgl'
import { InsetButtons, InsetShow } from '../../components/InsetButtons'
import { useDraggableInset } from '../../components/useDraggableInset'
import { EVAL_CODES } from '../../domain/evalCodes'
import { maneuverById } from '../../domain/maneuvers'
import { FULL_LOCK_TURNS, steerTurns } from '../../domain/maneuvers/geometry'
import type { ManeuverStep } from '../../domain/maneuvers/types'
import { getSettings } from '../../db'
import { href } from '../../lib/router'
import { ManeuverClock } from './clock'
import { ManeuverDiagram } from './ManeuverDiagram'

/** A kormány állása a lépés mozgása alatt (az utolsó ív szerint) szövegesen */
function steerText(step: ManeuverStep): { turns: number; text: string } {
  const arc = [...step.motion].reverse().find((s) => s.kind === 'arc') ?? null
  const turns = steerTurns(arc)
  if (!arc) return { turns: 0, text: step.motion.length ? 'egyenesben' : '–' }
  const full = Math.abs(turns) >= FULL_LOCK_TURNS - 0.01
  const side = turns > 0 ? 'jobbra' : 'balra'
  return { turns, text: full ? `teljes kormány ${side} (~${FULL_LOCK_TURNS.toLocaleString('hu-HU')} fordulat)` : `${side}, ~${Math.abs(turns).toLocaleString('hu-HU', { maximumFractionDigits: 1 })} fordulat` }
}

export function ManeuverPage({ id }: { id: string }) {
  const maneuver = maneuverById(id)
  const clock = useMemo(() => (maneuver ? new ManeuverClock(maneuver) : null), [maneuver])
  const { step, playing, speed, setSpeed, go } = useStepPlayer(clock, maneuver?.steps.length ?? 0)
  const [mainView, setMainView] = useState<'scene' | 'map'>('scene')
  const [view3d, setView3d] = useState(true)
  const { ref: insetBox, hidden: insetHidden, setHidden: setInsetHidden } = useDraggableInset<HTMLDivElement>()

  useEffect(() => {
    getSettings().then((s) => setView3d(s.view3d))
  }, [])
  // Lejátszás közben az aktív lépés a lépéslistán belül látható marad (mobilon a panel kicsi)
  const activeRef = useRef<HTMLLIElement>(null)
  useEffect(() => {
    if (activeRef.current) revealStep(activeRef.current)
  }, [step])

  if (!maneuver || !clock) {
    return (
      <p className="status error">
        Nincs ilyen manőver. <a href={href('maneuvers')}>Vissza</a>
      </p>
    )
  }

  const current = maneuver.steps[step]
  const steer = steerText(current)
  const poseNow = () => clock.now()
  const diagram = <ManeuverDiagram maneuver={maneuver} clock={clock} step={step} className="maneuver-live" />
  const use3d = view3d && webglAvailable()
  const scene = use3d ? (
    <Fallback fallback={diagram}>
      <Suspense fallback={diagram}>
        <ManeuverScene3D
          site={maneuver.site}
          poseNow={poseNow}
          look={current.look}
          refLine={current.ref ? { ref: current.ref, start: clock.starts[step] } : undefined}
          reversing={current.gear === 'R'}
        />
      </Suspense>
    </Fallback>
  ) : (
    diagram
  )

  return (
    <section className="drive maneuver-page">
      <header className="drive-top">
        <span className="badge">{maneuver.id}</span>
        <span className="muted maneuver-title">{maneuver.title}</span>
        <div className="progress" aria-hidden>
          <div style={{ width: `${((step + (playing ? 0 : 1)) / maneuver.steps.length) * 100}%` }} />
        </div>
        <a className="btn small ghost" href={href('maneuvers')}>
          Manőverek
        </a>
      </header>

      <div className="drive-grid">
        <div className={`drive-visual${insetHidden ? ' inset-hidden' : ''}`} ref={insetBox}>
          {use3d ? (
            <>
              <div className={`pane ${mainView === 'scene' ? 'pane-main' : 'pane-inset'}`}>
                {scene}
                {mainView !== 'scene' && <InsetButtons swapLabel="3D nézet nagyban" onSwap={() => setMainView('scene')} onHide={() => setInsetHidden(true)} />}
              </div>
              <div className={`pane ${mainView === 'map' ? 'pane-main' : 'pane-inset'} diagram-pane`}>
                {diagram}
                {mainView !== 'map' && <InsetButtons swapLabel="Felülnézet nagyban" onSwap={() => setMainView('map')} onHide={() => setInsetHidden(true)} />}
              </div>
              {insetHidden && <InsetShow label={mainView === 'scene' ? 'Felülnézet' : '3D'} onShow={() => setInsetHidden(false)} />}
            </>
          ) : (
            <div className="pane pane-main diagram-pane">{diagram}</div>
          )}
        </div>

        <div className="drive-side maneuver-side">
          <div className="player-head">
            <StepControls step={step} count={maneuver.steps.length} playing={playing} speed={speed} setSpeed={setSpeed} go={go} allTitle="A teljes manőver lejátszása az elejétől" />
            <div className="maneuver-status" aria-live="polite">
              <span className={`gear ${current.gear === 'R' ? 'rev' : ''}`} title="Sebességfokozat">
                {current.gear === 'R' ? 'R' : current.gear === 'N' ? 'N' : '1'}
              </span>
              <span className="steer" title="Kormány">
                <Wheel turns={steer.turns} />
                {steer.text}
              </span>
              {current.indicator && <span className="badge indicator">{current.indicator === 'left' ? '◀ index balra' : 'index jobbra ▶'}</span>}
              <span className="badge">👁 {LOOK_LABEL[current.look]}</span>
            </div>
          </div>

          <ol className="maneuver-steps">
            {maneuver.steps.map((s, i) => (
              <li key={i} ref={i === step ? activeRef : undefined} className={i === step ? 'active' : i < step ? 'done' : ''}>
                <button className="step-head" onClick={() => go(i, true)}>
                  <span className="step-no">{i + 1}</span>
                  {s.title}
                </button>
                {i === step && (
                  <div className="step-body">
                    {s.cue && <p className="cue">Mihez igazodj: {s.cue}</p>}
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
                            <li key={x.code}>
                              <code title={EVAL_CODES[x.code]?.text}>{x.code}</code> {x.text}
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

          <div className="card exam-box">
            <h2>Mit néz a vizsgabiztos?</h2>
            <ul>
              {maneuver.exam.map((x) => (
                <li key={x.code}>
                  <code title={EVAL_CODES[x.code]?.text}>{x.code}</code> {x.text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
