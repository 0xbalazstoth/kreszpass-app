import { pathLength, type Segment } from '../maneuvers/geometry'
import { actor, FRONT, me, MY_X, N, PARTNER_COLORS, pose, S } from '../faults/lessons/common'
import { arcR, at, driveSeq, hold, kin, laneShift, pulse, shifts, split, st } from '../faults/motion'
import { LANE, PARKED_X, SIDEWALK, signRight, straightRoad, withWorld } from '../faults/world'
import type { SituationLesson } from './types'

const P = PARTNER_COLORS
const WALK = 4.7

// ---------------------------------------------------------------- elindulás emelkedőn

const OWN_Z = 20
const hillK = kin(0, [{ wait: 2600 }, { wait: 2600 }, { to: 4, d: 0.8 }, { to: 18, d: 18 }])
const hillPlan = split(hillK, [st(18.8)], [0, 1, 3])
const leadK = kin(0, [{ wait: 1200 }, { to: 20, d: 40 }])

export const HILL1: SituationLesson = {
  id: 'elindulas-emelkedon',
  group: 'other',
  title: 'Elindulás emelkedőn',
  summary: 'Emelkedőn a kézifékkel indulsz, így az autó egy centit sem gurul vissza a mögötted álló felé.',
  world: withWorld(straightRoad({ south: 70, north: -50 }), { signs: [signRight('A-006', 50)] }),
  actors: [me(OWN_Z), actor('a', 'car', pose(MY_X, OWN_Z - 4.4 - 3), P[2]), actor('b', 'car', pose(MY_X, OWN_Z + 0.85 + 1.5 + 3.55), P[4])],
  steps: [
    {
      phase: 'step',
      title: 'Állás az emelkedőn',
      how: ['Emelkedőn állsz egy sorban, közvetlenül mögötted (másfél méterre) egy autó. A lábad a féken van.', 'Ha elinduláskor a fékről a gázra lépsz, az autó hátragurulhat: ezért a kéziféket használod.'],
      ms: hillPlan.ms[0],
      moves: { me: hillPlan.moves[0], a: driveSeq(leadK, [st(40)], hillPlan.ms)[0] },
      controls: { speed: hillPlan.speeds[0], gear: hold('1'), clutch: hold(1), brake: hold(0.4), handbrake: at([0, false], [0.5, true]) },
      marks: [{ kind: 'gap', a: 'me', b: 'b' }],
    },
    {
      phase: 'step',
      title: 'Felkészülés: gáz, csúszási pont',
      how: ['Behúzott kézifékkel leveszed a lábad a fékről, kicsit gázt adsz (kb. 1500–2000-es fordulat), és a kuplungot a csúszási pontig engeded.', 'Az autó eleje enyhén megemelkedik, a motor hangja mélyül: a kocsi „húz”.'],
      ms: hillPlan.ms[1],
      moves: { me: hillPlan.moves[1], a: driveSeq(leadK, [st(40)], hillPlan.ms)[1] },
      controls: { speed: hillPlan.speeds[1], brake: at<number>([0, 0.4], [0.15, 0]), gas: at<number>([0, 0], [0.25, 0.35]), clutch: at<number>([0, 1], [0.35, 1], [0.8, 0.5]), handbrake: hold(true) },
      marks: [{ kind: 'gap', a: 'me', b: 'b' }],
      mistakes: [{ code: '2/3', text: 'A pedálokat és a kéziféket nem összehangoltan kezeli (túráztat, rángat).' }],
    },
    {
      phase: 'step',
      title: 'Kézifék ki, indulás',
      how: ['A csúszási ponton kiengeded a kéziféket: az autó előre indul, nem gurul vissza.', 'A gázt növelve, a kuplungot fokozatosan felengedve elindulsz.'],
      ms: hillPlan.ms[2],
      moves: { me: hillPlan.moves[2], a: driveSeq(leadK, [st(40)], hillPlan.ms)[2] },
      controls: { speed: hillPlan.speeds[2], handbrake: at([0, true], [0.05, false]), gas: hold(0.35), clutch: at<number>([0, 0.5], [0.3, 0]) },
      marks: [{ kind: 'gap', a: 'me', b: 'b' }],
      mistakes: [{ code: '8/7', text: 'Elinduláskor több mint 50 cm-t hátragurul.' }],
    },
  ],
}

