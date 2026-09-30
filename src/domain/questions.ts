import type { Situation, Turn } from './types'

export type SignType = 'stop' | 'give_way' | 'priority_road' | 'speed' | 'crossing' | 'roundabout' | 'rail' | 'tram' | 'bus'
/** Vasúti átjáró fényjelzője: villogó piros (tilos), villogó fehér (szabad), vagy nincs fényjelző */
export type RailLight = 'red_flash' | 'white_flash' | 'none'
export type LightState = 'green' | 'yellow' | 'red' | 'red_yellow' | 'flashing_yellow'
export type Side = 'left' | 'right' | 'ahead'
/** Váratlan helyzetek az úton */
export type HazardKind = 'parked_oncoming' | 'parked_clear' | 'roadworks' | 'ball_child' | 'door_open' | 'cyclist' | 'emergency'
export const HAZARD_KINDS: HazardKind[] = ['parked_oncoming', 'parked_clear', 'roadworks', 'ball_child', 'door_open', 'cyclist', 'emergency']
/**
 * Villamos/autóbusz a megállóban: doors_open – áll, az utasok az úttesten szállnak; arriving – előttünk érkezik a megállóba;
 * standing – áll a megállóban (villamosnál járdasziget mellett; autóbusznál gyalogos lép ki elé); departing – elindulni készül
 */
export type TransitState = 'doors_open' | 'arriving' | 'standing' | 'departing'

export interface SceneCar {
  from: Side
  /** A partner szándéka: merre halad tovább */
  intent: Turn
  /** Áll-e (pl. mellékúton várakozik) */
  waiting?: boolean
}

export interface Scene {
  layout: 'junction' | 'roundabout' | 'road'
  turn: Turn
  /** Tábla a saját irányunkban */
  mySign?: SignType
  /** Tábla a keresztező úton */
  crossSign?: SignType
  light?: LightState
  cars: SceneCar[]
  pedestrian?: { where: 'my_crossing' | 'target_road' | 'exit_crossing'; state: 'crossing' | 'waiting' }
  /** Mellettünk álló, kilátást takaró jármű */
  blocker?: boolean
  speed?: number
  /** A helyszínen valóban álló további táblák (OSM), a fő tábla mellett */
  extraSigns?: string[]
  /** Vasúti átjáró az úton (a mi utunk a sínek előtt) */
  rail?: {
    barrier: boolean
    light: RailLight
    barrierDown?: boolean
    /** A sínek mögött torlódás: a túloldalon nincs hely */
    queue?: boolean
    /** Vonat közeledik (jelzőberendezés nélküli átjárónál) */
    train?: boolean
    /** Előttünk lassú jármű halad (előzési tilalom) */
    slowAhead?: boolean
  }
  /**
   * Körforgalom: a valós kijáratszám, hányadikon hajtunk ki, a körpálya sávjai, és hogy a behajtás előtt (entry)
   * vagy a körben, a kijárat előtt (exit) vagyunk. A partner: a körben balról érkező, a külső sávban mellettünk haladó,
   * vagy a következő bejáratnál várakozó autó.
   */
  roundabout?: { exits: number; exit: number; lanes: number; phase: 'entry' | 'exit'; partner?: 'ring_car' | 'outer_car' | 'entry_waiting' }
  hazard?: HazardKind
  transit?: { kind: 'tram' | 'bus'; island: boolean; state: TransitState }
}

export interface Option {
  text: string
  correct: boolean
  /** Rossz válasz esetén a minősítő lap kódja */
  code?: string
}

export interface Prompt {
  /** Sablon + változat azonosító, statisztikához */
  id: string
  title: string
  text: string
  scene: Scene
  options: Option[]
  /** Időtúllépéskor és kód nélküli rossz válasznál */
  timeoutCode: string
  explanation: string
}

type Rng = () => number

const ok = (text: string): Option => ({ text, correct: true })
const bad = (text: string, code: string): Option => ({ text, correct: false, code })

function pick<T>(items: T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length) % items.length]
}

export function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const TURN_WORD: Record<Turn, string> = { straight: 'Egyenesen haladsz', left: 'Balra kanyarodsz', right: 'Jobbra kanyarodsz' }

type Draft = Omit<Prompt, 'options'> & { options: Option[] }

function junctionScene(turn: Turn, extra: Partial<Scene>): Scene {
  return { layout: 'junction', turn, cars: [], ...extra }
}

// ---------------------------------------------------------------- STOP

function stopPrompts(s: Situation): Draft[] {
  const base = { mySign: 'stop' as const, crossSign: undefined }
  return [
    {
      id: 'stop:empty',
      title: 'STOP tábla',
      text: `${TURN_WORD[s.turn]}. A keresztező úton most nem jön senki. Mi a teendőd?`,
      scene: junctionScene(s.turn, { ...base }),
      options: [
        ok('Megállok a STOP vonalnál, körülnézek, majd továbbhaladok'),
        bad('Lassítva, megállás nélkül továbbhaladok, hiszen szabad az út', '8/26'),
        bad('Jóval a vonal előtt megállok, ahonnan nem látok be, majd elindulok', '6/3'),
        bad('Csak akkor állok meg, ha jobbról jön valaki', '8/26'),
      ],
      timeoutCode: '8/25',
      explanation:
        'Az „Állj! Elsőbbségadás kötelező” tábla előtt forgalomtól függetlenül meg kell állni, ott, ahonnan be lehet látni a keresztező utat.',
    },
    {
      id: 'stop:car_left',
      title: 'STOP tábla',
      text: `${TURN_WORD[s.turn]}. A keresztező úton balról autó közeledik. Mi a teendőd?`,
      scene: junctionScene(s.turn, { ...base, cars: [{ from: 'left', intent: 'straight' }] }),
      options: [
        ok('Megállok, és elengedem a balról érkezőt'),
        bad('Megállok, majd elindulok, mert balról jön, nekem van elsőbbségem', '8/24'),
        bad('Lassítok, és ha elég a rés, még beférek elé', '8/26'),
        bad('Megállás nélkül behajtok, mert a jobbkéz-szabály szerint ő vár', '8/24'),
      ],
      timeoutCode: '8/25',
      explanation: 'STOP táblánál meg kell állni, és a keresztező út minden irányból érkező járművének elsőbbséget kell adni.',
    },
  ]
}

// ---------------------------------------------------------------- Elsőbbségadás kötelező

function giveWayPrompts(s: Situation): Draft[] {
  const base = { mySign: 'give_way' as const }
  return [
    {
      id: 'give_way:empty',
      title: 'Elsőbbségadás kötelező',
      text: `${TURN_WORD[s.turn]}. A keresztező úton nem jön senki. Mi a helyes?`,
      scene: junctionScene(s.turn, { ...base }),
      options: [
        ok('Lassítok, körülnézek, és ha szabad az út, megállás nélkül továbbhaladok'),
        bad('Tempómat tartva behajtok, a tábla csak forgalomnál számít', '8/24'),
        bad('Mindenképpen megállok, akkor is, ha szabad az út', '5/4'),
      ],
      timeoutCode: '8/25',
      explanation:
        'Az „Elsőbbségadás kötelező” táblánál megállni csak akkor kell, ha elsőbbséget kell adni. A sebességet úgy kell megválasztani, hogy szükség esetén meg lehessen állni.',
    },
    {
      id: 'give_way:car_right',
      title: 'Elsőbbségadás kötelező',
      text: `${TURN_WORD[s.turn]}. A keresztező úton jobbról autó közeledik. Mi a teendőd?`,
      scene: junctionScene(s.turn, { ...base, cars: [{ from: 'right', intent: 'straight' }] }),
      options: [
        ok('Elengedem a jobbról érkezőt, csak utána hajtok be'),
        bad('Behajtok előtte, mert elég nagy a rés', '8/24'),
        bad('Csak a balról érkezőnek kell elsőbbséget adnom', '8/24'),
      ],
      timeoutCode: '8/25',
      explanation: 'A tábla a keresztező út minden irányból érkező járművének elsőbbséget biztosít.',
    },
    {
      id: 'give_way:car_left',
      title: 'Elsőbbségadás kötelező',
      text: `${TURN_WORD[s.turn]}. A keresztező úton balról autó jön, jobbról senki. Mi a teendőd?`,
      scene: junctionScene(s.turn, { ...base, cars: [{ from: 'left', intent: 'straight' }] }),
      options: [
        ok('Elengedem a balról érkezőt, csak utána hajtok be'),
        bad('Behajtok, mert jobbról nem jön senki', '8/24'),
        bad('Behajtok, a balról érkező majd lassít', '8/24'),
      ],
      timeoutCode: '8/25',
      explanation: 'A tábla felülírja a jobbkéz-szabályt: a balról érkezőnek is elsőbbsége van.',
    },
  ]
}

