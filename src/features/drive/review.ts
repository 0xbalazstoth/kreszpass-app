import { createEmptyCard, fsrs, generatorParameters, type Card } from 'ts-fsrs'
import { db } from '../../db'
import { ratingFor, type Thresholds } from '../../domain/scoring'
import type { Outcome, Situation } from '../../domain/types'

const scheduler = fsrs(generatorParameters({ enable_fuzz: true, enable_short_term: true }))

const SEVERITY: Record<Outcome, number> = { ok: 0, late: 1, slow: 2, wrong: 3, timeout: 4 }

export function worstOutcome(list: Array<{ outcome: Outcome; reactionMs: number | null }>) {
  return list.reduce((a, b) => (SEVERITY[b.outcome] > SEVERITY[a.outcome] ? b : a))
}

/** Egy helyzet ismétlési ütemezésének frissítése (FSRS) */
export async function recordReview(s: Situation, outcome: Outcome, reactionMs: number | null, t: Thresholds): Promise<void> {
  const existing = await db.cards.get(s.id)
  const card: Card = existing?.card ?? createEmptyCard<Card>(new Date())
  const next = scheduler.next(card, new Date(), ratingFor(outcome, reactionMs, t)).card
  await db.cards.put({ situationId: s.id, routeId: s.routeId, card: next })
}

/** Esedékes ismétlések, a legrégebben esedékessel kezdve */
export async function dueSituations(limit = 25): Promise<Situation[]> {
  const due = await db.cards.where('card.due').belowOrEqual(new Date()).limit(limit).sortBy('card.due')
  const list = await db.situations.bulkGet(due.map((c) => c.situationId))
  return list.filter((s): s is Situation => Boolean(s))
}