// ---------------------------------------------------------------- kihajtás ingatlanról

/** Az udvar felől a kapuig: a hátsó tengely itt indul (az orr nyugat felé néz) */
const GATE_X = 14
const DRIVE_R = 5
const SIDEWALK_OUT = LANE + SIDEWALK
const drivewayWorld = () =>
  withWorld(straightRoad({ south: 80, north: -60 }), {
    asphalt: [{ x: (LANE + GATE_X + 2) / 2, z: 0, w: GATE_X + 2 - LANE, d: 7 }],
    bounds: [-10, -40, 18, 40],
    view: [28, 40],
  })
// A hátsó tengely helyei: megállás a járda előtt (az orr 0,4 m-re a járdától), majd az úttest széle előtt, aztán ív jobbra
const AT_WALK = SIDEWALK_OUT + 0.4 + FRONT
const AT_ROAD = LANE + 0.4 + FRONT
const ARC_X = MY_X + DRIVE_R
const S1 = GATE_X - AT_WALK
const S2 = AT_WALK - AT_ROAD
const exitPath: Segment[] = [st(S1), st(S2), st(AT_ROAD - ARC_X), arcR(DRIVE_R, 90), st(25)]
const dK = kin(0, [{ to: 5, d: S1 * 0.4 }, { to: 0, d: S1 * 0.6 }, { wait: 3200 }, { to: 5, d: S2 * 0.5 }, { to: 0, d: S2 * 0.5 }, { wait: 3600 }, { to: 12, d: AT_ROAD - ARC_X + (Math.PI / 2) * DRIVE_R }, { to: 30, d: 25 }])
const dPlan = split(dK, exitPath, [1, 2, 4, 5, 7])
const pedK = kin(0, [{ wait: 1500 }, { to: WALK, d: 0.3 }, { to: WALK, d: 13 }])
const carK = kin(40, [{ to: 40, d: 300 }])

