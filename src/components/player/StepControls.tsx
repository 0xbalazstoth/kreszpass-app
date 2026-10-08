interface Props {
  step: number
  count: number
  playing: boolean
  speed: number
  setSpeed: (speed: number) => void
  go: (i: number, play: boolean, all?: boolean) => void
  /** Az „Az egész” gomb magyarázata */
  allTitle: string
}

/** ◀ Előző / ▶ Lejátszás / Következő ▶ / Az egész / tempó */
export function StepControls({ step, count, playing, speed, setSpeed, go, allTitle }: Props) {
  return (
    <div className="maneuver-controls">
      <button className="btn" onClick={() => go(Math.max(0, step - 1), true)} disabled={step === 0} aria-label="Előző lépés (←)">
        ◀<span className="ctl-label">Előző</span>
      </button>
      <button className="btn primary" onClick={() => go(step, !playing)} aria-label="Lejátszás / szünet (szóköz)">
        {playing ? '❚❚ Szünet' : '▶ Lejátszás'}
      </button>
      <button className="btn" onClick={() => go(Math.min(count - 1, step + 1), true)} disabled={step === count - 1} aria-label="Következő lépés (→)">
        <span className="ctl-label">Következő</span>▶
      </button>
      <button className="btn ghost" onClick={() => go(0, true, true)} title={allTitle} aria-label={allTitle}>
        ↺<span className="ctl-label">Az egész</span>
      </button>
      <label className="inline">
        <span className="ctl-label">Tempó</span>
        <select value={speed} aria-label="Tempó" onChange={(e) => setSpeed(Number(e.target.value))}>
          <option value={0.5}>0,5×</option>
          <option value={1}>1×</option>
          <option value={2}>2×</option>
        </select>
      </label>
    </div>
  )
}