// ---------------------------------------------------------------- Főútvonalon

function priorityPrompts(s: Situation): Draft[] {
  const base = { mySign: 'priority_road' as const, crossSign: 'give_way' as const }
  const drafts: Draft[] = []
  if (s.turn === 'straight') {
    drafts.push({
      id: 'priority:side_waiting',
      title: 'Főútvonal',
      text: 'Főútvonalon egyenesen haladsz. Jobbról a mellékúton egy autó várakozik. Mi a helyes?',
      scene: junctionScene('straight', { ...base, cars: [{ from: 'right', intent: 'straight', waiting: true }] }),
      options: [
        ok('Egyenletes tempóval haladok tovább, de figyelem, valóban megvár-e'),
        bad('Lassítok, és intek neki, hogy jöjjön', '8/13'),
        bad('Gyorsítok, hogy biztosan előtte érjek át', '8/16'),
      ],
      timeoutCode: '8/25',
      explanation: 'Elsőbbséggel kell haladni, de óvatosan. Az indokolatlan lassítás vagy intés megtévesztő az elsőbbségadás szempontjából.',
    })
  }
  if (s.turn === 'left') {
    drafts.push({
      id: 'priority:left_oncoming',
      title: 'Főútvonal, balra kanyarodás',
      text: 'Főútvonalról balra kanyarodsz. Szemből egy autó egyenesen jön. Mi a teendőd?',
      scene: junctionScene('left', { ...base, cars: [{ from: 'ahead', intent: 'straight' }] }),
      options: [
        ok('Elengedem a szemből egyenesen haladót, utána kanyarodom'),
        bad('Kanyarodom, mert főútvonalon elsőbbségem van', '8/24'),
        bad('Kanyarodom, ő majd lassít', '8/24'),
      ],
      timeoutCode: '8/25',
      explanation: 'Balra kanyarodáskor a szemből egyenesen haladó és jobbra kanyarodó járműnek elsőbbséget kell adni, főútvonalon is.',
    })
  }
  if (s.turn === 'right' || s.turn === 'left') {
    drafts.push(targetRoadPedestrian(s.turn, 'priority', base))
  }
  return drafts
}

function targetRoadPedestrian(turn: Turn, kind: string, sceneExtra: Partial<Scene>): Draft {
  return {
    id: `${kind}:turn_pedestrian`,
    title: 'Bekanyarodás, gyalogos',
    text: `${TURN_WORD[turn]}. Abban az utcában, ahová bekanyarodsz, egy gyalogos halad át az úttesten (nincs zebra). Mi a teendőd?`,
    scene: junctionScene(turn, { ...sceneExtra, pedestrian: { where: 'target_road', state: 'crossing' } }),
    options: [
      ok('Elengedem a gyalogost, csak utána fejezem be a kanyarodást'),
      bad('Bekanyarodom, zebra nélkül nekem van elsőbbségem', '8/27'),
      bad('Dudálok, hogy siessen', '8/27'),
    ],
    timeoutCode: '8/25',
    explanation: 'Bekanyarodáskor annak az útnak az úttestjén áthaladó gyalogosnak, amelyre bekanyarodsz, elsőbbséget kell adni.',
  }
}

// ---------------------------------------------------------------- Egyenrangú

function equalPrompts(s: Situation): Draft[] {
  const drafts: Draft[] = []
  if (s.turn !== 'left') {
    drafts.push(
      {
        id: 'equal:car_right',
        title: 'Egyenrangú kereszteződés',
        text: `${TURN_WORD[s.turn]}. Jobbról autó közeledik. Mi a teendőd?`,
        scene: junctionScene(s.turn, { cars: [{ from: 'right', intent: 'straight' }] }),
        options: [
          ok('Elengedem a jobbról érkezőt'),
          bad('Tempómat tartva továbbhaladok, a jobbról jövő majd lassít', '8/14'),
          bad('Én megyek előbb, mert szélesebb úton jövök', '8/24'),
        ],
        timeoutCode: '8/25',
        explanation: 'Egyenrangú kereszteződésben a jobbról érkezőnek elsőbbsége van (jobbkéz-szabály).',
      },
      {
        id: 'equal:car_left',
        title: 'Egyenrangú kereszteződés',
        text: `${TURN_WORD[s.turn]}. Balról autó közeledik, jobbról senki. Mi a helyes?`,
        scene: junctionScene(s.turn, { cars: [{ from: 'left', intent: 'straight' }] }),
        options: [
          ok('Fékkészenlétben továbbhaladok, a balról érkező ad nekem elsőbbséget'),
          bad('Megállok, és elengedem a balról érkezőt', '8/13'),
          bad('Gyorsítok, hogy előbb odaérjek', '8/16'),
        ],
        timeoutCode: '8/25',
        explanation: 'Jobbkéz-szabály: a balról érkező köteles elsőbbséget adni. Az indokolatlan megállás megtévesztő.',
      },
      {
        id: 'equal:empty',
        title: 'Egyenrangú kereszteződés',
        text: `${TURN_WORD[s.turn]}. Nem látsz senkit a kereszteződésben. Hogyan haladsz át?`,
        scene: junctionScene(s.turn, {}),
        options: [
          ok('Mérsékelt sebességgel, fékkészenlétben, jobbra figyelve'),
          bad('Tempómat tartva, hiszen nem látok senkit', '8/14'),
          bad('Minden esetben megállok', '5/4'),
        ],
        timeoutCode: '8/25',
        explanation: 'Egyenrangú kereszteződésbe csak olyan sebességgel szabad behajtani, hogy a jobbról érkezőnek elsőbbséget lehessen adni.',
      },
    )
  } else {
    drafts.push({
      id: 'equal:left_oncoming',
      title: 'Egyenrangú, balra kanyarodás',
      text: 'Balra kanyarodsz. Szemből egy autó egyenesen jön, jobbról senki. Mi a teendőd?',
      scene: junctionScene('left', { cars: [{ from: 'ahead', intent: 'straight' }] }),
      options: [
        ok('Elengedem a szemből egyenesen haladót, utána kanyarodom'),
        bad('Kanyarodom, mert ő nem jobbról jön', '8/24'),
        bad('Gyorsan kanyarodom előtte', '8/24'),
      ],
      timeoutCode: '8/25',
      explanation: 'Balra kanyarodáskor a szemből egyenesen haladó és jobbra kanyarodó járműnek elsőbbséget kell adni.',
    })
  }
  if (s.turn !== 'straight') drafts.push(targetRoadPedestrian(s.turn, 'equal', {}))
  return drafts
}

// ---------------------------------------------------------------- Jelzőlámpa