export const DRIVEWAY1: SituationLesson = {
  id: 'kihajtas-ingatlanrol',
  group: 'other',
  title: 'Kihajtás ingatlanról',
  summary: 'Kapubejáróból kihajtva előbb a járdán haladó gyalogosnak, aztán az úton érkezőknek kell elsőbbséget adni.',
  world: drivewayWorld(),
  actors: [me(0, GATE_X, -Math.PI / 2), actor('ped', 'ped', pose(LANE + SIDEWALK / 2, -7, S), '#7c3aed'), actor('c', 'car', pose(MY_X, 150, N), P[1])],
  steps: [
    {
      phase: 'step',
      title: 'Lassan a járda széléig',
      how: ['Az ingatlanról lépésben gurulsz ki, és a járda előtt megállsz.', 'A járdán haladó gyalogosnak elsőbbsége van: jobbról egy gyalogos közeledik.'],
      ms: dPlan.ms[0],
      moves: { me: dPlan.moves[0], ped: driveSeq(pedK, [st(13.3)], dPlan.ms)[0], c: driveSeq(carK, [st(300)], dPlan.ms)[0] },
      controls: { speed: dPlan.speeds[0], gear: hold('1'), gas: hold(0.08), brake: pulse(0.6, 1, 0.3) },
      look: at([0, 'right'], [0.5, 'left']),
    },
    {
      phase: 'step',
      title: 'A gyalogos elhalad',
      how: ['Megvárod, amíg a gyalogos elhalad előtted.', 'Csak utána gurulsz tovább a járdán át.'],
      ms: dPlan.ms[1],
      moves: { me: dPlan.moves[1], ped: driveSeq(pedK, [st(13.3)], dPlan.ms)[1], c: driveSeq(carK, [st(300)], dPlan.ms)[1] },
      controls: { speed: dPlan.speeds[1], brake: hold(0.3), clutch: hold(1) },
      look: at([0, 'right'], [0.6, 'left']),
      mistakes: [{ code: '8/27', text: 'Nem ad elsőbbséget a járdán haladó gyalogosnak.' }],
    },
    {
      phase: 'step',
      title: 'Átgurulás a járdán, megállás az úttest szélén',
      how: ['Lassan átgurulsz a járdán, és az úttest széle előtt újra megállsz.', 'Innen már belátod az utat: balról egy autó közeledik.'],
      ms: dPlan.ms[2],
      moves: { me: dPlan.moves[2], ped: driveSeq(pedK, [st(13.3)], dPlan.ms)[2], c: driveSeq(carK, [st(300)], dPlan.ms)[2] },
      controls: { speed: dPlan.speeds[2], brake: pulse(0.55, 1, 0.3), clutch: hold(0.55), gas: hold(0.08) },
      look: at([0, 'left'], [0.5, 'right']),
    },
    {
      phase: 'step',
      title: 'Elsőbbségadás az úton érkezőnek',
      how: ['Ingatlanról kihajtva az úttesten haladóknak elsőbbséget kell adni: megvárod, amíg az autó elhalad.', 'Utána jelzés jobbra, és újra balra, jobbra nézel.'],
      ms: dPlan.ms[3],
      moves: { me: dPlan.moves[3], ped: driveSeq(pedK, [st(13.3)], dPlan.ms)[3], c: driveSeq(carK, [st(300)], dPlan.ms)[3] },
      controls: { speed: dPlan.speeds[3], brake: hold(0.3), clutch: hold(1), indicator: at([0, 'off'], [0.5, 'right']) },
      look: at([0, 'left'], [0.6, 'right'], [0.85, 'left']),
      mistakes: [{ code: '8/24', text: 'Az úton haladó elé hajt ki.' }],
    },
    {
      phase: 'step',
      title: 'Kihajtás jobbra',
      how: ['Befordulsz jobbra, a sávod közepére, és felgyorsítasz.', 'A kanyar után kikapcsolod az irányjelzőt.'],
      ms: dPlan.ms[4],
      moves: { me: dPlan.moves[4], ped: driveSeq(pedK, [st(13.3)], dPlan.ms)[4], c: driveSeq(carK, [st(300)], dPlan.ms)[4] },
      controls: { speed: dPlan.speeds[4], brake: hold(0), clutch: at<number>([0, 1], [0.15, 0]), gas: hold(0.25), indicator: at([0, 'right'], [0.5, 'off']) },
    },
  ],
}

// ---------------------------------------------------------------- megállás a járda mellett

const kerbWorld = () => withWorld(straightRoad({ parking: true, south: 190, north: -80 }), { signs: [signRight('C-048', 40)], bounds: [-10, -80, 10, 190] })
const parkPath: Segment[] = [st(36), ...laneShift(PARKED_X - MY_X, 14), st(4), ...laneShift(MY_X - PARKED_X, 12), st(16)]
const SHIFT_IN = pathLength(parkPath.slice(0, 3)) - 36
const SHIFT_OUT = pathLength(parkPath.slice(4, 6))
const pK = kin(40, [{ to: 25, d: 36 }, { to: 0, d: SHIFT_IN + 4 }, { wait: 3500 }, { wait: 3500 }, { to: 25, d: SHIFT_OUT + 16 }])
const pPlan = split(pK, parkPath, [0, 1, 2, 3, 4])
const bK = kin(40, [{ to: 40, d: 300 }])

