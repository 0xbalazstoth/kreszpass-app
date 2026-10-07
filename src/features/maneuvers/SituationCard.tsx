import { useMemo } from 'react'
import type { SituationLesson } from '../../domain/situations'
import { href } from '../../lib/router'
import { LessonClock } from '../faults/clock'
import { FaultDiagram } from '../faults/FaultDiagram'

/** Egy forgalmi helyzet kártyája: felülnézeti állókép (az első lépés vége), cím, rövid leírás */
export function SituationCard({ lesson }: { lesson: SituationLesson }) {
  const clock = useMemo(() => {
    const c = new LessonClock(lesson)
    c.goTo(0, false)
    return c
  }, [lesson])
  return (
    <a className="card maneuver-card" href={href(`maneuvers/${lesson.id}`)}>
      <FaultDiagram clock={clock} step={0} still className="maneuver-thumb" />
      <h2>{lesson.title}</h2>
      <p>{lesson.summary}</p>
      <span className="muted">{lesson.steps.length} lépés</span>
    </a>
  )
}
