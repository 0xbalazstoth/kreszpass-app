import { pathLength, type Segment } from '../../maneuvers/geometry'
import { at, drive, hold, kin, laneShift, pulse, shifts, st, stepTo, tEnd } from '../motion'
import type { FaultLesson } from '../types'
import { PARKED_X, signRight, straightRoad, withWorld } from '../world'
import { actor, me, MY_X, PARTNER_COLORS, pose } from './common'

const P = PARTNER_COLORS
const road = (extra = {}) => withWorld(straightRoad({ south: 90, north: -120 }), extra)

// ---------------------------------------------------------------- 5/1

const s51 = kin(20, [{ to: 20, d: 12 }])
const w51 = kin(20, [{ to: 50, d: 40 }, { to: 50, d: 45 }])
const g51r = shifts('2', [0.18, '3'], [0.4, '4'])

export const L5_1: FaultLesson = {
  code: '5/1',
  title: 'Magas fordulatszám',
  summary: 'Indokolatlanul alacsony fokozatban, magas fordulattal hajtja a motort.',
  world: road({ signs: [signRight('C-033-50', 70)] }),
  actors: [me(80)],
  steps: [
    {
      phase: 'setup',
      title: 'Gyorsítás 50 km/h-ra',
      how: ['Második fokozatban, 20 km/h-val haladsz, és fel kell gyorsítanod 50 km/h-ra.', 'Figyeld a fordulatszámmérőt: benzines motornál kb. 2000–2500-as fordulatnál érdemes felváltani.'],
      ms: s51.ms,
      moves: { me: drive(s51).move },
      controls: { speed: drive(s51).speed, gear: hold('2'), gas: hold(0.2) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: második fokozatban marad',
      how: [
        'A vizsgázó második fokozatban gyorsít 50 km/h-ra, és ott is marad: a motor 3000–4000-es fordulaton bőg.',
        'Feleslegesen magas a fogyasztás, a zaj és a kopás, és rendszeresen így vezetni az 5/1-es hiba.',
      ],
      ms: w51.ms,
      moves: { me: drive(w51).move },
      controls: {
        speed: drive(w51).speed,
        gas: at<number>([0, 0.55], [tEnd(w51, 0), 0.4]),
        rpm: at<number>([0, 1500], [tEnd(w51, 0), 3700], [1, 3600]),
      },
      marks: [{ kind: 'label', at: [-4.5, 40], text: 'Túráztat', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: időben felvált',
      how: ['Kb. 2500-as fordulatnál felváltasz harmadikba, majd negyedikbe.', '50 km/h-nál negyedikben a motor kb. 1600-as fordulaton, csendesen jár.'],
      ms: w51.ms,
      moves: { me: drive(w51).move },
      controls: { speed: drive(w51).speed, gas: at<number>([0, 0.35], [0.17, 0], [0.22, 0.35], [0.39, 0], [0.44, 0.3], [tEnd(w51, 0), 0.2]), ...g51r },
    },
  ],
}

// ---------------------------------------------------------------- 5/2

const w52 = kin(0, [{ to: 9, d: 3 }, { to: 7, d: 3 }, { to: 14, d: 6 }, { to: 11, d: 5 }, { to: 22, d: 14 }, { to: 30, d: 20 }])
const r52 = kin(0, [{ to: 30, d: 45 }, { to: 30, d: 6 }])

export const L5_2: FaultLesson = {
  code: '5/2',
  title: 'Korai felkapcsolás, rángató motor',
  summary: 'Túl alacsony sebességnél kapcsol fel, a motor alacsony fordulaton rángat.',
  world: road(),
  actors: [me(60)],
  steps: [
    {
      phase: 'setup',
      title: 'Indulás után',
      how: ['Elindultál egyesben, és fel kell gyorsítanod kb. 30 km/h-ra.', 'Minden felkapcsolás előtt annyira fel kell gyorsítani az autót, hogy a nagyobb fokozatban se essen túl alacsonyra a fordulat.'],
      ms: 2200,
      controls: { gear: hold('1'), clutch: hold(0) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: túl korán vált fel',
      how: [
        'A vizsgázó már 8–9 km/h-nál második, 14 km/h-nál harmadik fokozatba vált: a fordulat 800 alá esik, a motor rángat, az autó szaggatottan halad.',
        'Felkapcsolás előtt eléggé fel kell gyorsítani a járművet. Ez az 5/2-es hiba.',
      ],
      ms: w52.ms,
      moves: { me: drive(w52).move },
      controls: {
        speed: drive(w52).speed,
        gas: hold(0.45),
        ...shifts('1', [tEnd(w52, 0), '2'], [tEnd(w52, 2), '3']),
        rpm: at<number>([0, 900], [tEnd(w52, 0) - 0.01, 1700], [tEnd(w52, 0) + 0.03, 750], [tEnd(w52, 1), 680], [tEnd(w52, 2) - 0.01, 1000], [tEnd(w52, 2) + 0.03, 620], [tEnd(w52, 3), 560], [tEnd(w52, 4), 950], [1, 1300]),
      },
      marks: [{ kind: 'label', at: [-4.5, 50], text: 'Rángat', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: kellő sebességnél vált',
      how: ['Egyesben kb. 15 km/h-ig, kettesben kb. 25–30 km/h-ig gyorsítasz, és csak utána váltasz fel.', 'Váltás után a fordulat 1300–1500 körül marad: a motor egyenletesen húz.'],
      ms: r52.ms,
      moves: { me: drive(r52).move },
      controls: { speed: drive(r52).speed, gas: at<number>([0, 0.35], [0.3, 0.35], [0.31, 0], [0.34, 0.4], [0.72, 0.4], [0.73, 0], [0.76, 0.25]), ...shifts('1', [0.33, '2'], [0.75, '3']) },
    },
  ],
}

// ---------------------------------------------------------------- 5/3

const s53 = kin(50, [{ to: 50, d: 20 }])
const w53 = kin(50, [{ to: 46, d: 6 }, { to: 25, d: 26 }, { to: 25, d: 12 }])
const r53 = kin(50, [{ to: 40, d: 14 }, { to: 25, d: 18 }, { to: 25, d: 12 }])

export const L5_3: FaultLesson = {
  code: '5/3',
  title: 'Visszakapcsolás rossz fokozatba',
  summary: 'Nagy sebességnél túl alacsony fokozatba kapcsol vissza: a motor felpörög, az autó megrándul.',
  world: road({ signs: [signRight('C-033-30', -40)] }),
  actors: [me(60)],
  steps: [
    {
      phase: 'setup',
      title: 'Lassítás 30 km/h-ra',
      how: ['Negyedikben, 50 km/h-val haladsz; előtted 30-as tábla van, le kell lassítanod.', 'Lassításkor mindig a pillanatnyi sebességhez illő fokozatba kell visszaváltani.'],
      ms: s53.ms,
      moves: { me: drive(s53).move },
      controls: { speed: drive(s53).speed, gear: hold('4'), gas: hold(0.2) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: 46 km/h-nál egyesbe vált',
      how: [
        'A vizsgázó 46 km/h-nál negyedikből egyesbe kapcsol: felengedéskor a motor a piros tartományba pörög, az autó erősen megrándul.',
        'A visszakapcsolásnak a haladási sebességhez kell illenie. Ez az 5/3-as hiba.',
      ],
      ms: w53.ms,
      moves: { me: drive(w53).move },
      controls: {
        speed: drive(w53).speed,
        gas: hold(0),
        ...shifts('4', [tEnd(w53, 0), '1'], [tEnd(w53, 1) + 0.04, '2']),
        rpm: at<number>([0, 1500], [tEnd(w53, 0) - 0.02, 1450], [tEnd(w53, 0) + 0.04, 5900], [tEnd(w53, 1), 3200], [tEnd(w53, 1) + 0.06, 1700]),
        brake: pulse(tEnd(w53, 0) + 0.04, tEnd(w53, 1), 0.2),
      },
      marks: [{ kind: 'label', at: [-4.5, 30], text: 'Megrándul!', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: fokozatonként vált vissza',
      how: ['Fékezel, és kb. 40 km/h-nál harmadikba, 25 km/h körül másodikba váltasz vissza.', 'A fordulat minden váltás után 1500–2000 között marad, nincs rándulás.'],
      ms: r53.ms,
      moves: { me: drive(r53).move },
      controls: { speed: drive(r53).speed, gas: hold(0), brake: pulse(0.04, tEnd(r53, 1) - 0.02, 0.25), ...shifts('4', [tEnd(r53, 0), '3'], [tEnd(r53, 1), '2']) },
    },
  ],
}

// ---------------------------------------------------------------- 5/4

const LEAD0 = 40
const lead = kin(40, [{ to: 40, d: 200 }])
const s54 = kin(40, [{ to: 40, d: 14 }])
const w54 = kin(40, [{ to: 48, d: 14 }, { to: 30, d: 14 }, { to: 45, d: 14 }, { to: 30, d: 14 }, { to: 46, d: 14 }, { to: 38, d: 10 }])
const r54 = kin(40, [{ to: 40, d: 80 }])

export const L5_4: FaultLesson = {
  code: '5/4',
  title: 'Darabos vezetés',
  summary: 'Egy egyenletesen haladó autó mögött hol gyorsít, hol fékez.',
  world: road(),
  actors: [me(75), actor('a', 'car', pose(MY_X, LEAD0), P[1])],
  steps: [
    {
      phase: 'setup',
      title: 'Egy autó mögött',
      how: ['Előtted egy autó egyenletesen, 40 km/h-val halad.', 'A forgalomhoz igazodva egyenletes sebességgel, állandó követési távolsággal kell haladnod.'],
      ms: s54.ms,
      moves: { me: drive(s54).move, a: drive(lead, undefined, s54.ms).move },
      controls: { speed: drive(s54).speed, gear: hold('3'), gas: hold(0.2) },
      marks: [{ kind: 'gap', a: 'me', b: 'a' }],
    },
    {
      phase: 'wrong',
      title: 'Hibás: gyorsít, fékez, gyorsít',
      how: [
        'A vizsgázó felgyorsít az előtte haladóra, aztán fékez, majd újra gyorsít: a távolság folyton változik, az utasok előre-hátra billegnek.',
        'A mögötte haladó sem tudja követni ezt a ritmust. Ez az 5/4-es hiba.',
      ],
      ms: w54.ms,
      moves: { me: drive(w54).move, a: drive(lead, undefined, w54.ms).move },
      controls: {
        speed: drive(w54).speed,
        gas: at<number>([0, 0.5], [tEnd(w54, 0), 0], [tEnd(w54, 1), 0.5], [tEnd(w54, 2), 0], [tEnd(w54, 3), 0.5], [tEnd(w54, 4), 0.1]),
        brake: at<number>([0, 0], [tEnd(w54, 0), 0], [tEnd(w54, 0) + 0.01, 0.4], [tEnd(w54, 1), 0.4], [tEnd(w54, 1) + 0.01, 0], [tEnd(w54, 2), 0], [tEnd(w54, 2) + 0.01, 0.4], [tEnd(w54, 3), 0.4], [tEnd(w54, 3) + 0.01, 0]),
      },
      marks: [{ kind: 'gap', a: 'me', b: 'a', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: egyenletesen követi',
      how: ['Az előtted haladó sebességéhez igazodsz: kis, finom gázadással tartod a 40 km/h-t.', 'A követési távolság állandó, fékezni nem kell.'],
      ms: r54.ms,
      moves: { me: drive(r54).move, a: drive(lead, undefined, r54.ms).move },
      controls: { speed: drive(r54).speed, gas: hold(0.2) },
      marks: [{ kind: 'gap', a: 'me', b: 'a' }],
    },
  ],
}

// ---------------------------------------------------------------- 5/5

const s55 = kin(25, [{ to: 25, d: 10 }])
const w55 = kin(25, [{ to: 25, d: 45 }])
const w55b = kin(50, [{ to: 50, d: 22 }, { to: 25, d: 22 }, { to: 25, d: 40 }])
const r55 = kin(25, [{ to: 50, d: 45 }, { to: 50, d: 40 }])
const r55b = kin(50, [{ to: 50, d: 140 }])

export const L5_5: FaultLesson = {
  code: '5/5',
  title: 'Indokolatlanul lassú haladás',
  summary: 'Szabad úton, jó időben a megengedett 50 helyett 25 km/h-val halad.',
  world: road({ signs: [signRight('C-033-50', 60)] }),
  actors: [me(70), actor('b', 'car', pose(MY_X, 108), P[3])],
  steps: [
    {
      phase: 'setup',
      title: 'Szabad út, 50 km/h-s korlátozás',
      how: ['Lakott területen, száraz, jól belátható úton haladsz, a megengedett sebesség 50 km/h.', 'Mögötted egy autó közeledik.'],
      ms: s55.ms,
      moves: { me: drive(s55).move, b: drive(r55b, undefined, s55.ms).move },
      controls: { speed: drive(s55).speed, gear: hold('2'), gas: hold(0.1) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: 25 km/h-val vánszorog',
      how: [
        'A vizsgázó indokolatlanul 25 km/h-val halad: a mögötte jövő kénytelen lelassítani, és mögötte araszolni.',
        'A sebességet a forgalmi, időjárási, látási és útviszonyokhoz kell megválasztani; ok nélkül lassan haladni hiba. Ez az 5/5-ös hiba.',
      ],
      ms: w55.ms,
      moves: { me: drive(w55).move, b: drive(w55b, undefined, w55.ms).move },
      controls: { speed: drive(w55).speed, gas: hold(0.1) },
      marks: [{ kind: 'gap', a: 'b', b: 'me', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: felgyorsít a megengedett sebességre',
      how: ['Mivel semmi sem indokolja a lassú haladást, egyenletesen felgyorsítasz 50 km/h-ra.', 'A forgalom ritmusával haladsz, a mögötted jövőt nem tartod fel.'],
      ms: r55.ms,
      moves: { me: drive(r55).move, b: drive(r55b, undefined, r55.ms).move },
      controls: { speed: drive(r55).speed, gas: at<number>([0, 0.4], [tEnd(r55, 0), 0.2]), ...shifts('2', [0.25, '3'], [0.55, '4']) },
      marks: [{ kind: 'gap', a: 'b', b: 'me' }],
    },
  ],
}

// ---------------------------------------------------------------- 5/6

const lead56 = kin(50, [{ to: 50, d: 40 }, { to: 30, d: 20 }, { to: 30, d: 60 }])
const s56 = kin(50, [{ to: 50, d: 20 }])
const w56 = kin(50, [{ to: 50, d: 52 }, { to: 30, d: 12 }, { to: 30, d: 30 }])
const r56 = kin(50, [{ to: 25, d: 30 }, { to: 25, d: 15 }, { to: 30, d: 35 }])

export const L5_6: FaultLesson = {
  code: '5/6',
  title: 'Helytelen követési távolság',
  summary: '50 km/h-nál néhány méterre megy az előtte haladó mögött.',
  world: road(),
  actors: [me(80), actor('a', 'car', pose(MY_X, 80 - 4.4 - 7), P[5])],
  steps: [
    {
      phase: 'setup',
      title: 'Követés 50 km/h-nál',
      how: ['Egy autó mögött haladsz 50 km/h-val, mindössze 7 méterre tőle.', 'A követési távolság akkora legyen, hogy az előtted haladó hirtelen fékezésekor is meg tudj állni: legalább 2 másodpercnyi út (50 km/h-nál kb. 28 m).'],
      ms: s56.ms,
      moves: { me: drive(s56).move, a: drive(s56).move },
      controls: { speed: drive(s56).speed, gear: hold('4'), gas: hold(0.2) },
      marks: [{ kind: 'gap', a: 'me', b: 'a', bad: true }],
    },
    {
      phase: 'wrong',
      title: 'Hibás: a nyomában marad',
      how: [
        'A vizsgázó 7 méterre követi az előtte haladót. Amikor az fékez, csak erős fékezéssel tudja elkerülni a ráfutást.',
        'A követési távolságot a sebességhez kell megválasztani. Ez az 5/6-os hiba.',
      ],
      ms: w56.ms,
      moves: { me: drive(w56).move, a: drive(lead56, undefined, w56.ms).move },
      controls: { speed: drive(w56).speed, gas: stepTo(0.2, 0, tEnd(w56, 0)), brake: pulse(tEnd(w56, 0), tEnd(w56, 1), 0.7) },
      marks: [{ kind: 'gap', a: 'me', b: 'a', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: lemarad, 2 másodpercnyi távolságot tart',
      how: [
        'Leveszed a gázt, és hagyod, hogy a távolság kb. 28 méterre nőjön: válassz egy tereptárgyat, és számold: „ezeregy, ezerkettő”.',
        'Ha az előtted haladó fékez, van időd és helyed nyugodtan lassítani.',
      ],
      ms: r56.ms,
      moves: { me: drive(r56).move, a: drive(lead56, undefined, r56.ms).move },
      controls: { speed: drive(r56).speed, gas: at<number>([0, 0], [tEnd(r56, 1), 0.15]), brake: pulse(0.02, tEnd(r56, 0) - 0.02, 0.15), ...shifts('4', [tEnd(r56, 0) - 0.04, '3']) },
      marks: [{ kind: 'gap', a: 'me', b: 'a' }],
    },
  ],
}

// ---------------------------------------------------------------- 5/7

const PARKED7 = [20, 14, 8, 2, -4, -10]
const close: Segment[] = [st(4), ...laneShift(0.8, 10), st(50), ...laneShift(-0.8, 10), st(10)]
const s57 = kin(50, [{ to: 50, d: 20 }])
const w57 = kin(50, [{ to: 50, d: pathLength(close) }])
const r57 = kin(50, [{ to: 35, d: 14 }, { to: 35, d: pathLength(close) - 14 }])

export const L5_7: FaultLesson = {
  code: '5/7',
  title: 'Túl közel az álló járművekhez',
  summary: 'Parkoló autók mellett nagy sebességgel, néhány centire halad el.',
  world: straightRoad({ parking: true, south: 90, north: -60 }),
  actors: [me(70), ...PARKED7.map((z, i) => actor(`p${i}`, 'car', pose(PARKED_X, z), P[(i + 2) % P.length]))],
  steps: [
    {
      phase: 'setup',
      title: 'Parkoló autók sora',
      how: ['A jobb oldalon sűrűn parkolnak az autók. Bármelyikből kinyílhat egy ajtó, vagy kiléphet mögüle egy gyalogos.', 'Az álló járművek mellett a sebességhez illő oldaltávolsággal kell elhaladni.'],
      ms: s57.ms,
      moves: { me: drive(s57).move },
      controls: { speed: drive(s57).speed, gear: hold('4'), gas: hold(0.2) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: 50 km/h-val, szorosan mellettük',
      how: [
        'A vizsgázó jobbra húzódik, és 50 km/h-val, kb. 30 cm-re halad el a parkoló autók mellett.',
        'Egy kinyíló ajtót vagy kilépő gyalogost már nem tudna kikerülni. Ez az 5/7-es hiba.',
      ],
      ms: w57.ms,
      moves: { me: drive(w57, close).move },
      controls: { speed: drive(w57, close).speed, gas: hold(0.2) },
      marks: [{ kind: 'gap', a: 'me', b: 'p2', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: lassabban, nagyobb oldaltávolsággal',
      how: ['A sávod közepén maradsz (kb. 1 m oldaltávolság), és a sebességet 35 km/h körülire csökkented.', 'Figyeled a parkoló autókat: van-e bennük valaki, mozog-e mögöttük gyalogos.'],
      ms: r57.ms,
      moves: { me: drive(r57).move },
      controls: { speed: drive(r57).speed, gas: at<number>([0, 0], [tEnd(r57, 0), 0.15]), ...shifts('4', [tEnd(r57, 0) - 0.03, '3']) },
      marks: [{ kind: 'gap', a: 'me', b: 'p2' }],
    },
  ],
}
