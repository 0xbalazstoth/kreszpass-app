import type { Situation, Turn } from './types'

export type SignType = 'stop' | 'give_way' | 'priority_road' | 'speed' | 'crossing' | 'roundabout'
export type LightState = 'green' | 'yellow' | 'red' | 'red_yellow' | 'flashing_yellow'
export type Side = 'left' | 'right' | 'ahead'

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

function roundaboutPrompts(): Draft[] {
  const base = { layout: 'roundabout' as const, turn: 'straight' as Turn, mySign: 'roundabout' as const }
  return [
    {
      id: 'roundabout:entry',
      title: 'Körforgalom',
      text: 'Körforgalomhoz érsz, a körben balról egy autó közeledik. Mi a teendőd?',
      scene: { ...base, cars: [{ from: 'left', intent: 'straight' }] },
      options: [
        ok('Elengedem a körben haladót, utána hajtok be'),
        bad('Behajtok, mert jobbról nem jön senki', '8/24'),
        bad('Behajtok, ő majd lassít', '8/24'),
      ],
      timeoutCode: '8/25',
      explanation: 'A körforgalomba behajtó köteles elsőbbséget adni a körben haladónak.',
    },
    {
      id: 'roundabout:signal',
      title: 'Körforgalom, irányjelzés',
      text: 'Körforgalomban a második kijáraton hajtasz ki. Hogyan adsz irányjelzést?',
      scene: { ...base, cars: [] },
      options: [
        ok('Kihajtás előtt, időben jobbra jelzek'),
        bad('A körben végig balra jelzek', '8/30'),
        bad('Nem jelzek, körforgalomban nem kell', '8/6'),
      ],
      timeoutCode: '8/25',
      explanation: 'A körforgalomból kihajtás előtt jobbra kell irányjelzést adni. A körben balra jelezni megtévesztő.',
    },
    {
      id: 'roundabout:exit_ped',
      title: 'Kihajtás, zebra',
      text: 'Kihajtasz a körforgalomból, a kijárati zebrán egy gyalogos halad át. Mi a teendőd?',
      scene: { ...base, cars: [], pedestrian: { where: 'exit_crossing', state: 'crossing' } },
      options: [
        ok('Megállok a zebra előtt, és átengedem'),
        bad('Kihajtok, mert a körben nekem van elsőbbségem', '8/27'),
        bad('Mögötte gyorsan kihajtok', '8/27'),
      ],
      timeoutCode: '8/25',
      explanation: 'A kijelölt gyalogos-átkelőhelyen áthaladó gyalogosnak elsőbbséget kell adni.',
    },
  ]
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

function turnPrompts(s: Situation): Draft[] {
  if (s.turn === 'straight' || s.kind === 'roundabout') return []
  const dir = s.turn === 'left' ? 'Balra' : 'Jobbra'
  return [
    {
      id: 'turn:sequence',
      title: `${dir} kanyarodás előtt`,
      text: `${dir} fogsz kanyarodni. Mi a helyes sorrend?`,
      scene: junctionScene(s.turn, {}),
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
      scene: junctionScene(s.turn, {}),
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
  const main = allDrafts(s, rng)
  const result: Draft[] = []
  const turn = turnPrompts(s)
  if (turn.length) result.push(pick(turn, rng))
  if (main.length) result.push(pick(main, rng))
  return result.map((d) => ({ ...d, options: shuffle(d.options, rng) }))
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
      return roundaboutPrompts()
    case 'crossing':
      return crossingPrompts()
    case 'speed_change':
      return speedPrompts(s, rng)
  }
}

export function allPromptVariants(s: Situation): Prompt[] {
  return [...turnPrompts(s), ...allDrafts(s, () => 0.5)]
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
}

export const TURN_LABEL: Record<Turn, string> = { straight: 'egyenesen', left: 'balra', right: 'jobbra' }
