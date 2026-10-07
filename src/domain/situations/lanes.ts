import { pathLength, type Segment } from '../maneuvers/geometry'
import type { SiteRect } from '../maneuvers/types'
import { actor, E, FRONT, me, MY_X, ONCOMING_X, PARTNER_COLORS, pose, RIGHT_R, rightTurnZ, S, STOP_AT } from '../faults/lessons/common'
import { arcR, at, driveSeq, hold, kin, laneShift, pulse, shifts, split, st } from '../faults/motion'
import type { World } from '../faults/types'
import { buildingRow, dashesZ, junction, JUNCTION_EDGE, LANE, myLights, SIDEWALK, signRight, STOP_Z, straightRoad, withWorld } from '../faults/world'
import type { SituationLesson } from './types'

const P = PARTNER_COLORS
const WALK = 4.7

// ---------------------------------------------------------------- cipzár (forgalmi sáv megszűnése)

/** A jobb sáv a z = MERGE_END vonalon megszűnik; utána egy sáv marad (x ∈ [−3,5, 0]) */
const MERGE_END = -15
function mergeWorld(): World {
  const south = 100
  const north = -90
  const asphalt: SiteRect[] = [
    { x: -LANE / 2, z: (south + north) / 2, w: LANE, d: south - north },
    { x: LANE / 2, z: (south + MERGE_END) / 2, w: LANE, d: south - MERGE_END },
  ]
  const sidewalks: SiteRect[] = [
    { x: -LANE - SIDEWALK / 2, z: (south + north) / 2, w: SIDEWALK, d: south - north },
    { x: LANE + SIDEWALK / 2, z: (south + MERGE_END) / 2, w: SIDEWALK, d: south - MERGE_END },
    { x: SIDEWALK / 2, z: (MERGE_END + north) / 2, w: SIDEWALK, d: MERGE_END - north },
  ]
  return {
    asphalt,
    sidewalks,
    markings: dashesZ(0, MERGE_END + 6, south),
    signs: [signRight('merge_lanes', 45), signRight('E-012', 85)],
    buildings: [...buildingRow(-(LANE + SIDEWALK + 3), north, south, 3), ...buildingRow(LANE + SIDEWALK + 3, MERGE_END + 10, south, 4)],
    bounds: [-10, north, 10, south],
    view: [24, 46],
  }
}
const LEFT_X = -MY_X
const zipK = kin(30, [{ to: 30, d: 25 }, { to: 15, d: 22 }, { to: 15, d: 16 }, { to: 30, d: 40 }])
const zipPlan = split(zipK, [st(103)], [0, 1, 2, 3])
const m1Path: Segment[] = [st(48), ...laneShift(-LANE, 14), st(60)]
const m1K = kin(30, [{ to: 30, d: pathLength(m1Path) }])
const m1Moves = driveSeq(m1K, m1Path, zipPlan.ms)

