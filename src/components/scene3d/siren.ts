import { useEffect } from 'react'

/** Kéthangú mentőszirénára emlékeztető hang (Web Audio), halkan; a jelenet végén elhallgat */
export function useSiren(on: boolean) {
  useEffect(() => {
    if (!on) return
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    let ctx: AudioContext
    try {
      ctx = new Ctx()
    } catch {
      return
    }
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    gain.gain.value = 0.04
    osc.connect(gain).connect(ctx.destination)
    // Messziről közeledik: a hangerő nő
    gain.gain.setValueAtTime(0.01, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 2.5)
    for (let i = 0; i < 40; i++) osc.frequency.setValueAtTime(i % 2 ? 590 : 440, ctx.currentTime + i * 0.55)
    osc.start()
    return () => {
      try {
        osc.stop()
      } catch {
        // már leállt
      }
      void ctx.close()
    }
  }, [on])
}
