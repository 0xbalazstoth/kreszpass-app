import { pathLength, type Segment } from '../maneuvers/geometry'
import type { SiteRect } from '../maneuvers/types'
import { actor, FRONT, me, MY_X, N, PARTNER_COLORS, pose, RIGHT_R, rightTurnZ, S } from '../faults/lessons/common'
import { arcR, at, driveSeq, hold, kin, laneShift, pulse, shifts, split, st } from '../faults/motion'
import { junction, LANE, signRight, solidZ, straightRoad, withWorld } from '../faults/world'
import type { SituationLesson } from './types'

const P = PARTNER_COLORS
/** Gyalogos tempója (km/h) */
const WALK = 4.7

/** Zebra egy kelet–nyugati úton (a csíkok a forgalommal párhuzamosak), az x helyen */
function zebraEW(x0: number): SiteRect[] {
  const out: SiteRect[] = []
  for (let z = -LANE + 0.35; z < LANE; z += 1.0) out.push({ x: x0, z, w: 3, d: 0.5 })
  return out
}

/** Gyalogos mozgása: `startMs`-ig áll, aztán egyenletes tempóval megteszi a `dist` utat */
const walker = (startMs: number, dist: number) => kin(0, [{ wait: startMs }, { to: WALK, d: 0.3 }, { to: WALK, d: dist - 0.3 }])

// ---------------------------------------------------------------- zebra a kanyarodás után

const ZX = 16
const turnK = kin(30, [{ to: 12, d: 40 - rightTurnZ() }, { to: 12, d: (Math.PI / 2) * RIGHT_R }, { to: 0, d: ZX - 1.5 - 1.2 - FRONT - (MY_X + RIGHT_R) }, { wait: 4200 }, { to: 25, d: 20 }])
const turnPath: Segment[] = [st(40 - rightTurnZ()), arcR(RIGHT_R, 90), st(40)]
const zPlan = split(turnK, turnPath, [0, 1, 2, 3, 4])
// A gyalogos 3 másodperccel azelőtt indul, hogy megállnánk
const zPed = walker(turnK.ends[2] - 3000, 2 * (LANE + 1.25))
const zPedMoves = driveSeq(zPed, [st(2 * (LANE + 1.25))], zPlan.ms)

