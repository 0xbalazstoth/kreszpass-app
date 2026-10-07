import { pathLength, type Segment } from '../maneuvers/geometry'
import { arcL, arcR, at, driveSeq, hold, kin, pulse, shifts, split, st } from '../faults/motion'
import { actor, E, leftTurnZ, me, MY_X, ONCOMING_X, PARTNER_COLORS, pose, RIGHT_R, rightTurnZ, S, STOP_AT, W } from '../faults/lessons/common'
import { ringArc, ringEntryPsi, ringExitPsi, ringExitTail, ringRadius, ringRoute, roundabout } from '../faults/roundabout'
import type { Actor } from '../faults/types'
import { junction, JUNCTION_EDGE, LANE, signRight, STOP_Z, withWorld } from '../faults/world'
import { ringPose } from './common'
import type { SituationLesson } from './types'

const P = PARTNER_COLORS

// ---------------------------------------------------------------- egysávos körforgalom

const R1 = ringRadius(1)
/** A cápafogaknál itt áll meg a hátsó tengely (az első lökhárító fél méterrel a vonal előtt) */
const GIVE_WAY_AT = 14.75 + 0.5 + 3.55
/**
 * Út a körforgalmon át, a lépések szerint szakaszolva: közeledés (35→25 km/h), megállás a cápafogaknál, várakozás,
 * behajtás és haladás a `passExit`. kijárat utánig, haladás a kihajtásig, kihajtás.
 */
function ringPlan(exit: number, r: number, passExit: number, waitMs: number) {
  const route = ringRoute(exit, { from: 60, after: 25, r })
  const toStop = 60 - GIVE_WAY_AT
  const entryLen = route.entryAt + pathLength(route.path.slice(1, 2)) - toStop
  const ring = route.path[2]
  const ringLen = ring.kind === 'arc' ? ring.angle * r : 0
  let firstA = ringExitPsi(passExit, r) + 0.2 - ringEntryPsi(0, r)
  while (firstA < 0) firstA += Math.PI * 2
  const firstPart = Math.min(ringLen - 1, firstA * r)
  const tail = pathLength(route.path.slice(3))
  const k = kin(35, [{ to: 25, d: 25 }, { to: 0, d: toStop - 25 }, { wait: waitMs }, { to: 20, d: entryLen + firstPart }, { to: 20, d: ringLen - firstPart }, { to: 30, d: tail }])
  return split(k, route.path, [0, 1, 2, 3, 4, 5])
}

const r1 = ringPlan(2, R1, 1, 2600)
// A körben balról érkező autó: kb. 8 másodperc alatt ér a keleti kijárathoz (közben elhalad a behajtásunk előtt), és kihajt
const P_V = 20
const pStart = ringExitPsi(1, R1) - (((P_V / 3.6) * 8) / R1)
const pPath: Segment[] = [ringArc(pStart, ringExitPsi(1, R1), R1), ...ringExitTail(R1, 60)]
const pMoves = driveSeq(kin(P_V, [{ to: P_V, d: pathLength(pPath) }]), pPath, r1.ms)

const actors1: Actor[] = [me(60), { id: 'p', kind: 'car', color: P[1], start: ringPose(pStart, R1) }]