export const KERB1: SituationLesson = {
  id: 'megallas-jarda-mellett',
  group: 'other',
  title: 'Megállás a járda mellett és újraindulás',
  summary: 'Megállás a vizsgabiztos kérésére: szabályos helyen, jelzéssel, a járdával párhuzamosan; indulás jelzéssel, körültekintéssel.',
  world: kerbWorld(),
  actors: [me(60), actor('b', 'car', pose(MY_X, 180, N), P[6])],
  steps: [
    {
      phase: 'step',
      title: 'Megfelelő hely kiválasztása',
      how: [
        'A vizsgabiztos kéri: „Álljon meg a járda mellett!” A „Megállni tilos” táblás szakaszon, zebrán és előtte 5 m-en, kereszteződésben és 5 m-en belül, buszmegállóban nem lehet.',
        'A tábla utáni szakasz már a parkolósáv: itt szabad megállni.',
      ],
      ms: pPlan.ms[0],
      moves: { me: pPlan.moves[0], b: driveSeq(bK, [st(300)], pPlan.ms)[0] },
      controls: { speed: pPlan.speeds[0], gas: hold(0), ...shifts('3', [0.6, '2']) },
      look: at([0, 'mirror_inner'], [0.2, 'mirror_right'], [0.35, 'ahead']),
      mistakes: [{ code: '8/1', text: 'Olyan helyen áll meg, ahol tilos.' }],
    },
    {
      phase: 'step',
      title: 'Jelzés jobbra, beállás',
      how: ['Tükör, jelzés jobbra, és egyenletesen lassítva a járdához közel (kb. 20–30 cm-re), vele párhuzamosan állsz meg.', 'A kerék nem érhet a szegélyhez.'],
      ms: pPlan.ms[1],
      moves: { me: pPlan.moves[1], b: driveSeq(bK, [st(300)], pPlan.ms)[1] },
      controls: { speed: pPlan.speeds[1], indicator: hold('right'), brake: pulse(0.1, 1, 0.3), ...shifts('2', [0.85, 'N']) },
      mistakes: [{ code: '8/19', text: 'Megálláskor felhajt a járdaszegélyre.' }],
    },
    {
      phase: 'step',
      title: 'Rögzítés',
      how: ['Megállás után behúzod a kéziféket, és kikapcsolod az irányjelzőt.', 'Ha hosszabban várakozol, a motort is leállítod, és sebességbe kapcsolsz.'],
      ms: pPlan.ms[2],
      moves: { me: pPlan.moves[2], b: driveSeq(bK, [st(300)], pPlan.ms)[2] },
      controls: { speed: pPlan.speeds[2], indicator: at([0, 'right'], [0.3, 'off']), brake: at<number>([0, 0.3], [0.5, 0]), handbrake: at([0, false], [0.25, true]) },
      mistakes: [{ code: '8/34', text: 'Várakozáskor nem rögzíti a járművet a kézifékkel.' }],
    },
    {
      phase: 'step',
      title: 'Indulás előtt: jelzés, körülnézés',
      how: ['Egyesbe kapcsolsz, bekapcsolod a bal irányjelzőt, és a tükörbe, majd a bal vállad fölött nézel: hátulról egy autó jön.', 'Megvárod, amíg elhalad; a jelzés nem ad elsőbbséget.'],
      ms: pPlan.ms[3],
      moves: { me: pPlan.moves[3], b: driveSeq(bK, [st(300)], pPlan.ms)[3] },
      controls: { speed: pPlan.speeds[3], indicator: at([0, 'off'], [0.1, 'left']), ...shifts('N', [0.15, '1']), handbrake: hold(true) },
      look: at([0, 'mirror_inner'], [0.2, 'mirror_left'], [0.5, 'shoulder_left'], [0.8, 'mirror_left']),
      mistakes: [{ code: '6/9', text: 'Jelez és rögtön kihúzódik, nem győződik meg róla, hogy elengedik.' }],
    },
    {
      phase: 'step',
      title: 'Kihúzódás',
      how: ['Ha a sáv szabad, kiengeded a kéziféket, és enyhe ívben kihúzódsz a forgalomba.', 'A sávod közepén kikapcsolod az irányjelzőt.'],
      ms: pPlan.ms[4],
      moves: { me: pPlan.moves[4], b: driveSeq(bK, [st(300)], pPlan.ms)[4] },
      controls: { speed: pPlan.speeds[4], handbrake: at([0, true], [0.05, false]), clutch: at<number>([0, 1], [0.15, 0]), gas: hold(0.25), indicator: at([0, 'left'], [0.6, 'off']) },
      look: at([0, 'shoulder_left'], [0.1, 'ahead']),
    },
  ],
}


/** A csoport helyzetei a felsorolás sorrendjében */
export const OTHER: SituationLesson[] = [HILL1, DRIVEWAY1, KERB1]
