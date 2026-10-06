import { pathLength, type Segment } from '../../maneuvers/geometry'
import { arcL, arcR, at, drive, during, hold, kin, laneShift, pulse, ramp, shifts, st, stepTo, tEnd } from '../motion'
import type { FaultLesson, FaultStep } from '../types'
import { junction, LANE, PARKED_X, signRight, STOP_Z, straightRoad, withWorld, zebra } from '../world'
import { actor, E, FRONT, me, MY_X, N, ONCOMING_X, PARTNER_COLORS, pose, redLightWorld, RIGHT_R, rightTurnZ, S, STOP_AT, W } from './common'

const P = PARTNER_COLORS

// ---------------------------------------------------------------- 6/1

const giveWayWorld = () =>
  withWorld(junction({ arm: 100, myLine: 'give_way' }), { signs: [signRight('B-001', STOP_Z + 1.2)], bounds: [-16, -24, 16, 100], view: [30, 48] })
const s61 = kin(40, [{ to: 40, d: 10 }])
const w61 = kin(40, [{ to: 20, d: 18 }, { to: 20, d: 80 - 18 - STOP_AT - 7 }, { to: 0, d: 7 }, { wait: 800 }])
const r61 = kin(40, [{ to: 40, d: 80 - STOP_AT - 30 }, { to: 0, d: 30 }, { wait: 800 }])

