import { pathLength, type Segment } from '../../maneuvers/geometry'
import { arcL, arcR, at, drive, hold, kin, laneShift, pulse, shifts, st, stepTo, tEnd } from '../motion'
import type { FaultLesson } from '../types'
import { junction, JUNCTION_EDGE, LANE, PARKED_X, signRight, solidZ, STOP_Z, straightRoad, withWorld } from '../world'
import { actor, E, LEFT_R, leftTurnZ, me, MY_X, N, PARTNER_COLORS, pose, RIGHT_R, rightTurnZ, STOP_AT, W } from './common'

const P = PARTNER_COLORS

// ---------------------------------------------------------------- 8/24

const P_LANE = -1.75
const s824own = kin(30, [{ to: 30, d: 22 }])
const s824p = kin(30, [{ to: 30, d: 22 }])
const w824own = kin(30, [{ to: 30, d: 43 }])
const w824p = kin(30, [{ to: 30, d: 6 }, { slam: 8 }, { wait: 2400 }])
const r824own = kin(30, [{ to: 0, d: 7 }, { wait: 2300 }, { to: 25, d: 22 }])
const r824p = kin(30, [{ to: 30, d: 66 }])
const r824ms = Math.max(r824own.ms, r824p.ms)
const w824ms = Math.max(w824own.ms, w824p.ms)

