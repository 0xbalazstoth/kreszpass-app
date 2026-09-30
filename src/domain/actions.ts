import type { Outcome, Situation, Turn } from './types'

/**
 * Mozdulat-gyakorlás: a közeledés alatt a vezető a valódi mozdulatokat „végzi el” billentyűvel vagy gombbal
 * (tükör, irányjelzés, fékezés). A sorrendet és az időzítést a minősítő lap kódjai szerint értékeljük.
 */

export type ActionKind = 'mirror' | 'indicator_left' | 'indicator_right' | 'brake'

export interface ActionEvent {
  kind: ActionKind
  /** A közeledés kezdetétől eltelt idő (ms) */
  t: number
}

export interface ExpectedActions {
  /** Kanyarodáskor az irányjelzés iránya; egyenesen haladva null (ekkor az irányjelzés megtévesztő) */
  indicator: 'left' | 'right' | null
  /** Kötelező-e lassítani (kanyarodás, STOP tábla) */
  brake: boolean
}

export interface ActionResult {
  outcome: Outcome
  codes: string[]
  /** Rövid, magyar nyelvű megjegyzések a visszajelzéshez */
  notes: string[]
}

/** Az irányjelzés ennél később (a közeledés hányadában) már „nem kellő időben” adott (6/8) */
const LATE_INDICATOR = 0.7

/** Mely helyzeteknél van értelme a mozdulat-gyakorlásnak, és mit várunk el */
export function expectedActions(s: Pick<Situation, 'kind' | 'turn'>): ExpectedActions | null {
  const junction = s.kind === 'stop' || s.kind === 'give_way' || s.kind === 'priority' || s.kind === 'equal' || s.kind === 'signals'
  if (!junction) return null
  const turn: Turn = s.turn
  if (turn !== 'straight') return { indicator: turn, brake: true }
  return { indicator: null, brake: s.kind === 'stop' }
}

export function scoreActions(exp: ExpectedActions, events: ActionEvent[], approachMs: number): ActionResult {
  const codes: string[] = []
  const notes: string[] = []
  const add = (code: string, note: string) => {
    if (!codes.includes(code)) codes.push(code)
    notes.push(note)
  }
  const first = (pred: (e: ActionEvent) => boolean) => events.filter(pred).sort((a, b) => a.t - b.t)[0]
  const indicator = first((e) => e.kind === 'indicator_left' || e.kind === 'indicator_right')
  const mirror = first((e) => e.kind === 'mirror')
  const brake = first((e) => e.kind === 'brake')

  if (exp.indicator) {
    const want = exp.indicator === 'left' ? 'indicator_left' : 'indicator_right'
    if (!indicator) add('8/6', 'Nem adtál irányjelzést.')
    else if (indicator.kind !== want) add('8/30', `Rossz irányba indexeltél (${exp.indicator === 'left' ? 'balra' : 'jobbra'} kanyarodsz).`)
    else if (indicator.t > approachMs * LATE_INDICATOR) add('6/8', 'Késve adtál irányjelzést.')
    if (!mirror) add('4/5', 'Irányjelzés előtt nem néztél a tükörbe.')
    else if (indicator && mirror.t > indicator.t) add('4/5', 'Előbb a tükörbe kell nézni, csak utána indexelni.')
    if (!brake) add('5/4', 'Nem lassítottál a kanyarodás előtt.')
    else if (indicator && brake.t < indicator.t) add('4/4', 'Előbb indexelj, csak utána fékezz.')
  } else {
    if (indicator) add('8/30', 'Egyenesen haladsz: az irányjelzés megtévesztő.')
    if (exp.brake && !brake) add('8/26', 'A STOP tábla előtt meg kell állni: nem fékeztél.')
  }

  const outcome: Outcome = codes.length === 0 ? 'ok' : codes.some((c) => c.startsWith('8/')) ? 'wrong' : 'late'
  return { outcome, codes, notes }
}

/** A várt mozdulatok szövegesen, a súgóhoz */
export function describeExpected(exp: ExpectedActions): string {
  if (exp.indicator) return `Tükör → index ${exp.indicator === 'left' ? 'balra' : 'jobbra'} → fékezés`
  return exp.brake ? 'Fékezés a STOP tábla előtt, index nélkül' : 'Egyenesen: index nélkül'
}
