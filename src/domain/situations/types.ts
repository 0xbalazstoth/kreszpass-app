import type { Lesson } from '../faults/types'

/**
 * Forgalmi helyzetek bemutatói a Manőverek fülön: körforgalom, főútvonal, vasúti átjáró… Lépésenként lejátszható
 * jelenetek (a hibakód-leckék motorjával), minden lépésnél a teendőkkel és a gyakori hibákkal.
 */

export type SituationGroup = 'junctions' | 'protected' | 'lanes' | 'other'

export const GROUP_TITLE: Record<SituationGroup, string> = {
  junctions: 'Kereszteződések, elsőbbség',
  protected: 'Védett és különleges helyek',
  lanes: 'Sávok és lámpák',
  other: 'Egyéb vizsgafeladatok',
}

export interface SituationLesson extends Lesson {
  /** Útvonalbarát azonosító (#/maneuvers/<id>) */
  id: string
  group: SituationGroup
}
