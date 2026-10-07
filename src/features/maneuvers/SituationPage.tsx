import { GROUP_TITLE, SITUATIONS, situationById } from '../../domain/situations'
import { href } from '../../lib/router'
import { LessonPlayer } from '../faults/LessonPlayer'

/** Egy forgalmi helyzet lépésenként (a Manőverek fülön, a hét manőver mellett) */
export function SituationPage({ id }: { id: string }) {
  const lesson = situationById(id)
  if (!lesson) {
    return (
      <p className="status error">
        Nincs ilyen manőver vagy helyzet. <a href={href('maneuvers')}>Vissza</a>
      </p>
    )
  }
  const index = SITUATIONS.indexOf(lesson)
  const prev = SITUATIONS[index - 1]
  const next = SITUATIONS[index + 1]
  return (
    <LessonPlayer
      lesson={lesson}
      badge={<span className="badge">{GROUP_TITLE[lesson.group]}</span>}
      back={
        <a className="btn small ghost" href={href('maneuvers')}>
          Manőverek
        </a>
      }
      banner={(current) => (
        <div className="phase-banner step" aria-live="polite">
          <strong>{lesson.steps.indexOf(current) + 1}.</strong>
          <span>{current.title}</span>
        </div>
      )}
      allTitle="Az egész helyzet lejátszása az elejétől"
    >
      <div className="card exam-box">
        <h2>{lesson.title}</h2>
        <p className="muted">{lesson.summary}</p>
      </div>
      <nav className="fault-nav">
        {prev ? (
          <a className="btn small" href={href(`maneuvers/${prev.id}`)}>
            ◀ {prev.title}
          </a>
        ) : (
          <span />
        )}
        {next && (
          <a className="btn small" href={href(`maneuvers/${next.id}`)}>
            {next.title} ▶
          </a>
        )}
      </nav>
    </LessonPlayer>
  )
}