export const ZEBRA1: SituationLesson = {
  id: 'zebra-kanyar-utan',
  group: 'protected',
  title: 'Zebra a kanyarodás után',
  summary: 'Jobbra kanyarodás után közvetlenül zebra van: a kanyarban már a gyalogosokat is figyelni kell.',
  world: withWorld(junction(), {
    markings: zebraEW(ZX),
    signs: [{ code: 'E-038', x: ZX - 3, z: LANE + 1.2, facing: -Math.PI / 2 }],
    bounds: [-14, -20, 34, 46],
  }),
  actors: [me(40), actor('ped', 'ped', pose(ZX, -(LANE + 1.25), S), '#db2777')],
  steps: [
    {
      phase: 'step',
      title: 'Jobbra kanyarodás előtt',
      how: ['Jobbra kanyarodni készülsz: tükör, jelzés, lassítás 12 km/h-ra.', 'A célúton, közvetlenül a kanyar után kijelölt gyalogos-átkelőhely van: a járdán egy gyalogos az átkelés felé tart.'],
      ms: zPlan.ms[0],
      moves: { me: zPlan.moves[0], ped: zPedMoves[0] },
      controls: { speed: zPlan.speeds[0], indicator: hold('right'), gas: hold(0), ...shifts('3', [0.5, '2']) },
      look: at([0, 'mirror_right'], [0.15, 'ahead'], [0.7, 'right']),
    },
    {
      phase: 'step',
      title: 'Kanyarodás, a zebra figyelése',
      how: ['Befordulsz, és már a kanyarban a zebrát nézed: a gyalogos lelépett.', 'A kanyarodó járműnek elsőbbséget kell adnia a célúton áthaladó gyalogosnak.'],
      ms: zPlan.ms[1],
      moves: { me: zPlan.moves[1], ped: zPedMoves[1] },
      controls: { speed: zPlan.speeds[1], indicator: hold('right'), gas: hold(0.05) },
      look: hold('right'),
      mistakes: [{ code: '8/27', text: 'Kanyarodás után nem ad elsőbbséget a zebrán áthaladó gyalogosnak.' }],
    },
    {
      phase: 'step',
      title: 'Megállás a zebra előtt',
      how: ['A zebra előtt, attól kb. egy méterre megállsz, egyenletes fékezéssel.', 'Ne állj rá a zebrára, és ne állj meg a kereszteződés közepén.'],
      ms: zPlan.ms[2],
      moves: { me: zPlan.moves[2], ped: zPedMoves[2] },
      controls: { speed: zPlan.speeds[2], indicator: at([0, 'right'], [0.4, 'off']), brake: pulse(0.05, 1, 0.3), ...shifts('2', [0.85, '1']) },
      mistakes: [{ code: '8/15', text: 'Az utolsó pillanatban, durván fékez a gyalogos előtt.' }],
    },
    {
      phase: 'step',
      title: 'Megvárja, amíg átér',
      how: ['Megvárod, amíg a gyalogos teljesen átér (és a túloldalról sem lép le újabb).', 'Ne siettesd, és ne indulj el, amíg a sávod előtt jár.'],
      ms: zPlan.ms[3],
      moves: { me: zPlan.moves[3], ped: zPedMoves[3] },
      controls: { speed: zPlan.speeds[3], brake: hold(0.3), clutch: hold(1) },
      look: at([0, 'ahead'], [0.6, 'left'], [0.8, 'right']),
    },
    {
      phase: 'step',
      title: 'Továbbhaladás',
      how: ['Ha a zebra szabad, elindulsz.', 'A kanyar után kikapcsolt irányjelzővel, egyenletesen gyorsítasz.'],
      ms: zPlan.ms[4],
      moves: { me: zPlan.moves[4], ped: zPedMoves[4] },
      controls: { speed: zPlan.speeds[4], brake: hold(0), clutch: at<number>([0, 1], [0.15, 0]), gas: hold(0.25) },
    },
  ],
}

// ---------------------------------------------------------------- vasúti átjáró

const RAIL_STOP = 5.2
const railWorld = () =>
  withWorld(straightRoad({ south: 90, north: -70 }), {
    rail: { z: 0, lightAt: { x: LANE + 1.2, z: 4 }, barrier: { x: LANE + 0.5, z: 3, length: LANE + 0.3 } },
    markings: [{ x: MY_X, z: RAIL_STOP, w: LANE, d: 0.4 }],
    signs: [signRight('A-038+H-022', 60), signRight('A-047', 40), signRight('A-041', 5.6)],
    bounds: [-12, -60, 12, 90],
  })
const railStopAt = RAIL_STOP + 0.5 + FRONT
const railK = kin(40, [{ to: 25, d: 30 }, { to: 0, d: 80 - 30 - railStopAt }, { wait: 12000 }, { wait: 2500 }, { to: 15, d: 12 }, { to: 25, d: 20 }])
const railPlan = split(railK, [st(80 - railStopAt + 32)], [0, 1, 2, 3, 5])
const trainK = kin(60, [{ to: 60, d: 600 }])
// A vonat a második lépés elején még messze van: a jelzés előbb vált, a sorompó lezár, utána érkezik
const trainMoves = driveSeq(trainK, [st(600)], railPlan.ms)
// A sínek mögött álló autó: torlódás, csak a vonat után indul el
const qK = kin(0, [{ wait: railK.ends[2] + 800 }, { to: 25, d: 60 }])
const qMoves = driveSeq(qK, [st(60)], railPlan.ms)