export const ZIP1: SituationLesson = {
  id: 'cipzar',
  group: 'lanes',
  title: 'Forgalmi sáv megszűnése (cipzár)',
  summary: 'A megszűnő sávból érkezőt a sáv végén egyesével be kell engedni: felváltva haladtok tovább.',
  world: mergeWorld(),
  actors: [me(70, LEFT_X), actor('m', 'car', pose(MY_X, 58), P[1])],
  steps: [
    {
      phase: 'step',
      title: 'A jobb sáv megszűnik',
      how: ['A „Forgalmi sáv vége” tábla jelzi: a jobb sáv hamarosan megszűnik. Te a bal (megmaradó) sávban haladsz.', 'A jobb sávban, kissé előtted egy autó halad: neki a sáv végén át kell sorolnia.'],
      ms: zipPlan.ms[0],
      moves: { me: zipPlan.moves[0], m: m1Moves[0] },
      controls: { speed: zipPlan.speeds[0], gear: hold('3'), gas: hold(0.15) },
    },
    {
      phase: 'step',
      title: 'Hely hagyása (cipzár)',
      how: [
        'Torlódásnál a megszűnő sávból érkezők a sáv végén, felváltva sorolnak be („cipzár-elv”). Ehhez hagysz helyet magad előtt.',
        'Kicsit lassítasz, hogy a jobb sávból érkező elférjen előtted.',
      ],
      ms: zipPlan.ms[1],
      moves: { me: zipPlan.moves[1], m: m1Moves[1] },
      controls: { speed: zipPlan.speeds[1], gas: hold(0), ...shifts('3', [0.6, '2']) },
      blinks: { m: hold('left') },
      look: at([0, 'mirror_right'], [0.3, 'ahead']),
      mistakes: [{ code: '8/11', text: 'Nem veszi fel a forgalom ritmusát: vagy feleslegesen megáll, vagy nem enged be senkit.' }],
    },
    {
      phase: 'step',
      title: 'A besoroló előtted halad tovább',
      how: ['A jobb sávból érkező irányjelzéssel, egyenletesen besorol eléd.', 'A követési távolságot ezután újra felveszed.'],
      ms: zipPlan.ms[2],
      moves: { me: zipPlan.moves[2], m: m1Moves[2] },
      controls: { speed: zipPlan.speeds[2], gas: hold(0.05) },
      blinks: { m: at([0, 'left'], [0.7, 'off']) },
      marks: [{ kind: 'gap', a: 'me', b: 'm' }],
    },
    {
      phase: 'step',
      title: 'Továbbhaladás',
      how: ['Egy sávban, felváltva haladtok tovább.', 'Ha te lennél a megszűnő sávban, előbb jelzéssel és tükörbe nézéssel, a sáv végén sorolnál be, a besorolás joga nem ad elsőbbséget.'],
      ms: zipPlan.ms[3],
      moves: { me: zipPlan.moves[3], m: m1Moves[3] },
      controls: { speed: zipPlan.speeds[3], gas: hold(0.25), ...shifts('2', [0.5, '3']) },
      marks: [{ kind: 'gap', a: 'me', b: 'm' }],
      mistakes: [{ code: '8/22', text: 'A megszűnő sávból figyelmetlenül, a másik elé vágva sorol be.' }],
    },
  ],
}

// ---------------------------------------------------------------- útszűkület

const NARROW = { x: 1.9, z: 0, w: 3.0, d: 24 }
const narrowWorld = () =>
  withWorld(straightRoad({ south: 90, north: -90 }), {
    extras: [{ kind: 'island', ...NARROW }],
    signs: [signRight('A-007', 55), signRight('B-005', 26)],
  })
const NARROW_STOP = NARROW.z + NARROW.d / 2 + 2 + FRONT
const around: Segment[] = [...laneShift(-LANE, 10), st(26), ...laneShift(LANE, 10), st(20)]
const nK = kin(40, [{ to: 25, d: 26 }, { to: 0, d: 70 - 26 - NARROW_STOP }, { wait: 5200 }, { to: 20, d: 12 }, { to: 30, d: pathLength(around) - 12 }])
const nPath: Segment[] = [st(70 - NARROW_STOP), ...around]
const nPlan = split(nK, nPath, [0, 1, 2, 4])
const oK = kin(40, [{ to: 40, d: 260 }])
const oMoves = driveSeq(oK, [st(260)], nPlan.ms)

