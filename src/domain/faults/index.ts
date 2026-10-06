import { EVAL_BLOCKS, type EvalCode } from '../evalCodes'
import * as block12 from './lessons/block1-2'
import * as block3 from './lessons/block3'
import * as block4 from './lessons/block4'
import * as block5 from './lessons/block5'
import * as block6 from './lessons/block6'
import * as block8a from './lessons/block8a'
import * as block8b from './lessons/block8b'
import type { FaultLesson } from './types'

export type { FaultLesson, FaultStep, Phase } from './types'

/** A blokkmodulok minden exportált leckéje (az `L<blokk>_<sor>` nevű exportok) */
const ALL: FaultLesson[] = [block12, block3, block4, block5, block6, block8a, block8b].flatMap((m) => Object.values(m) as FaultLesson[])

const BY_CODE = new Map(ALL.map((l) => [l.code, l]))

/** A leckék a minősítő lap sorrendjében (a 7. blokk a Manőverek fülön van) */
export const FAULT_LESSONS: FaultLesson[] = EVAL_BLOCKS.flatMap((b) => b.items)
  .filter((i): i is EvalCode => 'code' in i)
  .map((c) => BY_CODE.get(c.code))
  .filter((l): l is FaultLesson => !!l)

export function lessonByCode(code: string | undefined): FaultLesson | undefined {
  return code ? BY_CODE.get(code) : undefined
}

/** Útvonalbarát azonosító: „8/16” → „8-16” */
export const codeSlug = (code: string) => code.replace('/', '-')
export const slugCode = (slug: string) => slug.replace('-', '/')
