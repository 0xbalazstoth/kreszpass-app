import { describe, expect, it } from 'vitest'
import { EVAL_BLOCKS, EVAL_CODES, MAX_FAULT_LINES } from './evalCodes'
import type { Prompt } from './questions'
import { classifyAnswer, evaluateSession, ratingFor } from './scoring'
import { DEFAULT_SETTINGS, type Attempt } from './types'
import { Rating } from 'ts-fsrs'

const t = DEFAULT_SETTINGS

const prompt: Prompt = {
  id: 'x',
  title: 'x',
  text: 'x',
  scene: { layout: 'road', turn: 'straight', cars: [] },
  options: [
    { text: 'jó', correct: true },
    { text: 'rossz', correct: false, code: '8/24' },
    { text: 'kód nélkül', correct: false },
  ],
  timeoutCode: '8/25',
  explanation: '',
}

const attempt = (codes: string[], outcome: Attempt['outcome'] = 'wrong', reactionMs: number | null = 1000): Attempt => ({
  situationId: 's',
  promptId: 'p',
  reactionMs,
  chosen: 0,
  outcome,
  codes,
  at: 0,
})

describe('minősítő lap kódjai', () => {
  it('a lap 6/11-et kihagyja, 6/12 létezik', () => {
    expect(EVAL_CODES['6/11']).toBeUndefined()
    expect(EVAL_CODES['6/12']).toBeDefined()
  })
  it('csak a 8. blokk végzetes', () => {
    for (const c of Object.values(EVAL_CODES)) expect(c.fatal).toBe(c.block === 8)
  })
  it('a 8. blokk 34 kódot tartalmaz', () => {
    expect(EVAL_BLOCKS[7].items).toHaveLength(34)
  })
})

describe('classifyAnswer', () => {
  it('helyes és gyors → nincs hiba', () => {
    expect(classifyAnswer(prompt, 0, 1500, t)).toEqual({ outcome: 'ok', codes: [] })
  })
  it('helyes, kissé késve → 6/4', () => {
    expect(classifyAnswer(prompt, 0, t.okMs + 1, t)).toEqual({ outcome: 'late', codes: ['6/4'] })
  })
  it('helyes, lassan → 6/2', () => {
    expect(classifyAnswer(prompt, 0, t.lateMs + 1, t)).toEqual({ outcome: 'slow', codes: ['6/2'] })
  })
  it('rossz válasz → az opció kódja', () => {
    expect(classifyAnswer(prompt, 1, 900, t)).toEqual({ outcome: 'wrong', codes: ['8/24'] })
  })
  it('rossz válasz kód nélkül → időtúllépés kódja', () => {
    expect(classifyAnswer(prompt, 2, 900, t)).toEqual({ outcome: 'wrong', codes: ['8/25'] })
  })
  it('nincs válasz → 8/25', () => {
    expect(classifyAnswer(prompt, null, null, t)).toEqual({ outcome: 'timeout', codes: ['8/25'] })
  })
  it('időkorlát utáni válasz → 8/25', () => {
    expect(classifyAnswer(prompt, 0, t.timeoutMs + 1, t).outcome).toBe('timeout')
  })
})

describe('evaluateSession', () => {
  it('hiba nélkül megfelelt', () => {
    const r = evaluateSession([attempt([], 'ok'), attempt([], 'ok')])
    expect(r.passed).toBe(true)
    expect(r.faultLines).toBe(0)
    expect(r.correct).toBe(2)
  })
  it('bármely 8-as hiba → nem felelt meg', () => {
    const r = evaluateSession([attempt([], 'ok'), attempt(['8/24'])])
    expect(r.passed).toBe(false)
    expect(r.fatal).toEqual(['8/24'])
    expect(r.faultLines).toBe(0)
  })
  it('pontosan a megengedett hibavonal még megfelelt, eggyel több már nem', () => {
    const atLimit = Array.from({ length: MAX_FAULT_LINES }, () => attempt(['6/4'], 'late'))
    expect(evaluateSession(atLimit).passed).toBe(true)
    expect(evaluateSession([...atLimit, attempt(['6/2'], 'slow')]).passed).toBe(false)
  })
  it('az ismételt kódok többször számítanak', () => {
    const r = evaluateSession([attempt(['6/4'], 'late'), attempt(['6/4'], 'late')])
    expect(r.marks['6/4']).toBe(2)
    expect(r.faultLines).toBe(2)
  })
  it('ismeretlen kód hibát dob', () => {
    expect(() => evaluateSession([attempt(['9/9'])])).toThrow()
  })
  it('átlagos reakcióidő csak a helyes válaszokból', () => {
    const r = evaluateSession([attempt([], 'ok', 1000), attempt([], 'ok', 3000), attempt(['8/24'], 'wrong', 100)])
    expect(r.avgReactionMs).toBe(2000)
  })
})

describe('ratingFor', () => {
  it('rossz → Again, gyors → Easy', () => {
    expect(ratingFor('wrong', 500, t)).toBe(Rating.Again)
    expect(ratingFor('ok', t.okMs / 4, t)).toBe(Rating.Easy)
    expect(ratingFor('ok', t.okMs, t)).toBe(Rating.Good)
    expect(ratingFor('late', t.okMs + 1, t)).toBe(Rating.Hard)
  })
})