export const RB1: SituationLesson = {
  id: 'korforgalom-1',
  group: 'junctions',
  title: 'Egysávos körforgalom',
  summary: 'Behajtás elsőbbségadással, a körben jelzés nélkül, kihajtás előtt jobbra jelezve.',
  world: roundabout(),
  actors: actors1,
  steps: [
    {
      phase: 'step',
      title: 'Közeledés: táblák, lassítás',
      how: [
        'A körforgalom előtt „Körforgalmú útkereszteződés” és „Elsőbbségadás kötelező” tábla áll: a körben haladóknak elsőbbségük van.',
        'Leveszed a gázt, visszaváltasz, és a körforgalom felé nézve már figyeled, ki halad a körben balról.',
        'Behajtáskor nem kell irányjelzést adni (ha mégis jobbra jeleznél, az megtévesztő lenne).',
      ],
      ms: r1.ms[0],
      moves: { me: r1.moves[0], p: pMoves[0] },
      controls: { speed: r1.speeds[0], gas: hold(0), ...shifts('3', [0.6, '2']) },
      mistakes: [
        { code: '8/30', text: 'Behajtáskor jobbra jelez: a körben haladók azt hiszik, ki fog hajtani.' },
        { code: '6/1', text: 'Messze a körforgalom előtt indokolatlanul lelassít.' },
      ],
    },
    {
      phase: 'step',
      title: 'Elsőbbségadás balra',
      how: [
        'Balra nézel: a körben egy autó közeledik. Neki elsőbbsége van, ezért a cápafogak előtt megállsz.',
        'Ha a körben szabad lenne az út, nem kellene megállni: elég annyira lassítani, hogy biztonságosan be tudj hajtani.',
      ],
      ms: r1.ms[1],
      moves: { me: r1.moves[1], p: pMoves[1] },
      controls: { speed: r1.speeds[1], brake: at<number>([0, 0.15], [0.5, 0.3]), ...shifts('2', [0.9, '1']) },
      look: at([0, 'ahead'], [0.3, 'left']),
      mistakes: [
        { code: '8/24', text: 'Behajt a körben haladó elé: elsőbbséget kell neki adni.' },
        { code: '8/14', text: 'Olyan gyorsan érkezik, hogy szükség esetén sem tudna megállni.' },
      ],
    },
    {
      phase: 'step',
      title: 'Megvárja, amíg elhalad',
      how: ['Megvárod, amíg a körben haladó elhalad a behajtásod előtt, és figyeled, nem jön-e mögötte újabb.', 'Ha a körben haladó jobbra jelez és ki fog hajtani előtted, csak akkor indulj, ha a szándéka már egyértelmű.'],
      ms: r1.ms[2],
      moves: { me: r1.moves[2], p: pMoves[2] },
      controls: { speed: r1.speeds[2], brake: hold(0.3), clutch: hold(1) },
      look: at([0, 'left'], [0.7, 'ahead']),
      blinks: { p: at([0, 'off'], [0.2, 'right']) },
    },
    {
      phase: 'step',
      title: 'Behajtás, haladás a körben',
      how: [
        'Behajtasz, és a körpálya közepén, jelzés nélkül haladsz. Az első kijáratot elhagyod.',
        'A körben haladva a kormányt folyamatosan, kis szögben tartod balra; a sebesség 20 km/h körüli.',
      ],
      ms: r1.ms[3],
      moves: { me: r1.moves[3], p: pMoves[3] },
      controls: { speed: r1.speeds[3], brake: hold(0), clutch: at<number>([0, 1], [0.15, 0], [0.46, 0], [0.48, 1], [0.52, 1], [0.55, 0]), gear: at([0, '1'], [0.5, '2']), gas: hold(0.25) },
      look: at([0, 'left'], [0.2, 'ahead']),
      mistakes: [{ code: '8/23', text: 'A körben nem tartja a sávját (levágja vagy kisodródik).' }],
    },
    {
      phase: 'step',
      title: 'Jelzés jobbra a kijárat előtt',
      how: [
        'Miután elhagytad az előző kijáratot, bekapcsolod a jobb irányjelzőt: ebből tudják a többiek, hogy a következőn kihajtasz.',
        'Belenézel a jobb tükörbe, és figyeled a kijárat zebráját.',
      ],
      ms: r1.ms[4],
      moves: { me: r1.moves[4], p: pMoves[4] },
      controls: { speed: r1.speeds[4], indicator: hold('right'), gas: hold(0.15) },
      look: at([0, 'mirror_right'], [0.3, 'ahead']),
      mistakes: [{ code: '6/8', text: 'Csak a kihajtás pillanatában (vagy egyáltalán nem) jelez jobbra.' }],
    },
    {
      phase: 'step',
      title: 'Kihajtás',
      how: ['Kihajtasz a kijárat jobb sávjába; a jelzést kikapcsolod.', 'Ha a kijárati zebrán gyalogos van, előtte meg kell állnod.'],
      ms: r1.ms[5],
      moves: { me: r1.moves[5], p: pMoves[5] },
      controls: { speed: r1.speeds[5], indicator: at([0, 'right'], [0.5, 'off']), gas: hold(0.3), ...shifts('2', [0.7, '3']) },
      mistakes: [{ code: '8/27', text: 'Nem ad elsőbbséget a kijárati zebrán áthaladó gyalogosnak.' }],
    },
  ],
}