export const NARROW1: SituationLesson = {
  id: 'utszukulet',
  group: 'lanes',
  title: 'Útszűkület: a szembejövő elsőbbsége',
  summary: 'A „Szembejövő forgalom elsőbbsége” táblánál a szűkület előtt meg kell várnod a szemből érkezőket.',
  world: narrowWorld(),
  actors: [me(70), actor('o', 'car', pose(ONCOMING_X, -150, S), P[2])],
  steps: [
    {
      phase: 'step',
      title: 'Útszűkület tábla',
      how: ['„Útszűkület”, majd „Szembejövő forgalom elsőbbsége” tábla: a te oldaladon szűkül az út, a szemből érkezőknek elsőbbségük van.', 'Lassítasz, és már messziről nézed, jön-e valaki szemből.'],
      ms: nPlan.ms[0],
      moves: { me: nPlan.moves[0], o: oMoves[0] },
      controls: { speed: nPlan.speeds[0], gas: hold(0), ...shifts('3', [0.6, '2']) },
    },
    {
      phase: 'step',
      title: 'Megállás a szűkület előtt',
      how: ['Szemből egy autó közeledik, ezért a szűkület előtt megállsz.', 'Annyira állj meg, hogy a szembejövő kényelmesen elhaladhasson, és utána ki tudj húzódni.'],
      ms: nPlan.ms[1],
      moves: { me: nPlan.moves[1], o: oMoves[1] },
      controls: { speed: nPlan.speeds[1], brake: pulse(0.05, 1, 0.3), ...shifts('2', [0.85, '1']) },
      mistakes: [{ code: '8/26', text: 'Nem a jelzésnek megfelelően közlekedik: behajt a szűkületbe a szembejövő elé.' }],
    },
    {
      phase: 'step',
      title: 'A szembejövő elhalad',
      how: ['Megvárod, amíg a szembejövő elhalad.', 'Ha a tábla fordított lenne („Elsőbbség a szembejövő forgalommal szemben”), neked lenne elsőbbséged, de akkor is óvatosan haladnál.'],
      ms: nPlan.ms[2],
      moves: { me: nPlan.moves[2], o: oMoves[2] },
      controls: { speed: nPlan.speeds[2], brake: hold(0.3), clutch: hold(1) },
    },
    {
      phase: 'step',
      title: 'Áthaladás a szűkületen',
      how: ['Tükör, jelzés balra, és kihúzódsz, áthaladsz a szűkületen, majd jelzéssel visszatérsz a sávodba.', 'Közben figyeled, nem érkezik-e újabb jármű szemből.'],
      ms: nPlan.ms[3],
      moves: { me: nPlan.moves[3], o: oMoves[3] },
      controls: { speed: nPlan.speeds[3], brake: hold(0), clutch: at<number>([0, 1], [0.12, 0]), gas: hold(0.2), indicator: at([0, 'left'], [0.25, 'off'], [0.6, 'right'], [0.8, 'off']) },
    },
  ],
}

// ---------------------------------------------------------------- egyirányú utca

const oneWayWorld = () =>
  withWorld(junction({ arm: 80 }), {
    signs: [
      // A nyugati ág egyirányú, a kereszteződésből nem lehet behajtani
      { code: 'C-001', x: -(JUNCTION_EDGE + 1.2), z: -(LANE + 1.2), facing: Math.PI / 2 },
      // A keleti ág egyirányú, a jelölt irányban (kelet felé)
      { code: 'E-013', x: JUNCTION_EDGE + 1.2, z: LANE + 1.2, facing: -Math.PI / 2 },
    ],
    bounds: [-30, -24, 34, 50],
  })
const owPath: Segment[] = [st(40 - rightTurnZ()), arcR(RIGHT_R, 90), st(8), ...laneShift(-LANE, 14), st(10)]
const owK = kin(30, [{ to: 12, d: 40 - rightTurnZ() }, { to: 12, d: (Math.PI / 2) * RIGHT_R }, { to: 30, d: pathLength(owPath) - (40 - rightTurnZ()) - (Math.PI / 2) * RIGHT_R }])
const owPlan = split(owK, owPath, [0, 1, 2])

