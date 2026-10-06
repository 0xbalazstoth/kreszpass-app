import { pathLength } from '../../maneuvers/geometry'
import { at, drive, hold, kin, laneShift, pulse, ramp, shifts, st, stepTo, tEnd } from '../motion'
import type { FaultLesson } from '../types'
import { PARKED_X, straightRoad } from '../world'
import { actor, me, MY_X, N, PARTNER_COLORS, pose, redLightWorld, STOP_AT } from './common'

/** Utca parkolósávval: a vizsga a járda mellől indul */
const kerbWorld = () => straightRoad({ parking: true, south: 60, north: -70 })
const parkedAt = (id: string, z: number, i: number) => actor(id, 'car', pose(PARKED_X, z, N), PARTNER_COLORS[i])

/** Kihúzódás a parkolósávból a mi sávunkba, majd egyenesen */
const pullOut = [...laneShift(MY_X - PARKED_X, 10), st(14)]
const PULL_OUT = pathLength(pullOut)

// ---------------------------------------------------------------- 1/1

export const L1_1: FaultLesson = {
  code: '1/1',
  title: 'Elindulás előtti ellenőrzések',
  summary: 'Az indulás előtti beállításokat és ellenőrzéseket csak a vizsgabiztos figyelmeztetése után végzi el.',
  world: kerbWorld(),
  actors: [me(10, PARKED_X), parkedAt('a', -2, 0), parkedAt('b', 18, 3)],
  steps: [
    {
      phase: 'setup',
      title: 'Beülsz a vizsgaautóba',
      how: ['A vizsgaautó a járda mellett áll, a motor nem jár, a kézifék behúzva.', 'Indulás előtt be kell állítanod az ülést, a kormányt és a tükröket, és be kell csatolnod az övet.'],
      ms: 2600,
      controls: { engine: hold(false), seatbelt: hold(false), handbrake: hold(true), gear: hold('N'), lights: hold('off') },
    },
    {
      phase: 'wrong',
      title: 'Hibás: azonnal indítana',
      how: [
        'A vizsgázó beül, rögtön beindítja a motort, és már egyesbe tenné a váltót: az övet nem csatolta be, a tükröket nem nézte meg.',
        'A vizsgabiztos figyelmeztetésére pótolja az ellenőrzéseket. Ha egyszeri figyelmeztetés után önállóan elvégzi, az az 1/1-es hibavonal.',
      ],
      ms: 6000,
      controls: {
        engine: at([0, false], [0.12, true]),
        clutch: pulse(0.2, 0.42),
        gear: at([0, 'N'], [0.26, '1'], [0.4, 'N']),
        seatbelt: at([0, false], [0.82, true]),
      },
      look: at([0, 'ahead'], [0.55, 'mirror_inner'], [0.63, 'mirror_left'], [0.71, 'mirror_right'], [0.8, 'ahead']),
      marks: [{ kind: 'label', at: [0, 4], text: 'Figyelmeztetés!', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: beállítás, ellenőrzés, aztán motorindítás',
      how: [
        'Beállítod az ülést és a kormányt, majd a belső, a bal és a jobb tükröt. Bekapcsolod az övet.',
        'Ellenőrzöd, hogy a kézifék be van húzva és a váltó üresben van. Kinyomod a kuplungot, beindítod a motort, és felkapcsolod a tompított fényszórót.',
      ],
      ms: 8000,
      controls: {
        seatbelt: at([0, false], [0.46, true]),
        clutch: pulse(0.6, 0.78),
        engine: at([0, false], [0.68, true]),
        lights: at([0, 'off'], [0.86, 'low']),
      },
      look: at([0, 'ahead'], [0.14, 'mirror_inner'], [0.24, 'mirror_left'], [0.34, 'mirror_right'], [0.44, 'ahead']),
    },
  ],
}

// ---------------------------------------------------------------- 2/1

const w21 = kin(0, [{ to: 22, d: PULL_OUT }])
const r21 = kin(0, [{ wait: 1600 }, { to: 22, d: PULL_OUT }])

export const L2_1: FaultLesson = {
  code: '2/1',
  title: 'Biztonsági öv',
  summary: 'Becsatolatlan biztonsági övvel indul el.',
  world: kerbWorld(),
  actors: [me(10, PARKED_X), parkedAt('a', -6, 1), parkedAt('b', 18, 4)],
  steps: [
    {
      phase: 'setup',
      title: 'Indulásra készen',
      how: ['A motor jár, egyesben vagy, a kézifék behúzva. A visszajelző mutatja: az öv nincs becsatolva.', 'A járda mellől kell kihúzódnod a forgalomba.'],
      ms: 2400,
      controls: { seatbelt: hold(false), handbrake: hold(true), gear: hold('1'), clutch: hold(1) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: öv nélkül indul',
      how: ['A vizsgázó becsatolatlan övvel indul el: a visszajelző villog.', 'Az övet induláskor már be kell csatolni. Ez a 2/1-es hiba.'],
      ms: w21.ms,
      moves: { me: drive(w21, pullOut).move },
      controls: {
        speed: drive(w21, pullOut).speed,
        handbrake: at([0, true], [0.05, false]),
        clutch: ramp(1, 0, 0.02, 0.3),
        gas: hold(0.25),
        indicator: at([0, 'left'], [0.55, 'off']),
      },
      look: at([0, 'mirror_left'], [0.12, 'shoulder_left'], [0.25, 'ahead']),
      marks: [{ kind: 'label', at: [PARKED_X + 1, 3], text: 'Öv nélkül!', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: becsatol, körülnéz, indul',
      how: [
        'Indulás előtt becsatolod az övet: a visszajelző kialszik.',
        'Irányjelzés balra, körülnézel (bal tükör, bal váll fölött), és ha a sáv szabad, kihúzódsz a forgalomba.',
      ],
      ms: r21.ms,
      moves: { me: drive(r21, pullOut).move },
      controls: {
        speed: drive(r21, pullOut).speed,
        seatbelt: at([0, false], [0.12, true]),
        handbrake: at([0, true], [tEnd(r21, 0), false]),
        clutch: ramp(1, 0, tEnd(r21, 0) - 0.04, tEnd(r21, 0) + 0.2),
        gas: stepTo(0, 0.25, tEnd(r21, 0) - 0.04),
        indicator: at([0, 'off'], [0.18, 'left'], [0.7, 'off']),
      },
      look: at([0, 'ahead'], [0.2, 'mirror_left'], [0.3, 'shoulder_left'], [0.42, 'ahead']),
    },
  ],
}

// ---------------------------------------------------------------- 2/2

const w22 = kin(0, [{ to: 3, d: 0.35 }, { to: 0, d: 0.15 }])
const r22 = kin(0, [{ wait: 900 }, { to: 22, d: 22 }])

export const L2_2: FaultLesson = {
  code: '2/2',
  title: 'Lefullad induláskor',
  summary: 'Zöld jelzésnél induláskor lefullasztja a motort.',
  world: redLightWorld(),
  actors: [me(STOP_AT)],
  steps: [
    {
      phase: 'setup',
      title: 'Piros-sárga, aztán zöld',
      how: ['A stopvonal előtt állsz, a lámpa piros-sárgára vált: kinyomod a kuplungot, és egyesbe kapcsolsz.', 'A lámpa zöldre vált, indulhatsz.'],
      ms: 2600,
      controls: { gear: at([0, 'N'], [0.3, '1']), clutch: at([0, 0], [0.2, 1]), brake: hold(0.3) },
      signals: { L: at([0, 'red'], [0.12, 'red_yellow'], [0.85, 'green']) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: gáz nélkül, hirtelen engedi fel a kuplungot',
      how: [
        'A vizsgázó gázadás nélkül, egyszerre engedi fel a kuplungpedált: az autó megrándul, és a motor lefullad.',
        'Újra kell indítania a motort, közben a mögötte állók várnak. Ez a 2/2-es hiba.',
      ],
      ms: 4200,
      moves: { me: drive(w22, undefined, 4200).move },
      controls: {
        speed: drive(w22, undefined, 4200).speed,
        brake: stepTo(0.3, 0, 0.05),
        clutch: ramp(1, 0, 0.04, 0.1),
        engine: at([0, true], [0.14, false], [0.72, true]),
        gear: at([0, '1'], [0.5, 'N']),
      },
      signals: { L: hold('green') },
      marks: [{ kind: 'label', at: [-4, STOP_AT], text: 'Lefulladt!', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: gáz és kuplung együtt',
      how: [
        'Kicsit gázt adsz (kb. 1500-as fordulat), és lassan felengeded a kuplungot, amíg az autó megmozdul (a csúszási pont).',
        'Ott egy pillanatra megtartod, majd a gázt növelve teljesen felengeded, és egyenletesen elindulsz.',
      ],
      ms: r22.ms,
      moves: { me: drive(r22).move },
      controls: {
        speed: drive(r22).speed,
        brake: stepTo(0.3, 0, 0.08),
        gas: at<number>([0, 0], [0.08, 0.25], [tEnd(r22, 0), 0.25], [0.5, 0.35]),
        clutch: at<number>([0, 1], [0.08, 1], [tEnd(r22, 0), 0.5], [tEnd(r22, 0) + 0.1, 0.45], [0.3, 0]),
      },
      signals: { L: hold('green') },
    },
  ],
}

// ---------------------------------------------------------------- 2/3

const w23 = kin(0, [{ to: 5, d: 1.2 }, { to: 1.5, d: 0.6 }, { to: 6, d: 1.4 }, { to: 0, d: 1.2 }])
const r23 = kin(0, [{ wait: 1300 }, { to: 22, d: 22 }])

export const L2_3: FaultLesson = {
  code: '2/3',
  title: 'Nem összehangolt kezelés',
  summary: 'Behúzott kézifékkel, túráztatott motorral, rángatva indul.',
  world: straightRoad({ south: 50, north: -50 }),
  actors: [me(20)],
  steps: [
    {
      phase: 'setup',
      title: 'Indulás az út szélén',
      how: ['Az út jobb szélén állsz, egyesben, a kézifék behúzva.', 'Indulásnál a gázt, a kuplungot és a kéziféket egymással összhangban kell kezelni.'],
      ms: 2200,
      controls: { handbrake: hold(true), gear: hold('1'), clutch: hold(1) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: behúzott kéziféket feledve, túráztatva',
      how: [
        'A vizsgázó erősen gázt ad, és felengedi a kuplungot, de a kézifék behúzva marad: a motor felpörög, az autó rángatva araszol.',
        'A pedálokat és a kéziféket nem összehangoltan kezeli. Ez a 2/3-as hiba.',
      ],
      ms: w23.ms + 600,
      moves: { me: drive(w23, undefined, w23.ms + 600).move },
      controls: {
        speed: drive(w23, undefined, w23.ms + 600).speed,
        gas: at<number>([0, 0.2], [0.1, 0.7], [0.5, 0.5], [0.6, 0.8], [0.85, 0.6], [1, 0]),
        rpm: at<number>([0, 1400], [0.12, 3600], [0.5, 2900], [0.62, 3900], [0.9, 3200], [1, 900]),
        clutch: at<number>([0, 1], [0.1, 0.5], [0.45, 0.3], [0.55, 0.6], [0.7, 0.2], [1, 1]),
        handbrake: hold(true),
      },
      marks: [{ kind: 'label', at: [-4, 18], text: 'Kézifék behúzva!', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: a csúszási pontnál engedi ki a kéziféket',
      how: [
        'Kis gázt adsz, és a kuplungot a csúszási pontig engeded fel: az autó „húzni” kezd, a motor hangja mélyül.',
        'Ekkor kiengeded a kéziféket, a gázt növelve felengeded a kuplungot, és simán elindulsz.',
      ],
      ms: r23.ms,
      moves: { me: drive(r23).move },
      controls: {
        speed: drive(r23).speed,
        gas: at<number>([0, 0], [0.06, 0.25], [0.4, 0.3]),
        clutch: at<number>([0, 1], [0.06, 1], [tEnd(r23, 0) - 0.04, 0.5], [tEnd(r23, 0) + 0.08, 0.45], [0.32, 0]),
        handbrake: at([0, true], [tEnd(r23, 0) - 0.02, false]),
      },
    },
  ],
}

// ---------------------------------------------------------------- 2/4

const A_Z = STOP_AT
const ME_Z = A_Z + 6.4
const B_Z = ME_Z + 6.4
const lead = kin(0, [{ to: 25, d: 30 }])
const w24 = kin(0, [{ wait: 3800 }, { to: 10, d: 9 }])
const r24 = kin(0, [{ wait: 800 }, { to: 25, d: 30 }])
const r24b = kin(0, [{ wait: 1700 }, { to: 25, d: 30 }])
const T24w = Math.max(lead.ms, w24.ms)
const T24r = Math.max(lead.ms, r24.ms, r24b.ms)

export const L2_4: FaultLesson = {
  code: '2/4',
  title: 'Nem a forgalomnak megfelelő indulás',
  summary: 'Zöld jelzésnél késlekedve, lassan indul, és feltartja a mögötte állókat.',
  world: redLightWorld(),
  actors: [me(ME_Z), actor('a', 'car', pose(MY_X, A_Z), PARTNER_COLORS[1]), actor('b', 'car', pose(MY_X, B_Z), PARTNER_COLORS[3])],
  steps: [
    {
      phase: 'setup',
      title: 'Sorban a lámpánál',
      how: ['A lámpánál a második autó vagy a sorban, mögötted is áll egy autó.', 'A lámpa zöldre vált: a sor elindul.'],
      ms: 2600,
      controls: { gear: at([0, 'N'], [0.3, '1']), clutch: at([0, 0], [0.2, 1]), brake: hold(0.3) },
      signals: { L: at([0, 'red'], [0.12, 'red_yellow'], [0.85, 'green']) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: késve, araszolva indul',
      how: [
        'Az előtted álló elindul, de a vizsgázó csak hosszú késéssel, majd nagyon lassan indul. A mögötte álló kénytelen várni.',
        'Az indulás ne legyen se túl lassú, se „erőszakos” (kipörgő kerékkel, hirtelen): igazodjon a forgalomhoz. Ez a 2/4-es hiba.',
      ],
      ms: T24w,
      moves: { a: drive(lead, undefined, T24w).move, me: drive(w24, undefined, T24w).move },
      controls: {
        speed: drive(w24, undefined, T24w).speed,
        brake: stepTo(0.3, 0, tEnd(w24, 0, T24w) - 0.05),
        clutch: ramp(1, 0, tEnd(w24, 0, T24w) - 0.03, tEnd(w24, 0, T24w) + 0.15),
        gas: stepTo(0, 0.15, tEnd(w24, 0, T24w) - 0.03),
      },
      signals: { L: hold('green') },
      marks: [{ kind: 'gap', a: 'me', b: 'a', bad: true }],
    },
    {
      phase: 'right',
      title: 'Helyes: az előtted haladóval együtt indul',
      how: [
        'Már a piros-sárgánál felkészültél: amikor az előtted álló megmozdul, te is elindulsz.',
        'Egyenletesen gyorsítasz, és közben megtartod a követési távolságot. Így a mögötted állók is átjutnak a zöldön.',
      ],
      ms: T24r,
      moves: { a: drive(lead, undefined, T24r).move, me: drive(r24, undefined, T24r).move, b: drive(r24b, undefined, T24r).move },
      controls: {
        speed: drive(r24, undefined, T24r).speed,
        brake: stepTo(0.3, 0, tEnd(r24, 0, T24r) - 0.05),
        clutch: ramp(1, 0, tEnd(r24, 0, T24r) - 0.03, tEnd(r24, 0, T24r) + 0.18),
        gas: stepTo(0, 0.3, tEnd(r24, 0, T24r) - 0.03),
      },
      signals: { L: hold('green') },
      marks: [{ kind: 'gap', a: 'me', b: 'a' }],
    },
  ],
}

// ---------------------------------------------------------------- 2/5

const w25 = kin(0, [{ to: 15, d: 8 }, { to: 8, d: 5 }, { to: 25, d: 14 }, { to: 16, d: 7 }, { to: 35, d: 22 }])
const r25 = kin(0, [{ to: 35, d: 56 }])
const g25w = shifts('1', [tEnd(w25, 0), '2'], [tEnd(w25, 3) + 0.04, '3'])
const g25r = shifts('1', [0.24, '2'], [0.58, '3'])

export const L2_5: FaultLesson = {
  code: '2/5',
  title: 'Egyenetlen gyorsítás',
  summary: 'Indulás után szaggatottan gyorsít: hol gázt ad, hol leveszi.',
  world: straightRoad({ south: 50, north: -60 }),
  actors: [me(40)],
  steps: [
    {
      phase: 'setup',
      title: 'Indulás után gyorsítás',
      how: ['Elindultál, és fel kell gyorsítanod kb. 35 km/h-ra.', 'Figyeld a sebességmérőt és a gázpedált.'],
      ms: 2200,
      controls: { gear: hold('1'), clutch: hold(1) },
    },
    {
      phase: 'wrong',
      title: 'Hibás: szaggatottan gyorsít',
      how: [
        'A vizsgázó hol nagy gázt ad, hol teljesen leveszi: az autó előre-hátra bólogat, a sebesség ugrál.',
        'A gyorsítás legyen egyenletes, fokozatos gázadással. Ez a 2/5-ös hiba.',
      ],
      ms: w25.ms,
      moves: { me: drive(w25).move },
      controls: {
        speed: drive(w25).speed,
        gas: at<number>([0, 0.6], [tEnd(w25, 0) - 0.02, 0.6], [tEnd(w25, 0), 0], [tEnd(w25, 1), 0], [tEnd(w25, 1) + 0.02, 0.7], [tEnd(w25, 2), 0.7], [tEnd(w25, 2) + 0.02, 0], [tEnd(w25, 3), 0], [tEnd(w25, 3) + 0.02, 0.7]),
        ...g25w,
      },
    },
    {
      phase: 'right',
      title: 'Helyes: egyenletes gyorsítás',
      how: ['Fokozatosan, egyenletesen nyomod a gázt, és a megfelelő fordulatnál felváltasz.', 'A sebesség folyamatosan nő, az autó nem rángat.'],
      ms: r25.ms,
      moves: { me: drive(r25).move },
      controls: { speed: drive(r25).speed, gas: at<number>([0, 0.35], [0.22, 0.4], [0.24, 0], [0.28, 0.35], [0.56, 0.4], [0.58, 0], [0.62, 0.3]), ...g25r },
    },
  ],
}