function signalPrompts(s: Situation): Draft[] {
  const drafts: Draft[] = [
    {
      id: 'signals:yellow_far',
      title: 'Jelzőlámpa: sárga',
      text: 'Sárgára vált a lámpa. Bőven van helyed biztonságosan megállni. Mi a teendőd?',
      scene: junctionScene(s.turn, { light: 'yellow' }),
      options: [
        ok('Egyenletesen lassítva megállok a stopvonal előtt'),
        bad('Gyorsítok, hogy még átérjek', '8/26'),
        bad('Tempómat tartva továbbhaladok', '8/26'),
      ],
      timeoutCode: '8/25',
      explanation: 'Sárga jelzésnél meg kell állni, ha az biztonságosan lehetséges.',
    },
    {
      id: 'signals:yellow_close',
      title: 'Jelzőlámpa: sárga, közel',
      text: 'Sárgára vált a lámpa, de már olyan közel vagy, hogy biztonságosan nem tudnál megállni. Mi a teendőd?',
      scene: junctionScene(s.turn, { light: 'yellow' }),
      options: [
        ok('Továbbhaladok, és elhagyom a kereszteződést'),
        bad('Erős fékezéssel mindenképp megállok', '8/3'),
        bad('Megállok a kereszteződés közepén', '8/3'),
      ],
      timeoutCode: '8/25',
      explanation: 'Ha a sárga jelzéskor már nem lehet biztonságosan megállni, tovább lehet haladni.',
    },
    {
      id: 'signals:red_yellow',
      title: 'Jelzőlámpa: piros-sárga',
      text: 'A piros lámpánál állsz, piros-sárgára vált. Mi a teendőd?',
      scene: junctionScene(s.turn, { light: 'red_yellow' }),
      options: [
        ok('Sebességbe kapcsolok, felkészülök, de csak zöldnél indulok'),
        bad('Már most elindulok', '8/26'),
        bad('Várok, és csak zöldnél kezdek sebességbe kapcsolni', '6/5'),
      ],
      timeoutCode: '8/25',
      explanation: 'A piros-sárga jelzés az indulásra való felkészülést jelzi, indulni csak zöldnél szabad.',
    },
    {
      id: 'signals:red_wait',
      title: 'Jelzőlámpa: piros, várakozás',
      text: 'Piros jelzésnél hosszabb ideig várakozol. Hogyan állsz a járművel?',
      scene: junctionScene(s.turn, { light: 'red' }),
      options: [
        ok('Üresbe teszem a váltót, kiengedem a tengelykapcsolót, fékkel tartom az autót'),
        bad('Sebességben, benyomott tengelykapcsolóval várok', '6/6'),
        bad('Lassan araszolok a stopvonalon túlra', '8/26'),
      ],
      timeoutCode: '8/25',
      explanation: 'Tilos jelzésnél nem szabad benyomott tengelykapcsolóval, sebességben állni (6/6).',
    },
    {
      id: 'signals:flashing',
      title: 'Villogó sárga',
      text: 'A lámpa sárgán villog, elsőbbséget szabályozó tábla nincs. Ki haladhat elsőként?',
      scene: junctionScene(s.turn, { light: 'flashing_yellow', cars: [{ from: 'right', intent: 'straight' }] }),
      options: [
        ok('A jobbról érkező, a jobbkéz-szabály szerint'),
        bad('Én, mert lámpás kereszteződésben vagyok', '8/24'),
        bad('Senki, mindenkinek meg kell állnia, mint pirosnál', '8/29'),
      ],
      timeoutCode: '8/25',
      explanation: 'Villogó sárgánál a táblák, azok hiányában az általános szabályok (jobbkéz-szabály) szerint kell haladni.',
    },
  ]
  if (s.turn === 'left') {
    drafts.push({
      id: 'signals:green_left',
      title: 'Zöld, balra kanyarodás',
      text: 'Zöld jelzésnél balra kanyarodsz, szemből egy autó egyenesen jön. Mi a teendőd?',
      scene: junctionScene('left', { light: 'green', cars: [{ from: 'ahead', intent: 'straight' }] }),
      options: [
        ok('Behúzódom a kereszteződésbe, elengedem a szembejövőt, majd kanyarodom'),
        bad('Kanyarodom, zöldnél nekem van elsőbbségem', '8/24'),
        bad('A stopvonalnál várok, amíg el nem fogy a szembejövő forgalom', '6/3'),
      ],
      timeoutCode: '8/25',
      explanation: 'A zöld jelzés nem ad elsőbbséget a szemből egyenesen haladóval szemben. Be kell húzódni a kereszteződésbe.',
    })
  }
  if (s.turn === 'right' || s.turn === 'left') {
    drafts.push({
      id: 'signals:green_turn_ped',
      title: 'Zöld, bekanyarodás',
      text: `Zöld jelzésnél ${s.turn === 'right' ? 'jobbra' : 'balra'} kanyarodsz. A bekanyarodás utáni zebrán gyalogosok haladnak át. Mi a teendőd?`,
      scene: junctionScene(s.turn, { light: 'green', pedestrian: { where: 'target_road', state: 'crossing' } }),
      options: [
        ok('Elengedem a gyalogosokat, csak utána fejezem be a kanyarodást'),
        bad('Zöldem van, a gyalogosoknak kell várniuk', '8/27'),
        bad('A stopvonalnál várok, amíg mindenki át nem ér', '6/3'),
      ],
      timeoutCode: '8/25',
      explanation: 'Bekanyarodáskor a zebrán áthaladó gyalogosnak elsőbbséget kell adni, zöld jelzésnél is.',
    })
  }
  if (s.turn === 'right') {
    drafts.push({
      id: 'signals:red_right',
      title: 'Piros, jobbra kanyarodás',
      text: 'Piros jelzés, jobbra kanyarodnál. Zöld kiegészítő nyíl nincs. Mi a teendőd?',
      scene: junctionScene('right', { light: 'red' }),
      options: [
        ok('Megállok a stopvonal előtt, és megvárom a zöldet'),
        bad('Ha nem jön senki, jobbra kanyarodhatok', '8/26'),
        bad('Lassítva kanyarodom, mert jobbra mindig szabad', '8/26'),
      ],
      timeoutCode: '8/25',
      explanation: 'Piros jelzésnél zöld kiegészítő nyíl nélkül jobbra sem szabad kanyarodni.',
    })
  }
  return drafts
}

// ---------------------------------------------------------------- Körforgalom

/** A körforgalom valós adatai; kézzel felvett helyzetnél egy tipikus négyágú kör 2. kijárata */
function ringOf(s: Situation) {
  const r = s.roundabout
  return { known: !!r, exit: r?.exit ?? 2, exits: r?.exits ?? 4, lanes: r?.lanes ?? 1 }
}

/** „a 2. kijáraton” – ismeretlen kijáratnál „a kijelölt kijáraton” */
function exitWords(s: Situation): string {
  const r = ringOf(s)
  return r.known ? `a ${r.exit}. kijáraton` : 'a kijelölt kijáraton'
}

function ringScene(s: Situation, phase: 'entry' | 'exit', extra: Partial<Scene> = {}, partner?: NonNullable<Scene['roundabout']>['partner']): Scene {
  const r = ringOf(s)
  return {
    layout: 'roundabout',
    turn: 'straight',
    mySign: 'roundabout',
    cars: [],
    roundabout: { exits: r.exits, exit: r.exit, lanes: r.lanes, phase, partner },
    ...extra,
  }
}