// ---------------------------------------------------------------- kétsávos körforgalom

const RIN = ringRadius(2, 'inner')
const ROUT = ringRadius(2, 'outer')
const r2 = ringPlan(3, RIN, 2, 2400)
const qStart = ringExitPsi(1, ROUT) - (((20 / 3.6) * 7.5) / ROUT)
const qPath: Segment[] = [ringArc(qStart, ringExitPsi(1, ROUT), ROUT), ...ringExitTail(ROUT, 60)]
const qMoves = driveSeq(kin(20, [{ to: 20, d: pathLength(qPath) }]), qPath, r2.ms)

export const RB2: SituationLesson = {
  id: 'korforgalom-2',
  group: 'junctions',
  title: 'Kétsávos körforgalom',
  summary: 'A harmadik kijárathoz a belső sávban haladsz, és kihajtás előtt meggyőződsz róla, hogy a külső sáv szabad.',
  world: roundabout({ lanes: 2 }),
  actors: [me(60), { id: 'q', kind: 'car', color: P[5], start: ringPose(qStart, ROUT) }],
  steps: [
    {
      phase: 'step',
      title: 'Közeledés, sávválasztás',
      how: [
        'A körforgalomban két sáv van. Az első kijárathoz a külső, a távolabbi (harmadik, negyedik) kijárathoz a belső sávot érdemes választani.',
        'Most a harmadik kijáraton (balra) hajtasz ki, ezért a belső sávba fogsz behajtani.',
      ],
      ms: r2.ms[0],
      moves: { me: r2.moves[0], q: qMoves[0] },
      controls: { speed: r2.speeds[0], gas: hold(0), ...shifts('3', [0.6, '2']) },
      mistakes: [{ code: '4/10', text: 'Nem a továbbhaladásnak megfelelő sávot választja.' }],
    },
    {
      phase: 'step',
      title: 'Elsőbbségadás mindkét sávnak',
      how: ['A körben mindkét sávban haladóknak elsőbbségük van: balra nézel, és megállsz, mert a külső sávban jön egy autó.', 'Csak akkor hajts be, ha a belső sávba vezető utad mindkét sávban szabad.'],
      ms: r2.ms[1],
      moves: { me: r2.moves[1], q: qMoves[1] },
      controls: { speed: r2.speeds[1], brake: at<number>([0, 0.15], [0.5, 0.3]), ...shifts('2', [0.9, '1']) },
      look: at([0, 'ahead'], [0.3, 'left']),
      mistakes: [{ code: '8/24', text: 'Behajt a körben haladó elé.' }],
    },
    {
      phase: 'step',
      title: 'Várakozás',
      how: ['Megvárod, amíg a külső sávban haladó elhalad (ő az első kijáraton kihajt).', 'Közben újra balra nézel: nem jön-e újabb jármű.'],
      ms: r2.ms[2],
      moves: { me: r2.moves[2], q: qMoves[2] },
      controls: { speed: r2.speeds[2], brake: hold(0.3), clutch: hold(1) },
      look: hold('left'),
      blinks: { q: hold('right') },
    },
    {
      phase: 'step',
      title: 'Behajtás a belső sávba, körözés',
      how: ['Behajtasz, és egyenletes ívben a belső sávba állsz. Az első és a második kijáratot elhagyod.', 'A körben a sávodat tartod, nem vágsz át a külső sávba.'],
      ms: r2.ms[3],
      moves: { me: r2.moves[3], q: qMoves[3] },
      controls: { speed: r2.speeds[3], brake: hold(0), clutch: at<number>([0, 1], [0.12, 0], [0.4, 0], [0.42, 1], [0.46, 1], [0.49, 0]), gear: at([0, '1'], [0.44, '2']), gas: hold(0.25) },
      mistakes: [{ code: '8/23', text: 'A körben nem követi a forgalmi sávját.' }],
    },
    {
      phase: 'step',
      title: 'Kihajtás előtt: tükör, váll fölött, jelzés',
      how: [
        'A második kijárat után jobbra jelzel. Belenézel a jobb tükörbe, majd a jobb vállad fölött a holttérbe: a külső sávban nem lehet senki melletted.',
        'Ha a külső sávban valaki halad, előbb őt engeded el (ha kell, még egy kört teszel).',
      ],
      ms: r2.ms[4],
      moves: { me: r2.moves[4], q: qMoves[4] },
      controls: { speed: r2.speeds[4], indicator: hold('right'), gas: hold(0.15) },
      look: at([0, 'mirror_right'], [0.35, 'shoulder_right'], [0.6, 'ahead']),
      mistakes: [
        { code: '8/22', text: 'Úgy húzódik át a külső sávon, hogy nem nézett körül.' },
        { code: '8/6', text: 'Kihajtás előtt elmarad a jelzés vagy a körültekintés.' },
      ],
    },
    {
      phase: 'step',
      title: 'Kihajtás',
      how: ['A külső sávon átívelve kihajtasz a kijárat jobb sávjába, majd kikapcsolod az irányjelzőt.', 'Figyeled a kijárati zebrát és a kerékpárosokat.'],
      ms: r2.ms[5],
      moves: { me: r2.moves[5], q: qMoves[5] },
      controls: { speed: r2.speeds[5], indicator: at([0, 'right'], [0.5, 'off']), gas: hold(0.3), ...shifts('2', [0.7, '3']) },
    },
  ],
}