export const RAIL1: SituationLesson = {
  id: 'vasuti-atjaro',
  group: 'protected',
  title: 'Vasúti átjáró fénysorompóval',
  summary: 'Villogó piros fénynél és lezáró sorompónál a megállóvonal előtt kell várni; a sínekre csak akkor hajts, ha a túloldalon van hely.',
  world: railWorld(),
  actors: [me(80), actor('train', 'train', pose(-400, 0, Math.PI / 2)), actor('q', 'car', pose(MY_X, -9, N), P[4])],
  steps: [
    {
      phase: 'step',
      title: 'Közeledés a vasúti átjáróhoz',
      how: [
        'Előjelző táblák jelzik a fény- és félsorompós vasúti átjárót. A fényjelző lassú villogó fehér fényt mutat: az átjárón szabad áthaladni, de csak fokozott óvatossággal.',
        'Lassítasz, és figyeled a jelzőt és a síneket mindkét irányban.',
      ],
      ms: railPlan.ms[0],
      moves: { me: railPlan.moves[0], train: trainMoves[0], q: qMoves[0] },
      controls: { speed: railPlan.speeds[0], gas: hold(0), ...shifts('3', [0.6, '2']) },
      rail: hold('white_flash'),
    },
    {
      phase: 'step',
      title: 'Villogó piros: megállás',
      how: [
        'A jelző váltakozva villogó piros fényre vált, a félsorompó lezár: vonat közeledik. A megállóvonal előtt meg kell állni.',
        'Villogó piros fénynél akkor is tilos áthaladni, ha a sorompó még nyitva van.',
      ],
      ms: railPlan.ms[1],
      moves: { me: railPlan.moves[1], train: trainMoves[1], q: qMoves[1] },
      controls: { speed: railPlan.speeds[1], brake: pulse(0.04, 1, 0.3), ...shifts('2', [0.85, 'N']) },
      rail: at([0, 'white_flash'], [0.05, 'red_flash']),
      barrier: at([0, false], [0.45, true]),
      mistakes: [{ code: '8/26', text: 'Villogó piros fénynél még áthajt az átjárón.' }],
    },
    {
      phase: 'step',
      title: 'Várakozás, a vonat elhalad',
      how: ['A megállóvonal előtt, üresben, fékkel tartva vársz. A vonat elhalad.', 'Ne kerülgesd a sorompót, és a sínek közelében ne állj meg.'],
      ms: railPlan.ms[2],
      moves: { me: railPlan.moves[2], train: trainMoves[2], q: qMoves[2] },
      controls: { speed: railPlan.speeds[2], brake: hold(0.3), gear: hold('N') },
      rail: hold('red_flash'),
      barrier: hold(true),
      look: at([0, 'left'], [0.5, 'right']),
    },
    {
      phase: 'step',
      title: 'Szabad jelzés, de a sínek mögött torlódás',
      how: [
        'A sorompó felnyílik, a jelző újra fehéren villog. A sínek mögött azonban áll egy autó.',
        'Csak akkor hajts a sínekre, ha a túloldalon biztosan van helyed: megvárod, amíg az előtted álló elindul és helyet hagy.',
      ],
      ms: railPlan.ms[3],
      moves: { me: railPlan.moves[3], train: trainMoves[3], q: qMoves[3] },
      controls: { speed: railPlan.speeds[3], brake: hold(0.3), ...shifts('N', [0.5, '1']) },
      rail: hold('white_flash'),
      barrier: at([0, true], [0.2, false]),
      marks: [{ kind: 'gap', a: 'me', b: 'q' }],
      mistakes: [{ code: '8/25', text: 'Úgy hajt a sínekre, hogy a túloldalon nincs hely, és a síneken kell megállnia.' }],
    },
    {
      phase: 'step',
      title: 'Áthaladás egy fokozatban',
      how: ['Elindulsz, és egyesben, majd kettesben, váltás nélkül, egyenletesen haladsz át a síneken.', 'A síneken nem váltasz és nem állsz meg.'],
      ms: railPlan.ms[4],
      moves: { me: railPlan.moves[4], train: trainMoves[4], q: qMoves[4] },
      controls: { speed: railPlan.speeds[4], brake: hold(0), clutch: at<number>([0, 1], [0.15, 0]), gas: hold(0.3) },
      rail: hold('white_flash'),
    },
  ],
}

// ---------------------------------------------------------------- villamosmegálló járdasziget nélkül

const TRAM_LANE_X = -1.0
const OWN_X = 3.2
const tramStopWorld = () =>
  withWorld(straightRoad({ parking: true, centre: 'none', south: 80, north: -70 }), {
    extras: [{ kind: 'tram_track', x: TRAM_LANE_X, z: 0, w: 2.1, d: 150 }],
    signs: [{ code: 'E-012', x: LANE + 2.3 + 1.2, z: 60, facing: 0 }, { code: 'E-041', x: LANE + 2.3 + 1.2, z: -2, facing: 0 }],
  })