/** Behajtás előtt: elsőbbség, irányjelzés, sávválasztás */
function roundaboutEntryPrompts(s: Situation): Draft[] {
  const r = ringOf(s)
  const where = exitWords(s)
  const drafts: Draft[] = [
    {
      id: 'roundabout:entry',
      title: 'Körforgalom, behajtás',
      text: `Körforgalomhoz érsz (${where} hajtasz majd ki), a körben balról egy autó közeledik. Mi a teendőd?`,
      scene: ringScene(s, 'entry', { cars: [{ from: 'left', intent: 'straight' }] }, 'ring_car'),
      options: [
        ok('Elengedem a körben haladót, utána hajtok be'),
        bad('Behajtok, mert jobbról nem jön senki', '8/24'),
        bad('Behajtok, ő majd lassít', '8/24'),
      ],
      timeoutCode: '8/25',
      explanation: 'A körforgalom bejáratánál „Elsőbbségadás kötelező” tábla áll: a körben haladónak elsőbbséget kell adni.',
    },
  ]
  if (r.exit === 1 && r.known) {
    drafts.push({
      id: 'roundabout:entry_signal_first',
      title: 'Körforgalom, első kijárat',
      text: 'Körforgalomba hajtasz be, és rögtön az 1. kijáraton hajtasz ki. Hogyan adsz irányjelzést?',
      scene: ringScene(s, 'entry'),
      options: [
        ok('Már a behajtás előtt jobbra jelzek, és a kihajtás befejezéséig folyamatosan jelzek'),
        bad('Nem jelzek, körforgalomban nem kell irányjelzés', '8/6'),
        bad('Behajtáskor balra jelzek, mert a kör balra visz', '8/30'),
      ],
      timeoutCode: '8/25',
      explanation:
        'A körforgalomba behajtást nem kell jelezni, de a körforgalomból kihajtást igen, kellő időben és folyamatosan (KRESZ 29. § (2)). Az első kijáratnál ez már a behajtás előtt kezdődik.',
    })
  } else {
    drafts.push({
      id: 'roundabout:entry_signal',
      title: 'Körforgalom, irányjelzés behajtáskor',
      text: `Körforgalomba hajtasz be, ${where} hajtasz ki. Kell-e irányjelzés a behajtáskor?`,
      scene: ringScene(s, 'entry'),
      options: [
        ok('Behajtáskor nem jelzek; a kihajtás előtt jobbra jelzek'),
        bad('Behajtáskor balra jelzek, mert a körben balra haladok', '8/30'),
        bad('Már behajtáskor jobbra jelzek, és a körben végig jelzek', '8/30'),
      ],
      timeoutCode: '8/25',
      explanation:
        'A körforgalomba behajtást nem kell irányjelzéssel jelezni, a kihajtást viszont igen (KRESZ 29. § (2)). A körben adott jobbra jelzés a korábbi kijáratoknál várakozókat megtéveszti.',
    })
  }
  if (r.lanes >= 2) {
    const near = r.exit <= 2
    drafts.push({
      id: 'roundabout:lane',
      title: 'Kétsávos körforgalom, besorolás',
      text: `Kétsávos körforgalomba hajtasz be, ${where} hajtasz ki (${r.exits} kijárat van). Burkolati jel nem ír elő mást. Melyik sávot választod?`,
      scene: ringScene(s, 'entry'),
      options: near
        ? [
            ok('A külső (jobb oldali) sávot, és abban maradok a kihajtásig'),
            bad('A belső sávot, és a kijáratnál onnan hajtok ki', '8/22'),
            bad('Mindegy, a körben bármikor átsorolhatok', '4/10'),
          ]
        : [
            ok('A belső (bal oldali) sávot; a kihajtás előtt jelezve, elsőbbséget adva sorolok át a külsőbe'),
            bad('A belső sávból közvetlenül hajtok ki, átvágva a külső sávon', '8/22'),
            bad('A külső sávot, és a kijáratok előtt a várakozók miatt többször lassítok', '4/10'),
          ],
      timeoutCode: '8/25',
      explanation: near
        ? 'Közeli kijárathoz a külső sáv való: onnan sávváltás nélkül lehet kihajtani.'
        : 'Távolabbi kijárathoz a belső sáv való. Kihajtás előtt a külső sávba kell átsorolni: ez irányváltoztatás, az ott haladónak elsőbbséget kell adni (KRESZ 29. § (1)).',
    })
  }
  return drafts
}

/** A körben, a kijárat előtt: kihajtás jelzése, gyalogos, sávváltás, bejáratnál várakozó */
function roundaboutExitPrompts(s: Situation): Draft[] {
  const r = ringOf(s)
  const where = exitWords(s)
  const drafts: Draft[] = [
    {
      id: 'roundabout:signal',
      title: 'Körforgalom, kihajtás jelzése',
      text:
        r.exit === 1
          ? 'Behajtottál a körforgalomba, és rögtön az 1. kijáraton hajtasz ki. Mi a helyes?'
          : `A körben haladsz, ${where} hajtasz ki. Mikor adsz irányjelzést?`,
      scene: ringScene(s, 'exit'),
      options:
        r.exit === 1
          ? [
              ok('Folyamatosan jobbra jelzek a kihajtás befejezéséig'),
              bad('A behajtás után kikapcsolom az irányjelzőt', '6/8'),
              bad('Nem jelzek, hiszen rögtön kihajtok', '8/6'),
            ]
          : [
              ok('Az előző kijárat elhagyása után jobbra jelzek, tükörbe nézek, és a kihajtásig jelzek'),
              bad('Nem jelzek, a körben mindenki látja, merre megyek', '8/6'),
              bad('Már az előző kijárat előtt jobbra jelzek', '8/30'),
              bad('Csak a kihajtás pillanatában kapcsolom be', '6/8'),
            ],
      timeoutCode: '8/25',
      explanation:
        'A kihajtást kellő időben megkezdett és a kihajtás befejezéséig folyamatosan adott irányjelzéssel kell jelezni (KRESZ 29. § (2)). Az előző kijárat előtt adott jelzés megtévesztő: a bejáratnál várakozó azt hiheti, ott hajtasz ki.',
    },
    {
      id: 'roundabout:exit_ped',
      title: 'Kihajtás, zebra',
      text: `Kihajtasz a körforgalomból (${where}), a kijárati zebrán egy gyalogos halad át. Mi a teendőd?`,
      scene: ringScene(s, 'exit', { pedestrian: { where: 'exit_crossing', state: 'crossing' } }),
      options: [
        ok('Megállok a zebra előtt, és átengedem'),
        bad('Kihajtok, mert a körben nekem van elsőbbségem', '8/27'),
        bad('Mögötte gyorsan kihajtok', '8/27'),
      ],
      timeoutCode: '8/25',
      explanation: 'A kijelölt gyalogos-átkelőhelyen áthaladó gyalogosnak elsőbbséget kell adni (KRESZ 43. § (1)).',
    },
  ]
  // Csak akkor van a kijáratunk előtt másik bejárat, ha nem az első kijáraton hajtunk ki
  if (r.exit >= 2) drafts.push({
    id: 'roundabout:entry_waiting',
    title: 'Körforgalom, várakozó a bejáratnál',
    text: `A körben haladsz tovább (${where} hajtasz ki). A következő bejáratnál egy autó várakozik, be akar hajtani. Mi a helyes?`,
    scene: ringScene(s, 'exit', {}, 'entry_waiting'),
    options: [
      ok('Egyenletes tempóval, irányjelzés nélkül haladok tovább, de figyelem, valóban megvár-e'),
      bad('Megállok, és beengedem', '8/13'),
      bad('Jobbra jelzek, hogy lássa, merre megyek', '8/30'),
    ],
    timeoutCode: '8/25',
    explanation:
      'A körben haladónak elsőbbsége van. Az indokolatlan megállás vagy a jobbra jelzés a kijárat előtt megtévesztő: a várakozó azt hiheti, hogy kihajtasz.',
  })
  if (r.lanes >= 2 && r.exit > 2) {
    drafts.push({
      id: 'roundabout:exit_lane',
      title: 'Kétsávos körforgalom, kihajtás',
      text: `A belső sávban haladsz, ${where} hajtasz ki. A külső sávban melletted egy autó halad. Mi a teendőd?`,
      scene: ringScene(s, 'exit', { cars: [{ from: 'left', intent: 'straight' }] }, 'outer_car'),
      options: [
        ok('Tükörbe nézek, jobbra jelzek, elengedem a külső sávban haladót, és mögötte sorolok át'),
        bad('Jelzek és átsorolok, ő majd lassít', '8/22'),
        bad('A belső sávból egyenesen kihajtok előtte', '8/24'),
      ],
      timeoutCode: '8/25',
      explanation: 'A sávváltás irányváltoztatás: az azonos irányban haladó, irányt nem változtató járműnek elsőbbséget kell adni (KRESZ 29. § (1)).',
    })
  }
  return drafts
}

