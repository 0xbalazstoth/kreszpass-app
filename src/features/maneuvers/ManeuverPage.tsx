import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Fallback, ManeuverScene3D } from '../../components/scene3d'
import { webglAvailable } from '../../components/scene3d/webgl'
import { EVAL_CODES } from '../../domain/evalCodes'
import { maneuverById, type Look } from '../../domain/maneuvers'
import { FULL_LOCK_TURNS, steerTurns } from '../../domain/maneuvers/geometry'
import type { ManeuverStep } from '../../domain/maneuvers/types'
import { getSettings } from '../../db'
import { href } from '../../lib/router'
import { ManeuverClock } from './clock'
import { ManeuverDiagram } from './ManeuverDiagram'

const LOOK_LABEL: Record<Look, string> = {
  ahead: 'előre',
  mirror_left: 'bal tükör',
  mirror_right: 'jobb tükör',
  mirror_inner: 'belső tükör',
  shoulder_left: 'hátra, a bal váll fölött',
  shoulder_right: 'hátra, a jobb váll fölött',
  back: 'hátra, a hátsó ablakon át',
}

/** A kormány állása a lépés mozgása alatt (az utolsó ív szerint) szövegesen */
function steerText(step: ManeuverStep): { turns: number; text: string } {
  const arc = [...step.motion].reverse().find((s) => s.kind === 'arc') ?? null
  const turns = steerTurns(arc)
  if (!arc) return { turns: 0, text: step.motion.length ? 'egyenesben' : '–' }
  const full = Math.abs(turns) >= FULL_LOCK_TURNS - 0.01
  const side = turns > 0 ? 'jobbra' : 'balra'
  return { turns, text: full ? `teljes kormány ${side} (~${FULL_LOCK_TURNS.toLocaleString('hu-HU')} fordulat)` : `${side}, ~${Math.abs(turns).toLocaleString('hu-HU', { maximumFractionDigits: 1 })} fordulat` }
}

/** Kormánykerék-ikon: a fordulat szerint elforgatva (1,5 fordulatnál a jelölés is körbefordul) */
function Wheel({ turns }: { turns: number }) {
  return (
    <svg viewBox="-12 -12 24 24" className="steer-icon" aria-hidden>
      <g transform={`rotate(${turns * 360})`}>
        <circle r="10" fill="none" stroke="currentColor" strokeWidth="2.4" />
        <circle r="2.6" fill="currentColor" />
        <path d="M-9.5 1 L-2.6 0.5 M9.5 1 L2.6 0.5 M0 2.6 L0 9.6" stroke="currentColor" strokeWidth="2.2" />
        <rect x="-1.2" y="-11.5" width="2.4" height="3" fill="#f59e0b" />
      </g>
    </svg>
  )
}

export function ManeuverPage({ id }: { id: string }) {
  const maneuver = maneuverById(id)
  const clock = useMemo(() => (maneuver ? new ManeuverClock(maneuver) : null), [maneuver])
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [playAll, setPlayAll] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [mainView, setMainView] = useState<'scene' | 'map'>('scene')
  const [view3d, setView3d] = useState(true)

  useEffect(() => {
    getSettings().then((s) => setView3d(s.view3d))
  }, [])

  const go = useCallback(
    (i: number, play: boolean, all = false) => {
      if (!clock) return
      clock.goTo(i, play)
      setStep(clock.step)
      setPlaying(play)
      setPlayAll(all)
    },
    [clock],
  )

  // Lejátszás: képkockánként léptet; az „Az egész” módban a lépés végén a következő indul
  useEffect(() => {
    if (!clock || !playing) return
    let raf = 0
    const loop = () => {
      if (clock.tick()) {
        if (playAll && clock.step < clock.maneuver.steps.length - 1) {
          // Rövid szünet a lépések között, hogy a szöveget követni lehessen
          window.setTimeout(() => go(clock.step + 1, true, true), 600)
        } else setPlaying(false)
        return
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [clock, playing, playAll, go])

  useEffect(() => {
    clock?.setSpeed(speed)
  }, [clock, speed])

  // Első betöltéskor a kiinduló helyzet (az első lépés eleje)
  useEffect(() => {
    clock?.goTo(0, false, true)
  }, [clock])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!clock) return
      if (e.key === 'ArrowRight') go(Math.min(clock.maneuver.steps.length - 1, step + (clock.progress >= 1 ? 1 : 0)), true)
      else if (e.key === 'ArrowLeft') go(Math.max(0, step - 1), true)
      else if (e.key === ' ') {
        e.preventDefault()
        go(step, !playing)
      } else return
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [clock, step, playing, go])

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
        <div className="drive-visual">
          {use3d ? (
            <>
              <div className={`pane ${mainView === 'scene' ? 'pane-main' : 'pane-inset'}`}>
                {scene}
                {mainView !== 'scene' && (
                  <button className="pane-swap" onClick={() => setMainView('scene')} aria-label="3D nézet nagyban">
                    ⤢
                  </button>
                )}
              </div>
              <div className={`pane ${mainView === 'map' ? 'pane-main' : 'pane-inset'} diagram-pane`}>
                {diagram}
                {mainView !== 'map' && (
                  <button className="pane-swap" onClick={() => setMainView('map')} aria-label="Felülnézet nagyban">
                    ⤢
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="pane pane-main diagram-pane">{diagram}</div>
          )}
        </div>

        <div className="drive-side maneuver-side">
          <div className="maneuver-controls">
            <button className="btn" onClick={() => go(Math.max(0, step - 1), true)} disabled={step === 0} aria-label="Előző lépés (←)">
              ◀ Előző
            </button>
            <button className="btn primary" onClick={() => go(step, !playing)} aria-label="Lejátszás / szünet (szóköz)">
              {playing ? '❚❚ Szünet' : '▶ Lejátszás'}
            </button>
            <button
              className="btn"
              onClick={() => go(Math.min(maneuver.steps.length - 1, step + 1), true)}
              disabled={step === maneuver.steps.length - 1}
              aria-label="Következő lépés (→)"
            >
              Következő ▶
            </button>
            <button className="btn ghost" onClick={() => go(0, true, true)} title="A teljes manőver lejátszása az elejétől">
              Az egész
            </button>
            <label className="inline">
              Tempó{' '}
              <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
                <option value={0.5}>0,5×</option>
                <option value={1}>1×</option>
                <option value={2}>2×</option>
              </select>
            </label>
          </div>

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

          <ol className="maneuver-steps">
            {maneuver.steps.map((s, i) => (
              <li key={i} className={i === step ? 'active' : i < step ? 'done' : ''}>
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