export const L8_24: FaultLesson = {
  code: '8/24',
  title: 'Elsőbbség meg nem adása',
  summary: 'Egyenrangú kereszteződésben nem adja meg az elsőbbséget a jobbról érkezőnek.',
  world: withWorld(junction(), { signs: [signRight('A-027', 30)], bounds: [-30, -30, 30, 46] }),
  actors: [me(40), actor('p', 'car', pose(44, P_LANE, W), '#dc2626')],
  steps: [
    {
      phase: 'setup',
      title: 'Egyenrangú utak kereszteződése',
      how: [
        'Táblával nem szabályozott, egyenrangú utak kereszteződéséhez közeledsz 30 km/h-val.',
        'Jobbról egy autó érkezik: egyenrangú kereszteződésben a jobbról érkezőnek elsőbbsége van.',
      ],
      ms: s824own.ms,
      moves: { me: drive(s824own).move, p: drive(s824p).move },
      controls: { speed: drive(s824own).speed, gear: at([0, '2']), gas: at([0, 0.15]) },
      look: at([0, 'ahead'], [0.6, 'right']),
    },
    {
      phase: 'wrong',
      title: 'Hibás: lassítás nélkül behajt',
      how: [
        'A vezető nem néz jobbra, nem lassít, és változatlan sebességgel behajt a kereszteződésbe.',
        'A jobbról érkező csak vészfékezéssel tudja elkerülni az ütközést. Ez elsőbbségadási hiba (8/24): sikertelen vizsga.',
      ],
      ms: w824ms,
      moves: { me: drive(w824own, undefined, w824ms).move, p: drive(w824p, undefined, w824ms).move },
      controls: { speed: drive(w824own, undefined, w824ms).speed, gas: at([0, 0.2]) },
      look: at([0, 'ahead']),
      marks: [{ kind: 'label', at: [9, -6], text: 'Vészfékez!', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: megáll, elengedi a jobbról érkezőt',
      how: [
        'Időben leveszed a gázt, és úgy lassítasz, hogy a kereszteződés előtt meg tudj állni. Közben jobbra, majd balra nézel.',
        'Megállsz, megvárod, amíg a jobbról érkező áthalad, és csak utána indulsz tovább.',
      ],
      ms: r824ms,
      moves: { me: drive(r824own, undefined, r824ms).move, p: drive(r824p, undefined, r824ms).move },
      controls: {
        speed: drive(r824own, undefined, r824ms).speed,
        gas: stepTo(0, 0.25, tEnd(r824own, 1, r824ms)),
        brake: pulse(0.02, tEnd(r824own, 1, r824ms) - 0.02, 0.45),
        clutch: pulse(tEnd(r824own, 0, r824ms) - 0.05, tEnd(r824own, 1, r824ms)),
        gear: at([0, '2'], [tEnd(r824own, 0, r824ms), '1']),
      },
      look: at([0, 'right'], [0.25, 'left'], [0.35, 'right'], [0.5, 'ahead']),
    },
  ],
}

// ---------------------------------------------------------------- 8/18

const s818 = kin(40, [{ to: 35, d: 20 }])
const skid: Segment[] = [st(40 - 20 - 11), arcR(12, 40), arcL(7, 20), arcR(5, 55), st(2)]
const w818 = kin(35, [{ to: 35, d: 14 }, { to: 0, d: pathLength(skid) - 14 }, { wait: 800 }])
const turn818: Segment[] = [st(40 - 20 - rightTurnZ()), arcR(RIGHT_R, 90), st(16)]
const r818 = kin(35, [{ to: 15, d: 40 - 20 - rightTurnZ() }, { to: 15, d: pathLength(turn818) - (40 - 20 - rightTurnZ()) }])

export const L8_18: FaultLesson = {
  code: '8/18',
  title: 'Elveszti uralmát a jármű felett',
  summary: 'Vizes úton túl gyorsan kanyarodik: az autó kicsúszik, a szemközti sávban, keresztben áll meg.',
  world: withWorld(junction(), { puddles: [{ x: 4, z: 1, w: 6, d: 3 }, { x: 1.5, z: 4, w: 3, d: 4 }], bounds: [-14, -24, 34, 46] }),
  actors: [me(40)],
  steps: [
    {
      phase: 'setup',
      title: 'Vizes úton jobbra kanyarodás',
      how: ['Eső után vizes az út, jobbra kanyarodni készülsz.', 'Vizes úton a tapadás kisebb: a kanyar előtt a szokásosnál is jobban le kell lassítani.'],
      ms: s818.ms,
      moves: { me: drive(s818).move },
      controls: { speed: drive(s818).speed, gear: hold('3'), indicator: hold('right'), gas: hold(0) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: 35 km/h-val fordul be',
      how: [
        'A vizsgázó 35 km/h-val kezd kanyarodni: az autó kisodródik, a vizsgázó kapkodva ellenkormányoz, és az autó a célút szemközti sávjában, ferdén áll meg.',
        'A jármű feletti uralom elvesztése a 8/18-as hiba: a vizsga sikertelen.',
      ],
      ms: w818.ms,
      moves: { me: drive(w818, skid).move },
      controls: { speed: drive(w818, skid).speed, brake: pulse(tEnd(w818, 0), 1, 0.9), indicator: at([0, 'right'], [0.4, 'hazard']) },
      marks: [{ kind: 'label', at: [14, -7], text: 'Kicsúszik!', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: kanyar előtt 15 km/h-ra lassít',
      how: ['A kanyar előtt, egyenesben, egyenletes fékezéssel 15 km/h-ra lassítasz, és visszaváltasz.', 'A kanyarban már nem fékezel: egyenletes, kis gázzal, folyamatos kormányzással fordulsz be.'],
      ms: r818.ms,
      moves: { me: drive(r818, turn818).move },
      controls: { speed: drive(r818, turn818).speed, brake: pulse(0.02, tEnd(r818, 0) - 0.03, 0.35), ...shifts('3', [tEnd(r818, 0) - 0.08, '2']), gas: at<number>([0, 0], [tEnd(r818, 0), 0.1]), indicator: at([0, 'right'], [0.8, 'off']) },
    },
  ],
}

// ---------------------------------------------------------------- 8/19

const s819 = kin(30, [{ to: 15, d: 20 }])
const kerbClimb: Segment[] = [st(40 - 20 - 8), arcR(4, 90), ...laneShift(-2.25, 8), st(10)]
const w819 = kin(15, [{ to: 12, d: pathLength(kerbClimb) }])
const turn819: Segment[] = [st(40 - 20 - rightTurnZ()), arcR(RIGHT_R, 90), st(16)]
const r819 = kin(15, [{ to: 15, d: pathLength(turn819) }])

export const L8_19: FaultLesson = {
  code: '8/19',
  title: 'Felhajt a járdára',
  summary: 'Jobbra kanyarodáskor túl korán és túl élesen fordul: a jobb hátsó kerék felmegy a járdaszegélyre.',
  world: withWorld(junction(), { bounds: [-14, -24, 34, 46] }),
  actors: [me(40)],
  steps: [
    {
      phase: 'setup',
      title: 'Jobbra kanyarodás',
      how: ['Jobbra kanyarodni készülsz, 15 km/h-ra lassítottál.', 'Kanyarodáskor a hátsó kerekek a belső ív felé „levágják” a kanyart: ezt hagyni kell nekik.'],
      ms: s819.ms,
      moves: { me: drive(s819).move },
      controls: { speed: drive(s819).speed, gear: at([0, '3'], [0.6, '2']), clutch: pulse(0.52, 0.64), indicator: hold('right'), brake: pulse(0.05, 0.5, 0.25) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: túl korán, teljes kormánnyal fordul',
      how: [
        'A vizsgázó már a sarok előtt teljesen elfordítja a kormányt: a jobb hátsó kerék felmegy a járdaszegélyre, és az autó egy darabig a járdán halad.',
        'Akár egy kerékkel is felhajtani a járdára vagy a szegélyre a 8/19-es hiba: a vizsga sikertelen.',
      ],
      ms: w819.ms,
      moves: { me: drive(w819, kerbClimb).move },
      controls: { speed: drive(w819, kerbClimb).speed, indicator: at([0, 'right'], [0.6, 'off']), gas: hold(0.1) },
      marks: [{ kind: 'label', at: [9, 9], text: 'Járdán!', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: a sarkon túl kezd kormányozni',
      how: ['Addig haladsz egyenesen, amíg a vállad nagyjából a sarok vonalába ér, és csak akkor fordítod el a kormányt.', 'Így a hátsó kerék is bőven a szegély mellett marad.'],
      ms: r819.ms,
      moves: { me: drive(r819, turn819).move },
      controls: { speed: drive(r819, turn819).speed, indicator: at([0, 'right'], [0.75, 'off']), gas: hold(0.1) },
      look: at([0, 'mirror_right'], [0.2, 'right'], [0.4, 'ahead']),
    },
  ],
}

// ---------------------------------------------------------------- 8/20

const turn820: Segment[] = [st(40 - 20 - rightTurnZ()), arcR(RIGHT_R, 90), st(16)]
const w820 = kin(15, [{ to: 13, d: 12.25 }, { to: 19, d: pathLength(turn820) - 12.25 }])
const r820 = kin(15, [{ to: 15, d: pathLength(turn820) }])

export const L8_20: FaultLesson = {
  code: '8/20',
  title: 'Kanyarodás kinyomott kuplunggal',
  summary: 'A kanyarban végig kinyomja a kuplungot: az autó gurul, nem lehet gázzal szabályozni.',
  world: withWorld(junction(), { bounds: [-14, -24, 34, 46] }),
  actors: [me(40)],
  steps: [
    {
      phase: 'setup',
      title: 'Jobbra kanyarodás',
      how: ['15 km/h-ra lassítva, másodikban jobbra kanyarodni készülsz.', 'A kanyarban az autót sebességben, a gázzal kell irányítani.'],
      ms: s819.ms,
      moves: { me: drive(s819).move },
      controls: { speed: drive(s819).speed, gear: at([0, '3'], [0.6, '2']), clutch: pulse(0.52, 0.64), indicator: hold('right'), brake: pulse(0.05, 0.5, 0.25) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: végig kuplungon gurul',
      how: [
        'A vizsgázó a kanyar előtt kinyomja a kuplungot, és végig úgy gurul: a motor nem fékez és nem húz, az autó a lejtőn felgyorsul, csak fékkel tudja lassítani.',
        'A nem biztonságos, indokolatlanul kinyomott kuplunggal végzett kanyarodás a 8/20-as hiba: a vizsga sikertelen.',
      ],
      ms: w820.ms,
      moves: { me: drive(w820, turn820).move },
      controls: { speed: drive(w820, turn820).speed, clutch: hold(1), gas: hold(0), indicator: at([0, 'right'], [0.75, 'off']), brake: pulse(0.8, 0.95, 0.3) },
      marks: [{ kind: 'label', at: [12, 8], text: 'Kuplungon gurul', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: másodikban, kis gázzal',
      how: ['Második fokozatban, felengedett kuplunggal, kis, egyenletes gázzal fordulsz be.', 'A sebességet így végig a gázpedállal tudod szabályozni.'],
      ms: r820.ms,
      moves: { me: drive(r820, turn820).move },
      controls: { speed: drive(r820, turn820).speed, clutch: hold(0), gas: hold(0.12), indicator: at([0, 'right'], [0.75, 'off']) },
    },
  ],
}

// ---------------------------------------------------------------- 8/21

const s821 = kin(30, [{ to: 20, d: 20 }])
const cutLeft: Segment[] = [st(40 - 20 - 6), arcL(4, 90), ...laneShift(3.75, 10), st(4)]
const w821 = kin(20, [{ to: 18, d: pathLength(cutLeft) }])
const left821: Segment[] = [st(40 - 20 - leftTurnZ()), arcL(LEFT_R, 90), st(12)]
const r821 = kin(20, [{ to: 18, d: pathLength(left821) }])

export const L8_21: FaultLesson = {
  code: '8/21',
  title: 'A bal oldal szabálytalan igénybevétele',
  summary: 'Balra kanyarodáskor levágja a kanyart, és a célút bal oldalán, a várakozó autó felé érkezik.',
  world: withWorld(junction(), { bounds: [-34, -24, 14, 46] }),
  actors: [me(40), actor('q', 'car', pose(-25, MY_X, E), P[2])],
  steps: [
    {
      phase: 'setup',
      title: 'Balra kanyarodás',
      how: ['Balra kanyarodni készülsz. A célúton, a túloldalon egy autó áll a saját sávjában.', 'Balra kanyarodáskor a kereszteződés középpontját jobbról kell megkerülni, és a célút jobb oldalára kell érkezni.'],
      ms: s821.ms,
      moves: { me: drive(s821).move },
      controls: { speed: drive(s821).speed, gear: hold('2'), indicator: hold('left') },
    },
    {
      phase: 'wrong',
      title: 'Hibás: levágja a kanyart',
      how: [
        'A vizsgázó túl korán, élesen fordul balra: a kereszteződés közepétől balra halad el, és a célút bal oldalára, a szembejövő sávba érkezik. Csak az utolsó pillanatban húzódik át jobbra.',
        'A menetirány szerinti bal oldal szabálytalan igénybevétele a 8/21-es hiba: a vizsga sikertelen.',
      ],
      ms: w821.ms,
      moves: { me: drive(w821, cutLeft).move },
      controls: { speed: drive(w821, cutLeft).speed, indicator: at([0, 'left'], [0.6, 'off']), gas: hold(0.1) },
      marks: [{ kind: 'label', at: [-12, 8], text: 'Bal oldalon!', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: nagy íven, a középponttól jobbra',
      how: ['A kereszteződés közepéig egyenesen haladsz, és onnan, a középpontot jobbról megkerülve, nagy íven fordulsz balra.', 'Így egyből a célút jobb oldalára érkezel.'],
      ms: r821.ms,
      moves: { me: drive(r821, left821).move },
      controls: { speed: drive(r821, left821).speed, indicator: at([0, 'left'], [0.8, 'off']), gas: hold(0.1) },
      look: at([0, 'ahead'], [0.2, 'left'], [0.4, 'ahead']),
    },
  ],
}

// ---------------------------------------------------------------- 8/22

const oneWay822 = () =>
  withWorld(junction({ arm: 100, oneWayNS: true }), { markings: [solidZ(0, 6.5, 40)], signs: [signRight('E-012', 85)], bounds: [-30, -30, 14, 100], view: [32, 52] })
const s822 = kin(40, [{ to: 40, d: 10 }])
const b822 = kin(40, [{ to: 40, d: 300 }])
const b822w = kin(40, [{ to: 40, d: 6 }, { to: 18, d: 18 }, { to: 18, d: 60 }])
const lateCut: Segment[] = [st(30), ...laneShift(-LANE, 7), st(40)]
const w822 = kin(40, [{ to: 40, d: pathLength(lateCut) }])
const early822: Segment[] = [st(6), ...laneShift(-LANE, 18), st(53)]
const r822 = kin(40, [{ to: 30, d: 6 }, { to: 30, d: pathLength(early822) - 6 }])

export const L8_22: FaultLesson = {
  code: '8/22',
  title: 'Szabálytalan sávváltás',
  summary: 'A záróvonalon át, a bal sávban haladó elé vágva sorol be.',
  world: oneWay822(),
  actors: [me(80), actor('b', 'car', pose(-MY_X, 74), P[6])],
  steps: [
    {
      phase: 'setup',
      title: 'Sávváltás a kereszteződés előtt',
      how: ['Egyirányú, kétsávos úton a jobb sávban haladsz, és a bal sávba kell átsorolnod. A kereszteződés előtt a sávokat záróvonal választja el.', 'A bal sávban melletted, kicsit előtted egy autó halad.'],
      ms: s822.ms,
      moves: { me: drive(s822).move, b: drive(b822, undefined, s822.ms).move },
      controls: { speed: drive(s822).speed, gear: hold('3'), gas: hold(0.2) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: a záróvonalon át, a másik elé vág',
      how: [
        'A vizsgázó a záróvonalon áthajtva, a bal sávban haladó elé vágva sorol be: annak fékeznie kell.',
        'A szabálytalan, figyelmetlen besorolás és sávváltás a 8/22-es hiba: a vizsga sikertelen.',
      ],
      ms: w822.ms,
      moves: { me: drive(w822, lateCut).move, b: drive(b822w, undefined, w822.ms).move },
      controls: { speed: drive(w822, lateCut).speed, indicator: at([0, 'off'], [0.3, 'left'], [0.55, 'off']), gas: hold(0.25) },
      marks: [{ kind: 'gap', a: 'b', b: 'me', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: a szaggatott szakaszon, a másik mögé sorol',
      how: ['Még a szaggatott vonalas szakaszon, tükör és jelzés után, kicsit lassítva a bal sávban haladó mögé sorolsz be.', 'A záróvonalat nem lépi át egyik kereked sem.'],
      ms: r822.ms,
      moves: { me: drive(r822, early822).move, b: drive(b822, undefined, r822.ms).move },
      controls: { speed: drive(r822, early822).speed, indicator: at([0, 'left'], [0.45, 'off']), gas: at<number>([0, 0], [0.1, 0.15]) },
      look: at([0, 'mirror_left'], [0.05, 'shoulder_left'], [0.1, 'ahead']),
      marks: [{ kind: 'gap', a: 'me', b: 'b' }],
    },
  ],
}

// ---------------------------------------------------------------- 8/23

const s823 = kin(30, [{ to: 30, d: 10 }])
const straight823 = kin(30, [{ to: 30, d: 72 }])
const drift: Segment[] = [st(20), ...laneShift(LANE, 12), st(40)]
const w823 = kin(30, [{ to: 30, d: pathLength(drift) }])
const b823w = kin(30, [{ to: 30, d: 20 }, { to: 8, d: 10 }, { to: 20, d: 40 }])

export const L8_23: FaultLesson = {
  code: '8/23',
  title: 'Nem tartja a sávját a kereszteződésben',
  summary: 'A kereszteződésen áthaladva átsodródik a mellette haladó sávjába.',
  world: withWorld(junction({ arm: 90, oneWayNS: true }), { signs: [signRight('E-012', 70)], bounds: [-20, -40, 20, 60], view: [32, 50] }),
  actors: [me(40, -MY_X), actor('b', 'car', pose(MY_X, 50), P[4])],
  steps: [
    {
      phase: 'setup',
      title: 'Egyenesen át, két sávban',
      how: ['Egyirányú, kétsávos úton a bal sávban haladsz egyenesen át a kereszteződésen. A jobb sávban, kicsit mögötted egy autó jön.', 'A kereszteződésben is a saját sávodban kell maradnod (ebben a terelővonal segít).'],
      ms: s823.ms,
      moves: { me: drive(s823).move, b: drive(s823).move },
      controls: { speed: drive(s823).speed, gear: hold('2'), gas: hold(0.15) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: átsodródik a jobb sávba',
      how: [
        'A vizsgázó a kereszteződésben nem követi a terelővonalat, és átsodródik a jobb sávba: a mellette haladó csak fékezéssel kerüli el az ütközést.',
        'Az útkereszteződésben a forgalmi sáv elhagyása a 8/23-as hiba: a vizsga sikertelen.',
      ],
      ms: w823.ms,
      moves: { me: drive(w823, drift).move, b: drive(b823w, undefined, w823.ms).move },
      controls: { speed: drive(w823, drift).speed, gas: hold(0.15) },
      marks: [{ kind: 'gap', a: 'b', b: 'me', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: végig a bal sávban',
      how: ['A kereszteződésen át a terelővonal mellett, a saját sávodban haladsz egyenesen.', 'A jobb sávban haladó zavartalanul halad melletted.'],
      ms: straight823.ms,
      moves: { me: drive(straight823).move, b: drive(straight823).move },
      controls: { speed: drive(straight823).speed, gas: hold(0.15) },
    },
  ],
}

// ---------------------------------------------------------------- 8/25

const BUS_Z = -6
const s825 = kin(40, [{ to: 40, d: 20 }])
const bus825w = kin(0, [{ wait: 1200 }, { to: 6, d: 1.2 }, { to: 0, d: 0.6 }, { wait: 4000 }])
const pass825: Segment[] = [st(8), ...laneShift(-LANE, 14), st(36), ...laneShift(LANE, 14), st(4)]
const w825 = kin(40, [{ to: 35, d: pathLength(pass825) }])
const bus825 = kin(0, [{ wait: 800 }, { to: 30, d: 40 }, { to: 30, d: 80 }])
const r825 = kin(40, [{ to: 0, d: 50 - (BUS_Z + 6 + 4 + 3.55) }, { wait: 1800 }, { to: 25, d: 30 }])

export const L8_25: FaultLesson = {
  code: '8/25',
  title: 'Nem ismeri fel a közlekedési helyzetet',
  summary: 'Nem veszi észre, hogy a megállóból jelzéssel kiinduló busznak elsőbbséget kell adnia.',
  world: withWorld(straightRoad({ south: 80, north: -130 }), { signs: [signRight('E-039', BUS_Z - 7)] }),
  actors: [me(70), actor('bus', 'bus', pose(2.1, BUS_Z), '#1d4ed8')],
  steps: [
    {
      phase: 'setup',
      title: 'Busz a megállóban',
      how: ['Lakott területen haladsz, előtted a megállóban busz áll. Bekapcsolja a bal irányjelzőjét: indulni készül.', 'Lakott területen a megállóból jelzéssel kiinduló autóbusznak lehetővé kell tenni az elindulást.'],
      ms: s825.ms,
      moves: { me: drive(s825).move },
      controls: { speed: drive(s825).speed, gear: hold('3'), gas: hold(0.2) },
      blinks: { bus: hold('left') },
    },
    {
      phase: 'wrong',
      title: 'Hibás: kikerüli az induló buszt',
      how: [
        'A vizsgázó nem lassít, hanem kihúzódik, és elmegy az induló busz mellett: a busznak meg kell állnia.',
        'A közlekedési helyzetet nem ismerte fel: ez a 8/25-ös hiba, a vizsga sikertelen.',
      ],
      ms: w825.ms,
      moves: { me: drive(w825, pass825).move, bus: drive(bus825w, undefined, w825.ms).move },
      controls: { speed: drive(w825, pass825).speed, indicator: at([0, 'left'], [0.3, 'off'], [0.65, 'right'], [0.9, 'off']), gas: hold(0.2) },
      blinks: { bus: hold('left') },
      marks: [{ kind: 'label', at: [6, BUS_Z - 8], text: 'A busz megáll', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: lassít, és elengedi a buszt',
      how: ['Felismered a helyzetet: leveszed a gázt, és megállsz a busz mögött, hogy kiindulhasson.', 'Amikor a busz besorolt, a kellő követési távolsággal mögötte haladsz tovább.'],
      ms: r825.ms,
      moves: { me: drive(r825).move, bus: drive(bus825, undefined, r825.ms).move },
      controls: { speed: drive(r825).speed, gas: at<number>([0, 0], [tEnd(r825, 1), 0.25]), brake: pulse(0.04, tEnd(r825, 1) - 0.02, 0.3), ...shifts('3', [0.3, '2'], [tEnd(r825, 0) - 0.03, '1']) },
      blinks: { bus: at([0, 'left'], [0.5, 'off']) },
      marks: [{ kind: 'gap', a: 'me', b: 'bus' }],
    },
  ],
}

// ---------------------------------------------------------------- 8/26

const stop826 = () => withWorld(junction({ arm: 80, myLine: 'stop' }), { signs: [signRight('B-002', STOP_Z + 1.2)], bounds: [-20, -30, 20, 70], view: [36, 50] })
const s826 = kin(30, [{ to: 30, d: 20 }])
const w826 = kin(30, [{ to: 8, d: 40 - STOP_AT - 2 }, { to: 8, d: 6 }, { to: 25, d: 25 }])
const r826 = kin(30, [{ to: 0, d: 40 - STOP_AT }, { wait: 2600 }, { to: 25, d: 25 }])

export const L8_26: FaultLesson = {
  code: '8/26',
  title: 'Nem a jelzéseknek megfelelően közlekedik',
  summary: 'A STOP táblánál nem áll meg, csak lassan „átgurul” a stopvonalon.',
  world: stop826(),
  actors: [me(60)],
  steps: [
    {
      phase: 'setup',
      title: 'STOP tábla',
      how: ['„Állj! Elsőbbségadás kötelező” tábla és stopvonal előtt közeledsz.', 'A STOP tábla előtt mindig meg kell állni (akkor is, ha az út szabad), az autó kerekeinek teljesen meg kell állniuk.'],
      ms: s826.ms,
      moves: { me: drive(s826).move },
      controls: { speed: drive(s826).speed, gear: hold('2'), gas: hold(0.1) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: megállás nélkül átgurul',
      how: [
        'A vizsgázó lelassít kb. 8 km/h-ra, körülnéz, és mivel szabad az út, megállás nélkül áthalad a stopvonalon.',
        'A közúti jelzés nem lassítást, hanem megállást ír elő: ez a 8/26-os hiba, a vizsga sikertelen.',
      ],
      ms: w826.ms,
      moves: { me: drive(w826).move },
      controls: { speed: drive(w826).speed, brake: pulse(0.02, tEnd(w826, 0), 0.3), gas: at<number>([0, 0], [tEnd(w826, 1), 0.25]) },
      look: at([0, 'ahead'], [tEnd(w826, 0) - 0.06, 'left'], [tEnd(w826, 0), 'right'], [tEnd(w826, 1), 'ahead']),
      marks: [{ kind: 'label', at: [-5, STOP_Z], text: 'Nem állt meg!', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: a stopvonalnál teljesen megáll',
      how: ['A stopvonal előtt teljesen megállsz (az autó meg sem moccan), és csak ezután nézel körül.', 'Ha az út szabad, elindulsz.'],
      ms: r826.ms,
      moves: { me: drive(r826).move },
      controls: { speed: drive(r826).speed, brake: pulse(0.02, tEnd(r826, 1), 0.3), gas: stepTo(0, 0.25, tEnd(r826, 1)), ...shifts('2', [tEnd(r826, 0) - 0.03, '1']) },
      look: at([0, 'ahead'], [tEnd(r826, 0), 'left'], [tEnd(r826, 0) + 0.08, 'right'], [tEnd(r826, 0) + 0.15, 'left'], [tEnd(r826, 1), 'ahead']),
    },
  ],
}

// ---------------------------------------------------------------- 8/27

const CHILD_Z = 1
const s827 = kin(40, [{ to: 40, d: 20 }])
const front827 = (gap: number) => CHILD_Z + 0.3 + gap + 3.55
const w827 = kin(40, [{ to: 40, d: 28 }, { slam: 50 - front827(0.8) - 28 }, { wait: 4500 }])
const r827 = kin(40, [{ to: 20, d: 16 }, { to: 0, d: 50 - front827(6) - 16 }, { wait: 4500 }])
const childRun = (ms: number, startMs: number) => ({ path: [st(10.5)], profile: [[0, 0], [startMs / ms, 0], [Math.min(1, (startMs + 4200) / ms), 1], [1, 1]] as [number, number][] })

export const L8_27: FaultLesson = {
  code: '8/27',
  title: 'Nem megfelelő reagálás a gyalogosra',
  summary: 'A parkoló autók közül kiszaladó gyereket csak az utolsó pillanatban veszi észre.',
  world: withWorld(straightRoad({ parking: true, south: 80, north: -60 }), { signs: [signRight('A-021', 30)] }),
  actors: [me(70), actor('kid', 'ped', pose(LANE + 2.3 + 1.6, CHILD_Z, W), '#ef4444'), actor('p1', 'car', pose(PARKED_X, CHILD_Z + 6.2), P[0]), actor('p2', 'car', pose(PARKED_X, CHILD_Z - 2.2), P[3])],
  steps: [
    {
      phase: 'setup',
      title: 'Gyerek a parkoló autók mögött',
      how: ['„Gyermekek” tábla után parkoló autók mellett haladsz. A két autó között egy gyerek fut a járdán az úttest felé.', 'Gyerekeknél mindig számítani kell a váratlanra.'],
      ms: s827.ms,
      moves: { me: drive(s827).move },
      controls: { speed: drive(s827).speed, gear: hold('3'), gas: hold(0.2) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: nem lassít, satufékkel áll meg',
      how: [
        'A vizsgázó nem lassít a gyerek láttán. Amikor az kiszalad az autók közül, csak teljes erejű fékezéssel, közvetlenül előtte tud megállni.',
        'A gyalogosok viselkedésére nem megfelelően reagált: ez a 8/27-es hiba, a vizsga sikertelen.',
      ],
      ms: w827.ms,
      moves: { me: drive(w827).move, kid: childRun(w827.ms, 1200) },
      controls: { speed: drive(w827).speed, gas: stepTo(0.2, 0, tEnd(w827, 0)), brake: pulse(tEnd(w827, 0), 1, 1), ...shifts('3', [tEnd(w827, 1) - 0.03, 'N']) },
      marks: [{ kind: 'gap', a: 'me', b: 'kid', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: azonnal lassít, fékkészenlétben',
      how: ['Amint a futó gyereket meglátod, leveszed a gázt, lassítasz, és a lábad a féken van.', 'Amikor kiszalad, nyugodtan, bőven előtte megállsz, és megvárod, amíg átér.'],
      ms: r827.ms,
      moves: { me: drive(r827).move, kid: childRun(r827.ms, 1200) },
      controls: { speed: drive(r827).speed, gas: stepTo(0.2, 0, 0.02), brake: pulse(0.04, 1, 0.35), ...shifts('3', [0.3, '2'], [tEnd(r827, 1) - 0.03, 'N']) },
      look: at([0, 'right'], [0.15, 'ahead']),
      marks: [{ kind: 'gap', a: 'me', b: 'kid' }],
    },
  ],
}

// ---------------------------------------------------------------- 8/28

const OWN28_X = 1.5
const BIKE28_X = 3.1
const turn828 = (z0: number): Segment[] => [st(z0 - rightTurnZ()), arcR(RIGHT_R, 90), st(14)]
const s828 = kin(30, [{ to: 15, d: 20 }])
const bike828 = kin(20, [{ to: 20, d: 200 }])
const bike828w = kin(20, [{ to: 20, d: 7 }, { slam: 5 }, { wait: 6000 }])
const w828 = kin(15, [{ to: 15, d: pathLength(turn828(22)) }])
const r828 = kin(15, [{ to: 0, d: 22 - 10.5 }, { wait: 2600 }, { to: 15, d: pathLength(turn828(10.5)) }])
const r828path = [st(22 - 10.5), ...turn828(10.5)]

export const L8_28: FaultLesson = {
  code: '8/28',
  title: 'Nem tájékozódik, figyelmetlen',
  summary: 'Jobbra kanyarodás előtt nem néz a tükörbe, és elvágja a mellette egyenesen haladó kerékpárost.',
  world: withWorld(junction({ arm: 80 }), { bounds: [-16, -30, 30, 66], view: [40, 52] }),
  actors: [me(42, OWN28_X), actor('k', 'bike', pose(BIKE28_X, 52), '#22c55e')],
  steps: [
    {
      phase: 'setup',
      title: 'Jobbra kanyarodás, mögötted kerékpáros',
      how: ['Jobbra kanyarodni készülsz. A tükörben látható volna, hogy jobb oldalt, mögötted egy kerékpáros jön, egyenesen tovább.', 'Kanyarodás előtt a belső és a jobb tükörbe, majd a jobb vállad fölött is hátra kell nézni.'],
      ms: s828.ms,
      moves: { me: drive(s828).move, k: drive(bike828, undefined, s828.ms).move },
      controls: { speed: drive(s828).speed, gear: at([0, '3'], [0.6, '2']), clutch: pulse(0.52, 0.64), indicator: hold('right'), brake: pulse(0.05, 0.5, 0.25) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: tükör nélkül fordul be',
      how: [
        'A vizsgázó nem néz se a tükörbe, se hátra, egyszerűen befordul: a mellette egyenesen haladó kerékpárosnak satufékkel kell megállnia.',
        'A forgalmi helyzetről nem tájékozódott: ez a 8/28-as hiba, a vizsga sikertelen.',
      ],
      ms: w828.ms,
      moves: { me: drive(w828, turn828(22)).move, k: drive(bike828w, undefined, w828.ms).move },
      controls: { speed: drive(w828, turn828(22)).speed, indicator: at([0, 'right'], [0.7, 'off']), gas: hold(0.1) },
      look: hold('ahead'),
      marks: [{ kind: 'label', at: [8, 14], text: 'Satufék!', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: körülnéz, elengedi a kerékpárost',
      how: ['A belső és a jobb tükörben, majd a vállad fölött észreveszed a kerékpárost: megállsz, és elengeded.', 'Amikor elhaladt, újra körülnézel, és befordulsz.'],
      ms: r828.ms,
      moves: { me: drive(r828, r828path).move, k: drive(bike828, undefined, r828.ms).move },
      controls: { speed: drive(r828, r828path).speed, brake: pulse(0.02, tEnd(r828, 1), 0.3), gas: stepTo(0, 0.12, tEnd(r828, 1)), indicator: at([0, 'right'], [0.85, 'off']), ...shifts('2', [tEnd(r828, 0) - 0.03, '1']) },
      look: at([0, 'mirror_inner'], [0.05, 'mirror_right'], [0.15, 'shoulder_right'], [0.28, 'ahead'], [tEnd(r828, 1) - 0.05, 'shoulder_right'], [tEnd(r828, 1), 'ahead']),
    },
  ],
}

// ---------------------------------------------------------------- 8/29

const MAIN = 90
const p829 = kin(50, [{ to: 50, d: 400 }])
const giveWay829 = () => withWorld(junction({ arm: 100, myLine: 'give_way' }), { signs: [signRight('B-001', STOP_Z + 1.2)], bounds: [-40, -30, 40, 40], view: [64, 50] })
const go829path: Segment[] = [st(MAIN)]
const w829 = kin(0, [{ wait: 9000 }, { to: 25, d: 30 }])
const r829 = kin(0, [{ wait: 1800 }, { to: 25, d: 30 }])

export const L8_29: FaultLesson = {
  code: '8/29',
  title: 'Rendszeresen akadályozza a forgalmat',
  summary: 'A cápafogaknál akkor is sokáig vár, amikor a főút bőven szabad, és mögötte feltorlódnak.',
  world: giveWay829(),
  actors: [me(STOP_AT), actor('b', 'car', pose(MY_X, STOP_AT + 6.4), P[1]), actor('c', 'car', pose(MY_X, STOP_AT + 12.8), P[5]), actor('p', 'car', pose(-200, MY_X, E), P[3])],
  steps: [
    {
      phase: 'setup',
      title: 'Várakozás a főút előtt',
      how: ['A cápafogaknál állsz, mögötted ketten várnak. A főúton a legközelebbi autó kb. 150 méterre van.', 'Ha a főút biztonságosan szabad, nem szabad feleslegesen várni.'],
      ms: 2400,
      moves: { p: drive(p829, undefined, 2400).move },
      controls: { gear: hold('1'), clutch: hold(1), brake: hold(0.3) },
      look: at([0, 'left'], [0.5, 'right']),
    },
    {
      phase: 'wrong',
      title: 'Hibás: bizonytalanul, sokáig vár',
      how: [
        'A vizsgázó újra és újra körülnéz, de nem indul el, pedig a főút bőven szabad: a mögötte állók egyre türelmetlenebbek.',
        'Ha ez a vizsgán rendszeresen előfordul, az a 8/29-es hiba: a vizsga sikertelen.',
      ],
      ms: w829.ms,
      moves: { me: drive(w829, go829path).move, b: drive(kin(0, [{ wait: 10000 }, { to: 25, d: 30 }]), undefined, w829.ms).move, p: drive(p829, undefined, w829.ms).move },
      controls: { speed: drive(w829, go829path).speed, brake: stepTo(0.3, 0, tEnd(w829, 0)), clutch: at<number>([0, 1], [tEnd(w829, 0) - 0.02, 1], [tEnd(w829, 0) + 0.1, 0]), gas: stepTo(0, 0.25, tEnd(w829, 0) - 0.02) },
      look: at(...(['left', 'right', 'left', 'right', 'left', 'right', 'left'] as const).map((l, i): [number, 'left' | 'right'] => [(tEnd(w829, 0) * i) / 7, l]), [tEnd(w829, 0), 'ahead']),
      marks: [{ kind: 'label', at: [-5, 20], text: 'Dudálnak', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: körülnéz, és határozottan indul',
      how: ['Balra, jobbra, majd újra balra nézel: a főút messzire szabad.', 'Határozottan, de nem kapkodva elindulsz, így a mögötted állók is továbbhaladhatnak.'],
      ms: r829.ms,
      moves: { me: drive(r829, go829path).move, b: drive(kin(0, [{ wait: 2800 }, { to: 25, d: 30 }]), undefined, r829.ms).move, p: drive(p829, undefined, r829.ms).move },
      controls: { speed: drive(r829, go829path).speed, brake: stepTo(0.3, 0, tEnd(r829, 0)), clutch: at<number>([0, 1], [tEnd(r829, 0) - 0.02, 1], [tEnd(r829, 0) + 0.12, 0]), gas: stepTo(0, 0.25, tEnd(r829, 0) - 0.02) },
      look: at([0, 'left'], [0.08, 'right'], [0.16, 'left'], [tEnd(r829, 0), 'ahead']),
    },
  ],
}

// ---------------------------------------------------------------- 8/30

const Q_X = 9.55
const s830 = kin(40, [{ to: 40, d: 15 }])
const w830 = kin(40, [{ to: 40, d: 80 }])
const q830w = kin(0, [{ wait: 1400 }, { to: 8, d: 1.2 }, { slam: 0.8 }, { wait: 6000 }])
const giveWay830 = () => withWorld(junction({ arm: 90 }), { signs: [{ code: 'B-001', x: JUNCTION_EDGE + 1.2, z: -(LANE + 1.2), facing: Math.PI / 2 }], bounds: [-20, -30, 30, 70], view: [44, 50] })

export const L8_30: FaultLesson = {
  code: '8/30',
  title: 'Megtévesztő irányjelzés',
  summary: 'Bekapcsolva felejtett jobb irányjelzővel halad egyenesen: a mellékútról érkező azt hiszi, befordul, és elindul.',
  world: giveWay830(),
  actors: [me(70), actor('q', 'car', pose(Q_X, -MY_X, W), P[2])],
  steps: [
    {
      phase: 'setup',
      title: 'Egyenesen tovább, jobb index',
      how: ['Egyenesen haladsz át a kereszteződésen. Egy korábbi sávváltás után bekapcsolva maradt a jobb irányjelződ.', 'Jobbról, a mellékúton egy autó vár: azt figyeli, mit jelzel.'],
      ms: s830.ms,
      moves: { me: drive(s830).move },
      controls: { speed: drive(s830).speed, gear: hold('3'), gas: hold(0.2), indicator: hold('right') },
    },
    {
      phase: 'wrong',
      title: 'Hibás: jelez, de egyenesen megy',
      how: [
        'A vizsgázó jobbra jelezve egyenesen halad tovább. A mellékúton várakozó azt hiszi, hogy befordul, ezért elindul, majd az utolsó pillanatban fékez.',
        'A megtévesztő irányjelzés a 8/30-as hiba: a vizsga sikertelen.',
      ],
      ms: w830.ms,
      moves: { me: drive(w830).move, q: drive(q830w, undefined, w830.ms).move },
      controls: { speed: drive(w830).speed, gas: hold(0.2), indicator: hold('right') },
      marks: [{ kind: 'label', at: [14, -6], text: 'Elindul!', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: csak akkor jelez, ha kanyarodik',
      how: ['A sávváltás után kikapcsolod az irányjelzőt (ha magától nem kapcsolt ki).', 'A mellékúton várakozó helyesen ítéli meg a helyzetet, és megvár.'],
      ms: w830.ms,
      moves: { me: drive(w830).move },
      controls: { speed: drive(w830).speed, gas: hold(0.2), indicator: at([0, 'right'], [0.05, 'off']) },
    },
  ],
}

// ---------------------------------------------------------------- 8/31

const s831 = kin(40, [{ to: 40, d: 20 }])
const amb = kin(60, [{ to: 60, d: 300 }])
const ambW = kin(60, [{ to: 60, d: 18 }, { to: 40, d: 20 }, { to: 40, d: 200 }])
const ambPath: Segment[] = [st(20), ...laneShift(-0.8, 12), st(160)]
const w831 = kin(40, [{ to: 40, d: 100 }])
const pullOver: Segment[] = [st(6), ...laneShift(2.4, 16), st(6)]
const r831 = kin(40, [{ to: 0, d: pathLength(pullOver) }, { wait: 2500 }])

export const L8_31: FaultLesson = {
  code: '8/31',
  title: 'Megkülönböztető jelzést használó jármű',
  summary: 'Nem veszi észre a mögötte szirénázó mentőt, és nem húzódik félre.',
  world: straightRoad({ parking: true, south: 120, north: -160 }),
  actors: [me(60), actor('amb', 'ambulance', pose(MY_X, 116, N))],
  steps: [
    {
      phase: 'setup',
      title: 'Mentő hátulról',
      how: ['40 km/h-val haladsz. A tükörben villogó kék fény látszik, és sziréna hallatszik: mentő érkezik mögötted.', 'A megkülönböztető jelzést használó járműnek akadálytalan haladást kell biztosítani.'],
      ms: s831.ms,
      moves: { me: drive(s831).move, amb: drive(amb, undefined, s831.ms).move },
      controls: { speed: drive(s831).speed, gear: hold('3'), gas: hold(0.2) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: nem veszi észre, tovább halad előtte',
      how: [
        'A vizsgázó nem néz a tükörbe, és változatlanul halad: a mentő mögötte kénytelen lelassítani.',
        'A megkülönböztető jelzést használó járművet nem vette észre: ez a 8/31-es hiba, a vizsga sikertelen.',
      ],
      ms: w831.ms,
      moves: { me: drive(w831).move, amb: drive(ambW, undefined, w831.ms).move },
      controls: { speed: drive(w831).speed, gas: hold(0.2) },
      look: hold('ahead'),
      marks: [{ kind: 'gap', a: 'amb', b: 'me', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: jobbra húzódik, lassít, megáll',
      how: ['Észreveszed a tükörben a mentőt: jelzés jobbra, és lassítva, a parkolósávba húzódva helyet adsz neki.', 'Megállsz, megvárod, amíg elhalad (és nem jön utána másik), csak utána indulsz tovább.'],
      ms: r831.ms,
      moves: { me: drive(r831, pullOver).move, amb: drive(amb, ambPath, r831.ms).move },
      controls: { speed: drive(r831, pullOver).speed, gas: hold(0), brake: pulse(0.04, 1, 0.3), indicator: at([0, 'right'], [0.75, 'off']), ...shifts('3', [0.35, '2'], [tEnd(r831, 0) - 0.03, 'N']) },
      look: at([0, 'mirror_inner'], [0.08, 'mirror_right'], [0.2, 'ahead']),
    },
  ],
}

// ---------------------------------------------------------------- 8/32

const lead832 = kin(40, [{ to: 40, d: 20 }, { to: 28, d: 12 }, { to: 40, d: 16 }, { to: 40, d: 12 }, { to: 28, d: 12 }, { to: 40, d: 100 }])
const s832 = kin(40, [{ to: 40, d: 15 }])
const w832 = kin(40, [{ to: 40, d: 19 }, { to: 18, d: 7 }, { to: 40, d: 20 }, { to: 40, d: 10 }, { to: 18, d: 7 }, { to: 40, d: 20 }])
const back832 = kin(40, [{ to: 40, d: 19 }, { to: 22, d: 8 }, { to: 40, d: 19 }, { to: 40, d: 10 }, { to: 22, d: 8 }, { to: 40, d: 20 }])
const r832 = kin(40, [{ to: 32, d: 20 }, { to: 32, d: 14 }, { to: 35, d: 24 }, { to: 35, d: 25 }])

export const L8_32: FaultLesson = {
  code: '8/32',
  title: 'Rendszeresen hirtelen fékez',
  summary: 'Minden apró lassulásra blokkolásig fékez: a mögötte haladó alig tud megállni.',
  world: straightRoad({ south: 110, north: -160 }),
  actors: [me(70), actor('a', 'car', pose(MY_X, 70 - 4.4 - 22), P[5]), actor('b', 'car', pose(MY_X, 70 + 4.4 + 14), P[0])],
  steps: [
    {
      phase: 'setup',
      title: 'Lassuló forgalom',
      how: ['A forgalom egyenetlenül halad: az előtted haladó időnként kicsit lassít. Mögötted is jön valaki.', 'A lassulást előre kell érzékelni, és fokozatosan, egyenletesen kell rá reagálni.'],
      ms: s832.ms,
      moves: { me: drive(s832).move, a: drive(s832).move, b: drive(s832).move },
      controls: { speed: drive(s832).speed, gear: hold('3'), gas: hold(0.2) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: minden lassulásra satufék',
      how: [
        'A vizsgázó minden apró lassulásra hirtelen, teljes erővel fékez, majd újra gyorsít: a mögötte haladónak kétszer is erősen fékeznie kell.',
        'Ha valaki rendszeresen hirtelen, blokkolva fékez, és nem képes egyenletesen lassítani, az a 8/32-es hiba: a vizsga sikertelen.',
      ],
      ms: w832.ms,
      moves: { me: drive(w832).move, a: drive(lead832, undefined, w832.ms).move, b: drive(back832, undefined, w832.ms).move },
      controls: { speed: drive(w832).speed, gas: at<number>([0, 0.2], [tEnd(w832, 0), 0], [tEnd(w832, 1), 0.4], [tEnd(w832, 3), 0], [tEnd(w832, 4), 0.4]), brake: at<number>([0, 0], [tEnd(w832, 0), 0], [tEnd(w832, 0) + 0.01, 1], [tEnd(w832, 1), 1], [tEnd(w832, 1) + 0.01, 0], [tEnd(w832, 3), 0], [tEnd(w832, 3) + 0.01, 1], [tEnd(w832, 4), 1], [tEnd(w832, 4) + 0.01, 0]) },
      marks: [{ kind: 'gap', a: 'b', b: 'me', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: előrelátóan, egyenletesen lassít',
      how: ['Nagyobb távolságot tartasz, és amikor az előtted haladó lassít, már a gáz elvételével követed, legfeljebb finoman fékezel.', 'A mögötted haladó nyugodtan követ.'],
      ms: r832.ms,
      moves: { me: drive(r832).move, a: drive(lead832, undefined, r832.ms).move, b: drive(r832).move },
      controls: { speed: drive(r832).speed, gas: at<number>([0, 0], [tEnd(r832, 1), 0.15]) },
      marks: [{ kind: 'gap', a: 'me', b: 'a' }],
    },
  ],
}

// ---------------------------------------------------------------- 8/33

const s833 = kin(40, [{ to: 40, d: 25 }])
const APP = 50 - STOP_AT
const w833 = kin(40, [{ to: 34, d: 14 }, { to: 0, d: APP - 14 }, { wait: 900 }])
const r833 = kin(40, [{ to: 30, d: 16 }, { to: 10, d: APP - 16 - 4 }, { to: 0, d: 4 }, { wait: 900 }])

export const L8_33: FaultLesson = {
  code: '8/33',
  title: 'Fék és kuplung rossz sorrendben',
  summary: 'Megálláskor már messze előre kinyomja a kuplungot, és csak utána fékez.',
  world: (() => withWorld(junction({ arm: 85, myLine: 'stop' }), { lights: [{ id: 'L', x: LANE + 1, z: STOP_Z - 0.2, facing: 0 }], bounds: [-14, -24, 14, 85], view: [28, 46] }))(),
  actors: [me(75)],
  steps: [
    {
      phase: 'setup',
      title: 'Megállás a piros lámpánál',
      how: ['40 km/h-val, harmadikban közeledsz a piros lámpához.', 'Lassításkor előbb a fék jön, és csak közvetlenül a megállás előtt a kuplung.'],
      ms: s833.ms,
      moves: { me: drive(s833).move },
      controls: { speed: drive(s833).speed, gear: hold('3'), gas: hold(0.15) },
      signals: { L: hold('red') },
    },
    {
      phase: 'wrong',
      title: 'Hibás: előbb kuplung, aztán fék',
      how: [
        'A vizsgázó már a lassítás elején kinyomja a kuplungot, és csak utána kezd fékezni: a motor alapjáratra esik, nem fékez, az autó csak a fékkel lassul.',
        'Ha valaki a fék- és a kuplungpedált rendszeresen rossz sorrendben működteti, az a 8/33-as hiba: a vizsga sikertelen.',
      ],
      ms: w833.ms,
      moves: { me: drive(w833).move },
      controls: { speed: drive(w833).speed, gas: hold(0), clutch: hold(1), brake: pulse(tEnd(w833, 0), 1, 0.45), gear: at([0, '3'], [tEnd(w833, 1) - 0.02, 'N']) },
      signals: { L: hold('red') },
      marks: [{ kind: 'label', at: [-5, 35], text: 'Kuplung előbb!', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: fék, és csak a végén kuplung',
      how: ['Leveszed a gázt, fékezel, és sebességben maradva a motor is fékez. Közben visszaváltasz.', 'Kb. 10 km/h-nál, közvetlenül a megállás előtt nyomod ki a kuplungot.'],
      ms: r833.ms,
      moves: { me: drive(r833).move },
      controls: {
        speed: drive(r833).speed,
        gas: hold(0),
        brake: at<number>([0, 0], [0.05, 0.25], [tEnd(r833, 2), 0.35]),
        clutch: at<number>([0, 0], [tEnd(r833, 0), 0], [tEnd(r833, 0) + 0.02, 1], [tEnd(r833, 0) + 0.08, 1], [tEnd(r833, 0) + 0.1, 0], [tEnd(r833, 1) - 0.01, 0], [tEnd(r833, 1), 1]),
        gear: at([0, '3'], [tEnd(r833, 0) + 0.05, '2'], [tEnd(r833, 2) + 0.03, 'N']),
      },
      signals: { L: hold('red') },
    },
  ],
}

// ---------------------------------------------------------------- 8/34

const park: Segment[] = [st(30), ...laneShift(PARKED_X - MY_X, 12), st(2)]
const s834 = kin(30, [{ to: 30, d: 12 }])
const w834path: Segment[] = [...park, st(0.6, 'R')]
const w834 = kin(30, [{ to: 0, d: pathLength(park) }, { wait: 2600 }, { to: 1.5, d: 0.3 }, { to: 0, d: 0.3 }])
const r834 = kin(30, [{ to: 0, d: pathLength(park) }, { wait: 3200 }])

export const L8_34: FaultLesson = {
  code: '8/34',
  title: 'Rögzítőfék nélküli várakozás',
  summary: 'Lejtős úton a járda mellett megáll, leállítja a motort, de nem húzza be a kéziféket: az autó elgurul.',
  world: withWorld(straightRoad({ parking: true, south: 80, north: -40 }), { signs: [signRight('A-005', 60)] }),
  actors: [me(58), actor('a', 'car', pose(PARKED_X, -4.5), P[1])],
  steps: [
    {
      phase: 'setup',
      title: 'Megállás a járda mellett',
      how: ['A vizsgabiztos kéri: álljon meg a járda mellett, várakozás céljából. Az út kissé lejt.', 'Várakozáskor az autót rögzítőfékkel (és sebességbe kapcsolva) biztosítani kell.'],
      ms: s834.ms,
      moves: { me: drive(s834).move },
      controls: { speed: drive(s834).speed, gear: hold('2'), gas: hold(0) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: kézifék nélkül hagyja',
      how: [
        'A vizsgázó jelzéssel beáll, leállítja a motort, üresbe teszi a váltót, és leveszi a lábát a fékről, de a kéziféket nem húzza be: az autó lassan elgurul.',
        'Várakozás céljából megállva a járművet rögzítőfékkel nem biztosítani a 8/34-es hiba: a vizsga sikertelen.',
      ],
      ms: w834.ms,
      moves: { me: drive(w834, w834path).move },
      controls: { speed: drive(w834, w834path).speed, indicator: at([0, 'right'], [tEnd(w834, 0), 'off']), brake: at<number>([0, 0.3], [tEnd(w834, 1) - 0.06, 0.3], [tEnd(w834, 1) - 0.04, 0]), engine: at([0, true], [tEnd(w834, 0) + 0.05, false]), gear: at([0, '2'], [tEnd(w834, 0) - 0.04, 'N']), handbrake: hold(false) },
      marks: [{ kind: 'label', at: [PARKED_X, 16], text: 'Elgurul!', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: kézifék, sebességbe kapcsolva',
      how: ['Megállás után behúzod a kéziféket, leállítod a motort, és egyesbe (lejtőn lefelé hátramenetbe) kapcsolsz.', 'Csak ezután veszed le a lábad a fékről: az autó meg sem moccan.'],
      ms: r834.ms,
      moves: { me: drive(r834, park).move },
      controls: { speed: drive(r834, park).speed, indicator: at([0, 'right'], [tEnd(r834, 0), 'off']), brake: at<number>([0, 0.3], [0.95, 0.3], [0.97, 0]), handbrake: at([0, false], [tEnd(r834, 0) + 0.04, true]), engine: at([0, true], [tEnd(r834, 0) + 0.12, false]), gear: at([0, '2'], [tEnd(r834, 0) - 0.03, 'N'], [tEnd(r834, 0) + 0.2, 'R']) },
    },
  ],
}