// ---------------------------------------------------------------- Zebra

function crossingPrompts(): Draft[] {
  const base = { layout: 'road' as const, turn: 'straight' as Turn, mySign: 'crossing' as const, cars: [] }
  return [
    {
      id: 'crossing:on_crossing',
      title: 'Gyalogos a zebrán',
      text: 'Kijelölt gyalogos-átkelőhely, egy gyalogos már az úttesten halad át. Mi a teendőd?',
      scene: { ...base, pedestrian: { where: 'my_crossing', state: 'crossing' } },
      options: [
        ok('Időben, egyenletesen lassítva megállok, és átengedem'),
        bad('Mögötte elhaladok, ha már túljutott a sávomon', '8/27'),
        bad('Az utolsó pillanatban erősen fékezek', '8/15'),
      ],
      timeoutCode: '8/25',
      explanation: 'A zebrán áthaladó gyalogosnak elsőbbséget kell adni, egyenletes, időben megkezdett lassítással.',
    },
    {
      id: 'crossing:waiting',
      title: 'Gyalogos a járdaszélen',
      text: 'A zebra előtt a járdaszélen gyalogos áll, láthatóan át akar menni. Mi a teendőd?',
      scene: { ...base, pedestrian: { where: 'my_crossing', state: 'waiting' } },
      options: [
        ok('Lassítok, megállok, és átengedem'),
        bad('Továbbhaladok, mert még nem lépett le', '8/27'),
        bad('Kézzel intek neki, hogy jöhet', '6/7'),
      ],
      timeoutCode: '8/25',
      explanation: 'Az átkelni szándékozó gyalogost át kell engedni. Intéssel nem szabad az úttestre „csalogatni”.',
    },
    {
      id: 'crossing:blocked_view',
      title: 'Takart zebra',
      text: 'A zebra előtt a melletted lévő sávban egy autó megállt, eltakarja a kilátást. Mi a teendőd?',
      scene: { ...base, blocker: true },
      options: [
        ok('Lassítok, szükség esetén megállok, és csak meggyőződés után haladok tovább'),
        bad('Tempómat tartva elhaladok mellette', '8/27'),
        bad('Gyorsítok, hogy mielőbb túljussak', '8/28'),
      ],
      timeoutCode: '8/25',
      explanation: 'Ha a zebra előtt egy jármű megállt, mellette csak akkor szabad továbbhaladni, ha nem veszélyeztetsz gyalogost.',
    },
    {
      id: 'crossing:empty',
      title: 'Zebra',
      text: 'Zebrához közeledsz, a közelben nem látsz gyalogost. Hogyan haladsz?',
      scene: { ...base },
      options: [
        ok('Fékkészenlétben, a járdaszéleket figyelve haladok át'),
        bad('Megállok, hátha jön valaki', '5/5'),
        bad('Gyorsítok, hogy mielőbb átérjek', '8/28'),
      ],
      timeoutCode: '8/25',
      explanation: 'Zebra előtt fokozott óvatossággal, fékkészenlétben kell haladni.',
    },
  ]
}

// ---------------------------------------------------------------- Vasúti átjáró

