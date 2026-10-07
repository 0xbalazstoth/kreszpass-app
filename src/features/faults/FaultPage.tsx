import { EVAL_CODES } from '../../domain/evalCodes'
import { codeSlug, FAULT_LESSONS, lessonByCode, slugCode } from '../../domain/faults'
import { href } from '../../lib/router'
import { LessonPlayer } from './LessonPlayer'
import { PHASE_LABEL } from './phases'

export function FaultPage({ slug }: { slug: string }) {
  const code = slugCode(slug)
  const lesson = lessonByCode(code)
  const evalCode = EVAL_CODES[code]

  if (!lesson || !evalCode) {
    return (
      <p className="status error">
        Ehhez a kódhoz nincs bemutató. <a href={href('eval')}>Vissza</a>
      </p>
    )
  }

  const index = FAULT_LESSONS.indexOf(lesson)
  const prev = FAULT_LESSONS[index - 1]
  const next = FAULT_LESSONS[index + 1]

  return (
    <LessonPlayer
      lesson={lesson}
      badge={<span className={`badge ${evalCode.fatal ? 'fatal' : ''}`}>{lesson.code}</span>}
      back={
        <a className="btn small ghost" href={href('eval')}>
          Minősítő lap
        </a>
      }
      banner={(current) => (
        <div className={`phase-banner ${current.phase}`} aria-live="polite">
          <strong>{PHASE_LABEL[current.phase]}</strong>
          {current.phase === 'wrong' ? (
            <span>
              <code>{lesson.code}</code> {evalCode.text}
            </span>
          ) : (
            <span>{current.title}</span>
          )}
        </div>
      )}
      allTitle="A helyzet, a hibás és a helyes megoldás egymás után"
      phaseChips
    >
      <div className="card exam-box">
        <h2>A minősítő lapon</h2>
        <p>
          <code>{evalCode.code}</code> {evalCode.text}
        </p>
        <p className="muted">
          {evalCode.fatal
            ? 'A 8. blokk hibája: egyetlen ilyen hiba is sikertelen vizsgát jelent.'
            : 'Hibavonal: önmagában nem buktat, de a lapon a megengedett hibavonalak száma 10.'}
        </p>
        <p className="muted">{lesson.summary}</p>
      </div>

      <nav className="fault-nav">
        {prev ? (
          <a className="btn small" href={href(`eval/${codeSlug(prev.code)}`)}>
            ◀ {prev.code}
          </a>
        ) : (
          <span />
        )}
        {next && (
          <a className="btn small" href={href(`eval/${codeSlug(next.code)}`)}>
            {next.code} ▶
          </a>
        )}
      </nav>
    </LessonPlayer>
  )
}
