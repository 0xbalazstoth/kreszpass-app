import { M5 } from '../../maneuvers/parallel'
import { pathLength, segmentLength, type Gear, type Segment } from '../../maneuvers/geometry'
import { arcL, arcR, at, drive, hold, kin, laneShift, pulse, ramp, shifts, st, stepTo, tAtDist, tEnd, type KinPart } from '../motion'
import type { FaultLesson, GearPos, Track } from '../types'
import { junction, LANE, signRight, STOP_Z, straightRoad, withWorld, zebra } from '../world'
import { actor, E, FRONT, leftTurnZ, LEFT_R, me, MY_X, ONCOMING_X, PARTNER_COLORS, pose, RIGHT_R, rightTurnZ, S, STOP_AT, W } from './common'

const P = PARTNER_COLORS

// ---------------------------------------------------------------- 8/16

const s816 = kin(50, [{ to: 50, d: 36 }])
const w816 = kin(50, [{ to: 50, d: 22 }, { to: 54, d: 34 }])
const r816 = kin(50, [{ to: 30, d: 20 }, { to: 30, d: 36 }])

export const L8_16: FaultLesson = {
  code: '8/16',
  title: 'Gyorshajtás',
  summary: 'Az iskola előtti 30-as táblát 50 km/h-val hagyja el: ez sikertelen vizsga.',
  world: withWorld(straightRoad({ south: 70, north: -60 }), { signs: [signRight('C-033-30', 0), signRight('A-021', 0)] }),
  actors: [me(60)],
  steps: [
    {
      phase: 'setup',
      title: 'Lakott területen, 50 km/h-val',
      how: ['Lakott területen 50 km/h-val haladsz, harmadik fokozatban.', 'Előtted, az iskola előtt 30 km/h-s sebességkorlátozó és „Gyermekek” tábla áll.'],
      ms: s816.ms,
      moves: { me: drive(s816).move },
      controls: { speed: drive(s816).speed, gear: at([0, '3']), gas: at([0, 0.25]) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: nem lassít a tábláig',
      how: [
        'A vizsgázó nem veszi le a gázt, sőt kicsit gyorsít, és 50 km/h fölött halad el a 30-as tábla mellett.',
        'A tábla a tábla vonalától érvényes: ott már legfeljebb 30 km/h lehet a sebesség. Ez gyorshajtás (8/16), a vizsga sikertelen.',
      ],
      ms: w816.ms,
      moves: { me: drive(w816).move },
      controls: { speed: drive(w816).speed, gas: ramp(0.25, 0.4, tEnd(w816, 0), tEnd(w816, 1)) },
      marks: [{ kind: 'label', at: [-2.5, 0], text: '30!', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: a tábláig 30 km/h-ra lassít',
      how: [
        'Amint meglátod a táblát, leveszed a gázt, és egyenletesen fékezve a tábla vonaláig 30 km/h-ra lassítasz.',
        'Visszakapcsolsz második fokozatba, és a táblától 30 km/h-val, a gyerekekre figyelve haladsz tovább.',
      ],
      ms: r816.ms,
      moves: { me: drive(r816).move },
      controls: {
        speed: drive(r816).speed,
        gas: stepTo(0, 0.15, tEnd(r816, 0) + 0.04),
        brake: pulse(0.06, tEnd(r816, 0) - 0.1, 0.3),
        gear: at([0, '3'], [tEnd(r816, 0) - 0.03, '2']),
        clutch: pulse(tEnd(r816, 0) - 0.08, tEnd(r816, 0)),
      },
    },
  ],
}

// ---------------------------------------------------------------- 8/1

const s81 = kin(30, [{ to: 30, d: 15 }])
const leftHere: Segment[] = [st(35 - leftTurnZ()), arcL(LEFT_R, 90), st(15)]
const w81 = kin(30, [{ to: 20, d: 20 }, { to: 20, d: pathLength(leftHere) - 20 }])
const r81 = kin(30, [{ to: 30, d: 80 }])

export const L8_1: FaultLesson = {
  code: '8/1',
  title: 'Közlekedési szabály megsértése',
  summary: 'A „Balra bekanyarodni tilos” tábla ellenére balra fordul.',
  world: withWorld(junction({ arm: 70 }), { signs: [signRight('C-028', STOP_Z + 1.2)], bounds: [-30, -40, 16, 60], view: [40, 52] }),
  actors: [me(50)],
  steps: [
    {
      phase: 'setup',
      title: '„Balra bekanyarodni tilos”',
      how: ['A kereszteződés előtt „Balra bekanyarodni tilos” tábla áll.', 'A vizsgabiztos azt kérte: „A következő lehetőségnél forduljon balra.” Itt ez nem lehetséges.'],
      ms: s81.ms,
      moves: { me: drive(s81).move },
      controls: { speed: drive(s81).speed, gear: hold('2'), gas: hold(0.15) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: a tábla ellenére befordul',
      how: [
        'A vizsgázó nem veszi észre (vagy figyelmen kívül hagyja) a táblát, és balra kanyarodik.',
        'A KRESZ szabályainak megsértése a vizsgán azonnali sikertelenséget jelent: ez a 8/1-es hiba.',
      ],
      ms: w81.ms,
      moves: { me: drive(w81, leftHere).move },
      controls: { speed: drive(w81, leftHere).speed, indicator: at([0, 'left'], [0.85, 'off']), gas: hold(0.1) },
      marks: [{ kind: 'label', at: [-8, 8], text: 'Tilos!', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: egyenesen továbbhalad',
      how: [
        'Észreveszed a táblát: itt nem fordulhatsz balra, ezért egyenesen továbbhaladsz.',
        'A következő szabályos lehetőségnél kanyarodsz balra. A vizsgabiztos utasítása sosem írja felül a KRESZ-t.',
      ],
      ms: r81.ms,
      moves: { me: drive(r81).move },
      controls: { speed: drive(r81).speed, gas: hold(0.15) },
    },
  ],
}

// ---------------------------------------------------------------- 8/2

export const L8_2: FaultLesson = {
  code: '8/2',
  title: 'KRESZ szerinti ellenőrzés',
  summary: 'A vizsgabiztos kérésére nem tudja ellenőrizni a világítást és az irányjelzőket.',
  world: straightRoad({ south: 40, north: -40 }),
  actors: [me(10)],
  steps: [
    {
      phase: 'setup',
      title: 'A vizsgabiztos kérése',
      how: ['Indulás előtt a vizsgabiztos kéri: „Ellenőrizze a világítást és az irányjelzőket!”', 'A KRESZ szerint az indulás előtti ellenőrzés a vezető feladata.'],
      ms: 2400,
      controls: { handbrake: hold(true), lights: hold('off') },
    },
    {
      phase: 'wrong',
      title: 'Hibás: nem találja a kapcsolókat',
      how: [
        'A vizsgázó a ködlámpát kapcsolja be a tompított helyett, az irányjelzőt és a vészvillogót pedig nem találja.',
        'A KRESZ szerinti ellenőrzést nem képes elvégezni: ez a 8/2-es hiba, a vizsga sikertelen.',
      ],
      ms: 6000,
      controls: { lights: at([0, 'off'], [0.2, 'fog'], [0.55, 'off']) },
      look: at([0, 'down'], [0.7, 'ahead']),
      marks: [{ kind: 'label', at: [-4.5, 6], text: 'Nem találja', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: végigkapcsolja és ellenőrzi',
      how: [
        'Bekapcsolod a tompított, majd a távolsági fényt (a visszajelzők a műszerfalon), aztán a bal és a jobb irányjelzőt, végül a vészvillogót.',
        'Közben a vizsgabiztos (vagy egy kirakat, a mögötted álló autó tükörképe) igazolja, hogy a lámpák működnek; a fékpedált is megnyomod a féklámpához.',
      ],
      ms: 9000,
      controls: {
        lights: at([0, 'off'], [0.08, 'low'], [0.22, 'high'], [0.34, 'low']),
        indicator: at([0, 'off'], [0.42, 'left'], [0.56, 'right'], [0.7, 'hazard'], [0.84, 'off']),
        brake: pulse(0.86, 0.96, 0.6),
      },
    },
  ],
}

// ---------------------------------------------------------------- 8/3

const BIKE_X = 2.75
const bike = kin(18, [{ to: 18, d: 300 }])
const s83 = kin(18, [{ to: 18, d: 10 }])
const o83 = kin(50, [{ to: 50, d: 300 }])
const o83w = kin(50, [{ to: 50, d: 12 }, { slam: 16.65 }, { wait: 4000 }, { to: 30, d: 30 }])
const w83path: Segment[] = [...laneShift(-2.4, 12), ...laneShift(2.4, 10), st(30)]
const w83 = kin(18, [{ to: 25, d: 12 }, { to: 18, d: 10 }, { to: 18, d: 30 }])
const r83path: Segment[] = [st(19), ...laneShift(-2.4, 12), st(26), ...laneShift(2.4, 12), st(10)]
const r83 = kin(18, [{ to: 18, d: 19 }, { to: 40, d: 30 }, { to: 40, d: pathLength(r83path) - 49 }])

export const L8_3: FaultLesson = {
  code: '8/3',
  title: 'Veszélyhelyzet teremtése',
  summary: 'Szembejövő forgalom mellett kezd kerékpárost előzni: a szembejövő vészfékez.',
  world: straightRoad({ south: 70, north: -160 }),
  actors: [me(32.45), actor('k', 'bike', pose(BIKE_X, 20), '#f59e0b'), actor('o', 'car', pose(ONCOMING_X, -70, S), P[0])],
  steps: [
    {
      phase: 'setup',
      title: 'Kerékpáros mögött, szemből autó',
      how: ['18 km/h-val egy kerékpáros mögött haladsz. Szemből egy autó közeledik.', 'Kerékpárost csak akkor szabad előzni, ha a szemközti sáv a teljes előzés idejére szabad, és legalább 1,5 m oldaltávolságot tudsz tartani.'],
      ms: s83.ms,
      moves: { me: drive(s83).move, k: drive(bike, undefined, s83.ms).move, o: drive(o83, undefined, s83.ms).move },
      controls: { speed: drive(s83).speed, gear: hold('2'), gas: hold(0.1) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: a szembejövő előtt kezd előzni',
      how: [
        'A vizsgázó kihúzódik előzni, pedig a szembejövő autó már közel van: annak vészfékeznie kell, a vizsgázó pedig visszarántja a kocsit a kerékpáros mögé.',
        'Veszélyhelyzetet teremtett: ez a 8/3-as hiba, a vizsga sikertelen.',
      ],
      ms: Math.max(w83.ms, 6000),
      moves: { me: drive(w83, w83path, Math.max(w83.ms, 6000)).move, k: drive(bike, undefined, Math.max(w83.ms, 6000)).move, o: drive(o83w, undefined, Math.max(w83.ms, 6000)).move },
      controls: { speed: drive(w83, w83path, Math.max(w83.ms, 6000)).speed, gas: at<number>([0, 0.5], [0.2, 0]), indicator: at([0, 'left'], [0.25, 'right'], [0.5, 'off']) },
      marks: [{ kind: 'label', at: [-6, -12], text: 'Vészfékez!', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: megvárja a szembejövőt, aztán bő oldaltávolsággal előz',
      how: [
        'A kerékpáros mögött maradsz, és megvárod, amíg a szembejövő elhalad.',
        'Utána tükör, jelzés, és legalább 1,5 m oldaltávolsággal, határozottan megelőzöd a kerékpárost; csak akkor térsz vissza, amikor a belső tükörben már látod.',
      ],
      ms: r83.ms,
      moves: { me: drive(r83, r83path).move, k: drive(bike, undefined, r83.ms).move, o: drive(o83, undefined, r83.ms).move },
      controls: { speed: drive(r83, r83path).speed, gas: at<number>([0, 0.1], [tEnd(r83, 0), 0.45], [tEnd(r83, 1), 0.2]), indicator: at([0, 'off'], [tEnd(r83, 0) - 0.08, 'left'], [0.55, 'off'], [0.62, 'right'], [0.85, 'off']), ...shifts('2', [tEnd(r83, 0) + 0.12, '3']) },
      look: at([0, 'ahead'], [tEnd(r83, 0) - 0.1, 'mirror_left'], [tEnd(r83, 0) - 0.04, 'ahead'], [0.6, 'mirror_inner'], [0.64, 'ahead']),
      marks: [{ kind: 'gap', a: 'me', b: 'k' }],
    },
  ],
}

// ---------------------------------------------------------------- 8/4

const flip = (s: Segment): Segment => ({ ...s, gear: s.gear === 'D' ? 'R' : 'D' })
/** Ugyanazon az úton vissza (a szakaszok fordított sorrendben, ellentétes menetiránnyal) */
const retrace = (path: Segment[]): Segment[] => [...path].reverse().map(flip)

/** Lassú manőverezés: az azonos irányú szakaszok egy menetet alkotnak, a menetek között megáll és vált */
function crawl(path: Segment[], kmh = 5): { k: ReturnType<typeof kin>; gear: Track<GearPos> } {
  const runs: { gear: Gear; len: number }[] = []
  for (const s of path) {
    const last = runs[runs.length - 1]
    if (last && last.gear === s.gear) last.len += segmentLength(s)
    else runs.push({ gear: s.gear, len: segmentLength(s) })
  }
  const parts: KinPart[] = []
  runs.forEach((r, i) => {
    if (i) parts.push({ wait: 700 })
    const a = Math.min(0.6, r.len / 3)
    parts.push({ to: kmh, d: a }, { to: kmh, d: r.len - 2 * a }, { to: 0, d: a })
  })
  const k = kin(0, parts)
  const gear: Track<GearPos> = runs.map((r, i) => [i === 0 ? 0 : (k.ends[4 * i - 2] + k.ends[4 * i - 1]) / 2 / k.ms, r.gear === 'R' ? 'R' : '1'])
  return { k, gear }
}

const m5 = M5.steps.flatMap((s) => s.motion)
const [m5in, ...m5rest] = m5
const [arcIn, straightIn, arcOut, forwardIn] = m5rest
const att1 = [{ ...arcIn, angle: arcIn.kind === 'arc' ? arcIn.angle * 0.6 : 0 } as Segment]
const att2 = [arcIn, { ...straightIn, dist: straightIn.kind === 'straight' ? straightIn.dist / 2 : 0 } as Segment]
const att3 = [arcIn, straightIn, { ...arcOut, angle: arcOut.kind === 'arc' ? arcOut.angle * 0.55 : 0 } as Segment]
const try1 = crawl([...att1, ...retrace(att1)])
const try2 = crawl([...att2, ...retrace(att2)])
const try3 = crawl(att3)
const good = crawl([arcIn, straightIn, arcOut, forwardIn])
const setup84 = kin(8, [{ to: 0, d: pathLength([m5in]) }, { wait: 600 }])
const parallelWorld = {
  asphalt: M5.site.asphalt,
  sidewalks: [{ x: 1.55, z: M5.site.asphalt[0].z, w: 2.8, d: M5.site.asphalt[0].d }],
  markings: M5.site.markings,
  bounds: [-10, -8, 4, 16] as [number, number, number, number],
}

export const L8_4: FaultLesson = {
  code: '8/4',
  title: 'A feladat a második javítás után sem sikerül',
  summary: 'A párhuzamos beállás két javítás után sem sikerül.',
  world: parallelWorld,
  actors: [me(M5.start.z, M5.start.x), ...M5.site.cars.map((c, i) => actor(`p${i}`, 'car', c.pose, c.color))],
  steps: [
    {
      phase: 'setup',
      title: 'Párhuzamos parkolás hátramenetben',
      how: ['A vizsgabiztos kéri: álljon be a két autó közé, hátramenetben.', 'A feladatot kétszer lehet javítani; ha a második javítás után sem sikerül, a vizsga sikertelen.'],
      ms: setup84.ms,
      moves: { me: drive(setup84, [m5in]).move },
      controls: { speed: drive(setup84, [m5in]).speed, gear: hold('1'), indicator: hold('right') },
    },
    {
      phase: 'wrong',
      title: '1. kísérlet: túl korán abbahagyja',
      how: ['A vizsgázó jobb kormánnyal tolatni kezd, de túl korán megáll, és kihúz.', 'Ez még nem hiba, de már egy javítás (7/8).'],
      ms: try1.k.ms,
      moves: { me: drive(try1.k, [...att1, ...retrace(att1)]).move },
      controls: { speed: drive(try1.k, [...att1, ...retrace(att1)]).speed, gear: try1.gear },
      look: hold('mirror_right'),
    },
    {
      phase: 'wrong',
      title: '1. javítás: elakad félúton',
      how: ['Másodszorra beljebb jut, de nem mer továbbtolatni, és újra kihúz.', 'A második próbálkozás a második javítás előtti utolsó lehetőség.'],
      ms: try2.k.ms,
      moves: { me: drive(try2.k, [...att2, ...retrace(att2)]).move },
      controls: { speed: drive(try2.k, [...att2, ...retrace(att2)]).speed, gear: try2.gear },
      look: hold('mirror_right'),
    },
    {
      phase: 'wrong',
      title: '2. javítás: ferdén, a szegélytől messze áll meg',
      how: [
        'Harmadszorra a bal kormányt túl korán veszi vissza: az autó ferdén, a szegélytől messze áll meg.',
        'A feladat a második javítás után sem sikerült: ez a 8/4-es hiba, a vizsga sikertelen.',
      ],
      ms: try3.k.ms,
      moves: { me: drive(try3.k, att3).move },
      controls: { speed: drive(try3.k, att3).speed, gear: try3.gear },
      look: at([0, 'mirror_right'], [0.6, 'mirror_left']),
      marks: [{ kind: 'label', at: [-6.5, 6], text: 'Ferde, messze', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: egy menetben, a manőver lépései szerint',
      how: [
        'A hátsó lökhárítók egy vonalában állsz meg, teljes jobb kormánnyal 45°-ig tolatsz, egyenesen tolatsz, majd teljes bal kormánnyal párhuzamosra állsz.',
        'Végül előregurulsz a hely közepére. (A lépésenkénti útmutató a Manőverek fülön, az M5-nél található.)',
      ],
      ms: good.k.ms,
      moves: { me: drive(good.k, [arcIn, straightIn, arcOut, forwardIn]).move },
      controls: { speed: drive(good.k, [arcIn, straightIn, arcOut, forwardIn]).speed, gear: good.gear },
      look: at([0, 'shoulder_right'], [0.3, 'mirror_right'], [0.6, 'mirror_left'], [0.85, 'ahead']),
    },
  ],
}

// ---------------------------------------------------------------- 8/5

const s85 = kin(0, [{ to: 15, d: 12 }])
const w85 = kin(15, [{ to: 30, d: 30 }, { to: 30, d: 30 }])
const r85 = kin(15, [{ to: 15, d: 6 }, { to: 0, d: 3 }, { wait: 500 }, { to: 30, d: 30 }, { to: 30, d: 21 }])

export const L8_5: FaultLesson = {
  code: '8/5',
  title: 'Elmaradt fékpróba',
  summary: 'Elindulás után nem ellenőrzi az üzemi fék hatásosságát.',
  world: straightRoad({ south: 60, north: -80 }),
  actors: [me(50)],
  steps: [
    {
      phase: 'setup',
      title: 'Elindulás után',
      how: ['Elindultál, az út előtted és mögötted is szabad.', 'Elindulás után, alacsony sebességnél ellenőrizni kell, hogy a fék hatásos-e.'],
      ms: s85.ms,
      moves: { me: drive(s85).move },
      controls: { speed: drive(s85).speed, ...shifts('1', [0.7, '2']), gas: hold(0.25) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: fékpróba nélkül gyorsít',
      how: ['A vizsgázó egyszerűen felgyorsít, a féket nem próbálja ki.', 'Az üzemi fék hatásosságának ellenőrzését elmulasztani a 8/5-ös hiba: a vizsga sikertelen.'],
      ms: w85.ms,
      moves: { me: drive(w85).move },
      controls: { speed: drive(w85).speed, gas: hold(0.3), ...shifts('2', [0.4, '3']) },
      marks: [{ kind: 'label', at: [-5, 30], text: 'Fékpróba?', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: tükör, aztán határozott fékezés',
      how: ['Belenézel a belső tükörbe (senki sincs mögötted), és kb. 15 km/h-ról határozottan fékezel: az autó egyenesen, egyenletesen lassul.', 'A fék rendben van, továbbindulsz.'],
      ms: r85.ms,
      moves: { me: drive(r85).move },
      controls: { speed: drive(r85).speed, gas: at<number>([0, 0.1], [tEnd(r85, 0), 0], [tEnd(r85, 2), 0.3]), brake: pulse(tEnd(r85, 0), tEnd(r85, 1), 0.7), clutch: pulse(tEnd(r85, 0) + 0.04, tEnd(r85, 2) + 0.02), gear: at([0, '2'], [tEnd(r85, 1), '1'], [tEnd(r85, 3) - 0.05, '2']) },
      look: at([0, 'mirror_inner'], [tEnd(r85, 0) - 0.05, 'ahead']),
    },
  ],
}

// ---------------------------------------------------------------- 8/6

const s86 = kin(50, [{ to: 50, d: 20.8 }])
const b86 = kin(70, [{ to: 70, d: 300 }])
const b86w = kin(70, [{ to: 70, d: 4 }, { to: 45, d: 30 }, { to: 45, d: 200 }])
const w86path: Segment[] = [...laneShift(-LANE, 18), st(40)]
const w86 = kin(50, [{ to: 50, d: pathLength(w86path) }])
const r86path: Segment[] = [st(75), ...laneShift(-LANE, 24), st(20)]
const r86 = kin(50, [{ to: 50, d: pathLength(r86path) }])

export const L8_6: FaultLesson = {
  code: '8/6',
  title: 'Elmaradt irányjelzés és körültekintés',
  summary: 'Irányjelzés és tükörbe nézés nélkül vált sávot a mellette érkező elé.',
  world: withWorld(straightRoad({ south: 90, north: -140 }), { signs: [signRight('E-012', 80)] }),
  actors: [me(60), actor('b', 'car', pose(-MY_X, 80), P[6])],
  steps: [
    {
      phase: 'setup',
      title: 'Sávváltás előtt',
      how: ['Egyirányú, kétsávos úton haladsz a jobb sávban, és át kell sorolnod a bal sávba.', 'A bal sávban hátulról gyorsabban jön egy autó.'],
      ms: s86.ms,
      moves: { me: drive(s86).move, b: drive(b86, undefined, s86.ms).move },
      controls: { speed: drive(s86).speed, gear: hold('3'), gas: hold(0.2) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: jelzés és körülnézés nélkül vált sávot',
      how: [
        'A vizsgázó se tükörbe nem néz, se irányt nem jelez, egyszerűen átkormányoz a bal sávba: a hátulról érkező erősen fékezni kényszerül.',
        'Az irányjelzés vagy a körültekintés elmulasztása a 8/6-os hiba: a vizsga sikertelen.',
      ],
      ms: w86.ms,
      moves: { me: drive(w86, w86path).move, b: drive(b86w, undefined, w86.ms).move },
      controls: { speed: drive(w86, w86path).speed, gas: hold(0.2), indicator: hold('off') },
      look: hold('ahead'),
      marks: [{ kind: 'gap', a: 'b', b: 'me', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: tükör, jelzés, váll fölött, aztán sávváltás',
      how: ['Belső és bal tükör: látod a gyorsabban érkezőt, ezért megvárod, amíg elhalad.', 'Utána irányjelzés balra, egy pillantás a bal vállad fölött (holttér), és egyenletes ívben átsorolsz.'],
      ms: r86.ms,
      moves: { me: drive(r86, r86path).move, b: drive(b86, undefined, r86.ms).move },
      controls: { speed: drive(r86, r86path).speed, gas: hold(0.2), indicator: at([0, 'off'], [0.5, 'left'], [0.85, 'off']) },
      look: at([0, 'mirror_inner'], [0.06, 'mirror_left'], [0.16, 'ahead'], [0.5, 'mirror_left'], [0.56, 'shoulder_left'], [0.62, 'ahead']),
    },
  ],
}

// ---------------------------------------------------------------- 8/7

const OWN87 = 20
const w87path: Segment[] = [st(0.8, 'R'), st(15)]
const w87 = kin(0, [{ wait: 600 }, { to: 2, d: 0.4 }, { to: 0, d: 0.4 }, { wait: 500 }, { to: 15, d: 15 }])
const r87 = kin(0, [{ wait: 2200 }, { to: 15, d: 15 }])

export const L8_7: FaultLesson = {
  code: '8/7',
  title: 'Visszagurulás emelkedőn',
  summary: 'Emelkedőn elinduláskor több mint fél métert hátragurul.',
  world: withWorld(straightRoad({ south: 60, north: -40 }), { signs: [signRight('A-006', 45)] }),
  actors: [me(OWN87), actor('b', 'car', pose(MY_X, OWN87 + 0.85 + 1.5 + 3.55), P[1])],
  steps: [
    {
      phase: 'setup',
      title: 'Megállás emelkedőn',
      how: ['Emelkedőn állsz, közvetlenül mögötted (1,5 méterre) egy autó.', 'Ha elinduláskor elengeded a féket, az autó hátragurul: ezt kézifékkel vagy gyors, összehangolt pedálkezeléssel kell megakadályozni.'],
      ms: 2200,
      controls: { gear: hold('1'), clutch: hold(1), brake: hold(0.4) },
      marks: [{ kind: 'gap', a: 'me', b: 'b' }],
    },
    {
      phase: 'wrong',
      title: 'Hibás: elengedi a féket, és az autó hátragurul',
      how: [
        'A vizsgázó kézifék nélkül, a fékről a gázra lépve indulna, de túl lassan: az autó kb. 80 cm-t hátragurul a mögötte álló felé.',
        'A tervezett iránnyal ellentétesen több mint 50 cm-t elgurulni a 8/7-es hiba: a vizsga sikertelen.',
      ],
      ms: w87.ms,
      moves: { me: drive(w87, w87path).move },
      controls: { speed: drive(w87, w87path).speed, brake: stepTo(0.4, 0, tEnd(w87, 0)), clutch: at<number>([0, 1], [tEnd(w87, 2), 1], [tEnd(w87, 3) + 0.1, 0]), gas: stepTo(0, 0.3, tEnd(w87, 2)) },
      marks: [{ kind: 'gap', a: 'me', b: 'b', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: kézifékkel indul',
      how: [
        'Behúzod a kéziféket, gázt adsz, és a kuplungot a csúszási pontig engeded: az autó „húz”.',
        'Ekkor kiengeded a kéziféket, és az autó egy centit sem gurul vissza, hanem előre indul.',
      ],
      ms: r87.ms,
      moves: { me: drive(r87).move },
      controls: { speed: drive(r87).speed, brake: stepTo(0.4, 0, 0.12), handbrake: at([0, false], [0.08, true], [tEnd(r87, 0) - 0.02, false]), clutch: at<number>([0, 1], [0.14, 1], [tEnd(r87, 0) - 0.04, 0.5], [tEnd(r87, 0) + 0.15, 0]), gas: stepTo(0, 0.3, 0.14) },
      marks: [{ kind: 'gap', a: 'me', b: 'b' }],
    },
  ],
}

// ---------------------------------------------------------------- 8/8

const Q_Z = -10
const s88 = kin(40, [{ to: 40, d: 20 }])
const stopBehind = (gap: number) => Q_Z + 0.85 + gap + FRONT
const w88 = kin(40, [{ to: 40, d: 50 - stopBehind(1.2) - 11 }, { slam: 11 }, { wait: 1200 }])
const r88 = kin(40, [{ to: 40, d: 10 }, { to: 0, d: 50 - stopBehind(3) - 10 }, { wait: 1200 }])

export const L8_8: FaultLesson = {
  code: '8/8',
  title: 'Az oktatónak kell beavatkoznia',
  summary: 'Nem fékez az álló sor előtt: a szakoktatónak kell a saját pedáljával megállítania az autót.',
  world: straightRoad({ south: 80, north: -40 }),
  actors: [me(70), actor('a', 'car', pose(MY_X, Q_Z), P[4])],
  steps: [
    {
      phase: 'setup',
      title: 'Álló autó előtted',
      how: ['Előtted a sávban egy autó áll (torlódás).', 'Időben el kell kezdened a lassítást, hogy kényelmesen mögötte állj meg.'],
      ms: s88.ms,
      moves: { me: drive(s88).move },
      controls: { speed: drive(s88).speed, gear: hold('3'), gas: hold(0.2) },
      blinks: { a: hold('hazard') },
    },
    {
      phase: 'wrong',
      title: 'Hibás: az oktató fékez helyette',
      how: [
        'A vizsgázó nem lassít. Az utolsó pillanatban a szakoktató lép a saját fékpedáljára: a vizsgázó pedálja (a műszerfalon) végig fel van engedve.',
        'Ha balesetveszély miatt a szakoktatónak kell beavatkoznia, az a 8/8-as hiba: a vizsga sikertelen.',
      ],
      ms: w88.ms,
      moves: { me: drive(w88).move },
      controls: { speed: drive(w88).speed, gas: hold(0.2), brake: hold(0) },
      blinks: { a: hold('hazard') },
      marks: [{ kind: 'label', at: [-5, 2], text: 'Az oktató fékez!', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: időben, egyenletesen fékez',
      how: ['Messziről észreveszed az álló autót, leveszed a gázt, és egyenletesen fékezve, pár méterrel mögötte állsz meg.', 'A szakoktatónak nem kell közbeavatkoznia.'],
      ms: r88.ms,
      moves: { me: drive(r88).move },
      controls: { speed: drive(r88).speed, gas: stepTo(0.2, 0, 0.02), brake: pulse(tEnd(r88, 0), 1, 0.3), ...shifts('3', [0.5, '2'], [tEnd(r88, 1) - 0.03, 'N']) },
      blinks: { a: hold('hazard') },
    },
  ],
}

// ---------------------------------------------------------------- 8/9

const lead89 = kin(40, [{ to: 40, d: 24 }, { to: 15, d: 18 }, { to: 15, d: 60 }])
const s89 = kin(40, [{ to: 40, d: 12 }])
const w89path: Segment[] = [st(8), ...laneShift(0.75, 14), st(4), ...laneShift(-0.75, 6), st(30)]
const w89 = kin(40, [{ to: 40, d: 26 }, { to: 10, d: 9 }, { to: 15, d: pathLength(w89path) - 35 }])
const straight89 = [st(pathLength(w89path))]
const r89 = kin(40, [{ to: 40, d: 14 }, { to: 15, d: 20 }, { to: 15, d: pathLength(w89path) - 34 }])

export const L8_9: FaultLesson = {
  code: '8/9',
  title: 'A kezelés elvonja a figyelmet',
  summary: 'Váltás közben lenéz a váltóra, az autó kisodródik, és az előtte lassítót csak az utolsó pillanatban veszi észre.',
  world: straightRoad({ south: 80, north: -80 }),
  actors: [me(70), actor('a', 'car', pose(MY_X, 70 - 4.4 - 18), P[5])],
  steps: [
    {
      phase: 'setup',
      title: 'Követés, váltás előtt',
      how: ['40 km/h-val egy autó mögött haladsz, és fel kell váltanod.', 'A váltást „vakon” kell tudni elvégezni: a szemed közben az úton marad.'],
      ms: s89.ms,
      moves: { me: drive(s89).move, a: drive(lead89, undefined, s89.ms).move },
      controls: { speed: drive(s89).speed, gear: hold('2'), gas: hold(0.2) },
      marks: [{ kind: 'gap', a: 'me', b: 'a' }],
    },
    {
      phase: 'wrong',
      title: 'Hibás: a váltót nézi',
      how: [
        'A vizsgázó a váltáskor lenéz a váltókarra, és kétszer is mellényúl: az autó közben a járda felé sodródik, és nem veszi észre, hogy az előtte haladó lassít. Az utolsó pillanatban erősen fékez.',
        'Ha a technikai kezelés elvonja a figyelmet a forgalomtól, az a 8/9-es hiba: a vizsga sikertelen.',
      ],
      ms: w89.ms,
      moves: { me: drive(w89, w89path).move, a: drive(lead89, undefined, w89.ms).move },
      controls: { speed: drive(w89, w89path).speed, ...shifts('2', [0.04, '3'], [0.09, '2'], [0.13, '3']), gas: at<number>([0, 0], [tEnd(w89, 0) * 0.75, 0.15], [tEnd(w89, 0), 0]), brake: pulse(tEnd(w89, 0), tEnd(w89, 1), 0.8) },
      look: at([0, 'down'], [tEnd(w89, 0) - 0.05, 'ahead']),
      marks: [{ kind: 'gap', a: 'me', b: 'a', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: vakon vált, figyeli az utat',
      how: ['A váltást ránézés nélkül, egy mozdulattal végzed el: a szemed végig az úton marad.', 'Időben látod, hogy az előtted haladó lassít, és egyenletesen lassítasz mögötte.'],
      ms: r89.ms,
      moves: { me: drive(r89, straight89).move, a: drive(lead89, undefined, r89.ms).move },
      controls: { speed: drive(r89, straight89).speed, ...shifts('2', [0.08, '3'], [tEnd(r89, 0) + 0.12, '2']), gas: at<number>([0, 0.15], [tEnd(r89, 0), 0]), brake: pulse(tEnd(r89, 0) + 0.01, tEnd(r89, 1), 0.3) },
      look: hold('ahead'),
      marks: [{ kind: 'gap', a: 'me', b: 'a' }],
    },
  ],
}

// ---------------------------------------------------------------- 8/10

const s810 = kin(0, [{ to: 15, d: 10 }])
const swervePath: Segment[] = [st(4), ...laneShift(-0.9, 7), ...laneShift(0.9, 7), st(16), ...laneShift(-0.9, 7), ...laneShift(0.9, 7), st(16)]
const w810 = kin(15, [{ to: 45, d: pathLength(swervePath) }])
const swerve1 = tAtDist(w810, 4)
const swerve2 = tAtDist(w810, 4 + 14.2 + 16)

export const L8_10: FaultLesson = {
  code: '8/10',
  title: 'Váltás közben elrántja a kormányt',
  summary: 'Minden váltásnál a váltókarral együtt a kormányt is elrántja: az autó a felezővonal felé kanyarodik.',
  world: straightRoad({ south: 80, north: -80 }),
  actors: [me(65)],
  steps: [
    {
      phase: 'setup',
      title: 'Gyorsítás, váltásokkal',
      how: ['Elindultál, és gyorsítasz: kettesbe, majd hármasba kell váltanod.', 'Váltáskor a bal kéz a kormányon marad, és tartja az irányt.'],
      ms: s810.ms,
      moves: { me: drive(s810).move },
      controls: { speed: drive(s810).speed, gear: hold('1'), gas: hold(0.35) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: a váltással együtt kormányoz',
      how: [
        'Váltáskor a vizsgázó a bal kezével is „húzza” a kormányt: az autó minden váltásnál a felezővonal felé kanyarodik, aztán visszarántja.',
        'A sebességváltás közben elrántott kormány a 8/10-es hiba: a vizsga sikertelen.',
      ],
      ms: w810.ms,
      moves: { me: drive(w810, swervePath).move },
      controls: { speed: drive(w810, swervePath).speed, ...shifts('1', [swerve1 + 0.02, '2'], [swerve2 + 0.02, '3']), gas: hold(0.35) },
      marks: [{ kind: 'label', at: [-4.5, 40], text: 'Elrántja', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: a kormány mozdulatlan marad',
      how: ['Váltás közben a bal kezed nyugodtan tartja a kormányt, a jobb kezed csak a váltókart mozgatja.', 'Az autó egyenesen halad a sáv közepén.'],
      ms: w810.ms,
      moves: { me: drive(w810, [st(pathLength(swervePath))]).move },
      controls: { speed: drive(w810, [st(pathLength(swervePath))]).speed, ...shifts('1', [swerve1 + 0.02, '2'], [swerve2 + 0.02, '3']), gas: hold(0.35) },
    },
  ],
}

// ---------------------------------------------------------------- 8/11

const flow = kin(50, [{ to: 50, d: 300 }])
const s811 = kin(50, [{ to: 50, d: 15 }])
const w811 = kin(50, [{ to: 20, d: 25 }, { to: 20, d: 40 }])
const b811w = kin(50, [{ to: 50, d: 20 }, { to: 20, d: 25 }, { to: 20, d: 60 }])
const c811w = kin(50, [{ to: 50, d: 25 }, { to: 20, d: 25 }, { to: 20, d: 60 }])
const r811 = kin(50, [{ to: 50, d: 100 }])

export const L8_11: FaultLesson = {
  code: '8/11',
  title: 'Nem veszi fel a forgalom ritmusát',
  summary: 'A folyamatosan haladó forgalomban ok nélkül 20 km/h-ra lassít, és maga mögött feltorlasztja a sort.',
  world: withWorld(straightRoad({ south: 120, north: -160 }), { signs: [signRight('C-033-50', 100)] }),
  actors: [me(70), actor('a', 'car', pose(MY_X, 40), P[2]), actor('b', 'car', pose(MY_X, 92), P[3]), actor('c', 'car', pose(MY_X, 110), P[0])],
  steps: [
    {
      phase: 'setup',
      title: 'Folyamatos forgalomban',
      how: ['A forgalom 50 km/h-val, egyenletesen halad; előtted és mögötted is autók jönnek.', 'A forgalom ritmusához kell igazodni.'],
      ms: s811.ms,
      moves: { me: drive(s811).move, a: drive(flow, undefined, s811.ms).move, b: drive(flow, undefined, s811.ms).move, c: drive(flow, undefined, s811.ms).move },
      controls: { speed: drive(s811).speed, gear: hold('4'), gas: hold(0.2) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: indokolatlanul lelassít',
      how: [
        'A vizsgázó ok nélkül 20 km/h-ra lassít: az előtte haladók elhúznak, mögötte pedig feltorlódik a sor.',
        'Ha valaki nem képes felvenni a forgalom ritmusát, akadályozza a forgalmat, az a 8/11-es hiba: a vizsga sikertelen.',
      ],
      ms: w811.ms,
      moves: { me: drive(w811).move, a: drive(flow, undefined, w811.ms).move, b: drive(b811w, undefined, w811.ms).move, c: drive(c811w, undefined, w811.ms).move },
      controls: { speed: drive(w811).speed, gas: hold(0.05), ...shifts('4', [0.3, '2']) },
      marks: [{ kind: 'gap', a: 'b', b: 'me', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: a forgalommal együtt halad',
      how: ['A megengedett 50 km/h-val, a többiekkel együtt, egyenletesen haladsz.', 'Az előtted haladótól megtartod a követési távolságot, a mögötted jövőket nem fékezed.'],
      ms: r811.ms,
      moves: { me: drive(r811).move, a: drive(flow, undefined, r811.ms).move, b: drive(flow, undefined, r811.ms).move, c: drive(flow, undefined, r811.ms).move },
      controls: { speed: drive(r811).speed, gas: hold(0.2) },
      marks: [{ kind: 'gap', a: 'me', b: 'a' }],
    },
  ],
}

// ---------------------------------------------------------------- 8/12

const lead812 = kin(50, [{ to: 50, d: 30 }, { to: 38, d: 14 }, { to: 50, d: 20 }, { to: 50, d: 30 }, { to: 38, d: 14 }, { to: 50, d: 100 }])
const s812 = kin(50, [{ to: 50, d: 20 }])
const w812 = kin(50, [{ to: 50, d: 30.5 }, { to: 37, d: 13 }, { to: 50, d: 21 }, { to: 50, d: 30.5 }, { to: 37, d: 13 }, { to: 50, d: 20 }])
const r812 = kin(50, [{ to: 30, d: 30 }, { to: 30, d: 10 }, { to: 45, d: 30 }, { to: 45, d: 58 }])

export const L8_12: FaultLesson = {
  code: '8/12',
  title: 'Rendszeresen kis követési távolság',
  summary: 'Folyamatosan az előtte haladó „nyakán” ül, aki ezért fékezéssel jelzi, hogy zavarja.',
  world: straightRoad({ south: 90, north: -160 }),
  actors: [me(80), actor('a', 'car', pose(MY_X, 80 - 4.4 - 6), P[7])],
  steps: [
    {
      phase: 'setup',
      title: 'Hat méterre a másik mögött',
      how: ['50 km/h-val haladsz, mindössze 6 méterre az előtted haladótól.', 'A tartósan kicsi követési távolság zavarja az előtted haladót, és ráfutásos balesethez vezethet.'],
      ms: s812.ms,
      moves: { me: drive(s812).move, a: drive(s812).move },
      controls: { speed: drive(s812).speed, gear: hold('4'), gas: hold(0.2) },
      marks: [{ kind: 'gap', a: 'me', b: 'a', bad: true }],
    },
    {
      phase: 'wrong',
      title: 'Hibás: végig a nyomában marad',
      how: [
        'A vizsgázó végig 5–7 méterre követi az előtte haladót. Az kétszer is rátapos a fékre, hogy jelezze: túl közel van. A vizsgázó minden alkalommal hirtelen fékez, majd újra felzárkózik.',
        'A rendszeresen kicsi követési távolsággal zavarni az előtte haladót a 8/12-es hiba: a vizsga sikertelen.',
      ],
      ms: w812.ms,
      moves: { me: drive(w812).move, a: drive(lead812, undefined, w812.ms).move },
      controls: { speed: drive(w812).speed, gas: at<number>([0, 0.2], [tEnd(w812, 0), 0], [tEnd(w812, 1), 0.35], [tEnd(w812, 2), 0.2], [tEnd(w812, 3), 0], [tEnd(w812, 4), 0.35]), brake: at<number>([0, 0], [tEnd(w812, 0), 0], [tEnd(w812, 0) + 0.01, 0.55], [tEnd(w812, 1), 0], [tEnd(w812, 3), 0], [tEnd(w812, 3) + 0.01, 0.55], [tEnd(w812, 4), 0]) },
      marks: [{ kind: 'gap', a: 'me', b: 'a', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: lemarad, és tartja a 2 másodpercet',
      how: ['Leveszed a gázt, és hagyod, hogy a távolság legalább 2 másodpercnyi útra (50 km/h-nál kb. 28 m) nőjön.', 'Ettől kezdve az előtted haladó lassításait egyenletes, kis lassítással követed.'],
      ms: r812.ms,
      moves: { me: drive(r812).move, a: drive(lead812, undefined, r812.ms).move },
      controls: { speed: drive(r812).speed, gas: at<number>([0, 0], [tEnd(r812, 1), 0.25]), brake: pulse(0.02, tEnd(r812, 0) - 0.02, 0.15) },
      marks: [{ kind: 'gap', a: 'me', b: 'a' }],
    },
  ],
}

// ---------------------------------------------------------------- 8/13

const s813 = kin(45, [{ to: 45, d: 20 }])
const p813 = kin(50, [{ to: 50, d: 300 }])
const p813w = kin(50, [{ to: 50, d: 22 }, { to: 22, d: 24 }, { to: 22, d: 8 }, { to: 45, d: 40 }])
const w813 = kin(45, [{ to: 45, d: 50 - STOP_AT - 12 }, { slam: 12 }, { wait: 2500 }])
const r813 = kin(45, [{ to: 45, d: 6 }, { to: 0, d: 50 - STOP_AT - 6 }, { wait: 2500 }])
const giveWay813 = () => withWorld(junction({ arm: 80, myLine: 'give_way' }), { signs: [signRight('B-001', STOP_Z + 1.2)], bounds: [-36, -30, 30, 72], view: [52, 56] })

export const L8_13: FaultLesson = {
  code: '8/13',
  title: 'Megtévesztő sebesség',
  summary: 'Az elsőbbségadás kötelező tábla felé olyan gyorsan közeledik, mintha nem akarna megállni: a főúton haladó fékez.',
  world: giveWay813(),
  actors: [me(70), actor('p', 'car', pose(-60, MY_X, E), P[1])],
  steps: [
    {
      phase: 'setup',
      title: 'Alárendelt útról a főút felé',
      how: ['Elsőbbségadás kötelező tábla felé közeledsz 45 km/h-val. Balról a főúton egy autó jön.', 'A főúton haladó a sebességedből ítéli meg, hogy meg fogsz-e állni.'],
      ms: s813.ms,
      moves: { me: drive(s813).move, p: drive(p813, undefined, s813.ms).move },
      controls: { speed: drive(s813).speed, gear: hold('3'), gas: hold(0.2) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: az utolsó pillanatig nem lassít',
      how: [
        'A vizsgázó változatlan sebességgel közeledik, és csak a cápafogak előtt fékez erősen. A főúton haladó azt hiszi, hogy nem fog megállni, ezért fékez.',
        'A sebessége megtévesztő volt az elsőbbségadás tekintetében: ez a 8/13-as hiba, a vizsga sikertelen.',
      ],
      ms: w813.ms,
      moves: { me: drive(w813).move, p: drive(p813w, undefined, w813.ms).move },
      controls: { speed: drive(w813).speed, gas: stepTo(0.2, 0, tEnd(w813, 0)), brake: pulse(tEnd(w813, 0), 1, 0.85), ...shifts('3', [tEnd(w813, 1) - 0.03, 'N']) },
      marks: [{ kind: 'label', at: [-14, 6], text: 'Fékez!', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: már messziről látható, hogy megáll',
      how: ['Már jó előre egyenletesen lassítasz: a főúton haladó látja, hogy meg fogsz állni.', 'A cápafogaknál megállsz, és elengeded.'],
      ms: r813.ms,
      moves: { me: drive(r813).move, p: drive(p813, undefined, r813.ms).move },
      controls: { speed: drive(r813).speed, gas: stepTo(0.2, 0, tEnd(r813, 0)), brake: pulse(tEnd(r813, 0), 1, 0.3), ...shifts('3', [0.45, '2'], [tEnd(r813, 1) - 0.03, 'N']) },
      look: at([0, 'ahead'], [0.6, 'left']),
    },
  ],
}

// ---------------------------------------------------------------- 8/14

const s814 = kin(40, [{ to: 40, d: 20 }])
const p814w = kin(30, [{ to: 30, d: 16 }, { to: 8, d: 12 }, { to: 30, d: 60 }])
const p814 = kin(30, [{ to: 30, d: 300 }])
const w814 = kin(40, [{ to: 40, d: 28 }, { slam: 50 - STOP_AT - 28 }, { wait: 3500 }])
const r814 = kin(40, [{ to: 20, d: 20 }, { to: 0, d: 50 - STOP_AT - 20 }, { wait: 3500 }])

export const L8_14: FaultLesson = {
  code: '8/14',
  title: 'Fékkészenlét hiánya egyenrangú kereszteződésben',
  summary: 'Beláthatatlan, egyenrangú kereszteződéshez 40 km/h-val közeledik: a jobbról érkező elé csak vészfékkel tud megállni.',
  world: withWorld(junction({ arm: 80 }), { signs: [signRight('A-027', 34)], bounds: [-30, -30, 50, 72], view: [52, 56] }),
  actors: [me(70), actor('p', 'car', pose(48, -MY_X, W), P[0])],
  steps: [
    {
      phase: 'setup',
      title: 'Beláthatatlan, egyenrangú kereszteződés',
      how: ['Egyenrangú utak kereszteződéséhez közeledsz. A sarkon álló ház miatt a jobbról érkezőket csak az utolsó pillanatban látod.', 'Ide csak olyan sebességgel szabad behajtani, hogy a jobbról érkezőnek elsőbbséget tudj adni.'],
      ms: s814.ms,
      moves: { me: drive(s814).move, p: drive(p814, undefined, s814.ms).move },
      controls: { speed: drive(s814).speed, gear: hold('3'), gas: hold(0.2) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: 40 km/h-val, fékkészenlét nélkül',
      how: [
        'A vizsgázó változatlanul 40 km/h-val közeledik. Amikor a jobbról érkező feltűnik, csak vészfékezéssel tud megállni, és a partnernek is fékeznie kell.',
        'Fékkészenlét nélkül, úgy hajtott a kereszteződéshez, hogy az elsőbbségadási kötelezettségének nem tudott volna eleget tenni: 8/14-es hiba, a vizsga sikertelen.',
      ],
      ms: w814.ms,
      moves: { me: drive(w814).move, p: drive(p814w, undefined, w814.ms).move },
      controls: { speed: drive(w814).speed, gas: stepTo(0.2, 0, tEnd(w814, 0)), brake: pulse(tEnd(w814, 0), 1, 0.9), ...shifts('3', [tEnd(w814, 1) - 0.03, 'N']) },
      look: at([0, 'ahead'], [tEnd(w814, 0), 'right']),
      marks: [{ kind: 'label', at: [8, 12], text: 'Vészfék!', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: lassan, fékkészenlétben közelít',
      how: ['Jó előre 20 km/h körülire lassítasz, a jobb lábad a fékpedál fölött van, és figyelsz jobbra.', 'Amint a jobbról érkező feltűnik, nyugodtan megállsz, és elengeded.'],
      ms: r814.ms,
      moves: { me: drive(r814).move, p: drive(p814, undefined, r814.ms).move },
      controls: { speed: drive(r814).speed, gas: hold(0), brake: at<number>([0, 0.2], [tEnd(r814, 0), 0.05], [tEnd(r814, 0) + 0.05, 0.3]), ...shifts('3', [0.25, '2'], [tEnd(r814, 1) - 0.03, 'N']) },
      look: at([0, 'right'], [0.3, 'left'], [0.4, 'right']),
    },
  ],
}

// ---------------------------------------------------------------- 8/15

const ZEBRA_PED_X = LANE + 1.1
const s815 = kin(40, [{ to: 40, d: 15 }])
const front = (gap: number) => 1.5 + gap + FRONT
const w815 = kin(40, [{ to: 40, d: 26 }, { slam: 55 - front(1) - 26 }, { wait: 5800 }])
const r815 = kin(40, [{ to: 30, d: 14 }, { to: 0, d: 55 - front(5) - 14 }, { wait: 5800 }])
const cross815 = (ms: number, startMs: number) => ({ path: [st(ZEBRA_PED_X * 2)], profile: [[0, 0], [startMs / ms, 0], [Math.min(1, (startMs + 7000) / ms), 1], [1, 1]] as [number, number][] })

export const L8_15: FaultLesson = {
  code: '8/15',
  title: 'Durva fékezés a gyalogos előtt',
  summary: 'A zebrára lépő gyalogos előtt satufékkel, közvetlenül a zebra előtt áll meg.',
  world: withWorld(straightRoad({ south: 80, north: -50 }), { markings: zebra(0), signs: [signRight('E-038', 2.4)] }),
  actors: [me(70), actor('ped', 'ped', pose(ZEBRA_PED_X, 0, W), '#0f766e')],
  steps: [
    {
      phase: 'setup',
      title: 'Gyalogos a zebra szélén',
      how: ['40 km/h-val közeledsz a kijelölt gyalogos-átkelőhelyhez. A szélén egy gyalogos áll, és át akar kelni.', 'A gyalogosnak elsőbbsége van: meg kell állnod, de nem mindegy, hogyan.'],
      ms: s815.ms,
      moves: { me: drive(s815).move },
      controls: { speed: drive(s815).speed, gear: hold('3'), gas: hold(0.2) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: satufékkel, a zebra szélén áll meg',
      how: [
        'A vizsgázó az utolsó pillanatban fékez teljes erővel: az autó a zebra szélén, csikorogva áll meg. A gyalogos megijed, visszalép.',
        'A durva fékezés az áthaladó gyalogos előtt a 8/15-ös hiba: a vizsga sikertelen.',
      ],
      ms: w815.ms,
      moves: { me: drive(w815).move, ped: cross815(w815.ms, w815.ms - 6000) },
      controls: { speed: drive(w815).speed, gas: stepTo(0.2, 0, tEnd(w815, 0)), brake: pulse(tEnd(w815, 0), tEnd(w815, 1) + 0.04, 1), ...shifts('3', [tEnd(w815, 1) - 0.03, 'N']) },
      marks: [{ kind: 'gap', a: 'me', b: 'ped', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: egyenletesen, a zebra előtt pár méterrel áll meg',
      how: ['Időben leveszed a gázt, és egyenletesen fékezve, a zebra előtt kb. 5 méterrel megállsz: a gyalogos látja, hogy átengeded.', 'Megvárod, amíg teljesen átér, és csak utána indulsz.'],
      ms: r815.ms,
      moves: { me: drive(r815).move, ped: cross815(r815.ms, r815.ms - 6000) },
      controls: { speed: drive(r815).speed, gas: stepTo(0.2, 0, 0.02), brake: pulse(0.06, tEnd(r815, 1) + 0.04, 0.3), ...shifts('3', [0.35, '2'], [tEnd(r815, 1) - 0.03, 'N']) },
      marks: [{ kind: 'gap', a: 'me', b: 'ped' }],
    },
  ],
}

// ---------------------------------------------------------------- 8/17

const s817 = kin(30, [{ to: 15, d: 20 }])
const wobble: Segment[] = [st(12.25), arcR(5, 25), st(3), arcR(9, 35), st(2), arcR(7, 30), ...laneShift(-2.2, 8), ...laneShift(2.0, 8), st(8)]
const w817 = kin(15, [{ to: 15, d: pathLength(wobble) }])
const smooth817: Segment[] = [st(40 - 20 - rightTurnZ()), arcR(RIGHT_R, 90), st(26)]
const r817 = kin(15, [{ to: 15, d: pathLength(smooth817) }])

export const L8_17: FaultLesson = {
  code: '8/17',
  title: 'Nem tud folyamatosan kormányozni',
  summary: 'Kanyarodás közben szakaszosan, kapkodva kormányoz: az autó a célút szemközti sávjába téved, és csak kígyózva tér vissza.',
  world: withWorld(junction(), { bounds: [-14, -24, 40, 46] }),
  actors: [me(40)],
  steps: [
    {
      phase: 'setup',
      title: 'Jobbra kanyarodás előtt',
      how: ['15 km/h-ra lassítva jobbra kanyarodni készülsz.', 'A kanyarban a kormányt folyamatosan, a kívánt ívnek megfelelően kell forgatni és visszaengedni.'],
      ms: s817.ms,
      moves: { me: drive(s817).move },
      controls: { speed: drive(s817).speed, gear: at([0, '3'], [0.6, '2']), clutch: pulse(0.52, 0.64), indicator: hold('right'), brake: pulse(0.05, 0.5, 0.25) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: kapkodva, szakaszosan kormányoz',
      how: [
        'A vizsgázó hol túl keveset, hol túl sokat fordít a kormányon, közben el is engedi: az autó a célút szemközti sávjába sodródik, majd kígyózva tér vissza.',
        'Ha valaki nem képes folyamatosan kormányozva irányítani a járművet, az a 8/17-es hiba: a vizsga sikertelen.',
      ],
      ms: w817.ms,
      moves: { me: drive(w817, wobble).move },
      controls: { speed: drive(w817, wobble).speed, gas: hold(0.1), indicator: at([0, 'right'], [0.5, 'off']) },
      marks: [{ kind: 'label', at: [20, -6], text: 'Szemközti sáv!', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: folyamatosan kormányoz',
      how: ['A kanyar elején egyenletesen, kézátfogással forgatod a kormányt, az ív közepén tartod, majd folyamatosan visszaengeded.', 'Az autó egy egyenletes íven, a célút jobb sávjába érkezik.'],
      ms: r817.ms,
      moves: { me: drive(r817, smooth817).move },
      controls: { speed: drive(r817, smooth817).speed, gas: hold(0.1), indicator: at([0, 'right'], [0.55, 'off']) },
      look: at([0, 'mirror_right'], [0.12, 'right'], [0.3, 'ahead']),
    },
  ],
}