export const ONEWAY1: SituationLesson = {
  id: 'egyiranyu-utca',
  group: 'lanes',
  title: 'Egyirányú utca',
  summary: 'Balra „Behajtani tilos”, jobbra egyirányú utca: csak jobbra kanyarodhatsz, és ott a teljes úttestet használhatod.',
  world: oneWayWorld(),
  actors: [me(40)],
  steps: [
    {
      phase: 'step',
      title: 'A táblák: balra tilos, jobbra egyirányú',
      how: [
        'A balra eső utca elején „Behajtani tilos” tábla áll: az egyirányú utca ezen a végén nem hajthatsz be. Jobbra „Egyirányú forgalmú út” tábla mutatja a haladási irányt.',
        'Ezért jobbra kanyarodsz: tükör, jelzés jobbra, lassítás.',
      ],
      ms: owPlan.ms[0],
      moves: { me: owPlan.moves[0] },
      controls: { speed: owPlan.speeds[0], indicator: hold('right'), gas: hold(0), ...shifts('3', [0.5, '2']) },
      look: at([0, 'left'], [0.3, 'right'], [0.6, 'mirror_right']),
      mistakes: [{ code: '8/26', text: 'Behajt a „Behajtani tilos” táblával jelzett utcába.' }],
    },
    {
      phase: 'step',
      title: 'Befordulás az egyirányú utcába',
      how: ['Befordulsz jobbra. Az egyirányú utcában mindkét sáv a te irányodba visz.', 'Ha a következő kereszteződésben balra fordulnál, időben a bal szélső sávba kell sorolnod.'],
      ms: owPlan.ms[1],
      moves: { me: owPlan.moves[1] },
      controls: { speed: owPlan.speeds[1], indicator: hold('right'), gas: hold(0.1) },
    },
    {
      phase: 'step',
      title: 'Besorolás balra',
      how: ['Mivel a következő utcába balra fordulsz, tükör, jelzés és váll fölötti pillantás után átsorolsz a bal sávba.', 'Egyirányú utcában balra kanyarodáshoz a bal szélső sávból kell indulni.'],
      ms: owPlan.ms[2],
      moves: { me: owPlan.moves[2] },
      controls: { speed: owPlan.speeds[2], indicator: at([0, 'off'], [0.2, 'left'], [0.85, 'off']), gas: hold(0.25), ...shifts('2', [0.6, '3']) },
      look: at([0, 'ahead'], [0.15, 'mirror_left'], [0.25, 'shoulder_left'], [0.35, 'ahead']),
      mistakes: [{ code: '4/10', text: 'Nem a továbbhaladási szándéknak megfelelő sávba sorol be.' }],
    },
  ],
}

// ---------------------------------------------------------------- villogó sárga lámpa

const flashWorld = () =>
  withWorld(junction({ arm: 80, myLine: 'give_way' }), {
    lights: myLights('L'),
    signs: [signRight('B-001', STOP_Z + 2.4)],
    bounds: [-34, -24, 34, 60],
    view: [52, 52],
  })
const fK = kin(40, [{ to: 20, d: 24 }, { to: 0, d: 60 - 24 - STOP_AT }, { wait: 3000 }, { to: 25, d: 30 }])
const fPlan = split(fK, [st(60 - STOP_AT + 30)], [0, 1, 2, 3])
const pFlashK = kin(40, [{ to: 40, d: 300 }])
const pFlash = driveSeq(pFlashK, [st(300)], fPlan.ms)

