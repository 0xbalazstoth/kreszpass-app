import { pathLength, type Segment } from '../../maneuvers/geometry'
import { arcL, arcR, at, drive, hold, kin, laneShift, pulse, shifts, st, stepTo, tEnd } from '../motion'
import type { FaultLesson, FaultStep } from '../types'
import { junction, LANE, PARKED_X, signRight, straightRoad, withWorld } from '../world'
import { actor, LEFT_R, leftTurnZ, me, MY_X, ONCOMING_X, PARTNER_COLORS, pose, RIGHT_R, rightTurnZ, S, W } from './common'

const P = PARTNER_COLORS

// ---------------------------------------------------------------- 4/1

const weave: Segment[] = [st(6), ...laneShift(0.5, 8), ...laneShift(-0.9, 10), ...laneShift(0.7, 9), ...laneShift(-0.3, 8), st(6)]
const WEAVE = pathLength(weave)
const s41 = kin(40, [{ to: 40, d: 18 }])
const w41 = kin(40, [{ to: 40, d: WEAVE }])

export const L4_1: FaultLesson = {
  code: '4/1',
  title: 'Kormányfogás',
  summary: 'Bizonytalan, merev kormányfogás: az autó a sávban ide-oda imbolyog.',
  world: straightRoad({ south: 70, north: -60 }),
  actors: [me(60)],
  steps: [
    {
      phase: 'setup',
      title: 'Egyenesen, 40 km/h-val',
      how: ['Egyenes úton haladsz a sávod közepén.', 'A kormányt két kézzel, „negyed három” (9 és 3 óra) állásban, lazán, de biztosan kell fogni.'],
      ms: s41.ms,
      moves: { me: drive(s41).move },
      controls: { speed: drive(s41).speed, gear: hold('3'), gas: hold(0.2) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: egy kézzel, görcsösen fogja',
      how: [
        'A vizsgázó egy kézzel, a kormány tetején fogja a kormányt, vagy görcsösen markolja: a kis korrekciók túl nagyok lesznek, az autó imbolyog a sávban.',
        'A bizonytalan, merev vagy helytelen kormányfogás a 4/1-es hiba.',
      ],
      ms: w41.ms,
      moves: { me: drive(w41, weave).move },
      controls: { speed: drive(w41, weave).speed, gas: hold(0.2) },
    },
    {
      phase: 'right',
      title: 'Helyes: két kézzel, 9 és 3 óra állásban',
      how: ['Két kézzel, a kormány két oldalán fogod a kormányt, a karod enyhén behajlítva.', 'Kis, nyugodt mozdulatokkal tartod az irányt: az autó egyenesen halad a sáv közepén.'],
      ms: w41.ms,
      moves: { me: drive(w41).move },
      controls: { speed: drive(w41).speed, gas: hold(0.2) },
    },
  ],
}

// ---------------------------------------------------------------- 4/2

const slalom: Segment[] = [st(23.4), ...laneShift(1.8, 6), ...laneShift(-1.8, 6), st(12), ...laneShift(1.8, 6), st(2), ...laneShift(-1.8, 6), st(14)]
const SLALOM = pathLength(slalom)
const s42 = kin(30, [{ to: 30, d: 12 }])
const w42 = kin(30, [{ to: 30, d: SLALOM }])
const PARKED_Z = [30, 24, 6, 0, -24, -30]

export const L4_2: FaultLesson = {
  code: '4/2',
  title: 'Szlalomozás a parkoló autók között',
  summary: 'A jobbra tartás miatt minden parkoló autó közé beáll, majd kikerüli a következőt.',
  world: straightRoad({ parking: true, south: 70, north: -60 }),
  actors: [me(55), ...PARKED_Z.map((z, i) => actor(`p${i}`, 'car', pose(PARKED_X, z), P[i % P.length]))],
  steps: [
    {
      phase: 'setup',
      title: 'Parkoló autók a jobb oldalon',
      how: ['A jobb oldalon autók parkolnak, köztük nagyobb üres helyekkel.', 'A jobbra tartás kötelező, de ez nem jelenti azt, hogy minden üres helyre be kell húzódni.'],
      ms: s42.ms,
      moves: { me: drive(s42).move },
      controls: { speed: drive(s42).speed, gear: hold('3'), gas: hold(0.15) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: behúzódik minden résbe',
      how: [
        'A vizsgázó minden üres helynél jobbra húzódik, aztán a következő parkoló autó előtt újra kihúzódik: kígyózva halad.',
        'A mögötte haladók nem tudják kiszámítani a mozgását, és minden kihúzódás újabb besorolás a forgalomba. Ez a 4/2-es hiba.',
      ],
      ms: w42.ms,
      moves: { me: drive(w42, slalom).move },
      controls: { speed: drive(w42, slalom).speed, gas: hold(0.15) },
      marks: [{ kind: 'label', at: [-1, 12], text: 'Szlalom', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: egyenes vonalban halad',
      how: ['A parkoló autók mellett egyenes vonalban, a sávod közepén haladsz el.', 'Ha a rés rövid, nem húzódsz be: a jobbra tartás a sávon belül értendő.'],
      ms: w42.ms,
      moves: { me: drive(w42).move },
      controls: { speed: drive(w42).speed, gas: hold(0.15) },
    },
  ],
}

// ---------------------------------------------------------------- 4/3

const APPROACH_Z = 40
const setupTurn = kin(30, [{ to: 15, d: 20 }])
const jerkyRight: Segment[] = [st(14.25), arcR(4, 40), st(1.5), arcR(4, 50), st(15)]
const smoothRight: Segment[] = [st(APPROACH_Z - 20 - rightTurnZ()), arcR(RIGHT_R, 90), st(14)]
const w43 = kin(15, [{ to: 15, d: pathLength(jerkyRight) }])
const r43 = kin(15, [{ to: 15, d: pathLength(smoothRight) }])

export const L4_3: FaultLesson = {
  code: '4/3',
  title: 'Szakaszos kormányzás kanyarban',
  summary: 'Jobbra kanyarodáskor későn és szakaszosan kormányoz, rossz íven fordul be.',
  world: junction(),
  actors: [me(APPROACH_Z)],
  steps: [
    {
      phase: 'setup',
      title: 'Jobbra kanyarodás előtt',
      how: ['Jobbra kanyarodni készülsz: az irányjelző jobbra jelez, 15 km/h-ra lassítasz.', 'Jobbra kanyarodáskor az úttest jobb széléhez közel, egyenletes íven kell befordulni.'],
      ms: setupTurn.ms,
      moves: { me: drive(setupTurn).move },
      controls: { speed: drive(setupTurn).speed, gear: at([0, '3'], [0.6, '2']), clutch: pulse(0.52, 0.64), indicator: hold('right'), brake: pulse(0.05, 0.5, 0.25) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: későn, két részletben kormányoz',
      how: [
        'A vizsgázó túl mélyen behajt, aztán hirtelen, két részletben fordítja a kormányt: az autó szögletes íven fordul, és a célút felezővonalára fut ki.',
        'A kanyart folyamatos kormányzással, a szabályos területen belül, de helyes íven kell bevenni. Ez a 4/3-as hiba.',
      ],
      ms: w43.ms,
      moves: { me: drive(w43, jerkyRight).move },
      controls: { speed: drive(w43, jerkyRight).speed, indicator: at([0, 'right'], [0.7, 'off']), gas: hold(0.1) },
      look: at([0, 'ahead'], [0.3, 'right'], [0.5, 'ahead']),
    },
    {
      phase: 'right',
      title: 'Helyes: egyenletes íven fordul be',
      how: [
        'A kanyarodás előtt még a jobb tükörbe nézel (kerékpáros), majd a sarok előtt egyenletesen, folyamatosan elfordítod a kormányt.',
        'Az ív végén fokozatosan visszaengeded a kormányt, és a célút jobb sávjában folytatod az utat.',
      ],
      ms: r43.ms,
      moves: { me: drive(r43, smoothRight).move },
      controls: { speed: drive(r43, smoothRight).speed, indicator: at([0, 'right'], [0.75, 'off']), gas: hold(0.1) },
      look: at([0, 'mirror_right'], [0.15, 'right'], [0.35, 'ahead']),
    },
  ],
}

// ---------------------------------------------------------------- 4/4

const TURN_FROM = 50
const turnPath: Segment[] = [st(TURN_FROM - rightTurnZ()), arcR(RIGHT_R, 90), st(10)]
const TURN_LEN = pathLength(turnPath)
const s44 = kin(40, [{ to: 40, d: 20 }])
const w44 = kin(40, [{ to: 15, d: TURN_FROM - rightTurnZ() }, { to: 15, d: TURN_LEN - (TURN_FROM - rightTurnZ()) }])
const w44b = kin(40, [{ to: 40, d: 4 }, { to: 12, d: 16 }, { to: 12, d: 40 }])
const r44 = kin(40, [{ to: 40, d: 12 }, { to: 15, d: TURN_FROM - rightTurnZ() - 12 }, { to: 15, d: TURN_LEN - (TURN_FROM - rightTurnZ()) }])
const T44w = w44.ms

export const L4_4: FaultLesson = {
  code: '4/4',
  title: 'Irányjelzés és fékezés sorrendje',
  summary: 'Előbb fékez, és csak utána kapcsolja be az irányjelzőt: a mögötte haladó meglepődik.',
  world: withWorld(junction({ arm: 80 }), { bounds: [-14, -24, 30, 80], view: [34, 50] }),
  actors: [me(TURN_FROM + 20), actor('b', 'car', pose(MY_X, TURN_FROM + 38), P[0])],
  steps: [
    {
      phase: 'setup',
      title: 'Jobbra kanyarodás, mögötted egy autó',
      how: ['40 km/h-val haladsz, a következő kereszteződésben jobbra fordulsz. Mögötted egy autó jön.', 'A mögötted haladónak előbb a szándékodat kell megtudnia, csak utána a lassítást.'],
      ms: s44.ms,
      moves: { me: drive(s44).move, b: drive(s44).move },
      controls: { speed: drive(s44).speed, gear: hold('3'), gas: hold(0.2) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: előbb fékez, aztán jelez',
      how: [
        'A vizsgázó jelzés nélkül fékezni kezd, és csak a kereszteződés előtt kapcsolja be az irányjelzőt. A mögötte haladó váratlanul kénytelen erősen fékezni.',
        'A helyes sorrend: tükör, irányjelzés, aztán lassítás. Ez a 4/4-es hiba.',
      ],
      ms: T44w,
      moves: { me: drive(w44, turnPath, T44w).move, b: drive(w44b, [st(54)], T44w).move },
      controls: {
        speed: drive(w44, turnPath, T44w).speed,
        gas: hold(0),
        brake: pulse(0.02, tEnd(w44, 0, T44w) - 0.03, 0.35),
        indicator: at([0, 'off'], [tEnd(w44, 0, T44w) - 0.12, 'right'], [0.92, 'off']),
        ...shifts('3', [0.4, '2']),
      },
      marks: [{ kind: 'gap', a: 'me', b: 'b', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: tükör, jelzés, aztán lassítás',
      how: [
        'Belenézel a belső és a jobb tükörbe, bekapcsolod a jobb irányjelzőt, és csak egy-két villanás után kezdesz lassítani.',
        'A mögötted haladó időben látja, mire készülsz, és egyenletesen lassít mögötted.',
      ],
      ms: r44.ms,
      moves: { me: drive(r44, turnPath).move, b: drive(r44, [st(TURN_LEN)]).move },
      controls: {
        speed: drive(r44, turnPath).speed,
        gas: stepTo(0.2, 0, tEnd(r44, 0)),
        brake: pulse(tEnd(r44, 0) + 0.02, tEnd(r44, 1) - 0.03, 0.3),
        indicator: at([0, 'off'], [0.06, 'right'], [0.94, 'off']),
        ...shifts('3', [0.5, '2']),
      },
      look: at([0, 'mirror_inner'], [0.04, 'mirror_right'], [0.1, 'ahead']),
      marks: [{ kind: 'gap', a: 'me', b: 'b' }],
    },
  ],
}

// ---------------------------------------------------------------- 4/5

const BUS_Z = -20
const s45 = kin(40, [{ to: 40, d: 20 }])
const s45b = kin(55, [{ to: 55, d: 27.5 }])
const w45path: Segment[] = [st(14), ...laneShift(-1.3, 7), ...laneShift(1.3, 5), st(48.45 - 26)]
const w45 = kin(40, [{ to: 40, d: 26 }, { to: 0, d: 22.45 }, { wait: 600 }])
const b45 = kin(55, [{ to: 55, d: 200 }])
const r45path: Segment[] = [st(34), ...laneShift(-LANE, 14), st(26)]
const r45 = kin(40, [{ to: 40, d: 18 }, { to: 25, d: 16 }, { to: 25, d: pathLength(r45path) - 34 }])
const T45w = Math.max(w45.ms, b45.ms)
const T45r = r45.ms

export const L4_5: FaultLesson = {
  code: '4/5',
  title: 'A mögöttes forgalom figyelése',
  summary: 'Nem néz rendszeresen a tükrökbe, ezért sávváltáskor nem veszi észre a mellette haladót.',
  world: withWorld(straightRoad({ south: 85, north: -80 }), { signs: [signRight('E-012', 70)] }),
  actors: [me(60), actor('b', 'car', pose(-MY_X, 80), P[6]), actor('bus', 'bus', pose(2.1, BUS_Z), '#1d4ed8')],
  steps: [
    {
      phase: 'setup',
      title: 'Kétsávos, egyirányú úton',
      how: ['Egyirányú, kétsávos úton haladsz a jobb sávban. Előtted a megállóban busz áll.', 'A bal sávban, mögötted gyorsabban jön egy autó: ezt csak a tükörből láthatod.'],
      ms: s45.ms,
      moves: { me: drive(s45).move, b: drive(s45b, undefined, s45.ms).move },
      controls: { speed: drive(s45).speed, gear: hold('3'), gas: hold(0.2) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: tükör nélkül húzódik ki',
      how: [
        'A vizsgázó menet közben egyszer sem néz a tükörbe. A busz miatt balra húzódna, de a bal sávban mellette már ott az autó: dudaszó, hirtelen visszarántja a kormányt, és a busz mögött meg kell állnia.',
        'A mögöttes és a melletti forgalmat menet közben rendszeresen (néhány másodpercenként) ellenőrizni kell a tükrökben. Ez a 4/5-ös hiba.',
      ],
      ms: T45w,
      moves: { me: drive(w45, w45path, T45w).move, b: drive(b45, undefined, T45w).move },
      controls: {
        speed: drive(w45, w45path, T45w).speed,
        gas: stepTo(0.2, 0, tEnd(w45, 0, T45w)),
        brake: pulse(tEnd(w45, 0, T45w), tEnd(w45, 1, T45w), 0.35),
        indicator: at([0, 'off'], [0.15, 'left'], [0.35, 'off']),
      },
      look: hold('ahead'),
      marks: [{ kind: 'label', at: [-4.5, 30], text: 'Duda!', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: rendszeresen a tükörbe néz',
      how: [
        'Néhány másodpercenként belenézel a belső és a bal tükörbe: már messziről látod a bal sávban közeledő autót.',
        'Lassítasz, elengeded, és csak utána váltasz sávot jelzéssel, a busz mellett pedig megfelelő oldaltávolsággal haladsz el.',
      ],
      ms: T45r,
      moves: { me: drive(r45, r45path, T45r).move, b: drive(b45, undefined, T45r).move },
      controls: {
        speed: drive(r45, r45path, T45r).speed,
        gas: at<number>([0, 0.2], [tEnd(r45, 0, T45r), 0], [tEnd(r45, 1, T45r), 0.15]),
        indicator: at([0, 'off'], [tEnd(r45, 1, T45r) - 0.06, 'left'], [0.85, 'off']),
      },
      look: at([0, 'mirror_inner'], [0.06, 'ahead'], [0.13, 'mirror_left'], [0.2, 'ahead'], [tEnd(r45, 1, T45r) - 0.08, 'mirror_left'], [tEnd(r45, 1, T45r) - 0.02, 'shoulder_left'], [tEnd(r45, 1, T45r) + 0.05, 'ahead']),
    },
  ],
}

// ---------------------------------------------------------------- 4/6

const pass = (lead: number, len: number, off: number, alongside: number): Segment[] => [st(lead), ...laneShift(-off, len), st(alongside), ...laneShift(off, len), st(10)]
const w46path = pass(36, 6, 2.9, 16)
const r46path = pass(8, 18, 2.9, 34)
const s46 = kin(40, [{ to: 40, d: 20 }])
const w46 = kin(40, [{ to: 40, d: pathLength(w46path) }])
const r46 = kin(40, [{ to: 32, d: 10 }, { to: 32, d: pathLength(r46path) - 10 }])

export const L4_6: FaultLesson = {
  code: '4/6',
  title: 'Meredek kihúzódás',
  summary: 'Az előtte álló akadályt az utolsó pillanatban, hirtelen kormánymozdulattal kerüli ki.',
  world: straightRoad({ south: 80, north: -60 }),
  actors: [me(70), actor('p', 'car', pose(MY_X, 0), P[7])],
  steps: [
    {
      phase: 'setup',
      title: 'Álló autó a sávodban',
      how: ['Előtted a sávodban vészvillogóval áll egy autó. A szemközti sáv szabad.', 'Ki kell kerülnöd: a kihúzódás legyen időben elkezdve és enyhe ívű.'],
      ms: s46.ms,
      moves: { me: drive(s46).move },
      controls: { speed: drive(s46).speed, gear: hold('3'), gas: hold(0.2) },
      blinks: { p: hold('hazard') },
    },
    {
      phase: 'wrong',
      title: 'Hibás: az utolsó pillanatban, élesen húzódik ki',
      how: [
        'A vizsgázó egészen közel megy az álló autóhoz, majd egy hirtelen kormányrántással vágja ki magát a szemközti sávba.',
        'A meredek kihúzódás meglepi a többieket, és ha valaki jön szemből vagy hátulról, nincs idő reagálni. Ez a 4/6-os hiba.',
      ],
      ms: w46.ms,
      moves: { me: drive(w46, w46path).move },
      controls: { speed: drive(w46, w46path).speed, indicator: at([0, 'off'], [0.32, 'left'], [0.6, 'right'], [0.85, 'off']) },
      marks: [{ kind: 'label', at: [-4.5, 10], text: 'Rántás!', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: időben, enyhe ívben kerül',
      how: [
        'Már messziről észreveszed az akadályt: tükör, jelzés balra, és jó előre, enyhe ívben húzódsz ki.',
        'Bő oldaltávolsággal elhaladsz mellette, majd jelzéssel, ugyanilyen enyhe ívben visszatérsz a sávodba.',
      ],
      ms: r46.ms,
      moves: { me: drive(r46, r46path).move },
      controls: { speed: drive(r46, r46path).speed, gas: at([0, 0], [0.2, 0.15]), indicator: at([0, 'left'], [0.4, 'off'], [0.62, 'right'], [0.9, 'off']) },
      look: at([0, 'mirror_left'], [0.06, 'ahead'], [0.58, 'mirror_right'], [0.64, 'ahead']),
    },
  ],
}

// ---------------------------------------------------------------- 4/7

const OBST_REAR = 0.85
const s47 = kin(40, [{ to: 40, d: 20 }])
const s47o = kin(40, [{ to: 40, d: 20 }])
const w47 = kin(40, [{ to: 40, d: 30 }, { slam: 50 - (OBST_REAR + 1 + 3.55) - 30 }, { wait: 3200 }])
const r47around: Segment[] = [...laneShift(-2.9, 10), st(14), ...laneShift(2.9, 10), st(6)]
const r47stopZ = OBST_REAR + 9 + 3.55
const r47 = kin(40, [{ to: 0, d: 50 - r47stopZ }, { wait: 1500 }, { to: 20, d: 12 }, { to: 20, d: pathLength(r47around) - 12 }])
const r47path: Segment[] = [st(50 - r47stopZ), ...r47around]
const o47 = kin(40, [{ to: 40, d: 250 }])
const T47w = Math.max(w47.ms, 6000)
const T47r = r47.ms

export const L4_7: FaultLesson = {
  code: '4/7',
  title: 'Akadály késői észrevétele',
  summary: 'Az előtte álló akadályt későn veszi észre, és erős fékezéssel, közvetlenül mögötte áll meg.',
  world: straightRoad({ south: 80, north: -100 }),
  actors: [me(70), actor('p', 'car', pose(MY_X, 0), P[7]), actor('o', 'car', pose(ONCOMING_X, -100, S), P[2])],
  steps: [
    {
      phase: 'setup',
      title: 'Akadály a sávban, szemből forgalom',
      how: ['Előtted a sávodban egy lerobbant autó áll vészvillogóval. Szemből egy autó közeledik.', 'Az akadályt csak akkor kerülheted ki, ha a szembejövő elhaladt.'],
      ms: s47.ms,
      moves: { me: drive(s47).move, o: drive(s47o).move },
      controls: { speed: drive(s47).speed, gear: hold('3'), gas: hold(0.2) },
      blinks: { p: hold('hazard') },
    },
    {
      phase: 'wrong',
      title: 'Hibás: későn veszi észre, satufékkel áll meg',
      how: [
        'A vizsgázó csak az utolsó pillanatban veszi észre az álló autót: erősen fékez, és közvetlenül mögötte áll meg.',
        'Innen a kikerüléshez kevés a hely, és a hirtelen fékezés a mögötte haladót is veszélyezteti. Ez a 4/7-es hiba.',
      ],
      ms: T47w,
      moves: { me: drive(w47, undefined, T47w).move, o: drive(o47, undefined, T47w).move },
      controls: { speed: drive(w47, undefined, T47w).speed, gas: stepTo(0.2, 0, tEnd(w47, 0, T47w)), brake: pulse(tEnd(w47, 0, T47w), 1, 0.9), ...shifts('3', [tEnd(w47, 1, T47w) - 0.04, 'N']) },
      marks: [{ kind: 'gap', a: 'me', b: 'p', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: időben lassít, helyet hagy, aztán kikerül',
      how: [
        'Messziről észreveszed az akadályt: leveszed a gázt, egyenletesen lassítasz, és bőven mögötte állsz meg, hogy legyen helyed kikerülni.',
        'Megvárod a szembejövőt, aztán tükör, jelzés, és enyhe ívben kikerülöd az álló autót.',
      ],
      ms: T47r,
      moves: { me: drive(r47, r47path, T47r).move, o: drive(o47, undefined, T47r).move },
      controls: {
        speed: drive(r47, r47path, T47r).speed,
        gas: at<number>([0, 0], [tEnd(r47, 1, T47r), 0.25]),
        brake: pulse(0.03, tEnd(r47, 1, T47r) - 0.02, 0.3),
        indicator: at([0, 'off'], [tEnd(r47, 0, T47r) + 0.04, 'left'], [0.8, 'off']),
        ...shifts('3', [0.25, '2'], [tEnd(r47, 0, T47r), '1']),
      },
      look: at([0, 'ahead'], [tEnd(r47, 0, T47r) + 0.02, 'mirror_left'], [tEnd(r47, 1, T47r) - 0.03, 'shoulder_left'], [tEnd(r47, 1, T47r) + 0.03, 'ahead']),
      marks: [{ kind: 'gap', a: 'me', b: 'p' }],
    },
  ],
}

// ---------------------------------------------------------------- 4/8

const WAIT_Z = 11
const leftTurn: Segment[] = [st(WAIT_Z - leftTurnZ()), arcL(LEFT_R, 90), st(12)]
const o1 = kin(35, [{ to: 35, d: 300 }])
const w48 = kin(0, [{ wait: 15000 }, { to: 20, d: 10 }, { to: 20, d: pathLength(leftTurn) - 10 }])
const r48 = kin(0, [{ wait: 4300 }, { to: 20, d: 10 }, { to: 20, d: pathLength(leftTurn) - 10 }])

export const L4_8: FaultLesson = {
  code: '4/8',
  title: 'Kihasználatlan kanyarodási lehetőség',
  summary: 'Balra kanyarodáskor a szembejövők közötti bőséges rést sem használja ki.',
  world: junction({ arm: 120 }),
  actors: [me(WAIT_Z), actor('b', 'car', pose(MY_X, WAIT_Z + 6.4), P[3]), actor('o1', 'car', pose(ONCOMING_X, -35, S), P[1]), actor('o2', 'car', pose(ONCOMING_X, -130, S), P[5])],
  steps: [
    {
      phase: 'setup',
      title: 'Balra kanyarodás, szemből forgalom',
      how: ['Balra kanyarodnál, a kereszteződés előtt állsz. Szemből egy autó jön, utána nagy rés következik.', 'A szembejövő egyenesen haladónak elsőbbsége van, de a biztonságos rést ki kell használni.'],
      ms: 2400,
      controls: { gear: hold('1'), clutch: hold(1), brake: hold(0.3), indicator: hold('left') },
      look: hold('ahead'),
    },
    {
      phase: 'wrong',
      title: 'Hibás: a nagy résben is vár',
      how: [
        'Az első szembejövő elhaladt, a következő még kb. 90 méterre van, a vizsgázó mégis vár, amíg az is el nem halad. A mögötte álló feleslegesen várakozik.',
        'A kanyarodásra kínálkozó, biztonságos alkalmat ki kell használni. Ez a 4/8-as hiba.',
      ],
      ms: w48.ms,
      moves: { me: drive(w48, leftTurn).move, o1: drive(o1, undefined, w48.ms).move, o2: drive(o1, undefined, w48.ms).move },
      controls: { speed: drive(w48, leftTurn).speed, clutch: ramp01(tEnd(w48, 0)), gas: stepTo(0, 0.25, tEnd(w48, 0)), brake: stepTo(0.3, 0, tEnd(w48, 0) - 0.02), indicator: at([0, 'left'], [0.93, 'off']) },
    },
    {
      phase: 'right',
      title: 'Helyes: az első szembejövő után indul',
      how: [
        'Figyeled a szembejövőket: az első után a következő még messze van, a rés bőven elég a kanyarodáshoz.',
        'Az első szembejövő után elindulsz, és határozottan, de nyugodtan befordulsz balra.',
      ],
      ms: r48.ms,
      moves: { me: drive(r48, leftTurn).move, o1: drive(o1, undefined, r48.ms).move, o2: drive(o1, undefined, r48.ms).move },
      controls: { speed: drive(r48, leftTurn).speed, clutch: ramp01(tEnd(r48, 0)), gas: stepTo(0, 0.25, tEnd(r48, 0)), brake: stepTo(0.3, 0, tEnd(r48, 0) - 0.02), indicator: at([0, 'left'], [0.9, 'off']) },
      look: at([0, 'ahead'], [tEnd(r48, 0) - 0.1, 'left'], [tEnd(r48, 0), 'ahead']),
    },
  ],
}

/** Kuplung felengedése az indulásnál (a t időpontban kezdve) */
function ramp01(t: number) {
  return at<number>([0, 1], [Math.max(0, t - 0.02), 1], [Math.min(1, t + 0.12), 0])
}

// ---------------------------------------------------------------- 4/9, 4/10

/** Egyirányú, kétsávos út a kereszteződésig; a célút kétirányú. Balra a bal sávból kell kanyarodni. */
const oneWayWorld = () =>
  withWorld(junction({ arm: 90, oneWayNS: true }), {
    signs: [signRight('E-012', 70)],
    bounds: [-30, -30, 14, 90],
    view: [32, 50],
  })
const LEFT_LANE_X = -MY_X
/** A bal sávból balra: az ív a bal sáv közepéről a nyugati ág jobb sávjába */
const LR = 6
const leftFromLeftLane = (approach: Segment[]): Segment[] => [...approach, arcL(LR, 90), st(10)]
const START_Z = 70
const ARC_Z = LR - MY_X
const s49 = kin(40, [{ to: 40, d: 10 }])
// Késői besorolás: a kereszteződés előtt 8 m-en vált sávot
const w49path = leftFromLeftLane([st(START_Z - 10 - 16 - 8), ...laneShift(-LANE, 8), st(16 - ARC_Z)])
const w49 = kin(40, [{ to: 40, d: START_Z - 10 - 16 - 8 }, { to: 15, d: 8 + 16 - ARC_Z }, { to: 15, d: pathLength(w49path) - (START_Z - 10 - ARC_Z) }])
// Időbeni besorolás: 45 m-rel előtte
const r49path = leftFromLeftLane([st(6), ...laneShift(-LANE, 16), st(START_Z - 10 - 22 - ARC_Z)])
const r49 = kin(40, [{ to: 40, d: 22 }, { to: 15, d: START_Z - 10 - 22 - ARC_Z }, { to: 15, d: pathLength(r49path) - (START_Z - 10 - ARC_Z) }])

const besorolas = (code: '4/9' | '4/10', wrong: FaultStep, title: string, summary: string): FaultLesson => ({
  code,
  title,
  summary,
  world: oneWayWorld(),
  actors: [me(START_Z)],
  steps: [
    {
      phase: 'setup',
      title: 'Balra kell kanyarodnod',
      how: ['Egyirányú, kétsávos úton haladsz a jobb sávban. A következő kereszteződésben balra kell kanyarodnod.', 'Egyirányú úton balra a bal szélső sávból lehet kanyarodni: oda időben be kell sorolni.'],
      ms: s49.ms,
      moves: { me: drive(s49).move },
      controls: { speed: drive(s49).speed, gear: hold('3'), gas: hold(0.2) },
      marks: [{ kind: 'label', at: [LEFT_LANE_X - 6, -8], text: '← Úticél' }],
    },
    wrong,
    {
      phase: 'right',
      title: 'Helyes: időben besorol a bal sávba',
      how: [
        'Jó előre: tükör, irányjelzés balra, váll fölötti pillantás, és enyhe ívben átsorolsz a bal sávba.',
        'A bal sávban lassítasz, és onnan szabályosan balra kanyarodsz.',
      ],
      ms: r49.ms,
      moves: { me: drive(r49, r49path).move },
      controls: {
        speed: drive(r49, r49path).speed,
        gas: stepTo(0.2, 0, tEnd(r49, 0)),
        brake: pulse(tEnd(r49, 0) + 0.02, tEnd(r49, 1) - 0.02, 0.25),
        indicator: at([0, 'left'], [0.3, 'off'], [0.45, 'left'], [0.95, 'off']),
        ...shifts('3', [tEnd(r49, 1) - 0.06, '2']),
      },
      look: at([0, 'mirror_left'], [0.04, 'shoulder_left'], [0.1, 'ahead']),
    },
  ],
})

export const L4_9 = besorolas(
  '4/9',
  {
    phase: 'wrong',
    title: 'Hibás: az utolsó pillanatban sorol be',
    how: [
      'A vizsgázó a jobb sávban marad szinte a kereszteződésig, és csak az utolsó métereken, fékezve vált át a bal sávba.',
      'Szabályosan (jelzéssel, körültekintéssel) teszi, de késve: a bal sávban haladókat meglepi. Ez a 4/9-es hiba.',
    ],
    ms: w49.ms,
    moves: { me: drive(w49, w49path).move },
    controls: {
      speed: drive(w49, w49path).speed,
      gas: stepTo(0.2, 0, tEnd(w49, 0)),
      brake: pulse(tEnd(w49, 0), tEnd(w49, 1) - 0.02, 0.45),
      indicator: at([0, 'off'], [tEnd(w49, 0) - 0.08, 'left'], [0.95, 'off']),
      ...shifts('3', [tEnd(w49, 1) - 0.08, '2']),
    },
    look: at([0, 'ahead'], [tEnd(w49, 0) - 0.06, 'mirror_left'], [tEnd(w49, 0) - 0.02, 'shoulder_left'], [tEnd(w49, 0) + 0.03, 'ahead']),
  },
  'Késői besorolás',
  'A kanyarodáshoz szükséges sávba csak az utolsó pillanatban sorol be.',
)

const w410path: Segment[] = [st(START_Z - 10 + 40)]
const w410 = kin(40, [{ to: 40, d: pathLength(w410path) }])

export const L4_10 = besorolas(
  '4/10',
  {
    phase: 'wrong',
    title: 'Hibás: a jobb sávban marad, egyenesen megy tovább',
    how: [
      'A vizsgázó nem sorol be a bal sávba, ezért nem tud balra kanyarodni: a jobb sávból szabályosan egyenesen halad tovább.',
      'Nem szabálytalan, de nem a szándékának megfelelő sávba sorolt, és kerülőre kényszerül. Ez a 4/10-es hiba.',
    ],
    ms: w410.ms,
    moves: { me: drive(w410, w410path).move },
    controls: { speed: drive(w410, w410path).speed },
    marks: [{ kind: 'label', at: [LEFT_LANE_X - 6, -8], text: 'Ide kellett volna', bad: true }],
  },
  'Rossz sávba sorol',
  'Balra akar kanyarodni, de a jobb sávban marad, ezért egyenesen kell továbbhaladnia.',
)

// ---------------------------------------------------------------- 4/11

const PUDDLE = { x: 2.7, z: 0, w: 2.2, d: 5 }
const s411 = kin(50, [{ to: 50, d: 22 }])
const w411 = kin(50, [{ to: 50, d: 60 }])
const r411 = kin(50, [{ to: 15, d: 28 }, { to: 15, d: 12 }, { to: 30, d: 20 }])

export const L4_11: FaultLesson = {
  code: '4/11',
  title: 'Víz ráfröcskölése a gyalogosra',
  summary: 'Lassítás nélkül hajt át a tócsán, és a járdán álló gyalogosra fröcsköli a vizet.',
  world: withWorld(straightRoad({ south: 70, north: -50 }), { puddles: [PUDDLE] }),
  actors: [me(52), actor('ped', 'ped', pose(LANE + 1.1, -1, W), '#7c3aed')],
  steps: [
    {
      phase: 'setup',
      title: 'Tócsa a járda mellett',
      how: ['Eső után az úttest szélén, a járda mellett nagy tócsa áll. A járdán közvetlenül mellette egy gyalogos várakozik.', '50 km/h-val közeledsz.'],
      ms: s411.ms,
      moves: { me: drive(s411).move },
      controls: { speed: drive(s411).speed, gear: hold('3'), gas: hold(0.2) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: teljes sebességgel áthajt rajta',
      how: [
        'A vizsgázó 50 km/h-val áthajt a tócsán: a víz a gyalogosra fröccsen.',
        'Az úttesten lévő vizet nem szabad a gyalogosokra fröcskölni. Ez a 4/11-es hiba.',
      ],
      ms: w411.ms,
      moves: { me: drive(w411).move },
      controls: { speed: drive(w411).speed, gas: hold(0.2) },
      marks: [{ kind: 'label', at: [LANE + 1.1, -4], text: 'Fröccs!', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: lépésben halad el mellette',
      how: [
        'Időben leveszed a gázt, és a tócsa előtt lépésben haladó sebességre lassítasz.',
        'Lassan, egyenletesen haladsz át rajta, így nem fröccsen víz a gyalogosra; utána újra gyorsítasz.',
      ],
      ms: r411.ms,
      moves: { me: drive(r411).move },
      controls: {
        speed: drive(r411).speed,
        gas: at<number>([0, 0], [tEnd(r411, 1), 0.25]),
        brake: pulse(0.04, tEnd(r411, 0) - 0.02, 0.3),
        ...shifts('3', [tEnd(r411, 0) - 0.08, '2']),
      },
    },
  ],
}