// ---------------------------------------------------------------- kanyarodó főútvonal

const ARM = 70
const mainWorld = () =>
  withWorld(junction({ arm: ARM }), {
    signs: [
      signRight('B-003+H-001', STOP_Z + 1.2),
      signRight('B-003+H-001', 50),
      // A mellékutakon (északról és nyugatról) elsőbbségadás kötelező; a tábla a feléjük haladók felé néz
      { code: 'B-001+H-008', x: -(LANE + 1.2), z: -(JUNCTION_EDGE + 1.2), facing: Math.PI },
      { code: 'B-001+H-008', x: -(JUNCTION_EDGE + 1.2), z: LANE + 1.2, facing: -Math.PI / 2 },
    ],
    markings: [
      // Cápafogak a két mellékúton
      ...[0.4, 1.2, 2.0, 2.8].map((o) => ({ x: -o, z: -(STOP_Z), w: 0.5, d: 0.5 })),
      ...[0.4, 1.2, 2.0, 2.8].map((o) => ({ x: -STOP_Z, z: o, w: 0.5, d: 0.5 })),
    ],
    bounds: [-30, -30, 40, 60],
  })
const mainPath: Segment[] = [st(50 - rightTurnZ()), arcR(RIGHT_R, 90), st(30)]
const mk = kin(40, [{ to: 40, d: 12 }, { to: 15, d: 50 - rightTurnZ() - 12 }, { to: 15, d: (Math.PI / 2) * RIGHT_R }, { to: 35, d: 30 }])
const mainPlan = split(mk, mainPath, [0, 1, 2, 3])

