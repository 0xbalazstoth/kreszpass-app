import type { Scene } from './questions'
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
  /** Kötelező irányjelzés iránya; null esetén minden irányjelzés megtévesztő (8/30) */
  indicator: 'left' | 'right' | null
  /** Az irányjelzést nem értékeljük (se a hiányát, se a meglétét), pl. akadály előtt várakozva */
  indicatorFree?: boolean
  /** Kötelező-e lassítani */
  brake: boolean
  /** Kanyarodás: a fékezés az irányjelzés után jön (4/4), hiánya 5/4 */
  turning?: boolean
  /** A lassítás elmaradásának kódja és magyarázata */
  brakeCode?: string
  brakeNote?: string
  /** A súgó szövege */
  hint?: string
}

export interface ActionResult {
  outcome: Outcome
  codes: string[]
  /** Rövid, magyar nyelvű megjegyzések a visszajelzéshez */
  notes: string[]
}

/** Az irányjelzés ennél később (a közeledés hányadában) már „nem kellő időben” adott (6/8) */
const LATE_INDICATOR = 0.7

const JUNCTION_KINDS = new Set<Situation['kind']>(['stop', 'give_way', 'priority', 'equal', 'signals'])

/** Mely helyzeteknél van értelme a mozdulat-gyakorlásnak, és mit várunk el */
export function expectedActions(s: Pick<Situation, 'kind' | 'turn' | 'roundabout'>, scene?: Scene): ExpectedActions | null {
  if (JUNCTION_KINDS.has(s.kind)) {
    const turn: Turn = s.turn
    if (turn !== 'straight') return { indicator: turn, brake: true, turning: true }
    return s.kind === 'stop'
      ? { indicator: null, brake: true, brakeCode: '8/26', brakeNote: 'A STOP tábla előtt meg kell állni: nem fékeztél.', hint: 'Fékezés a STOP tábla előtt, index nélkül' }
      : { indicator: null, brake: false }
  }
  switch (s.kind) {
    case 'roundabout':
      // Első kijáratnál a kihajtást már a behajtás előtt jelezni kell; egyébként behajtáskor nem jelzünk (KRESZ 29. § (2))
      if (s.roundabout?.exit === 1) return { indicator: 'right', brake: true, turning: true, hint: 'Első kijárat: tükör → index jobbra → fékezés' }
      return {
        indicator: null,
        brake: true,
        brakeCode: '5/4',
        brakeNote: 'Körforgalomhoz lassítva, elsőbbségadásra készen kell érkezni.',
        hint: 'Lassítás, behajtáskor index nélkül',
      }
    case 'rail_crossing':
      return {
        indicator: null,
        brake: true,
        brakeCode: '8/28',
        brakeNote: 'Vasúti átjárót csak fokozott óvatossággal, lassítva szabad megközelíteni.',
        hint: 'Lassítás, index nélkül',
      }
    case 'tram_stop':
    case 'bus_stop': {
      const state = scene?.transit?.state
      if (state === 'doors_open')
        return { indicator: null, brake: true, brakeCode: '8/26', brakeNote: 'Az utasokat az úttesten fogadó villamos mögött meg kell állni.', hint: 'Megállás a villamos mögött' }
      if (state === 'departing')
        return { indicator: null, brake: true, brakeCode: '8/24', brakeNote: 'Az induló autóbusznak lassítással kell utat engedni.', hint: 'Lassítás, az induló busz elengedése' }
      return { indicator: null, brake: true, brakeCode: '5/4', brakeNote: 'A megálló mellett lassítva, fékkészen kell elhaladni.', hint: 'Lassítás, fékkészenlét' }
    }
    case 'hazard':
      switch (scene?.hazard) {
        case 'parked_clear':
          return { indicator: 'left', brake: false, hint: 'Tükör → index balra, fokozatos kihúzódás' }
        case 'roadworks':
          return {
            indicator: 'left',
            brake: true,
            brakeCode: '5/4',
            brakeNote: 'A munkaterület előtt lassítani kell.',
            hint: 'Tükör → index balra → lassítás',
          }
        case 'parked_oncoming':
          return {
            indicator: null,
            indicatorFree: true,
            brake: true,
            brakeCode: '8/24',
            brakeNote: 'Az akadály mögött le kell lassítani, és elengedni a szembejövőt.',
            hint: 'Lassítás az akadály mögött',
          }
        case 'ball_child':
          return { indicator: null, brake: true, brakeCode: '4/7', brakeNote: 'A labda után gyerek futhat: azonnal lassítani kell.', hint: 'Azonnali lassítás' }
        case 'door_open':
          return { indicator: null, indicatorFree: true, brake: true, brakeCode: '5/7', brakeNote: 'A kinyíló ajtó előtt lassítani kell.', hint: 'Lassítás, oldaltávolság' }
        case 'cyclist':
          return { indicator: null, brake: true, brakeCode: '8/3', brakeNote: 'Szembejövő forgalomnál a kerékpáros mögött le kell lassítani.', hint: 'Lassítás a kerékpáros mögött' }
        default:
          // Mentőautónál a félrehúzódás a lényeg, azt a kérdés kéri számon
          return null
      }
    default:
      return null
  }
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
    const dirWord = exp.indicator === 'left' ? 'balra' : 'jobbra'
    if (!indicator) add('8/6', 'Nem adtál irányjelzést.')
    else if (indicator.kind !== want) add('8/30', `Rossz irányba indexeltél (${dirWord} kell).`)
    else if (indicator.t > approachMs * LATE_INDICATOR) add('6/8', 'Késve adtál irányjelzést.')
    if (!mirror) add('4/5', 'Irányjelzés előtt nem néztél a tükörbe.')
    else if (indicator && mirror.t > indicator.t) add('4/5', 'Előbb a tükörbe kell nézni, csak utána indexelni.')
    if (exp.turning) {
      if (!brake) add('5/4', 'Nem lassítottál a kanyarodás előtt.')
      else if (indicator && brake.t < indicator.t) add('4/4', 'Előbb indexelj, csak utána fékezz.')
    } else if (exp.brake && !brake) add(exp.brakeCode ?? '5/4', exp.brakeNote ?? 'Nem lassítottál.')
  } else {
    if (indicator && !exp.indicatorFree) add('8/30', 'Itt az irányjelzés megtévesztő.')
    if (exp.brake && !brake) add(exp.brakeCode ?? '5/4', exp.brakeNote ?? 'Nem lassítottál.')
  }

  const outcome: Outcome = codes.length === 0 ? 'ok' : codes.some((c) => c.startsWith('8/')) ? 'wrong' : 'late'
  return { outcome, codes, notes }
}

/** A várt mozdulatok szövegesen, a súgóhoz */
export function describeExpected(exp: ExpectedActions): string {
  if (exp.hint) return exp.hint
  if (exp.indicator) return `Tükör → index ${exp.indicator === 'left' ? 'balra' : 'jobbra'} → fékezés`
  return exp.brake ? 'Lassítás, index nélkül' : 'Egyenesen: index nélkül'
}