const PED_ZS = [-6, -12]
const crossX = LANE + 2.3 + 1.0 - (TRAM_LANE_X + 1.2 + 0.4)
const TS_STOP = PED_ZS[0] + 1.6 + FRONT
const tsK = kin(30, [{ to: 15, d: 30 }, { to: 0, d: 60 - 30 - TS_STOP }, { wait: 6500 }, { to: 20, d: 40 }])
const tsPlan = split(tsK, [st(60 - TS_STOP + 40)], [0, 1, 2, 3])
const pedK = (delay: number) => walker(tsK.ends[1] - 2000 + delay, crossX)

export const TRAMSTOP1: SituationLesson = {
  id: 'villamosmegallo',
  group: 'protected',
  title: 'Villamosmegálló járdasziget nélkül',
  summary: 'A járdasziget nélküli megállóban álló villamos és a járda között, az utasok fel- és leszállása alatt meg kell állni.',
  world: tramStopWorld(),
  actors: [
    me(60, OWN_X),
    actor('tram', 'tram', pose(TRAM_LANE_X, -14, N)),
    ...PED_ZS.map((z, i) => actor(`ped${i}`, 'ped', pose(LANE + 2.3 + 1.0, z, -Math.PI / 2), i ? '#0f766e' : '#7c3aed')),
  ],
  steps: [
    {
      phase: 'step',
      title: 'Villamos a megállóban',
      how: ['Előtted, tőled balra a villamos a megállóban áll, ajtói nyitva. Járdasziget nincs: az utasok a járdáról, az úttesten át szállnak fel.', 'Lassítasz, és figyeled a járdáról lelépő utasokat.'],
      ms: tsPlan.ms[0],
      moves: { me: tsPlan.moves[0], ped0: driveSeq(pedK(0), [st(crossX)], tsPlan.ms)[0], ped1: driveSeq(pedK(1000), [st(crossX)], tsPlan.ms)[0] },
      controls: { speed: tsPlan.speeds[0], gas: hold(0), ...shifts('3', [0.6, '2']) },
    },
    {
      phase: 'step',
      title: 'Megállás az utasok előtt',
      how: [
        'Ahol a villamos és a járda között utasok mennek át, ott meg kell állni, és meg kell várni, amíg felszállnak.',
        'Az első átkelő utas előtt állsz meg, bő távolságra.',
      ],
      ms: tsPlan.ms[1],
      moves: { me: tsPlan.moves[1], ped0: driveSeq(pedK(0), [st(crossX)], tsPlan.ms)[1], ped1: driveSeq(pedK(1000), [st(crossX)], tsPlan.ms)[1] },
      controls: { speed: tsPlan.speeds[1], brake: pulse(0.05, 1, 0.3), ...shifts('2', [0.85, '1']) },
      mistakes: [{ code: '8/27', text: 'A villamos és a járda között halad el az utasok mellett (nem áll meg).' }],
    },
    {
      phase: 'step',
      title: 'Várakozás',
      how: ['Megvárod, amíg minden utas felszállt, és senki sem lép le a járdáról.', 'Ha a villamos ajtaja még nyitva van, további utasokra is számíts.'],
      ms: tsPlan.ms[2],
      moves: { me: tsPlan.moves[2], ped0: driveSeq(pedK(0), [st(crossX)], tsPlan.ms)[2], ped1: driveSeq(pedK(1000), [st(crossX)], tsPlan.ms)[2] },
      controls: { speed: tsPlan.speeds[2], brake: hold(0.3), clutch: hold(1) },
      look: at([0, 'ahead'], [0.5, 'right']),
    },
    {
      phase: 'step',
      title: 'Elhaladás a villamos mellett',
      how: ['Ha már senki sem megy át, lassan, a villamostól és a járdától is kellő távolságra elhaladsz.', 'Közben figyeled a járdát: késve érkező utas még leléphet.'],
      ms: tsPlan.ms[3],
      moves: { me: tsPlan.moves[3], ped0: driveSeq(pedK(0), [st(crossX)], tsPlan.ms)[3], ped1: driveSeq(pedK(1000), [st(crossX)], tsPlan.ms)[3] },
      controls: { speed: tsPlan.speeds[3], brake: hold(0), clutch: at<number>([0, 1], [0.15, 0]), gas: hold(0.2) },
    },
  ],
}