export const MAIN1: SituationLesson = {
  id: 'kanyarodo-foutvonal',
  group: 'junctions',
  title: 'Főútvonal és kanyarodó főútvonal',
  summary: 'A főútvonal jobbra kanyarodik: követed, ezért jelezned kell, de elsőbbséged van a mellékutakról érkezőkkel szemben.',
  world: mainWorld(),
  actors: [me(50), actor('n', 'car', pose(ONCOMING_X, -(STOP_AT), S), P[2]), actor('w', 'car', pose(-(STOP_AT), MY_X, E), P[6])],
  steps: [
    {
      phase: 'step',
      title: 'A tábla: kanyarodó főútvonal',
      how: [
        'A „Főútvonal” tábla alatti kiegészítő tábla vastag vonala mutatja, merre halad tovább a főút: itt jobbra kanyarodik.',
        'A két mellékúton (északról és nyugatról) érkezőknek elsőbbségadás kötelező: neked van elsőbbséged, ha a főúton maradsz.',
      ],
      ms: mainPlan.ms[0],
      moves: { me: mainPlan.moves[0] },
      controls: { speed: mainPlan.speeds[0], gear: hold('3'), gas: hold(0.2) },
    },
    {
      phase: 'step',
      title: 'Tükör, jelzés jobbra, lassítás',
      how: [
        'A főút követése is irányváltoztatás: tükörbe nézel, és jobbra jelzel, mielőtt lassítani kezdesz.',
        '15 km/h-ra lassítasz, és visszaváltasz másodikba.',
      ],
      ms: mainPlan.ms[1],
      moves: { me: mainPlan.moves[1] },
      controls: { speed: mainPlan.speeds[1], gas: hold(0), indicator: hold('right'), brake: pulse(0.15, 0.85, 0.3), ...shifts('3', [0.6, '2']) },
      look: at([0, 'mirror_inner'], [0.08, 'mirror_right'], [0.18, 'ahead']),
      mistakes: [
        { code: '8/6', text: 'A kanyarodó főút követésekor nem jelez.' },
        { code: '4/4', text: 'Előbb fékez, és csak utána jelez.' },
      ],
    },
    {
      phase: 'step',
      title: 'Befordulás a főúton',
      how: [
        'Befordulsz jobbra: a mellékutakon várakozók elengednek. Ennek ellenére figyeld őket, hogy valóban megállnak-e.',
        'A kanyar ívét folyamatosan kormányozva, a célút jobb sávjába érkezel.',
      ],
      ms: mainPlan.ms[2],
      moves: { me: mainPlan.moves[2] },
      controls: { speed: mainPlan.speeds[2], indicator: hold('right'), gas: hold(0.1) },
      look: at([0, 'left'], [0.3, 'ahead']),
    },
    {
      phase: 'step',
      title: 'Ha nem követnéd a főutat',
      how: [
        'Ha egyenesen (vagy balra) haladnál tovább, elhagynád a főútvonalat: akkor neked kellene elsőbbséget adnod a főúton haladóknak.',
        'Most a főúton maradtál: kikapcsolod az irányjelzőt, és felgyorsítasz.',
      ],
      ms: mainPlan.ms[3],
      moves: { me: mainPlan.moves[3] },
      controls: { speed: mainPlan.speeds[3], indicator: at([0, 'right'], [0.2, 'off']), gas: hold(0.3), ...shifts('2', [0.6, '3']) },
      mistakes: [{ code: '8/24', text: 'A főútvonalat elhagyva nem ad elsőbbséget a főúton haladónak.' }],
    },
  ],
}

// ---------------------------------------------------------------- egyenrangú kereszteződés villamossal

const tramWorld = () =>
  withWorld(junction({ arm: 80 }), {
    signs: [signRight('A-027', 34), signRight('A-040', 42)],
    extras: [{ kind: 'tram_track', x: 0, z: MY_X, w: 2.1, d: 160, rotY: Math.PI / 2 }],
    bounds: [-34, -24, 34, 50],
  })
const tramK = kin(30, [{ to: 30, d: 140 }])
const ownTram = kin(30, [{ to: 30, d: 14 }, { to: 0, d: 50 - 14 - STOP_AT }, { wait: 9000 }, { to: 25, d: 30 }])
const tramPlan = split(ownTram, [st(50 - STOP_AT), st(30)], [0, 1, 2, 3])
const tramMoves = driveSeq(tramK, [st(140)], tramPlan.ms)
// A jobbról érkező autó a megállóvonalánál vár, amíg a villamos elhalad, aztán áthajt
const pTram = kin(30, [{ to: 0, d: 30 - STOP_AT }, { wait: 4200 }, { to: 30, d: 60 }])
const pTramMoves = driveSeq(pTram, [st(30 - STOP_AT + 60)], tramPlan.ms)