function railPrompts(s: Situation): Draft[] {
  // Kézzel felvett átjárónál a leggyakoribb eset: fénysorompó, sorompó nélkül
  const rail = s.rail ?? { barrier: false, lights: true }
  const scene = (light: RailLight, barrierDown = false, extra: Partial<NonNullable<Scene['rail']>> = {}): Scene => ({
    layout: 'road',
    turn: 'straight',
    mySign: 'rail',
    cars: [],
    rail: { barrier: rail.barrier, light, barrierDown, ...extra },
  })
  const free: RailLight = rail.lights ? 'white_flash' : 'none'
  const out: Draft[] = [
    {
      id: 'rail:approach',
      title: 'Vasúti átjáró előtt',
      text: 'Vasúti átjáróra figyelmeztető tábla és háromcsíkos előjelző tábla mellett haladsz el. Hogyan közeledsz?',
      scene: scene(rail.lights ? 'white_flash' : 'none'),
      options: [
        ok('Csökkentem a sebességet, hogy a megállás helyén szükség esetén biztonságosan meg tudjak állni'),
        bad('Tartom a sebességet, a tábla csak tájékoztat', '8/28'),
        bad('Gyorsítok, hogy mielőbb átérjek a síneken', '8/16'),
      ],
      timeoutCode: '8/25',
      explanation:
        'Vasúti átjáróhoz úgy kell közeledni, hogy a jármű a megállás helyén (sorompó, fénysorompó vagy Andráskereszt előtt) biztonságosan megállítható legyen.',
    },
  ]
  if (rail.lights) {
    out.push(
      {
        id: 'rail:red_flash',
        title: 'Fénysorompó: villogó piros',
        text: 'A fénysorompó váltakozva villogó piros fényt ad, vonatot nem látsz. Mi a teendőd?',
        scene: scene('red_flash'),
        options: [
          ok('Megállok a fénysorompó előtt, és megvárom, amíg a piros fény kialszik'),
          bad('Ha nem látok vonatot, óvatosan áthaladok', '8/26'),
          bad('Gyorsan áthaladok, mielőtt a vonat odaér', '8/3'),
        ],
        timeoutCode: '8/25',
        explanation: 'A villogó piros fény tilos jelzés: a fénysorompó előtt meg kell állni, akkor is, ha vonat nem látható.',
      },
      {
        id: 'rail:white_flash',
        title: 'Fénysorompó: villogó fehér',
        text: 'A fénysorompó lassú ütemű villogó fehér fényt ad. Mi a teendőd?',
        scene: scene('white_flash'),
        options: [
          ok('Áthaladhatok, fokozott óvatossággal, és nem állok meg a síneken'),
          bad('Megállok, mert vasúti átjárónál mindig meg kell állni', '8/29'),
          bad('Ha előttem torlódás van, a síneken várakozom', '8/3'),
        ],
        timeoutCode: '8/25',
        explanation:
          'A villogó fehér fény azt jelzi, hogy a fénysorompó működik, és szabad az áthaladás. A síneken megállni tilos: csak akkor hajts rá, ha a túloldalon van hely.',
      },
    )
  } else {
    out.push({
      id: 'rail:no_signal',
      title: 'Jelzőberendezés nélküli átjáró',
      text: 'Andráskereszttel jelzett, sorompó és fényjelző nélküli vasúti átjáróhoz érsz. Mi a teendőd?',
      scene: scene('none'),
      options: [
        ok('Lassítok, jobbra-balra körülnézek, és csak akkor haladok át, ha vonat nem közeledik'),
        bad('Továbbhaladok, mert nincs sorompó, tehát nem jön vonat', '8/28'),
        bad('Megállok a síneken, hogy jobban kilássak', '8/3'),
      ],
      timeoutCode: '8/25',
      explanation: 'Jelzőberendezés nélküli átjárónál meg kell győződni arról, hogy vonat nem közeledik; ha a kilátás korlátozott, meg kell állni.',
    })
  }
  if (rail.barrier) {
    out.push({
      id: 'rail:barrier',
      title: 'Lezárt sorompó',
      text: 'A sorompó lezárt helyzetben van, vonatot nem látsz. Mi a teendőd?',
      scene: scene(rail.lights ? 'red_flash' : 'none', true),
      options: [
        ok('Megállok a sorompó előtt, és megvárom, amíg teljesen felnyílik'),
        bad('Ha félsorompó, kikerülöm, mert nem jön vonat', '8/26'),
        bad('Közvetlenül a sorompó rúdja elé hajtok, hogy azonnal indulhassak', '6/3'),
      ],
      timeoutCode: '8/25',
      explanation: 'Lezárt (vagy záródó, nyíló) sorompónál meg kell állni. A sorompót kikerülni tilos, akkor is, ha vonat nem látható.',
    })
    if (rail.lights) {
      out.push({
        id: 'rail:after_lift',
        title: 'Felnyílt sorompó, piros fény',
        text: 'A sorompó rúdja már felnyílt, de a fényjelző még villogó piros fényt ad. Mi a teendőd?',
        scene: scene('red_flash'),
        options: [
          ok('Tovább várok, és csak a villogó fehér jelzésnél indulok'),
          bad('Elindulok, hiszen a sorompó már nyitva van', '8/26'),
          bad('Lassan a sínekre gurulok, hogy azonnal átérjek', '8/3'),
        ],
        timeoutCode: '8/25',
        explanation:
          'Meg kell állni, ha a fényjelző villogó piros jelzést ad, akkor is, ha a sorompó rúdja nyitott (KRESZ 39. § (3) c)). Biztosított átjáróra csak nyitott sorompónál és jelzés nélkül, illetve villogó fehér fénynél szabad ráhajtani.',
      })
    }
  }
  out.push(
    {
      id: 'rail:queue',
      title: 'Torlódás a sínek mögött',
      text: `${rail.lights ? 'A fénysorompó villogó fehér fényt ad, de' : 'Vonat nem közeledik, de'} a sínek túloldalán feltorlódtak a járművek, épp nem férnél el mögöttük. Mi a teendőd?`,
      scene: scene(free, false, { queue: true }),
      options: [
        ok('A megállás helyén várok, és csak akkor hajtok rá, ha a túloldalon van helyem'),
        bad('Ráhajtok, a sor majd elindul', '8/3'),
        bad('A sínek előtt, a sorompó vonalán túl várakozom', '6/3'),
      ],
      timeoutCode: '8/25',
      explanation:
        'A vasúti átjárón csak folyamatosan, megállás nélkül szabad áthaladni. Ha erre nincs lehetőség, az átjáró előtt meg kell állni (KRESZ 39. § (2), (3) g)).',
    },
    {
      id: 'rail:no_overtake',
      title: 'Előzés vasúti átjáró előtt',
      text: 'Közvetlenül a vasúti átjáró előtt egy lassú mezőgazdasági jármű halad előtted, szemből senki sem jön. Megelőzheted?',
      scene: scene(free, false, { slowAhead: true }),
      options: [
        ok('Nem: vasúti átjáróban és közvetlenül előtte tilos előzni, mögötte maradok'),
        bad('Igen, ha szemből senki sem jön', '8/26'),
        bad('Igen, ha a sínek előtt befejezem az előzést', '8/26'),
      ],
      timeoutCode: '8/25',
      explanation: 'Vasúti átjáróban és közvetlenül vasúti átjáró előtt tilos előzni (KRESZ 34. § (8) d)).',
    },
    {
      id: 'rail:stop_position',
      title: 'Vasúti átjáró, hol állsz meg?',
      text: `Meg kell állnod a vasúti átjáró előtt. Hol állsz meg?`,
      scene: scene(rail.lights ? 'red_flash' : 'none', rail.barrier && rail.lights),
      options: [
        ok(
          rail.lights || rail.barrier
            ? 'A fénysorompó (sorompó) előtt, illetve a megállás helyét jelző vonal előtt'
            : 'Az Andráskereszt előtt, illetve a megállás helyét jelző vonal előtt',
        ),
        bad('Közvetlenül az első sín előtt, hogy jobban kilássak', '6/3'),
        bad('Jóval előtte, ahonnan a pályára nem látok rá', '6/3'),
      ],
      timeoutCode: '8/25',
      explanation:
        'Az átjáró előtt az Andráskeresztnél, a fénysorompónál, a sorompónál, vagy a megállás helyét jelző útburkolati jel előtt kell megállni (KRESZ 39. § (3)).',
    },
  )
  if (!rail.lights && !rail.barrier) {
    out.push({
      id: 'rail:train_visible',
      title: 'Vonat közeledik',
      text: 'Jelzőberendezés nélküli átjáróhoz érsz, balról vonat közeledik. Mi a teendőd?',
      scene: scene('none', false, { train: true }),
      options: [
        ok('Megállok az Andráskereszt előtt, és megvárom, amíg a vonat elhalad'),
        bad('Gyorsan áthajtok, még messze van', '8/3'),
        bad('Lassan a sínek elé gurulok, és ott várok', '8/28'),
      ],
      timeoutCode: '8/25',
      explanation:
        'Ha bármely irányból vasúti jármű közeledik, az átjáró előtt meg kell állni (KRESZ 39. § (3) a)). Biztosítatlan átjáróra csak akkor szabad ráhajtani, ha vonat nem közeledik (39. § (4)).',
    })
  }
  return out
}

// ---------------------------------------------------------------- Villamosmegálló

function tramPrompts(s: Situation): Draft[] {
  const island = s.transit?.island
  const scene = (isl: boolean, state: TransitState, extra: Partial<Scene> = {}): Scene => ({
    layout: 'road',
    turn: 'straight',
    mySign: 'tram',
    cars: [],
    transit: { kind: 'tram', island: isl, state },
    ...extra,
  })
  const out: Draft[] = []
  if (island !== true) {
    out.push(
      {
        id: 'tram:doors_open',
        title: 'Villamosmegálló járdasziget nélkül',
        text: 'Járdasziget nélküli megállóban áll a villamos, az utasok az úttesten át szállnak fel és le. Mi a teendőd?',
        scene: scene(false, 'doors_open'),
        options: [
          ok('Megállok a villamos mögött, és csak a villamos elindulása után haladok tovább'),
          bad('Ha az utasok átértek, a villamos mellett elhaladok', '8/26'),
          bad('Lépésben, dudálva elhaladok a villamos mellett', '8/27'),
        ],
        timeoutCode: '8/25',
        explanation:
          'Az olyan megállóhely előtt, amelyben villamos áll, és az utasok az úttestről szállnak fel és le, meg kell állni, és továbbhaladni csak a villamos elindulása után szabad (KRESZ 35. § (2)).',
      },
      {
        id: 'tram:arriving',
        title: 'Villamos a megálló előtt',
        text: 'Előtted villamos halad, és egy járdasziget nélküli megállóhoz közeledik. Megelőzheted?',
        scene: scene(false, 'arriving'),
        options: [
          ok('Nem: közvetlenül ilyen megálló előtt villamost előzni tilos, mögötte maradok'),
          bad('Igen, jobbról, mielőtt megáll', '8/26'),
          bad('Igen, ha gyorsan előtte érek a megállóhoz', '8/26'),
        ],
        timeoutCode: '8/25',
        explanation: 'Tilos villamost előzni közvetlenül olyan megállóhely előtt, ahol az utasok az úttestről szállnak fel és le (KRESZ 34. § (8) b)).',
      },
    )
  }
  if (island !== false) {
    out.push({
      id: 'tram:island',
      title: 'Villamosmegálló járdaszigettel',
      text: 'Járdaszigetes megállóban áll a villamos, a szigeten utasok várnak. Hogyan haladsz el mellette?',
      scene: scene(true, 'standing'),
      options: [
        ok('Mérsékelt sebességgel, fékkészen, a szigetről lelépő gyalogosokra figyelve haladok el'),
        bad('Tempómat tartva elhaladok, a szigeten biztonságban vannak', '8/28'),
        bad('Megállok, és megvárom, amíg a villamos elindul', '5/5'),
      ],
      timeoutCode: '8/25',
      explanation:
        'Járdaszigetnél nem kell megállni, de fokozottan ügyelni kell a sziget és a járda között áthaladó gyalogosokra (KRESZ 43. § (4) a)).',
    })
  }
  return out
}

