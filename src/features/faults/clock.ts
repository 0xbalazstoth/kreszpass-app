import type { StepClock } from '../../components/player/useStepPlayer'
import { frameAt, stepMs, stepStates, type Frame, type StepState } from '../../domain/faults/timeline'
import type { Lesson } from '../../domain/faults/types'

/**
 * Egy hibakód-lecke lejátszása: melyik lépésnél tart és azon belül hol. A felülnézet, a 3D nézet és a műszerfal
 * minden képkockánál innen kérdezi le a jelenet állapotát, így a React-állapot csak lépésváltáskor változik.
 */
export class LessonClock implements StepClock {
  readonly lesson: Lesson
  readonly states: StepState[]
  step = 0
  progress = 1
  playing = false
  speed = 1
  private startedAt = 0
  private cache: { step: number; progress: number; frame: Frame } | null = null

  constructor(lesson: Lesson) {
    this.lesson = lesson
    this.states = stepStates(lesson)
  }

  duration(i = this.step): number {
    return stepMs(this.lesson.steps[i]) / this.speed
  }

  goTo(i: number, play: boolean, atStart = false) {
    this.step = Math.max(0, Math.min(this.lesson.steps.length - 1, i))
    this.progress = play || atStart ? 0 : 1
    this.playing = play
    this.startedAt = performance.now()
  }

  setSpeed(speed: number) {
    // A lépésen belüli helyzet maradjon, csak a tempó változzon
    if (this.playing) this.startedAt = performance.now() - this.progress * (stepMs(this.lesson.steps[this.step]) / speed)
    this.speed = speed
  }

  tick(now = performance.now()): boolean {
    if (!this.playing) return false
    this.progress = Math.min(1, (now - this.startedAt) / this.duration())
    if (this.progress >= 1) {
      this.playing = false
      return true
    }
    return false
  }

  /** A jelenet most (egy képkockán belül több nézet is kérdezi: gyorsítótárazva) */
  now(): Frame {
    const c = this.cache
    if (c && c.step === this.step && c.progress === this.progress) return c.frame
    const frame = frameAt(this.lesson, this.states[this.step], this.lesson.steps[this.step], this.progress)
    this.cache = { step: this.step, progress: this.progress, frame }
    return frame
  }
}