export const TRAM1: SituationLesson = {
  id: 'egyenrangu-villamos',
  group: 'junctions',
  title: 'Egyenrangú kereszteződés villamossal',
  summary: 'Egyenrangú kereszteződésben a villamosnak akkor is elsőbbsége van, ha balról érkezik; utána a jobbról érkező, végül te jössz.',
  world: tramWorld(),
  actors: [me(50), actor('tram', 'tram', pose(-60, MY_X, E)), actor('p', 'car', pose(30, -MY_X, W), P[0])],
  steps: [
    {
      phase: 'step',
      title: 'Közeledés: egyenrangú utak, villamos',
      how: [
        'Egyenrangú utak kereszteződéséhez közeledsz, a keresztező úton villamos jár. Balról villamos, jobbról egy autó érkezik.',
        'A sorrend: a villamos (bármelyik irányból jön), utána a jobbról érkező autó, végül te.',
      ],
      ms: tramPlan.ms[0],
      moves: { me: tramPlan.moves[0], tram: tramMoves[0], p: pTramMoves[0] },
      controls: { speed: tramPlan.speeds[0], gear: hold('2'), gas: hold(0.1) },
      look: at([0, 'ahead'], [0.5, 'left'], [0.8, 'right']),
    },
    {
      phase: 'step',
      title: 'Megállás',
      how: ['Lassítasz, és a kereszteződés előtt megállsz: két járműnek is elsőbbséget kell adnod.', 'A jobbról érkező is megáll: ő a villamost engedi el.'],
      ms: tramPlan.ms[1],
      moves: { me: tramPlan.moves[1], tram: tramMoves[1], p: pTramMoves[1] },
      controls: { speed: tramPlan.speeds[1], brake: pulse(0.05, 1, 0.3), ...shifts('2', [0.85, '1']) },
      look: at([0, 'left'], [0.6, 'right']),
      mistakes: [{ code: '8/24', text: 'A balról érkező villamosnak nem ad elsőbbséget (a jobbkéz-szabályra hivatkozva).' }],
    },
    {
      phase: 'step',
      title: 'Előbb a villamos, aztán a jobbról érkező',
      how: ['Megvárod, amíg a villamos teljesen áthalad, majd a jobbról érkező autó is elindul és áthajt.', 'Csak ezután, újbóli körülnézés után indulhatsz.'],
      ms: tramPlan.ms[2],
      moves: { me: tramPlan.moves[2], tram: tramMoves[2], p: pTramMoves[2] },
      controls: { speed: tramPlan.speeds[2], brake: hold(0.3), clutch: hold(1) },
      look: at([0, 'left'], [0.5, 'right'], [0.9, 'left']),
    },
    {
      phase: 'step',
      title: 'Áthaladás',
      how: ['Egyenletesen elindulsz, és áthaladsz a kereszteződésen.', 'A síneken nem állsz meg, és figyelsz a villamos után esetleg érkező újabb járművekre.'],
      ms: tramPlan.ms[3],
      moves: { me: tramPlan.moves[3], tram: tramMoves[3], p: pTramMoves[3] },
      controls: { speed: tramPlan.speeds[3], brake: hold(0), clutch: at<number>([0, 1], [0.15, 0]), gas: hold(0.25) },
    },
  ],
}

// ---------------------------------------------------------------- balra kanyarodás egymás előtt

const LR11 = 11
const leftPath: Segment[] = [st(40 - leftTurnZ(LR11)), arcL(LR11, 90), st(20)]
const leftK = kin(30, [{ to: 12, d: 40 - leftTurnZ(LR11) }, { to: 12, d: (Math.PI / 2) * LR11 }, { to: 30, d: 20 }])
const leftPlan = split(leftK, leftPath, [0, 1, 2])
const oPlan = driveSeq(leftK, leftPath, leftPlan.ms)

