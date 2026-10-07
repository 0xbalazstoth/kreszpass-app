import { JUNCTIONS } from './junctions'
import { LANES } from './lanes'
import { OTHER } from './other'
import { PROTECTED } from './protected'
import type { SituationGroup, SituationLesson } from './types'

export { GROUP_TITLE } from './types'
export type { SituationGroup, SituationLesson } from './types'

/** A forgalmi helyzetek csoportonként, a felsorolás sorrendjében */
export const SITUATIONS: SituationLesson[] = [...JUNCTIONS, ...PROTECTED, ...LANES, ...OTHER]

export const GROUPS: SituationGroup[] = ['junctions', 'protected', 'lanes', 'other']

export function situationById(id: string | undefined): SituationLesson | undefined {
  return SITUATIONS.find((s) => s.id === id)
}