export const L6_1: FaultLesson = {
  code: '6/1',
  title: 'Túl korai lassítás',
  summary: 'Az elsőbbségadás kötelező tábla előtt már messze, indokolatlanul lelassít, és lassan araszol a kereszteződésig.',
  world: giveWayWorld(),
  actors: [me(90)],
  steps: [
    {
      phase: 'setup',
      title: 'Elsőbbségadás kötelező tábla előtt',
      how: ['Alárendelt úton közeledsz egy kereszteződéshez: elsőbbségadás kötelező tábla és cápafogak jelzik.', 'A tábla még kb. 80 méterre van, az út szabad.'],
      ms: s61.ms,
      moves: { me: drive(s61).move },
      controls: { speed: drive(s61).speed, gear: hold('3'), gas: hold(0.2) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: 80 méterrel előtte lelassít',
      how: [
        'A vizsgázó már messze a kereszteződés előtt 20 km/h-ra lassít, és így araszol végig, holott ott még semmi sem indokolja.',
        'A mögötte haladókat feleslegesen feltartja. A lassítást a körülményekhez képest túl korán kezdeni a 6/1-es hiba.',
      ],
      ms: w61.ms,
      moves: { me: drive(w61).move },
      controls: { speed: drive(w61).speed, gas: at<number>([0, 0], [tEnd(w61, 0), 0.08], [tEnd(w61, 1), 0]), brake: at<number>([0, 0.25], [tEnd(w61, 0), 0], [tEnd(w61, 1), 0], [tEnd(w61, 1) + 0.01, 0.3]), ...shifts('3', [tEnd(w61, 0) - 0.03, '2']) },
      marks: [{ kind: 'zone', rect: { x: MY_X, z: 60, w: LANE, d: 36 }, bad: true, label: 'Feleslegesen lassú' }],
    },
    {
      phase: 'right',
      title: 'Helyes: a kereszteződés előtt, egyenletesen lassít',
      how: [
        'Tartod a tempót, amíg lehet, és kb. 30 méterrel a kereszteződés előtt kezdesz egyenletesen lassítani.',
        'A cápafogaknál megállsz (vagy annyira lelassítasz, hogy szükség esetén meg tudj állni), és körülnézel balra, jobbra.',
      ],
      ms: r61.ms,
      moves: { me: drive(r61).move },
      controls: { speed: drive(r61).speed, gas: stepTo(0.2, 0, tEnd(r61, 0)), brake: pulse(tEnd(r61, 0) + 0.02, 1, 0.3), ...shifts('3', [tEnd(r61, 0) + 0.18, '2'], [tEnd(r61, 1) - 0.03, 'N']) },
      look: at([0, 'ahead'], [tEnd(r61, 1) - 0.04, 'left'], [tEnd(r61, 1) + 0.03, 'right']),
    },
  ],
}

// ---------------------------------------------------------------- 6/2

const zebraWorld = () => withWorld(straightRoad({ south: 80, north: -60 }), { markings: zebra(0), signs: [signRight('E-038', 2.4)] })
const PED_X = LANE + 1.1
/** A gyalogos a járdán sétál a zebra felé, ott befordul, és átkel */
const pedWalk: Segment[] = [st(8), arcL(0.4, 90), st(PED_X * 2 - 0.8)]
const WALK = pathLength(pedWalk)
const PED_V = 1.3
const s62 = kin(40, [{ to: 40, d: 20 }])
const s62ms = s62.ms
const pedAfter = (ms: number) => Math.min(1, (PED_V * (s62ms + ms)) / 1000 / WALK)
/** A gyalogos mozgása egy lépésben (a lépés hossza ms): a helyzet ideje után folytatja */
const pedMove = (stepMs: number, startMs: number) => {
  const a = pedAfter(startMs)
  const b = pedAfter(startMs + stepMs)
  return { path: pedWalk, profile: [[0, a], [1, b]] as [number, number][] }
}
const stopFront = (gap: number) => 1.5 + gap + FRONT
const w62a = kin(40, [{ to: 40, d: 30 }, { to: 0, d: 50 - stopFront(1.2) - 30 }])
const w62 = kin(40, [{ to: 40, d: 30 }, { to: 0, d: 50 - stopFront(1.2) - 30 }, { wait: Math.max(600, 10500 - w62a.ms) }, { to: 20, d: 16 }])
const r62a = kin(40, [{ to: 25, d: 22 }, { to: 0, d: 50 - stopFront(4) - 22 }])
const r62 = kin(40, [{ to: 25, d: 22 }, { to: 0, d: 50 - stopFront(4) - 22 }, { wait: Math.max(600, 10500 - r62a.ms) }, { to: 20, d: 16 }])

export const L6_2: FaultLesson = {
  code: '6/2',
  title: 'Lassú helyzetfelismerés',
  summary: 'Csak akkor veszi észre a zebra felé tartó gyalogost, amikor az már lelép: erősen kell fékeznie.',
  world: zebraWorld(),
  actors: [me(70), { id: 'ped', kind: 'ped', color: '#7c3aed', start: pose(PED_X, 8, N) }],
  steps: [
    {
      phase: 'setup',
      title: 'Gyalogos a zebra felé tart',
      how: ['40 km/h-val közeledsz egy kijelölt gyalogos-átkelőhelyhez.', 'A jobb oldali járdán egy gyalogos határozottan a zebra felé sétál: valószínűleg át akar kelni.'],
      ms: s62ms,
      moves: { me: drive(s62).move, ped: pedMove(s62ms, -s62ms) },
      controls: { speed: drive(s62).speed, gear: hold('3'), gas: hold(0.2) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: későn ismeri fel, erősen fékez',
      how: [
        'A vizsgázó nem figyel a járdára: csak akkor fékez, amikor a gyalogos már a zebrára lép, és erős fékezéssel, közvetlenül a zebra előtt áll meg.',
        'A helyzetet időben fel kellett volna ismernie. Ez a 6/2-es hiba.',
      ],
      ms: w62.ms,
      moves: { me: drive(w62).move, ped: pedMove(w62.ms, 0) },
      controls: { speed: drive(w62).speed, gas: stepTo(0.2, 0, tEnd(w62, 0)), brake: pulse(tEnd(w62, 0), tEnd(w62, 2), 0.6), ...shifts('3', [tEnd(w62, 1) - 0.03, 'N'], [tEnd(w62, 2) - 0.04, '1']) },
      look: at([0, 'ahead']),
      marks: [{ kind: 'gap', a: 'me', b: 'ped', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: már a járdán észreveszi',
      how: [
        'Már messziről észreveszed a zebra felé tartó gyalogost: leveszed a gázt, fékkészenlétbe helyezed a lábad, és lassítasz.',
        'Kényelmesen, a zebra előtt pár méterrel megállsz, és megvárod, amíg átér.',
      ],
      ms: r62.ms,
      moves: { me: drive(r62).move, ped: pedMove(r62.ms, 0) },
      controls: { speed: drive(r62).speed, gas: stepTo(0.2, 0, 0.02), brake: pulse(tEnd(r62, 0) - 0.04, tEnd(r62, 2), 0.3), ...shifts('3', [tEnd(r62, 0), '2'], [tEnd(r62, 1) - 0.03, 'N'], [tEnd(r62, 2) - 0.04, '1']) },
      look: at([0, 'right'], [0.12, 'ahead']),
      marks: [{ kind: 'gap', a: 'me', b: 'ped' }],
    },
  ],
}

// ---------------------------------------------------------------- 6/3

const stopWorld = () =>
  withWorld(junction({ arm: 90, myLine: 'stop' }), { signs: [signRight('B-002', STOP_Z + 1.2)], bounds: [-30, -40, 30, 70], view: [44, 52] })
const s63 = kin(30, [{ to: 30, d: 20 }])
const cross: Segment[] = [st(200)]
const p63 = kin(40, [{ to: 40, d: 260 }])
const FAR_BACK = STOP_AT + 8
const w63 = kin(30, [{ to: 0, d: 40 - FAR_BACK }, { wait: 2000 }, { to: 8, d: 4 }, { to: 0, d: 4 }, { wait: 1800 }, { to: 25, d: 22 }])
const r63 = kin(30, [{ to: 0, d: 40 - STOP_AT }, { wait: 2600 }, { to: 25, d: 22 }])

export const L6_3: FaultLesson = {
  code: '6/3',
  title: 'Rossz helyen áll meg',
  summary: 'A STOP táblánál messze a vonal előtt áll meg, ahonnan a keresztező utat nem látja.',
  world: stopWorld(),
  actors: [me(60), actor('p', 'car', pose(-70, MY_X, E), P[0])],
  steps: [
    {
      phase: 'setup',
      title: '„Állj! Elsőbbségadás kötelező”',
      how: ['STOP táblához közeledsz: a stopvonalnál meg kell állnod, és elsőbbséget kell adnod.', 'A sarkon álló házak takarják a keresztező utat: balról egy autó közeledik.'],
      ms: s63.ms,
      moves: { me: drive(s63).move, p: drive(p63, cross, s63.ms).move },
      controls: { speed: drive(s63).speed, gear: hold('2'), gas: hold(0.1) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: 8 méterrel a vonal előtt áll meg',
      how: [
        'A vizsgázó messze a stopvonal előtt megáll, ahonnan a házak miatt semmit sem lát a keresztező útból. Újra el kell indulnia, és a vonalnál még egyszer megállnia.',
        'Ott kell megállni, ahonnan a forgalmi helyzet felismerhető. Ez a 6/3-as hiba.',
      ],
      ms: w63.ms,
      moves: { me: drive(w63).move, p: drive(p63, cross, w63.ms).move },
      controls: { speed: drive(w63).speed, brake: at<number>([0, 0.3], [tEnd(w63, 1), 0.3], [tEnd(w63, 1) + 0.01, 0], [tEnd(w63, 2), 0], [tEnd(w63, 2) + 0.01, 0.3], [tEnd(w63, 4), 0.3], [tEnd(w63, 4) + 0.01, 0]), gas: at<number>([0, 0], [tEnd(w63, 4), 0.25]) },
      look: at([0, 'ahead'], [tEnd(w63, 0), 'left'], [tEnd(w63, 0) + 0.08, 'right'], [tEnd(w63, 1), 'ahead'], [tEnd(w63, 3), 'left'], [tEnd(w63, 3) + 0.04, 'right'], [tEnd(w63, 4), 'ahead']),
      marks: [{ kind: 'zone', rect: { x: MY_X, z: STOP_AT - 1, w: LANE, d: 5 }, label: 'Innen látna ki' }],
    },
    {
      phase: 'right',
      title: 'Helyes: a stopvonalnál áll meg, onnan körülnéz',
      how: [
        'Egyenletesen lassítva pontosan a stopvonal előtt állsz meg: innen már belátod a keresztező utat.',
        'Balra, jobbra, majd újra balra nézel, elengeded a balról érkezőt, és csak utána indulsz.',
      ],
      ms: r63.ms,
      moves: { me: drive(r63).move, p: drive(p63, cross, r63.ms).move },
      controls: { speed: drive(r63).speed, brake: pulse(0.04, tEnd(r63, 1), 0.3), gas: stepTo(0, 0.25, tEnd(r63, 1)) },
      look: at([0, 'ahead'], [tEnd(r63, 0) - 0.04, 'left'], [tEnd(r63, 0) + 0.03, 'right'], [tEnd(r63, 0) + 0.07, 'left'], [tEnd(r63, 1), 'ahead']),
    },
  ],
}

// ---------------------------------------------------------------- 6/4

const s64 = kin(40, [{ to: 40, d: 20 }])
const w64 = kin(40, [{ to: 40, d: 15 }, { to: 0, d: 55 - STOP_AT - 15 }, { wait: 800 }])
const r64 = kin(40, [{ to: 0, d: 55 - STOP_AT }, { wait: 800 }])
const yellowThenRed = (ms: number) => at<'green' | 'yellow' | 'red'>([0, 'green'], [0.03, 'yellow'], [Math.min(0.95, 3000 / ms), 'red'])

export const L6_4: FaultLesson = {
  code: '6/4',
  title: 'Késve reagál a jelzésre',
  summary: 'A sárgára váltó lámpára kissé késve, de még időben reagál.',
  world: redLightWorld(),
  actors: [me(75)],
  steps: [
    {
      phase: 'setup',
      title: 'Zöld lámpa felé',
      how: ['40 km/h-val közeledsz egy zöld lámpához.', 'A lámpa bármikor sárgára válthat: figyeld folyamatosan.'],
      ms: s64.ms,
      moves: { me: drive(s64).move },
      controls: { speed: drive(s64).speed, gear: hold('3'), gas: hold(0.2) },
      signals: { L: hold('green') },
    },
    {
      phase: 'wrong',
      title: 'Hibás: egy pillanatig még gázt ad',
      how: [
        'A lámpa sárgára vált, de a vizsgázó még egy-két másodpercig változatlanul halad, csak utána fékez, erősebben a kelleténél.',
        'Végül szabályosan megáll, de késve reagált. Ez a 6/4-es hiba.',
      ],
      ms: w64.ms,
      moves: { me: drive(w64).move },
      controls: { speed: drive(w64).speed, gas: stepTo(0.2, 0, tEnd(w64, 0)), brake: pulse(tEnd(w64, 0) + 0.01, 1, 0.45), ...shifts('3', [tEnd(w64, 1) - 0.04, 'N']) },
      signals: { L: yellowThenRed(w64.ms) },
    },
    {
      phase: 'right',
      title: 'Helyes: azonnal lassít',
      how: ['Amint a lámpa sárgára vált (és még biztonságosan meg tudsz állni), leveszed a gázt, és egyenletesen fékezel.', 'Nyugodtan, a stopvonal előtt állsz meg.'],
      ms: r64.ms,
      moves: { me: drive(r64).move },
      controls: { speed: drive(r64).speed, gas: stepTo(0.2, 0, 0.03), brake: pulse(0.06, 1, 0.3), ...shifts('3', [0.5, '2'], [tEnd(r64, 0) - 0.04, 'N']) },
      signals: { L: yellowThenRed(r64.ms) },
    },
  ],
}

// ---------------------------------------------------------------- 6/5, 6/6

const go = (wait: number) => kin(0, [{ wait }, { to: 20, d: 22 }])
const atRedSetup = (title: string, how: string[], controls: FaultStep['controls']): FaultStep => ({
  phase: 'setup',
  title,
  how,
  ms: 2400,
  controls,
  signals: { L: hold('red') },
})
const w65 = go(4200)
const r65 = go(1500)
const signal65 = (ms: number, greenAt: number) => at<'red' | 'red_yellow' | 'green'>([0, 'red'], [0.04, 'red_yellow'], [greenAt / ms, 'green'])

export const L6_5: FaultLesson = {
  code: '6/5',
  title: 'Nem készül fel az indulásra',
  summary: 'Piros-sárga jelzésnél nem kapcsol sebességbe, ezért zöldnél csak késve indul.',
  world: redLightWorld(),
  actors: [me(STOP_AT)],
  steps: [
    atRedSetup('Várakozás a piros lámpánál', ['A stopvonalnál állsz, üresben, a lábad a féken.', 'A piros-sárga jelzés azt jelenti: hamarosan zöld jön, készülj fel az indulásra.'], { gear: hold('N'), brake: hold(0.3) }),
    {
      phase: 'wrong',
      title: 'Hibás: csak zöldnél kezd készülődni',
      how: [
        'Piros-sárgánál a vizsgázó semmit sem csinál. Csak zöldnél nyomja ki a kuplungot és kapcsol egyesbe, ezért több másodperc után indul el.',
        'A mögötte állók feleslegesen várnak. Ez a 6/5-ös hiba.',
      ],
      ms: w65.ms,
      moves: { me: drive(w65).move },
      signals: { L: signal65(w65.ms, 1500) },
      controls: { speed: drive(w65).speed, clutch: at<number>([0, 0], [1700 / w65.ms, 1], [tEnd(w65, 0) - 0.02, 1], [tEnd(w65, 0) + 0.12, 0]), gear: at([0, 'N'], [2600 / w65.ms, '1']), brake: stepTo(0.3, 0, tEnd(w65, 0)), gas: stepTo(0, 0.25, tEnd(w65, 0) - 0.02) },
      marks: [{ kind: 'label', at: [-4.5, STOP_AT], text: 'Késik', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: piros-sárgánál egyesbe kapcsol',
      how: ['Piros-sárgánál kinyomod a kuplungot, és egyesbe kapcsolsz: készen állsz.', 'Zöldnél azonnal, egyenletesen elindulsz (de csak ha a kereszteződés szabad).'],
      ms: r65.ms,
      moves: { me: drive(r65).move },
      signals: { L: signal65(r65.ms, 1500) },
      controls: { speed: drive(r65).speed, clutch: at<number>([0, 0], [0.06, 1], [tEnd(r65, 0) - 0.02, 1], [tEnd(r65, 0) + 0.12, 0]), gear: at([0, 'N'], [0.1, '1']), brake: stepTo(0.3, 0, tEnd(r65, 0)), gas: stepTo(0, 0.25, tEnd(r65, 0) - 0.02) },
    },
  ],
}

const w66 = go(6500)

export const L6_6: FaultLesson = {
  code: '6/6',
  title: 'Kuplung lenyomva a piros alatt',
  summary: 'Tilos jelzésnél végig benyomott kuplunggal, sebességben áll.',
  world: redLightWorld(),
  actors: [me(STOP_AT)],
  steps: [
    atRedSetup('Hosszú piros', ['A stopvonalnál megálltál, a lámpa még sokáig pirosat mutat.', 'Álló helyzetben a kuplungot nem kell (és nem is szabad) végig lenyomva tartani.'], { gear: hold('1'), clutch: hold(1), brake: hold(0.3) }),
    {
      phase: 'wrong',
      title: 'Hibás: végig kuplungon, egyesben áll',
      how: [
        'A vizsgázó a teljes piros alatt egyesben, lenyomott kuplunggal áll. Ez koptatja a kuplungot, és ha a lába lecsúszik, az autó előreugrik.',
        'Tilos jelzésnél benyomott kuplunggal, sebességben állni a 6/6-os hiba.',
      ],
      ms: w66.ms,
      moves: { me: drive(w66).move },
      signals: { L: at([0, 'red'], [4800 / w66.ms, 'red_yellow'], [6300 / w66.ms, 'green']) },
      controls: { speed: drive(w66).speed, clutch: at<number>([0, 1], [tEnd(w66, 0) - 0.02, 1], [tEnd(w66, 0) + 0.1, 0]), gear: hold('1'), brake: stepTo(0.3, 0, tEnd(w66, 0)), gas: stepTo(0, 0.25, tEnd(w66, 0) - 0.02) },
      marks: [{ kind: 'label', at: [-5, STOP_AT], text: 'Kuplungon áll', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: üresben vár, piros-sárgánál kapcsol',
      how: ['Megállás után üresbe teszed a váltót, felengeded a kuplungot, és a fékkel (hosszabb várakozásnál kéziféket is húzva) tartod az autót.', 'Piros-sárgánál kuplung, egyes fokozat, és zöldnél indulsz.'],
      ms: w66.ms,
      moves: { me: drive(w66).move },
      signals: { L: at([0, 'red'], [4800 / w66.ms, 'red_yellow'], [6300 / w66.ms, 'green']) },
      controls: {
        speed: drive(w66).speed,
        gear: at([0, '1'], [0.06, 'N'], [5000 / w66.ms, '1']),
        clutch: at<number>([0, 1], [0.08, 1], [0.12, 0], [4900 / w66.ms, 0], [4950 / w66.ms, 1], [tEnd(w66, 0) - 0.02, 1], [tEnd(w66, 0) + 0.1, 0]),
        brake: stepTo(0.3, 0, tEnd(w66, 0)),
        gas: stepTo(0, 0.25, tEnd(w66, 0) - 0.02),
      },
    },
  ],
}

// ---------------------------------------------------------------- 6/7

const PED7 = pose(PED_X, 0, W)
const s67 = kin(40, [{ to: 40, d: 20 }])
const w67own = kin(40, [{ to: 0, d: 40 - 6.55 }, { wait: 8000 }])
const W67 = 14000
const o67 = kin(40, [{ to: 40, d: 70 }, { slam: 14.45 }, { wait: 6000 }])
const r67 = kin(40, [{ to: 35, d: 10 }, { to: 35, d: 70 }])
const o67r = kin(40, [{ to: 40, d: 200 }])

export const L6_7: FaultLesson = {
  code: '6/7',
  title: 'Gyalogosok „csalogatása”',
  summary: 'Zebra nélküli helyen megáll, és átinti a gyalogost, aki a szemközti forgalom elé lép.',
  world: straightRoad({ south: 80, north: -130 }),
  actors: [me(60), actor('ped', 'ped', PED7, '#db2777'), actor('o', 'car', pose(ONCOMING_X, -110, S), P[2])],
  steps: [
    {
      phase: 'setup',
      title: 'Gyalogos a járda szélén',
      how: ['Egy gyalogos a járda szélén áll, és láthatóan át akar menni az úttesten. Itt nincs kijelölt gyalogos-átkelőhely.', 'Szemből egy autó közeledik.'],
      ms: s67.ms,
      moves: { me: drive(s67).move, o: drive(o67r, undefined, s67.ms).move },
      controls: { speed: drive(s67).speed, gear: hold('3'), gas: hold(0.2) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: megáll és átinti',
      how: [
        'A vizsgázó indokolatlanul megáll, és átinti a gyalogost. A gyalogos elindul, de a szemközti sávban érkező autót már nem látja a megálló autótól: az csak vészfékezéssel tud megállni.',
        'Félreérthető viselkedéssel a gyalogosokat az úttestre „csalogatni” a 6/7-es hiba.',
      ],
      ms: W67,
      moves: { me: drive(w67own, undefined, W67).move, ped: during([st(PED_X * 2)], 6500 / W67, 13600 / W67), o: drive(o67, undefined, W67).move },
      controls: { speed: drive(w67own, undefined, W67).speed, gas: hold(0), brake: pulse(0.02, 1, 0.3), ...shifts('3', [tEnd(w67own, 0, W67) - 0.03, 'N']) },
      marks: [{ kind: 'label', at: [-5.5, -8], text: 'Vészfékez!', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: egyértelműen, egyenletesen halad tovább',
      how: [
        'Kicsit lassítasz és fékkészenlétben figyeled a gyalogost, de egyenletes tempóval, egyértelműen haladsz tovább: neki kell megvárnia a szabad utat.',
        'Így a gyalogos nem kerül a szemközti forgalom elé.',
      ],
      ms: r67.ms,
      moves: { me: drive(r67).move, o: drive(o67r, undefined, r67.ms).move },
      controls: { speed: drive(r67).speed, gas: at<number>([0, 0], [tEnd(r67, 0), 0.15]) },
    },
  ],
}

// ---------------------------------------------------------------- 6/8

const TURN_FROM = 55
const turnPath: Segment[] = [st(TURN_FROM - rightTurnZ()), arcR(RIGHT_R, 90), st(12)]
const TURN = pathLength(turnPath)
const s68 = kin(40, [{ to: 40, d: 15 }])
const r68 = kin(40, [{ to: 40, d: 10 }, { to: 15, d: TURN_FROM - rightTurnZ() - 10 }, { to: 15, d: TURN - (TURN_FROM - rightTurnZ()) }])

export const L6_8: FaultLesson = {
  code: '6/8',
  title: 'Késői, rövid irányjelzés',
  summary: 'Az irányjelzőt csak a kanyarodás pillanatában kapcsolja be.',
  world: withWorld(junction({ arm: 80 }), { bounds: [-14, -24, 30, 80], view: [34, 50] }),
  actors: [me(TURN_FROM + 15)],
  steps: [
    {
      phase: 'setup',
      title: 'Jobbra kanyarodás előtt',
      how: ['A következő kereszteződésben jobbra kanyarodsz.', 'Az irányjelzést annyival előbb kell bekapcsolni, hogy a többiek felkészülhessenek a manőveredre.'],
      ms: s68.ms,
      moves: { me: drive(s68).move },
      controls: { speed: drive(s68).speed, gear: hold('3'), gas: hold(0.2) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: a kanyarban kapcsol jelzést',
      how: [
        'A vizsgázó csak akkor kapcsolja be az irányjelzőt, amikor már fordítja a kormányt: egy-két villanás után ki is kapcsol.',
        'Nem félrevezető, de nem kellő időben és ideig jelzett. Ez a 6/8-as hiba.',
      ],
      ms: r68.ms,
      moves: { me: drive(r68, turnPath).move },
      controls: { speed: drive(r68, turnPath).speed, gas: stepTo(0.2, 0, tEnd(r68, 0)), brake: pulse(tEnd(r68, 0) + 0.02, tEnd(r68, 1) - 0.02, 0.3), indicator: at([0, 'off'], [tEnd(r68, 1) - 0.02, 'right'], [tEnd(r68, 1) + 0.1, 'off']), ...shifts('3', [0.55, '2']) },
      marks: [{ kind: 'label', at: [12, 8], text: 'Késve jelez', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: 30–50 méterrel előtte jelez',
      how: ['Tükörbe nézel, és már a lassítás előtt, kb. 30–50 méterrel a kereszteződés előtt bekapcsolod a jobb irányjelzőt.', 'A jelzés a kanyarodás végéig ég, és utána kikapcsol.'],
      ms: r68.ms,
      moves: { me: drive(r68, turnPath).move },
      controls: { speed: drive(r68, turnPath).speed, gas: stepTo(0.2, 0, tEnd(r68, 0)), brake: pulse(tEnd(r68, 0) + 0.02, tEnd(r68, 1) - 0.02, 0.3), indicator: at([0, 'right'], [0.92, 'off']), ...shifts('3', [0.55, '2']) },
      look: at([0, 'mirror_right'], [0.06, 'ahead']),
    },
  ],
}

// ---------------------------------------------------------------- 6/9

const pullOut: Segment[] = [...laneShift(MY_X - PARKED_X, 10), st(14)]
const PULL = pathLength(pullOut)
const b69 = kin(40, [{ to: 40, d: 220 }])
const b69w = kin(40, [{ to: 40, d: 22 }, { to: 12, d: 22 }, { to: 12, d: 60 }])
const w69 = kin(0, [{ wait: 400 }, { to: 18, d: 8 }, { to: 18, d: PULL - 8 }])
const r69 = kin(0, [{ wait: 6200 }, { to: 18, d: 8 }, { to: 18, d: PULL - 8 }])
const kerbWorld = () => straightRoad({ parking: true, south: 90, north: -90 })

export const L6_9: FaultLesson = {
  code: '6/9',
  title: 'Nem győződik meg róla, hogy észlelték a jelzését',
  summary: 'Bekapcsolja az irányjelzőt, és azonnal kihúzódik a hátulról közeledő autó elé.',
  world: kerbWorld(),
  actors: [me(10, PARKED_X), actor('a', 'car', pose(PARKED_X, -6), P[4]), actor('c', 'car', pose(PARKED_X, 18), P[6]), actor('b', 'car', pose(MY_X, 80), P[1])],
  steps: [
    {
      phase: 'setup',
      title: 'Kihúzódás a járda mellől',
      how: ['A járda mellől indulsz, a tükörben egy közeledő autót látsz.', 'Az irányjelzés nem ad elsőbbséget: meg kell győződnöd róla, hogy a többiek észlelték, és el is tudnak engedni.'],
      ms: 2000,
      moves: { b: drive(b69, undefined, 2000).move },
      controls: { gear: hold('1'), clutch: hold(1), handbrake: hold(true) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: jelez és azonnal kihúzódik',
      how: [
        'A vizsgázó bekapcsolja a bal irányjelzőt, és rögtön ki is húzódik: a hátulról jövő autónak erősen fékeznie kell.',
        'Nem győződött meg arról, hogy a jelzését észlelték, és a másik el tudja engedni. Ez a 6/9-es hiba.',
      ],
      ms: w69.ms,
      moves: { me: drive(w69, pullOut).move, b: drive(b69w, undefined, w69.ms).move },
      controls: { speed: drive(w69, pullOut).speed, handbrake: at([0, true], [0.02, false]), clutch: ramp(1, 0, 0.04, 0.2), gas: hold(0.25), indicator: at([0, 'left'], [0.75, 'off']) },
      marks: [{ kind: 'gap', a: 'b', b: 'me', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: jelez, figyel, elengedi',
      how: [
        'Bekapcsolod az irányjelzőt, és a tükörben, majd a vállad fölött figyeled a közeledőt: nem lassít, tehát nem enged ki.',
        'Megvárod, amíg elhalad, újra körülnézel, és csak akkor húzódsz ki, amikor a sáv szabad.',
      ],
      ms: r69.ms,
      moves: { me: drive(r69, pullOut).move, b: drive(b69, undefined, r69.ms).move },
      controls: {
        speed: drive(r69, pullOut).speed,
        handbrake: at([0, true], [tEnd(r69, 0) - 0.02, false]),
        clutch: ramp(1, 0, tEnd(r69, 0) - 0.02, tEnd(r69, 0) + 0.1),
        gas: stepTo(0, 0.25, tEnd(r69, 0) - 0.02),
        indicator: at([0, 'left'], [0.92, 'off']),
      },
      look: at([0, 'mirror_left'], [0.25, 'shoulder_left'], [0.4, 'mirror_left'], [tEnd(r69, 0) - 0.06, 'shoulder_left'], [tEnd(r69, 0), 'ahead']),
    },
  ],
}

// ---------------------------------------------------------------- 6/10

const A_TURN_FROM = 28.3
const aPath: Segment[] = [st(A_TURN_FROM - rightTurnZ()), arcR(RIGHT_R, 90), st(60)]
const s610 = kin(40, [{ to: 40, d: 16.7 }])
const a610 = kin(40, [{ to: 15, d: A_TURN_FROM - rightTurnZ() }, { to: 15, d: (Math.PI / 2) * RIGHT_R }, { to: 30, d: 60 }])
const w610 = kin(40, [{ to: 40, d: 16 }, { to: 12, d: 14 }, { to: 12, d: 6 }, { to: 35, d: 30 }])
const r610 = kin(40, [{ to: 22, d: 22 }, { to: 22, d: 14 }, { to: 35, d: 30 }])

export const L6_10: FaultLesson = {
  code: '6/10',
  title: 'Lassú reagálás a partner jelzésére',
  summary: 'Az előtte haladó jobbra kanyarodását jelzi és lassít, de csak az utolsó pillanatban fékez.',
  world: withWorld(junction({ arm: 100 }), { bounds: [-14, -40, 30, 90], view: [34, 54] }),
  actors: [me(75), actor('a', 'car', pose(MY_X, 45), P[5])],
  steps: [
    {
      phase: 'setup',
      title: 'Az előtted haladó jobbra jelez',
      how: ['Egy autó mögött haladsz 40 km/h-val. Bekapcsolja a jobb irányjelzőjét: be fog fordulni, ezért lassítani fog.', 'A partner jelzésére időben kell reagálni.'],
      ms: s610.ms,
      moves: { me: drive(s610).move, a: drive(s610).move },
      controls: { speed: drive(s610).speed, gear: hold('3'), gas: hold(0.2) },
      blinks: { a: hold('right') },
      marks: [{ kind: 'gap', a: 'me', b: 'a' }],
    },
    {
      phase: 'wrong',
      title: 'Hibás: későn, erősen fékez',
      how: [
        'A vizsgázó nem veszi figyelembe a jelzést: változatlanul halad, aztán amikor a távolság már kicsi, erősen fékez.',
        'Még időben reagált, de lassan. Ez a 6/10-es hiba.',
      ],
      ms: w610.ms,
      moves: { me: drive(w610).move, a: drive(a610, aPath, w610.ms).move },
      controls: { speed: drive(w610).speed, gas: at<number>([0, 0.2], [tEnd(w610, 0), 0], [tEnd(w610, 2), 0.35]), brake: pulse(tEnd(w610, 0) + 0.01, tEnd(w610, 1), 0.55), ...shifts('3', [tEnd(w610, 1) - 0.04, '2']) },
      blinks: { a: at([0, 'right'], [0.75, 'off']) },
      marks: [{ kind: 'gap', a: 'me', b: 'a', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: azonnal leveszi a gázt',
      how: ['Amint a jelzést látod, leveszed a gázt, és enyhén fékezve megnöveled a távolságot.', 'Megvárod, amíg az előtted haladó befordul, és egyenletesen haladsz tovább.'],
      ms: r610.ms,
      moves: { me: drive(r610).move, a: drive(a610, aPath, r610.ms).move },
      controls: { speed: drive(r610).speed, gas: at<number>([0, 0], [tEnd(r610, 1), 0.3]), brake: pulse(0.02, tEnd(r610, 0), 0.2), ...shifts('3', [tEnd(r610, 0) - 0.04, '2']) },
      blinks: { a: at([0, 'right'], [0.75, 'off']) },
      marks: [{ kind: 'gap', a: 'me', b: 'a' }],
    },
  ],
}

// ---------------------------------------------------------------- 6/12

const s612 = kin(70, [{ to: 70, d: 40 }])
const own612 = kin(70, [{ to: 70, d: 180 }])
const o612 = kin(70, [{ to: 70, d: 260 }])

export const L6_12: FaultLesson = {
  code: '6/12',
  title: 'Világítás helytelen használata',
  summary: 'Sötétben a szembejövő közeledtekor sem kapcsol át tompított fényre, és elvakítja.',
  world: withWorld(straightRoad({ south: 120, north: -260, buildings: false }), { night: true }),
  actors: [me(110), actor('o', 'car', pose(ONCOMING_X, -230, S), P[3])],
  steps: [
    {
      phase: 'setup',
      title: 'Sötétben, távolsági fénnyel',
      how: ['Este, lakott területen kívül, kivilágítatlan úton haladsz 70 km/h-val. A távolsági fényszóró be van kapcsolva.', 'Szemből egy autó közeledik.'],
      ms: s612.ms,
      moves: { me: drive(s612).move, o: drive(o612, undefined, s612.ms).move },
      controls: { speed: drive(s612).speed, gear: hold('5'), gas: hold(0.25), lights: hold('high') },
    },
    {
      phase: 'wrong',
      title: 'Hibás: távolsági fénnyel marad',
      how: [
        'A vizsgázó a szembejövő közeledtekor sem kapcsol át tompított fényre: a szembejövő vezetőt elvakítja.',
        'A járművek kivilágítására vonatkozó szabályok helytelen alkalmazása a 6/12-es hiba.',
      ],
      ms: own612.ms,
      moves: { me: drive(own612).move, o: drive(o612, undefined, own612.ms).move },
      controls: { speed: drive(own612).speed, lights: hold('high') },
      marks: [{ kind: 'label', at: [-6, 20], text: 'Vakít!', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: időben tompított fényre vált',
      how: ['Amint a szembejövő feltűnik, tompított fényre kapcsolsz, hogy ne vakítsd el.', 'Miután elhaladt melletted, visszakapcsolhatsz távolsági fényre.'],
      ms: own612.ms,
      moves: { me: drive(own612).move, o: drive(o612, undefined, own612.ms).move },
      controls: { speed: drive(own612).speed, lights: at([0, 'high'], [0.04, 'low'], [0.82, 'high']) },
    },
  ],
}