export const LEFT2: SituationLesson = {
  id: 'balra-egymas-elott',
  group: 'junctions',
  title: 'Balra kanyarodás egymás előtt',
  summary: 'Két szemből érkező, balra kanyarodó jármű egymás előtt (nem egymást megkerülve) fordul be.',
  world: withWorld(junction(), { bounds: [-30, -40, 30, 46] }),
  actors: [me(40), actor('o', 'car', pose(ONCOMING_X, -40, S), P[3])],
  steps: [
    {
      phase: 'step',
      title: 'Mindketten balra jeleznek',
      how: ['Balra kanyarodni készülsz, és a szembejövő is balra jelez.', 'Két, egymással szemben balra kanyarodó jármű egymás előtt (a kereszteződés közepe előtt) fordul be: így nem keresztezik egymás útját.'],
      ms: leftPlan.ms[0],
      moves: { me: leftPlan.moves[0], o: oPlan[0] },
      controls: { speed: leftPlan.speeds[0], indicator: hold('left'), gas: hold(0), ...shifts('3', [0.5, '2']) },
      blinks: { o: hold('left') },
    },
    {
      phase: 'step',
      title: 'Befordulás egymás előtt',
      how: [
        'A kereszteződés közepét nem kerülöd meg: a középponttól (a szembejövőtől nézve is) jobbra, egymás előtt fordultok be.',
        'Közben figyeled a szembejövőt: ha ő egyenesen menne tovább, neki elsőbbsége lenne.',
      ],
      ms: leftPlan.ms[1],
      moves: { me: leftPlan.moves[1], o: oPlan[1] },
      controls: { speed: leftPlan.speeds[1], indicator: hold('left'), gas: hold(0.1) },
      blinks: { o: hold('left') },
      look: at([0, 'ahead'], [0.4, 'left']),
      mistakes: [
        { code: '8/21', text: 'Levágja a kanyart, és a célút bal oldalára érkezik.' },
        { code: '8/23', text: 'A kereszteződésben nem követi a sávját.' },
      ],
    },
    {
      phase: 'step',
      title: 'Kihaladás a célút jobb sávjában',
      how: ['A célút jobb sávjába érkezel, kikapcsolod az irányjelzőt, és felgyorsítasz.', 'A szembejövő ugyanígy, a saját célútja jobb sávjába érkezett.'],
      ms: leftPlan.ms[2],
      moves: { me: leftPlan.moves[2], o: oPlan[2] },
      controls: { speed: leftPlan.speeds[2], indicator: at([0, 'left'], [0.3, 'off']), gas: hold(0.3) },
      blinks: { o: at([0, 'left'], [0.3, 'off']) },
    },
  ],
}

// ---------------------------------------------------------------- STOP, kilátási pont

const stopWorld = () =>
  withWorld(junction({ arm: 90, myLine: 'stop' }), {
    signs: [signRight('B-002', STOP_Z + 1.2)],
    // A sarkon álló ház takarja a balra eső utat
    buildings: [{ x: -(LANE + 2.5 + 5), z: LANE + 2.5 + 6, w: 9, d: 9, h: 9, color: '#d9c7a7' }],
    bounds: [-30, -30, 30, 70],
    view: [44, 52],
  })
const VIEW_AT = STOP_AT - 2.6
const stopK = kin(30, [{ to: 0, d: 40 - STOP_AT }, { wait: 1500 }, { to: 4, d: 1.3 }, { to: 0, d: 1.3 }, { wait: 3200 }, { to: 25, d: 30 }])
const stopPlan = split(stopK, [st(40 - VIEW_AT + 30)], [0, 1, 3, 4, 5])
const pStop = kin(40, [{ to: 40, d: 220 }])
const pStopMoves = driveSeq(pStop, [st(220)], stopPlan.ms)