// ---------------------------------------------------------------- buszmegálló

const BUS_Z = -6
const busWorld = () => withWorld(straightRoad({ south: 80, north: -130 }), { signs: [signRight('E-039', BUS_Z - 7)] })
const busStopAt = BUS_Z + 6 + 4 + FRONT
const bK = kin(40, [{ to: 25, d: 20 }, { to: 0, d: 70 - 20 - busStopAt }, { wait: 2600 }, { to: 25, d: 40 }])
const bPlan = split(bK, [st(70 - busStopAt + 40)], [0, 1, 2, 3])
const busK = kin(0, [{ wait: bK.ends[1] + 600 }, { to: 30, d: 40 }, { to: 30, d: 100 }])
const busMoves = driveSeq(busK, [st(140)], bPlan.ms)

export const BUS1: SituationLesson = {
  id: 'buszmegallo',
  group: 'protected',
  title: 'Autóbusz kihaladása a megállóból',
  summary: 'Lakott területen a megállóból jelzéssel kihaladó autóbusznak lehetővé kell tenni az elindulást.',
  world: busWorld(),
  actors: [me(70), actor('bus', 'bus', pose(2.1, BUS_Z), '#1d4ed8')],
  steps: [
    {
      phase: 'step',
      title: 'Busz a megállóban, balra jelez',
      how: ['A megállóban álló busz bekapcsolja a bal irányjelzőjét: el akar indulni.', 'Lakott területen ilyenkor lassítani kell, és ha szükséges, meg kell állni, hogy kihaladhasson.'],
      ms: bPlan.ms[0],
      moves: { me: bPlan.moves[0], bus: busMoves[0] },
      controls: { speed: bPlan.speeds[0], gas: hold(0), ...shifts('3', [0.6, '2']) },
      blinks: { bus: hold('left') },
    },
    {
      phase: 'step',
      title: 'Megállás a busz mögött',
      how: ['Nem kerülöd ki az induló buszt: mögötte, kellő távolságra megállsz.', 'A busz így biztonságosan besorolhat a forgalomba.'],
      ms: bPlan.ms[1],
      moves: { me: bPlan.moves[1], bus: busMoves[1] },
      controls: { speed: bPlan.speeds[1], brake: pulse(0.05, 1, 0.3), ...shifts('2', [0.85, '1']) },
      blinks: { bus: hold('left') },
      marks: [{ kind: 'gap', a: 'me', b: 'bus' }],
      mistakes: [{ code: '8/25', text: 'Nem ismeri fel, hogy a kihaladó busznak elsőbbséget kell adnia, és kikerüli.' }],
    },
    {
      phase: 'step',
      title: 'A busz elindul',
      how: ['A busz kihalad a megállóból, és besorol.', 'Megvárod, amíg teljesen a sávba ér és gyorsít.'],
      ms: bPlan.ms[2],
      moves: { me: bPlan.moves[2], bus: busMoves[2] },
      controls: { speed: bPlan.speeds[2], brake: hold(0.3), clutch: hold(1) },
      blinks: { bus: at([0, 'left'], [0.6, 'off']) },
    },
    {
      phase: 'step',
      title: 'Követés',
      how: ['Elindulsz, és kellő követési távolsággal haladsz a busz mögött.', 'Ne előzd meg rögtön: a következő megállónál újra megállhat.'],
      ms: bPlan.ms[3],
      moves: { me: bPlan.moves[3], bus: busMoves[3] },
      controls: { speed: bPlan.speeds[3], brake: hold(0), clutch: at<number>([0, 1], [0.15, 0]), gas: hold(0.25) },
      marks: [{ kind: 'gap', a: 'me', b: 'bus' }],
    },
  ],
}

// ---------------------------------------------------------------- lakó-pihenő övezet