export const FLASH1: SituationLesson = {
  id: 'villogo-sarga',
  group: 'lanes',
  title: 'Villogó sárga vagy kikapcsolt lámpa',
  summary: 'Ha a lámpa sárgán villog vagy ki van kapcsolva, a táblák szerint kell elsőbbséget adni.',
  world: flashWorld(),
  actors: [me(60), actor('p', 'car', pose(-170, MY_X, E), P[3])],
  steps: [
    {
      phase: 'step',
      title: 'A lámpa sárgán villog',
      how: ['A jelzőlámpa sárgán villog: a kereszteződésben ilyenkor a táblák (és ha nincs tábla, az általános szabályok) szerint kell haladni.', 'A te utadon „Elsőbbségadás kötelező” tábla áll.'],
      ms: fPlan.ms[0],
      moves: { me: fPlan.moves[0], p: pFlash[0] },
      controls: { speed: fPlan.speeds[0], gas: hold(0), ...shifts('3', [0.6, '2']) },
      signals: { L: hold('flashing_yellow') },
    },
    {
      phase: 'step',
      title: 'Elsőbbségadás',
      how: ['Lassítasz, és a cápafogaknál megállsz: balról egy autó érkezik a főúton.', 'A villogó sárga nem ad elsőbbséget, csak fokozott óvatosságra figyelmeztet.'],
      ms: fPlan.ms[1],
      moves: { me: fPlan.moves[1], p: pFlash[1] },
      controls: { speed: fPlan.speeds[1], brake: pulse(0.05, 1, 0.3), ...shifts('2', [0.85, '1']) },
      signals: { L: hold('flashing_yellow') },
      look: at([0, 'left'], [0.6, 'right']),
      mistakes: [{ code: '8/26', text: 'A villogó sárgát szabad jelzésnek veszi, és nem a tábla szerint közlekedik.' }],
    },
    {
      phase: 'step',
      title: 'Várakozás',
      how: ['Megvárod, amíg a főúton haladó elhalad.', 'Balra, jobbra, majd újra balra nézel.'],
      ms: fPlan.ms[2],
      moves: { me: fPlan.moves[2], p: pFlash[2] },
      controls: { speed: fPlan.speeds[2], brake: hold(0.3), clutch: hold(1) },
      signals: { L: hold('flashing_yellow') },
      look: at([0, 'left'], [0.5, 'right'], [0.85, 'left']),
    },
    {
      phase: 'step',
      title: 'Áthaladás',
      how: ['Ha mindkét irány szabad, áthaladsz.', 'Ugyanígy kell eljárni akkor is, ha a lámpa teljesen ki van kapcsolva.'],
      ms: fPlan.ms[3],
      moves: { me: fPlan.moves[3], p: pFlash[3] },
      controls: { speed: fPlan.speeds[3], brake: hold(0), clutch: at<number>([0, 1], [0.15, 0]), gas: hold(0.25) },
      signals: { L: hold('flashing_yellow') },
    },
  ],
}

// ---------------------------------------------------------------- zöld kiegészítő nyíl

const AX = 16
function zebraEW(x0: number): SiteRect[] {
  const out: SiteRect[] = []
  for (let z = -LANE + 0.35; z < LANE; z += 1.0) out.push({ x: x0, z, w: 3, d: 0.5 })
  return out
}
const arrowWorld = () =>
  withWorld(junction({ arm: 80, myLine: 'stop' }), {
    lights: myLights('L').map((l) => ({ ...l, arrow: 'A' })),
    markings: zebraEW(AX),
    bounds: [-14, -20, 34, 50],
  })
const arK = kin(30, [{ to: 0, d: 40 - STOP_AT }, { wait: 1200 }, { to: 12, d: STOP_AT - rightTurnZ() + (Math.PI / 2) * RIGHT_R }, { to: 0, d: AX - 1.5 - 1.2 - FRONT - (MY_X + RIGHT_R) }, { wait: 4200 }, { to: 25, d: 20 }])
const arPath: Segment[] = [st(40 - rightTurnZ()), arcR(RIGHT_R, 90), st(40)]
const arPlan = split(arK, arPath, [0, 1, 2, 3, 4, 5])
const arPed = kin(0, [{ wait: arK.ends[2] - 2500 }, { to: WALK, d: 0.3 }, { to: WALK, d: 2 * (LANE + 1.25) - 0.3 }])
const arPedMoves = driveSeq(arPed, [st(2 * (LANE + 1.25))], arPlan.ms)

