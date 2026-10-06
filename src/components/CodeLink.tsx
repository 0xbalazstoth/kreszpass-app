import { EVAL_CODES } from '../domain/evalCodes'
import { codeSlug, lessonByCode } from '../domain/faults'
import { href } from '../lib/router'

/** Hibakód; ha van hozzá bemutató a Minősítő lap fülön, oda mutató linkként */
export function CodeLink({ code }: { code: string }) {
  const chip = <code title={EVAL_CODES[code]?.text}>{code}</code>
  if (!lessonByCode(code)) return chip
  return (
    <a className="code-link" href={href(`eval/${codeSlug(code)}`)} title={`${EVAL_CODES[code]?.text ?? code}: bemutató`}>
      {chip}
    </a>
  )
}
