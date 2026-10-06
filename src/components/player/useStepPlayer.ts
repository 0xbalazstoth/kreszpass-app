import { useCallback, useEffect, useState } from 'react'

/** Lépésenként lejátszható óra (manőver, hibakód-lecke): a rajzok minden képkockánál innen kérdeznek */
export interface StepClock {
  step: number
  /** A lépésen belüli előrehaladás, 0..1 */
  progress: number
  goTo(i: number, play: boolean, atStart?: boolean): void
  setSpeed(speed: number): void
  /** Képkockánként: továbbléptet; igazat ad, ha a lépés épp most ért véget */
  tick(now?: number): boolean
}

/**
 * A lejátszó állapota és vezérlése: lépésváltás, lejátszás/szünet, „Az egész” (a lépések egymás után, rövid
 * szünettel), tempó, és a billentyűk (←, →, szóköz). A React-állapot csak lépésváltáskor változik.
 */
export function useStepPlayer(clock: StepClock | null, count: number) {
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [playAll, setPlayAll] = useState(false)
  const [speed, setSpeed] = useState(1)

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
    let timer = 0
    const loop = () => {
      if (clock.tick()) {
        if (playAll && clock.step < count - 1) {
          // Rövid szünet a lépések között, hogy a szöveget követni lehessen
          timer = window.setTimeout(() => go(clock.step + 1, true, true), 600)
        } else setPlaying(false)
        return
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
    }
  }, [clock, playing, playAll, go, count])

  useEffect(() => {
    clock?.setSpeed(speed)
  }, [clock, speed])

  // Első betöltéskor a kiinduló helyzet (az első lépés eleje); az oldalak leckénként újra létrejönnek (key)
  useEffect(() => {
    clock?.goTo(0, false, true)
  }, [clock])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!clock) return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return
      if (e.key === 'ArrowRight') go(Math.min(count - 1, step + (clock.progress >= 1 ? 1 : 0)), true)
      else if (e.key === 'ArrowLeft') go(Math.max(0, step - 1), true)
      else if (e.key === ' ') {
        e.preventDefault()
        go(step, !playing)
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [clock, step, playing, go, count])

  return { step, playing, speed, setSpeed, go }
}
