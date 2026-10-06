import { at, drive, hold, kin, pulse, shifts, tEnd } from '../motion'
import type { FaultLesson } from '../types'
import { me, redLightWorld, STOP_AT } from './common'

// ---------------------------------------------------------------- 3/4

const s34 = kin(40, [{ to: 40, d: 25 }])
const w34 = kin(40, [{ to: 32, d: 24 }, { to: 0, d: 50 - STOP_AT - 24 }, { wait: 900 }])
const r34 = kin(40, [{ to: 30, d: 16 }, { to: 12, d: 16 }, { to: 0, d: 50 - STOP_AT - 32 }, { wait: 900 }])

export const L3_4: FaultLesson = {
  code: '3/4',
  title: 'Üresben gurulás',
  summary: 'Megállás előtt jó előre üresbe teszi a váltót, és üresben gurul a piros lámpáig.',
  world: redLightWorld(),
  actors: [me(75)],
  steps: [
    {
      phase: 'setup',
      title: 'Piros lámpa előtt',
      how: ['40 km/h-val, harmadik fokozatban haladsz.', 'Előtted a jelzőlámpa pirosat mutat: meg kell állnod a stopvonal előtt.'],
      ms: s34.ms,
      moves: { me: drive(s34).move },
      controls: { speed: drive(s34).speed, gear: hold('3'), gas: hold(0.15) },
      signals: { L: hold('red') },
    },
    {
      phase: 'wrong',
      title: 'Hibás: üresben gurul a lámpáig',
      how: [
        'A vezető már messze a lámpa előtt kinyomja a kuplungot, üresbe teszi a váltót, és a motor alapjáraton jár.',
        'Üresben a motor nem fékez, és a vezető nem tud azonnal gyorsítani, ha a helyzet úgy kívánja. Ez a 3/4-es hiba.',
      ],
      ms: w34.ms,
      moves: { me: drive(w34).move },
      controls: {
        speed: drive(w34).speed,
        gas: hold(0),
        clutch: pulse(0.02, 0.1),
        gear: at([0, '3'], [0.07, 'N']),
        brake: pulse(tEnd(w34, 0), tEnd(w34, 1), 0.45),
      },
      marks: [{ kind: 'label', at: [-4.5, 34], text: 'Üresben gurul', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: sebességben marad, a motor is fékez',
      how: [
        'Leveszed a gázt, és sebességben maradsz: a motor is fékezi az autót. Utána egyenletesen fékezel, és közben második fokozatba váltasz.',
        'A kuplungot csak közvetlenül a megállás előtt nyomod ki, hogy a motor ne fulladjon le. Állva üresbe teszed a váltót, és a lábad a féken marad.',
      ],
      ms: r34.ms,
      moves: { me: drive(r34).move },
      controls: {
        speed: drive(r34).speed,
        gas: hold(0),
        brake: at<number>([0, 0], [tEnd(r34, 0) - 0.02, 0], [tEnd(r34, 0), 0.25], [tEnd(r34, 1), 0.3], [tEnd(r34, 2), 0.4], [1, 0.4]),
        clutch: at<number>(
          [0, 0],
          [tEnd(r34, 0) + 0.04, 0],
          [tEnd(r34, 0) + 0.06, 1],
          [tEnd(r34, 0) + 0.12, 1],
          [tEnd(r34, 0) + 0.14, 0],
          [tEnd(r34, 1) - 0.02, 0],
          [tEnd(r34, 1), 1],
          [tEnd(r34, 2) + 0.03, 1],
          [tEnd(r34, 2) + 0.06, 0],
        ),
        gear: at([0, '3'], [tEnd(r34, 0) + 0.09, '2'], [tEnd(r34, 2) + 0.03, 'N']),
      },
    },
  ],
}

/** A lámpa előtti lassítás közös helyzete: 40 km/h, harmadikban, a lámpa piros */
const APPROACH = 50 - STOP_AT
const setupRed = (title: string, how: string[]): FaultLesson['steps'][number] => ({
  phase: 'setup',
  title,
  how,
  ms: s34.ms,
  moves: { me: drive(s34).move },
  controls: { speed: drive(s34).speed, gear: hold('3'), gas: hold(0.15) },
  signals: { L: hold('red') },
})

// ---------------------------------------------------------------- 3/1

const w31 = kin(40, [{ to: 30, d: 16 }, { to: 12, d: 16 }, { to: 0, d: APPROACH - 32 }, { wait: 1300 }])
const g31 = shifts('3', [tEnd(w31, 0) + 0.06, '2'])

export const L3_1: FaultLesson = {
  code: '3/1',
  title: 'Lefullad megálláskor',
  summary: 'Megálláskor nem nyomja ki időben a kuplungot, és a motor lefullad.',
  world: redLightWorld(),
  actors: [me(75)],
  steps: [
    setupRed('Megállás a piros lámpánál', ['40 km/h-val, harmadikban közeledsz a piros lámpához.', 'Meg kell állnod a stopvonal előtt.']),
    {
      phase: 'wrong',
      title: 'Hibás: sebességben, kuplung nélkül áll meg',
      how: [
        'A vizsgázó fékez, de a kuplungot nem nyomja ki: a fordulat az alapjárat alá esik, az autó megrándul, és a motor lefullad.',
        'Újra kell indítania a motort a kereszteződés előtt. Ez a 3/1-es hiba.',
      ],
      ms: w31.ms,
      moves: { me: drive(w31).move },
      controls: {
        speed: drive(w31).speed,
        gas: hold(0),
        brake: at<number>([0, 0], [tEnd(w31, 0) - 0.02, 0], [tEnd(w31, 0), 0.3], [tEnd(w31, 2), 0.4]),
        ...g31,
        engine: at([0, true], [tEnd(w31, 2) - 0.02, false]),
      },
      signals: { L: hold('red') },
      marks: [{ kind: 'label', at: [-4.5, STOP_AT], text: 'Lefulladt!', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: a megállás előtt kinyomja a kuplungot',
      how: [
        'Fékezel, és amikor a sebesség kb. 10–15 km/h-ra csökken (a fordulat az alapjárat közelébe ér), kinyomod a kuplungot.',
        'Kinyomott kuplunggal állsz meg, majd állva üresbe teszed a váltót: a motor jár tovább.',
      ],
      ms: r34.ms,
      moves: { me: drive(r34).move },
      controls: {
        speed: drive(r34).speed,
        gas: hold(0),
        brake: at<number>([0, 0], [tEnd(r34, 0) - 0.02, 0], [tEnd(r34, 0), 0.3], [tEnd(r34, 2), 0.4]),
        clutch: at<number>([0, 0], [tEnd(r34, 0) + 0.04, 0], [tEnd(r34, 0) + 0.06, 1], [tEnd(r34, 0) + 0.12, 1], [tEnd(r34, 0) + 0.14, 0], [tEnd(r34, 1) - 0.02, 0], [tEnd(r34, 1), 1], [tEnd(r34, 2) + 0.03, 1], [tEnd(r34, 2) + 0.06, 0]),
        gear: at([0, '3'], [tEnd(r34, 0) + 0.09, '2'], [tEnd(r34, 2) + 0.03, 'N']),
      },
      signals: { L: hold('red') },
    },
  ],
}

// ---------------------------------------------------------------- 3/2

const w32 = kin(40, [{ to: 37, d: 30 }, { slam: APPROACH - 30 }, { wait: 900 }])
const r32 = kin(40, [{ to: 20, d: 24 }, { to: 0, d: APPROACH - 24 }, { wait: 900 }])

export const L3_2: FaultLesson = {
  code: '3/2',
  title: 'Fékerő adagolása',
  summary: 'Előbb alig fékez, aztán az utolsó métereken teljes erővel: nem tudja adagolni a fékerőt.',
  world: redLightWorld(),
  actors: [me(75)],
  steps: [
    setupRed('Megállás a piros lámpánál', ['40 km/h-val közeledsz a piros lámpához.', 'A fékerőt úgy kell adagolni, hogy egyenletesen, a stopvonal előtt állj meg.']),
    {
      phase: 'wrong',
      title: 'Hibás: alig fékez, aztán beletapos',
      how: [
        'A vizsgázó túl gyengén nyomja a féket, az autó alig lassul. A stopvonal közelében észbe kap, és teljes erővel fékez: az utasok előrebillennek.',
        'A fékpedált a szükséges erővel kell nyomni, és a fékerőt menet közben adagolni kell. Ez a 3/2-es hiba.',
      ],
      ms: w32.ms,
      moves: { me: drive(w32).move },
      controls: { speed: drive(w32).speed, gas: hold(0), brake: at<number>([0, 0.08], [tEnd(w32, 0) - 0.02, 0.08], [tEnd(w32, 0), 0.95]), ...shifts('3', [tEnd(w32, 1) - 0.06, 'N']) },
      signals: { L: hold('red') },
      marks: [{ kind: 'label', at: [-4.5, STOP_AT + 4], text: 'Satufék!', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: időben, adagolva fékez',
      how: [
        'Időben kezdesz fékezni, közepes erővel, és figyeled, hogyan lassul az autó.',
        'Ha kell, növeled, a végén kicsit csökkented a fékerőt, így az autó rándulás nélkül áll meg a vonal előtt.',
      ],
      ms: r32.ms,
      moves: { me: drive(r32).move },
      controls: {
        speed: drive(r32).speed,
        gas: hold(0),
        brake: at<number>([0, 0.15], [0.1, 0.3], [tEnd(r32, 0), 0.35], [tEnd(r32, 1) - 0.06, 0.2], [tEnd(r32, 1), 0.3]),
        ...shifts('3', [tEnd(r32, 0) - 0.05, '2'], [tEnd(r32, 1) + 0.03, 'N']),
      },
      signals: { L: hold('red') },
    },
  ],
}

// ---------------------------------------------------------------- 3/3

const w33 = kin(40, [{ to: 28, d: 9 }, { to: 28, d: 6 }, { to: 14, d: 9 }, { to: 16, d: 6 }, { to: 0, d: APPROACH - 30 }, { wait: 900 }])
const r33 = kin(40, [{ to: 0, d: APPROACH }, { wait: 900 }])

export const L3_3: FaultLesson = {
  code: '3/3',
  title: 'Egyenetlen lassítás',
  summary: 'Lassításkor hol fékez, hol elengedi a féket: az autó bólogat.',
  world: redLightWorld(),
  actors: [me(75)],
  steps: [
    setupRed('Megállás a piros lámpánál', ['40 km/h-val közeledsz a piros lámpához.', 'A lassítás legyen egyenletes, az utasok ne dőljenek előre-hátra.']),
    {
      phase: 'wrong',
      title: 'Hibás: szaggatottan fékez',
      how: [
        'A vizsgázó rálép a fékre, elengedi, majd újra fékez: a sebesség lépcsőzetesen csökken, az autó bólogat.',
        'A mögötte haladó nem tudja kiszámítani, mire készül. Ez a 3/3-as hiba.',
      ],
      ms: w33.ms,
      moves: { me: drive(w33).move },
      controls: {
        speed: drive(w33).speed,
        gas: hold(0),
        brake: at<number>([0, 0.5], [tEnd(w33, 0) - 0.01, 0.5], [tEnd(w33, 0), 0], [tEnd(w33, 1), 0], [tEnd(w33, 1) + 0.01, 0.5], [tEnd(w33, 2) - 0.01, 0.5], [tEnd(w33, 2), 0], [tEnd(w33, 3), 0], [tEnd(w33, 3) + 0.01, 0.45]),
        ...shifts('3', [tEnd(w33, 2), '2'], [tEnd(w33, 4) + 0.02, 'N']),
      },
      signals: { L: hold('red') },
    },
    {
      phase: 'right',
      title: 'Helyes: egyenletes lassítás',
      how: ['Leveszed a gázt, és egyenletes, a távolsághoz illő erővel fékezel egészen a megállásig.', 'Közben visszaváltasz, és a megállás előtt kinyomod a kuplungot.'],
      ms: r33.ms,
      moves: { me: drive(r33).move },
      controls: {
        speed: drive(r33).speed,
        gas: hold(0),
        brake: at<number>([0, 0.1], [0.08, 0.3], [tEnd(r33, 0) - 0.06, 0.3], [tEnd(r33, 0), 0.35]),
        ...shifts('3', [0.4, '2'], [tEnd(r33, 0) + 0.03, 'N']),
      },
      signals: { L: hold('red') },
    },
  ],
}