// ---------------------------------------------------------------- Autóbuszmegálló

function busPrompts(): Draft[] {
  const scene = (state: TransitState, extra: Partial<Scene> = {}): Scene => ({
    layout: 'road',
    turn: 'straight',
    mySign: 'bus',
    cars: [],
    transit: { kind: 'bus', island: false, state },
    ...extra,
  })
  return [
    {
      id: 'bus:departing',
      title: 'Induló autóbusz',
      text: 'Lakott területen a megállóban álló autóbusz balra jelez, el akar indulni. Hirtelen fékezés nélkül megállhatnál. Mi a teendőd?',
      scene: scene('departing'),
      options: [
        ok('Lassítok, szükség esetén megállok, és lehetővé teszem az elindulását'),
        bad('Gyorsítok, hogy még előtte elhaladjak', '8/24'),
        bad('Tempómat tartom, nekem van elsőbbségem', '8/24'),
      ],
      timeoutCode: '8/25',
      explanation:
        'Lakott területen a menetrend szerint közlekedő, elindulási szándékát jelző autóbusz elindulását – ha ez hirtelen fékezés nélkül megtehető – lassítással, szükség esetén megállással is lehetővé kell tenni (KRESZ 24. § (3)).',
    },
    {
      id: 'bus:ped_front',
      title: 'Álló autóbusz a megállóban',
      text: 'A megállóban autóbusz áll, utasok szállnak le. A busz eleje eltakarja a járdát. Hogyan haladsz el mellette?',
      scene: scene('standing'),
      options: [
        ok('Lassan, fékkészen haladok el, számítok a busz elől kilépő gyalogosra'),
        bad('Tempómat tartva, szorosan elhaladok mellette', '8/27'),
        bad('Dudálok, hogy a gyalogosok ne lépjenek le', '8/28'),
      ],
      timeoutCode: '8/25',
      explanation:
        'A menetrend szerint közlekedő járművek megállóhelyéről az úttestre lelépő gyalogosokra fokozottan ügyelni kell (KRESZ 43. § (4) a)). Hangjelzést csak balesetveszélyben szabad adni.',
    },
  ]
}

// ---------------------------------------------------------------- Váratlan helyzetek

const HAZARD_PROMPTS: Record<HazardKind, Omit<Draft, 'scene'>> = {
  parked_oncoming: {
    id: 'hazard:parked_oncoming',
    title: 'Akadály a sávodban, szembejövővel',
    text: 'A sávodban elakadásjelzővel álló kisteherautó van, szemből autó közeledik. Mi a teendőd?',
    options: [
      ok('Lassítok, az akadály mögött szükség esetén megállok, és elengedem a szembejövőt'),
      bad('Kikerülöm, a szembejövő majd lassít', '8/24'),
      bad('Az utolsó pillanatban, hirtelen kormánymozdulattal kerülöm ki', '4/6'),
    ],
    timeoutCode: '8/25',
    explanation:
      'Az akadály kikerülésére az előzés szabályai vonatkoznak: csak akkor szabad kikerülni, ha a szembejövő forgalmat nem zavarja (KRESZ 35. § (1), 34. § (1) a)). Akinek a sávjában az akadály van, annak kell várnia.',
  },
  parked_clear: {
    id: 'hazard:parked_clear',
    title: 'Akadály a sávodban',
    text: 'A sávodban egy jármű áll az úttest szélén, szemből senki sem jön. Hogyan kerülöd ki?',
    options: [
      ok('Tükörbe nézek, balra jelzek, fokozatosan, kellő oldaltávolsággal kikerülöm, majd jobbra jelezve visszatérek'),
      bad('Irányjelzés nélkül kerülöm ki, hiszen nem jön senki', '8/6'),
      bad('Lassítás nélkül, szorosan mellette haladok el', '5/7'),
      bad('Közvetlenül mögötte, meredeken húzódom ki', '4/6'),
    ],
    timeoutCode: '8/25',
    explanation:
      'A kikerülés irányváltoztatás: tükörbe nézés után kellő időben irányjelzést kell adni, és megfelelő oldaltávolságot kell tartani (KRESZ 29. § (2), 34. § (1) d), (2)).',
  },
  roadworks: {
    id: 'hazard:roadworks',
    title: 'Úton folyó munkák',
    text: 'Úton folyó munkák: a sávodat terelőkúpok zárják le, a „Kikerülési irány” tábla balra mutat. Szemből most nem jön senki. Mi a teendőd?',
    options: [
      ok('Lassítok, tükörbe nézek, balra jelzek, és a tábla szerint balról kerülöm ki a munkaterületet'),
      bad('Jobbról, a padka felől kerülöm ki', '8/26'),
      bad('Tempómat tartva elhaladok, hiszen nincs szembejövő', '8/28'),
    ],
    timeoutCode: '8/25',
    explanation: 'A „Kikerülési irány” tábla azt jelzi, hogy az akadályt a nyíl irányában kell kikerülni. Munkaterület mellett csökkentett sebességgel, fokozott figyelemmel kell haladni.',
  },
  ball_child: {
    id: 'hazard:ball_child',
    title: 'Labda az úttesten',
    text: 'A parkoló autók közül egy labda gurul az úttestre előtted. Mi a teendőd?',
    options: [
      ok('Azonnal lassítok, fékkészen haladok, számítok rá, hogy gyerek szalad utána'),
      bad('Kikerülöm a labdát, és tempómat tartom', '8/3'),
      bad('Dudálok, és tovább haladok', '4/7'),
    ],
    timeoutCode: '8/25',
    explanation: 'A labda után gyakran gyerek fut ki. A gyermekekre fokozottan ügyelni kell (KRESZ 43. § (4) b)), ilyenkor azonnal lassítani kell.',
  },
  door_open: {
    id: 'hazard:door_open',
    title: 'Kinyíló ajtó',
    text: 'Az úttest szélén parkoló autó vezetőoldali ajtaja kinyílik előtted. Mi a teendőd?',
    options: [
      ok('Lassítok, és csak kellő oldaltávolsággal, a szembejövőket figyelve haladok el mellette'),
      bad('Tempómat tartva, szorosan elhaladok, az ajtót úgyis becsukja', '5/7'),
      bad('Hirtelen balra rántom a kormányt', '4/6'),
    ],
    timeoutCode: '8/25',
    explanation: 'Álló járművek mellett a sebességhez mérten kellő oldaltávolságot kell tartani: a kinyíló ajtó és a kiszálló ember akadályt jelent.',
  },
  cyclist: {
    id: 'hazard:cyclist',
    title: 'Kerékpáros előtted',
    text: 'Előtted az úttest jobb szélén kerékpáros halad, szemből folyamatos a forgalom. Mi a teendőd?',
    options: [
      ok('Mögötte maradok, és csak akkor előzöm, ha kellő oldaltávolságot tudok tartani'),
      bad('Szorosan mellette, a szembejövők előtt megelőzöm', '8/3'),
      bad('Dudálok, hogy húzódjon félre', '8/28'),
    ],
    timeoutCode: '8/25',
    explanation: 'Előzni csak akkor szabad, ha a szembejövő forgalmat nem zavarja, és a megelőzendő mellett megfelelő oldaltávolság tartható (KRESZ 34. § (1) a), d)).',
  },
  emergency: {
    id: 'hazard:emergency',
    title: 'Mentőautó mögötted',
    text: 'A tükörben látod: mögötted kék fénnyel villogó, szirénázó mentőautó közeledik. Mi a teendőd?',
    options: [
      ok('Jobbra félrehúzódom, szükség esetén megállok, és elengedem'),
      bad('Gyorsítok, hogy ne legyek útban', '8/31'),
      bad('Azonnal, a sávom közepén megállok', '8/31'),
      bad('Ha lassít, megelőzöm', '8/31'),
    ],
    timeoutCode: '8/25',
    explanation:
      'A megkülönböztető jelzéseket használó gépjárműnek elsőbbséget kell adni, és akadálytalan továbbhaladását félrehúzódással, szükség esetén megállással lehetővé kell tenni. Előzni tilos (KRESZ 42. § (1), (3)).',
  },
}