const zoneWorld = () => withWorld(straightRoad({ centre: 'none', south: 90, north: -90 }), { signs: [signRight('E-043', 60), signRight('E-044', -60)] })
const PED_X = 2.4
const passPath: Segment[] = [st(20), ...laneShift(-2.2, 10), st(30), ...laneShift(2.2, 10), st(50)]
const zK = kin(30, [{ to: 20, d: 20 }, { to: 10, d: 10 }, { to: 10, d: 30 }, { to: 20, d: pathLength(passPath) - 60 }])
const zPlan2 = split(zK, passPath, [0, 1, 2, 3])
const walkerK = kin(WALK, [{ to: WALK, d: 40 }])

export const ZONE1: SituationLesson = {
  id: 'lako-piheno-ovezet',
  group: 'protected',
  title: 'Lakó-pihenő övezet',
  summary: 'Legfeljebb 20 km/h, a gyalogosok az úttest teljes szélességét használhatják, és kihajtáskor elsőbbséget kell adni.',
  world: zoneWorld(),
  actors: [me(80), actor('ped', 'ped', pose(PED_X, 48, N), '#7c3aed')],
  steps: [
    {
      phase: 'step',
      title: 'Behajtás az övezetbe',
      how: ['A „Lakó-pihenő övezet” táblánál legfeljebb 20 km/h-val szabad haladni.', 'Az övezetben a gyalogosok az úttestet teljes szélességében használhatják, a gyerekek ott is játszhatnak.'],
      ms: zPlan2.ms[0],
      moves: { me: zPlan2.moves[0], ped: driveSeq(walkerK, [st(40)], zPlan2.ms)[0] },
      controls: { speed: zPlan2.speeds[0], gas: hold(0), ...shifts('3', [0.5, '2']) },
      mistakes: [{ code: '8/16', text: 'Az övezetben 20 km/h-nál gyorsabban halad.' }],
    },
    {
      phase: 'step',
      title: 'Gyalogos az úttesten',
      how: ['Előtted egy gyalogos az úttest közepén sétál: ez itt szabályos.', 'Lépésben haladó tempóra lassítasz, és nem dudálsz rá.'],
      ms: zPlan2.ms[1],
      moves: { me: zPlan2.moves[1], ped: driveSeq(walkerK, [st(40)], zPlan2.ms)[1] },
      controls: { speed: zPlan2.speeds[1], brake: pulse(0.1, 0.6, 0.2), ...shifts('2', [0.6, '1']) },
      mistakes: [{ code: '8/27', text: 'Nem megfelelően reagál a gyalogosra (szorosan, gyorsan halad el mellette).' }],
    },
    {
      phase: 'step',
      title: 'Elhaladás bő oldaltávolsággal',
      how: ['Lassan, legalább másfél méter oldaltávolsággal haladsz el a gyalogos mellett.', 'Közben figyeled, nem fordul-e meg vagy lép-e eléd.'],
      ms: zPlan2.ms[2],
      moves: { me: zPlan2.moves[2], ped: driveSeq(walkerK, [st(40)], zPlan2.ms)[2] },
      controls: { speed: zPlan2.speeds[2], gas: hold(0.05) },
      marks: [{ kind: 'gap', a: 'me', b: 'ped' }],
    },
    {
      phase: 'step',
      title: 'Az övezet vége',
      how: ['Az övezet végét jelző táblánál a megengedett sebesség újra a lakott területi.', 'Ha az övezetből egy útra hajtasz ki, az úton haladóknak elsőbbséget kell adnod.'],
      ms: zPlan2.ms[3],
      moves: { me: zPlan2.moves[3], ped: driveSeq(walkerK, [st(40)], zPlan2.ms)[3] },
      controls: { speed: zPlan2.speeds[3], gas: hold(0.2), ...shifts('1', [0.3, '2']) },
    },
  ],
}

// ---------------------------------------------------------------- kerékpársáv keresztezése

const BIKE_X = 2.9
const OWN_BX = 1.2
const bikeWorld = () =>
  withWorld(junction({ arm: 80 }), {
    markings: [solidZ(2.25, LANE + 2.5 + 1, 80)],
    bounds: [-14, -30, 30, 60],
    view: [36, 50],
  })