export const ARROW1: SituationLesson = {
  id: 'zold-nyil',
  group: 'lanes',
  title: 'Zöld kiegészítő nyíl',
  summary: 'Piros mellett a zöld nyíl irányába kanyarodhatsz, de a gyalogosoknak elsőbbséget kell adnod.',
  world: arrowWorld(),
  actors: [me(40), actor('ped', 'ped', pose(AX, -(LANE + 1.25), S), '#db2777')],
  steps: [
    {
      phase: 'step',
      title: 'Piros, mellette zöld nyíl',
      how: ['A fő lámpa pirosat mutat, mellette a jobbra mutató kiegészítő lámpa zölden világít.', 'Jobbra kanyarodni a nyíl irányában szabad, de előbb megállsz a stopvonalnál, és körülnézel.'],
      ms: arPlan.ms[0],
      moves: { me: arPlan.moves[0], ped: arPedMoves[0] },
      controls: { speed: arPlan.speeds[0], indicator: hold('right'), brake: pulse(0.1, 1, 0.3), ...shifts('2', [0.85, '1']) },
      signals: { L: hold('red'), A: hold('green') },
    },
    {
      phase: 'step',
      title: 'Körülnézés',
      how: ['Balra nézel (a keresztező úton zöldet kapók érkezhetnek), jobbra a zebra felé.', 'A célút zebráján a gyalogosok is zöldet kaphatnak: nekik elsőbbségük van.'],
      ms: arPlan.ms[1],
      moves: { me: arPlan.moves[1], ped: arPedMoves[1] },
      controls: { speed: arPlan.speeds[1], indicator: hold('right'), brake: hold(0.3), clutch: hold(1) },
      signals: { L: hold('red'), A: hold('green') },
      look: at([0, 'left'], [0.5, 'right']),
    },
    {
      phase: 'step',
      title: 'Kanyarodás lassan',
      how: ['Lassan befordulsz jobbra, közben a zebrát figyeled: egy gyalogos lelép.', 'A zöld nyíl nem ad elsőbbséget: aki a saját irányában zöldet kapott, azt elengeded.'],
      ms: arPlan.ms[2],
      moves: { me: arPlan.moves[2], ped: arPedMoves[2] },
      controls: { speed: arPlan.speeds[2], indicator: hold('right'), brake: hold(0), clutch: at<number>([0, 1], [0.15, 0]), gas: hold(0.1) },
      signals: { L: hold('red'), A: hold('green') },
      look: hold('right'),
      mistakes: [{ code: '8/27', text: 'A zöld nyílnál nem ad elsőbbséget a zebrán áthaladó gyalogosnak.' }],
    },
    {
      phase: 'step',
      title: 'Megállás a zebra előtt',
      how: ['A zebra előtt megállsz.', 'Ne állj meg a kereszteződés közepén: csak akkor kanyarodj be, ha a zebra előtt elférsz.'],
      ms: arPlan.ms[3],
      moves: { me: arPlan.moves[3], ped: arPedMoves[3] },
      controls: { speed: arPlan.speeds[3], indicator: at([0, 'right'], [0.5, 'off']), brake: pulse(0.05, 1, 0.3) },
      signals: { L: hold('red'), A: hold('green') },
    },
    {
      phase: 'step',
      title: 'Várakozás',
      how: ['Megvárod, amíg a gyalogos átér.', 'A nyíl közben kialudhat: ha már a kereszteződésben vagy, a kanyarodást befejezheted.'],
      ms: arPlan.ms[4],
      moves: { me: arPlan.moves[4], ped: arPedMoves[4] },
      controls: { speed: arPlan.speeds[4], brake: hold(0.3), clutch: hold(1) },
      signals: { L: hold('red'), A: at([0, 'green'], [0.7, 'red']) },
    },
    {
      phase: 'step',
      title: 'Továbbhaladás',
      how: ['A zebra szabad: elindulsz.', 'Kikapcsolt irányjelzővel, egyenletesen gyorsítasz.'],
      ms: arPlan.ms[5],
      moves: { me: arPlan.moves[5], ped: arPedMoves[5] },
      controls: { speed: arPlan.speeds[5], brake: hold(0), clutch: at<number>([0, 1], [0.15, 0]), gas: hold(0.25) },
      signals: { L: hold('red'), A: hold('red') },
    },
  ],
}


/** A csoport helyzetei a felsorolás sorrendjében */
export const LANES: SituationLesson[] = [ZIP1, NARROW1, ONEWAY1, FLASH1, ARROW1]