function hazardPrompts(): Draft[] {
  return HAZARD_KINDS.map((kind) => ({
    ...HAZARD_PROMPTS[kind],
    scene: { layout: 'road', turn: 'straight', cars: kind === 'parked_oncoming' ? [{ from: 'ahead', intent: 'straight' }] : [], hazard: kind },
  }))
}

// ---------------------------------------------------------------- Sebesség

function speedPrompts(s: Situation, rng: Rng): Draft[] {
  const to = s.speedTo
  if (!to) return []
  const from = s.speedFrom && s.speedFrom !== to ? s.speedFrom : to === 50 ? 70 : 50
  const candidates = [to + 10, to + 20, Math.max(10, to - 10), from].filter((v) => v !== to)
  const wrong = [...new Set(candidates)].slice(0, 3)
  return [
    {
      id: 'speed:limit',
      title: 'Sebességkorlátozás',
      text: `Új tábla következik (eddig ${from} km/h volt). Mekkora a megengedett legnagyobb sebesség innentől?`,
      scene: { layout: 'road', turn: 'straight', mySign: 'speed', speed: to, cars: [] },
      options: [
        ok(`${to} km/h`),
        ...shuffle(wrong, rng).map((v) => bad(`${v} km/h`, v > to ? '8/16' : '5/5')),
      ],
      timeoutCode: '8/25',
      explanation: `A tábla szerint ${to} km/h a megengedett legnagyobb sebesség. Túllépése gyorshajtás (8/16).`,
    },
  ]
}

// ---------------------------------------------------------------- Kanyarodás előtt

/** A helyzet állandó elemei (tábla, lámpa), hogy a kanyarodási kérdés is a valós helyet mutassa */
export function baseScene(s: Situation): Partial<Scene> {
  switch (s.kind) {
    case 'stop':
      return { mySign: 'stop' }
    case 'give_way':
      return { mySign: 'give_way' }
    case 'priority':
      return { mySign: 'priority_road', crossSign: 'give_way' }
    case 'signals':
      return { light: 'green' }
    default:
      return {}
  }
}

function turnPrompts(s: Situation): Draft[] {
  if (s.turn === 'straight' || !['stop', 'give_way', 'priority', 'equal', 'signals'].includes(s.kind)) return []
  const dir = s.turn === 'left' ? 'Balra' : 'Jobbra'
  return [
    {
      id: 'turn:sequence',
      title: `${dir} kanyarodás előtt`,
      text: `${dir} fogsz kanyarodni. Mi a helyes sorrend?`,
      scene: junctionScene(s.turn, baseScene(s)),
      options: [
        ok('Tükör → irányjelzés → besorolás → lassítás'),
        bad('Fékezés → irányjelzés → besorolás', '4/4'),
        bad('Irányjelzés → besorolás, tükörbe nézés nélkül', '4/5'),
        bad('Besorolás → irányjelzés a kanyar pillanatában', '6/8'),
      ],
      timeoutCode: '8/25',
      explanation: 'Előbb a mögöttes forgalom ellenőrzése, majd időben irányjelzés, besorolás, végül lassítás.',
    },
    {
      id: 'turn:lane',
      title: `${dir} kanyarodás, besorolás`,
      text: `${dir} fogsz kanyarodni kétirányú úton. Hová sorolsz be?`,
      scene: junctionScene(s.turn, baseScene(s)),
      options:
        s.turn === 'right'
          ? [
              ok('Az úttest jobb széléhez'),
              bad('Középre, hogy nagyobb ívben kanyarodhassak', '8/22'),
              bad('Maradok a sávom közepén, nem sorolok be', '4/10'),
            ]
          : [
              ok('Az úttest közepéhez, a felezővonal mellé'),
              bad('A jobb szélen maradok', '4/10'),
              bad('Átlépem a felezővonalat, hogy korábban kanyarodhassak', '8/21'),
            ],
      timeoutCode: '8/25',
      explanation:
        s.turn === 'right'
          ? 'Jobbra kanyarodás előtt az úttest jobb széléhez kell húzódni.'
          : 'Balra kanyarodás előtt kétirányú úton az úttest közepéhez kell besorolni.',
    },
  ]
}

// ---------------------------------------------------------------- Belépési pont

/**
 * Egy helyzethez tartozó kérdéssor. Kanyarodáskor először a besorolás/irányjelzés,
 * majd az elsőbbségi kérdés jön, mindkettő véletlenszerű változattal.
 */
export function buildPrompts(s: Situation, rng: Rng = Math.random): Prompt[] {
  // Körforgalom: előbb a behajtás, majd a körben a kihajtás
  if (s.kind === 'roundabout') {
    return [pick(roundaboutEntryPrompts(s), rng), pick(roundaboutExitPrompts(s), rng)].map((d) => withRealSigns(s, { ...d, options: shuffle(d.options, rng) }))
  }
  const main = allDrafts(s, rng)
  const result: Draft[] = []
  const turn = turnPrompts(s)
  if (turn.length) result.push(pick(turn, rng))
  if (main.length) result.push(pick(main, rng))
  return result.map((d) => withRealSigns(s, { ...d, options: shuffle(d.options, rng) }))
}

/** A helyszínen valóban álló táblák (OSM) a jelenetbe kerülnek, így a 3D nézet és a térkép a valós helyet mutatja */
function withRealSigns(s: Situation, p: Prompt): Prompt {
  return s.signs?.length ? { ...p, scene: { ...p.scene, extraSigns: s.signs } } : p
}

/** Egy helyzet összes lehetséges kérdésváltozata (teszteléshez és előnézethez) */
export function allDrafts(s: Situation, rng: Rng = Math.random): Prompt[] {
  switch (s.kind) {
    case 'stop':
      return stopPrompts(s)
    case 'give_way':
      return giveWayPrompts(s)
    case 'priority':
      return priorityPrompts(s)
    case 'equal':
      return equalPrompts(s)
    case 'signals':
      return signalPrompts(s)
    case 'roundabout':
      return [...roundaboutEntryPrompts(s), ...roundaboutExitPrompts(s)]
    case 'crossing':
      return crossingPrompts()
    case 'speed_change':
      return speedPrompts(s, rng)
    case 'rail_crossing':
      return railPrompts(s)
    case 'tram_stop':
      return tramPrompts(s)
    case 'bus_stop':
      return busPrompts()
    case 'hazard':
      return hazardPrompts()
  }
}

export function allPromptVariants(s: Situation): Prompt[] {
  return [...turnPrompts(s), ...allDrafts(s, () => 0.5)].map((p) => withRealSigns(s, p))
}

export const KIND_LABEL: Record<Situation['kind'], string> = {
  stop: 'STOP tábla',
  give_way: 'Elsőbbségadás kötelező',
  priority: 'Főútvonal',
  equal: 'Egyenrangú kereszteződés',
  signals: 'Jelzőlámpa',
  roundabout: 'Körforgalom',
  crossing: 'Zebra',
  speed_change: 'Sebességváltozás',
  rail_crossing: 'Vasúti átjáró',
  tram_stop: 'Villamosmegálló',
  bus_stop: 'Autóbuszmegálló',
  hazard: 'Váratlan helyzet',
}

export const TURN_LABEL: Record<Turn, string> = { straight: 'egyenesen', left: 'balra', right: 'jobbra' }