const bikeTurn: Segment[] = [st(45 - rightTurnZ()), arcR(RIGHT_R, 90), st(20)]
const bkK = kin(30, [{ to: 15, d: 20 }, { to: 0, d: 45 - rightTurnZ() - 20 }, { wait: 3000 }, { to: 12, d: (Math.PI / 2) * RIGHT_R }, { to: 25, d: 20 }])
const bkPlan = split(bkK, bikeTurn, [0, 1, 2, 4])
const bikeK = kin(18, [{ to: 18, d: 200 }])

export const BIKE1: SituationLesson = {
  id: 'kerekparsav',
  group: 'protected',
  title: 'Kerékpársáv keresztezése jobbra kanyarodáskor',
  summary: 'Jobbra kanyarodáskor a kerékpársávon egyenesen haladó kerékpárosnak elsőbbsége van: a holtteret is ellenőrizni kell.',
  world: bikeWorld(),
  actors: [me(45, OWN_BX), actor('k', 'bike', pose(BIKE_X, 70, N), '#22c55e')],
  steps: [
    {
      phase: 'step',
      title: 'Jobbra kanyarodás, mellette kerékpársáv',
      how: ['A sávod mellett, tőled jobbra kerékpársáv fut. Jobbra kanyarodni készülsz: jelzés jobbra, lassítás.', 'A tükörben látod: hátulról kerékpáros jön a kerékpársávon.'],
      ms: bkPlan.ms[0],
      moves: { me: bkPlan.moves[0], k: driveSeq(bikeK, [st(200)], bkPlan.ms)[0] },
      controls: { speed: bkPlan.speeds[0], indicator: hold('right'), gas: hold(0), ...shifts('3', [0.6, '2']) },
      look: at([0, 'mirror_inner'], [0.2, 'mirror_right']),
      marks: [{ kind: 'label', at: [BIKE_X + 2.5, 30], text: 'Kerékpársáv' }],
    },
    {
      phase: 'step',
      title: 'Holttér, megállás',
      how: ['A jobb vállad fölött hátranézel (a holttérben is lehet kerékpáros), és a kanyar előtt megállsz.', 'Az egyenesen haladó kerékpárosnak elsőbbsége van.'],
      ms: bkPlan.ms[1],
      moves: { me: bkPlan.moves[1], k: driveSeq(bikeK, [st(200)], bkPlan.ms)[1] },
      controls: { speed: bkPlan.speeds[1], indicator: hold('right'), brake: pulse(0.05, 1, 0.3), ...shifts('2', [0.85, '1']) },
      look: at([0, 'shoulder_right'], [0.4, 'mirror_right']),
      mistakes: [{ code: '8/28', text: 'Nem néz a tükörbe és hátra, és elvágja a kerékpárost.' }],
    },
    {
      phase: 'step',
      title: 'A kerékpáros elhalad',
      how: ['Megvárod, amíg a kerékpáros elhalad melletted és áthalad a kereszteződésen.', 'Újra a tükörbe és hátra nézel: jön-e még valaki.'],
      ms: bkPlan.ms[2],
      moves: { me: bkPlan.moves[2], k: driveSeq(bikeK, [st(200)], bkPlan.ms)[2] },
      controls: { speed: bkPlan.speeds[2], indicator: hold('right'), brake: hold(0.3), clutch: hold(1) },
      look: at([0, 'right'], [0.6, 'shoulder_right']),
    },
    {
      phase: 'step',
      title: 'Befordulás',
      how: ['Ha a kerékpársáv szabad, befordulsz jobbra.', 'A kanyar után kikapcsolod az irányjelzőt.'],
      ms: bkPlan.ms[3],
      moves: { me: bkPlan.moves[3], k: driveSeq(bikeK, [st(200)], bkPlan.ms)[3] },
      controls: { speed: bkPlan.speeds[3], brake: hold(0), clutch: at<number>([0, 1], [0.12, 0]), gas: hold(0.15), indicator: at([0, 'right'], [0.6, 'off']) },
    },
  ],
}


/** A csoport helyzetei a felsorolás sorrendjében */
export const PROTECTED: SituationLesson[] = [ZEBRA1, RAIL1, TRAMSTOP1, BUS1, ZONE1, BIKE1]
