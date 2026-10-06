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
        ◀ Előző
      </button>
      <button className="btn primary" onClick={() => go(step, !playing)} aria-label="Lejátszás / szünet (szóköz)">
        {playing ? '❚❚ Szünet' : '▶ Lejátszás'}
      </button>
      <button className="btn" onClick={() => go(Math.min(count - 1, step + 1), true)} disabled={step === count - 1} aria-label="Következő lépés (→)">
        Következő ▶
      </button>
      <button className="btn ghost" onClick={() => go(0, true, true)} title={allTitle}>
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
  )
}