export const STOP1: SituationLesson = {
  id: 'stop-kilatasi-pont',
  group: 'junctions',
  title: 'STOP tábla, beláthatatlan sarok',
  summary: 'A stopvonalnál teljesen megállsz, aztán a kilátási pontig araszolsz, és onnan adsz elsőbbséget.',
  world: stopWorld(),
  actors: [me(40), actor('p', 'car', pose(-150, MY_X, E), P[1])],
  steps: [
    {
      phase: 'step',
      title: 'Megállás a stopvonalnál',
      how: ['„Állj! Elsőbbségadás kötelező”: a stopvonal előtt teljesen meg kell állni, akkor is, ha az út szabadnak tűnik.', 'Egyenletesen lassítasz, és pontosan a vonal előtt állsz meg.'],
      ms: stopPlan.ms[0],
      moves: { me: stopPlan.moves[0], p: pStopMoves[0] },
      controls: { speed: stopPlan.speeds[0], brake: pulse(0.05, 1, 0.3), ...shifts('2', [0.85, '1']) },
      mistakes: [{ code: '8/26', text: 'Nem áll meg teljesen, csak lassan „átgurul” a vonalon.' }],
    },
    {
      phase: 'step',
      title: 'Körülnézés: a ház takar',
      how: ['A vonaltól balra semmit sem látsz: a sarkon álló ház eltakarja az utat.', 'Ilyenkor a megállás után lassan, fékkészenlétben tovább kell araszolni, amíg belátod a keresztező utat.'],
      ms: stopPlan.ms[1],
      moves: { me: stopPlan.moves[1], p: pStopMoves[1] },
      controls: { speed: stopPlan.speeds[1], brake: hold(0.3), clutch: hold(1) },
      look: at([0, 'left'], [0.5, 'right']),
    },
    {
      phase: 'step',
      title: 'Araszolás a kilátási pontig',
      how: ['A csúszó kuplunggal, lépésben előregurulsz addig a pontig, ahonnan már látod a balról érkezőket, de még nem lógsz be a keresztező sávba.', 'Ott ismét megállsz.'],
      ms: stopPlan.ms[2],
      moves: { me: stopPlan.moves[2], p: pStopMoves[2] },
      controls: { speed: stopPlan.speeds[2], brake: at<number>([0, 0], [0.7, 0.3]), clutch: hold(0.55), gas: hold(0.1) },
      look: hold('left'),
      marks: [{ kind: 'zone', rect: { x: MY_X, z: VIEW_AT - 2.5, w: LANE, d: 1.2 }, label: 'Kilátási pont' }],
      mistakes: [{ code: '6/3', text: 'Nem ott áll meg, ahonnan a helyzetet felismerhetné.' }],
    },
    {
      phase: 'step',
      title: 'Elsőbbségadás',
      how: ['Balról egy autó érkezik: elengeded, majd újra balra, jobbra nézel.', 'Ha mindkét irány szabad, indulhatsz.'],
      ms: stopPlan.ms[3],
      moves: { me: stopPlan.moves[3], p: pStopMoves[3] },
      controls: { speed: stopPlan.speeds[3], brake: hold(0.3), clutch: hold(1) },
      look: at([0, 'left'], [0.6, 'right'], [0.85, 'left']),
      mistakes: [{ code: '8/24', text: 'A kilátási pontról a közeledő elé hajt.' }],
    },
    {
      phase: 'step',
      title: 'Áthaladás',
      how: ['Határozottan, de egyenletesen gyorsítva áthaladsz a kereszteződésen.', 'A keresztező úton nem állsz meg.'],
      ms: stopPlan.ms[4],
      moves: { me: stopPlan.moves[4], p: pStopMoves[4] },
      controls: { speed: stopPlan.speeds[4], brake: hold(0), clutch: at<number>([0, 1], [0.15, 0]), gas: hold(0.3) },
    },
  ],
}


/** A csoport helyzetei a felsorolás sorrendjében */
export const JUNCTIONS: SituationLesson[] = [RB1, RB2, MAIN1, TRAM1, LEFT2, STOP1]
