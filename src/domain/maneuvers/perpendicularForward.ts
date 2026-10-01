import { deg, R_MIN, type Pose, type Segment } from './geometry'
import { CAR_COLORS, LINE, mirrorPose, mirrorSegment, mirrorSite } from './sites'
import type { Maneuver, ManeuverStep, Site } from './types'

/**
 * M1 / M2: beállás parkolóhelyre előre, 90°-os szögben (jobbra, illetve balra), majd kiállás.
 * A jobb oldali változat geometriája: a parkolóhelyek a parkolósáv keleti oldalán, a bejáratuk az x = 0 vonalon,
 * 2,5 m szélesek és 5 m mélyek; a kiválasztott hely a z = 0 körül van. Észak felé (−z) haladunk.
 */

const BAY_W = 2.5
const BAY_D = 5
/** A helyre előre beállt autó hátsó tengelye (eleje 30 cm-re a hely végétől) */
const PARKED_AXLE_X = BAY_D - 0.3 - 3.55
/**
 * A közeledés: a hátsó tengely x-e. Teljes kormánnyal (4 m-es ív) a kocsi bal első sarka a túloldali szomszéd felé
 * lendül ki; hogy ne érjen hozzá, a fordulásnak a hely előtt kell befejeződnie, ezért a parkolósáv túlsó széléről
 * indulunk: a kocsi jobb oldala kb. 5,5 m-re van a parkoló autók végétől.
 */
const APPROACH_X = -6.3
/** A kiálláskor ennyit tolatunk egyenesen (a tükrök kb. 60 cm-rel túljutnak a szomszéd autók végén) */
const EXIT_STRAIGHT = 3.45

function site(): Site {
  const lines = [-6.25, -3.75, -1.25, 1.25, 3.75, 6.25].map((z) => ({ x: BAY_D / 2, z, w: BAY_D, d: LINE }))
  const parked = (z: number, color: string, backIn = false) => ({
    color,
    pose: backIn ? { x: BAY_D - 0.3 - 0.85, z, heading: -Math.PI / 2 } : { x: PARKED_AXLE_X, z, heading: Math.PI / 2 },
  })
  return {
    asphalt: [{ x: -3.5, z: 0, w: 17, d: 36 }],
    kerbs: [{ x: BAY_D + 0.35, z: 0, w: 0.3, d: 36 }],
    markings: [...lines, { x: BAY_D, z: 0, w: LINE, d: 12.5 }],
    cars: [parked(-5, CAR_COLORS[2], true), parked(-2.5, CAR_COLORS[1]), parked(2.5, CAR_COLORS[3]), parked(5, CAR_COLORS[0])],
    target: { pose: { x: PARKED_AXLE_X, z: 0, heading: Math.PI / 2 }, posTol: 0.25, headTol: 3 },
    bounds: [-12, -9, 6.5, 15],
  }
}

type Side = 'right' | 'left'

function words(side: Side) {
  const r = side === 'right'
  return {
    side: r ? 'jobbra' : 'balra',
    back: r ? 'balra' : 'jobbra',
    sideAdj: r ? 'jobb' : 'bal',
    otherAdj: r ? 'bal' : 'jobb',
    mirror: r ? 'mirror_right' : 'mirror_left',
    shoulder: r ? 'shoulder_right' : 'shoulder_left',
  } as const
}

function steps(side: Side): ManeuverStep[] {
  const w = words(side)
  const arc = (gear: 'D' | 'R'): Segment => ({ kind: 'arc', radius: R_MIN, angle: deg(90), dir: 'right', gear })
  const m = (s: Segment): Segment => (side === 'right' ? s : mirrorSegment(s))
  const neighbourZ = BAY_W
  return [
    {
      title: 'Lassítás, hely kiválasztása, irányjelzés',
      how: [
        'A parkolóban haladj lépéstempóban (5–10 km/h), 1. fokozatban, a tengelykapcsoló finom csúsztatásával.',
        'Válaszd ki a szabad helyet, és nézd meg, nincs-e rajta akadály (bevásárlókocsi, kerékpár, alacsony oszlop).',
        `Nézz a belső, majd a ${w.sideAdj} oldali tükörbe, és adj ${w.side} irányjelzést időben, hogy a mögötted jövők lássák, hová készülsz.`,
        ...(side === 'left'
          ? ['Balra beálláskor átkeresztezed a szemközti forgalom útját: a szemből jövőket (autó, gyalogos) el kell engedned.']
          : []),
      ],
      motion: [m({ kind: 'straight', dist: 5, gear: 'D' })],
      gear: 'D',
      indicator: side,
      look: w.mirror,
      mistakes: [
        { code: '8/6', text: 'Elmaradt az irányjelzés vagy a körültekintés.' },
        { code: '6/8', text: 'Az irányjelzés későn, csak a kanyarodás pillanatában.' },
      ],
    },
    {
      title: `Helyezkedés: húzódj ${w.back}, távol a parkoló autóktól`,
      how: [
        `Előre beálláshoz nagy ív kell: húzódj a parkolósáv túlsó (${w.otherAdj}) szélére, hogy a kocsid ${w.sideAdj} oldala kb. 5–5,5 m-re legyen a parkoló autók végétől. Ha közelebbről fordulsz, a ${w.otherAdj} első sarok a túloldali szomszéd autóba ér.`,
        'Tartsd a lépéstempót, a kormány egyenesben.',
        `Figyeld oldalt a kiválasztott hely előtti (hozzád közelebbi) autót: a fordulást akkor kezded, amikor a közepe a vállad vonalába ér.`,
      ],
      cue: 'A kiválasztott hely előtti autó közepe a vállad vonalában',
      motion: [m({ kind: 'straight', dist: 4, gear: 'D' })],
      gear: 'D',
      indicator: side,
      look: 'ahead',
    },
    {
      title: `Teljes kormány ${w.side}`,
      how: [
        `Lassíts szinte megállásig, és gördülés közben tekerd a kormányt teljesen ${w.side} (kb. 1,5 fordulat). Gördülve könnyebb kormányozni, és kíméli a gumit.`,
        `Gurulj lépésben: a kocsi orra befordul a helyre. Közben figyeld a ${w.otherAdj} első sarkot (a túloldali szomszéd autó felé) és a ${w.sideAdj} tükörben a ${w.sideAdj} hátsó kereket és a közelebbi szomszéd sarkát.`,
        `Ha a ${w.sideAdj} hátsó sarok túl közel kerül a szomszéd autóhoz, állj meg, tolass vissza egy kicsit, és kezdd újra – a vizsgán ez javításnak számít.`,
      ],
      cue: 'A szomszéd autó közepe a vállad vonalában: indulhat a fordulás',
      ref: { car: 'driver', at: [0, neighbourZ], axis: 'z', label: 'A szomszéd autó közepe' },
      motion: [m(arc('D'))],
      gear: 'D',
      indicator: side,
      look: w.mirror,
      mistakes: [
        { code: '8/3', text: 'Hozzáér a szomszéd autóhoz: veszélyhelyzet, sikertelen vizsga.' },
        { code: '7/3', text: 'Másodszori javítással sikerült beállni.' },
      ],
    },
    {
      title: 'Kormány egyenesbe, begurulás a hely végéig',
      how: [
        `Amikor a kocsi párhuzamos a parkolóhely vonalaival (az orra ekkor kb. 1 m-re van bent a helyen, a két szomszéd autó között), tekerd vissza a kormányt egyenesbe (1,5 fordulat ${w.back}).`,
        'Gurulj lassan, egyenesen előre, amíg az autó eleje kb. 30 cm-re van a hely végétől (szegély, fal). A kocsi vége nagyjából a szomszéd autók végével kerül egy vonalba.',
        'Mindkét tükörben ellenőrizd, hogy középen állsz: két oldalt nagyjából egyforma a távolság a vonalaktól.',
      ],
      cue: 'A kocsi párhuzamos a szomszéd autókkal',
      motion: [m({ kind: 'straight', dist: PARKED_AXLE_X - (APPROACH_X + R_MIN), gear: 'D' })],
      gear: 'D',
      look: 'ahead',
      mistakes: [
        { code: '7/1', text: 'Nem a parkolóhely közepén áll.' },
        { code: '7/2', text: 'A kocsi tengelye nagyon eltér a parkolóhely tengelyétől (ferdén áll).' },
        { code: '8/19', text: 'Felhajt a szegélyre (akár egy kerékkel is).' },
      ],
    },
    {
      title: 'Megállás és rögzítés',
      how: [
        'Fékkel állj meg, nyomd be a tengelykapcsolót, kapcsold üresbe.',
        'Húzd be a kéziféket: várakozáskor a járművet rögzíteni kell.',
        'Kapcsold ki az irányjelzőt.',
      ],
      motion: [],
      gear: 'N',
      look: 'ahead',
      mistakes: [{ code: '8/34', text: 'Várakozáskor nem rögzíti a járművet a rögzítőfékkel.' }],
    },
    {
      title: 'Kiállás: előkészület, körültekintés',
      how: [
        'Nyomd be a tengelykapcsolót, kapcsolj hátramenetbe, a lábfékkel tartsd az autót, és engedd ki a kéziféket.',
        `Adj ${w.back} irányjelzést: a parkolósávba, a forgalomba hajtasz ki.`,
        `Nézz körül: belső tükör, mindkét külső tükör, majd fordulj hátra a ${w.sideAdj} vállad fölött. A parkolósávban jöhet autó, gyalogos, gyerek is.`,
      ],
      motion: [],
      gear: 'R',
      indicator: side === 'right' ? 'left' : 'right',
      look: w.shoulder,
      mistakes: [{ code: '4/5', text: 'Indulás előtt nem ellenőrzi a mögöttes és a melletti forgalmat.' }],
    },
    {
      title: 'Egyenesen hátra',
      how: [
        'Lépéstempóban, a tengelykapcsoló csúsztatásával tolass egyenesen, a kormány egyenesben.',
        'Közben nézz hátra (a hátsó ablakon át) és a tükrökbe felváltva.',
        'Addig tolass egyenesen, amíg a külső tükreid kb. 60 cm-rel túljutnak a szomszéd autók végén: a kocsi orra ekkor még kb. 1 m-re bent van a helyen, de fordulás közben már nem ér a szomszédokhoz.',
      ],
      cue: 'A tükreid kb. 60 cm-rel a szomszéd autók vége után',
      motion: [m({ kind: 'straight', dist: EXIT_STRAIGHT, gear: 'R' })],
      gear: 'R',
      indicator: side === 'right' ? 'left' : 'right',
      look: 'back',
    },
    {
      title: `Teljes kormány ${w.side}, tolatás ívben`,
      how: [
        `Tolatáskor a kocsi hátulja arra fordul, amerre a kormányt tekered: tekerd teljesen ${w.side} (kb. 1,5 fordulat), így a hátulja a parkolósáv felé, az orra pedig a haladási irányba fordul.`,
        `Lassan tolass, és váltogasd a nézést: hátra, a ${w.sideAdj} tükörbe (a közelebbi szomszéd sarka), és előre a ${w.otherAdj} első sarokra, mert az kilendül a túloldali autó felé.`,
        'Amikor a kocsi párhuzamos a parkolósávval, állj meg.',
      ],
      // Mindkét tükör ugyanazon a keresztvonalon van: elég az egyiket nézni
      ref: { car: 'mirror_left', at: [side === 'right' ? -0.3 : 0.3, 0], axis: 'x', label: 'A szomszéd autók vége' },
      motion: [m(arc('R'))],
      gear: 'R',
      indicator: side === 'right' ? 'left' : 'right',
      look: 'back',
      mistakes: [{ code: '8/7', text: 'Megálláskor a kocsi a tervezettel ellentétes irányba több mint 50 cm-t elgurul.' }],
    },
    {
      title: 'Kormány egyenesbe, elindulás',
      how: [
        'Állva vagy lassan gördülve tekerd egyenesbe a kormányt.',
        'Kapcsolj 1. fokozatba, nézz előre és a tükrökbe, majd egyenletesen indulj el.',
        'Kapcsold ki az irányjelzőt, ha magától nem kapcsolt ki.',
      ],
      motion: [m({ kind: 'straight', dist: 3, gear: 'D' })],
      gear: 'D',
      look: 'ahead',
    },
  ]
}

function build(side: Side): Maneuver {
  const right = side === 'right'
  const s = site()
  const start: Pose = { x: APPROACH_X, z: 13, heading: 0 }
  const base: Maneuver = {
    id: right ? 'M1' : 'M2',
    title: right ? 'Beállás parkolóhelyre jobbra előre 90°-os szögben, majd kiállás' : 'Beállás parkolóhelyre balra előre 90°-os szögben, majd kiállás',
    summary: right
      ? 'Előre a jobb oldali, merőleges parkolóhelyre, majd tolatva ki. Széles ív kell: húzódj el a parkoló autóktól.'
      : 'Előre a bal oldali, merőleges parkolóhelyre a szemközti forgalom elengedése után, majd tolatva ki.',
    site: right ? s : mirrorSite(s),
    start: right ? start : mirrorPose(start),
    steps: steps(side),
    targetAfter: 4,
    exam: [
      { code: '7/1', text: 'A parkolás után a kocsi a parkolóhely közepén álljon.' },
      { code: '7/2', text: 'A kocsi tengelye ne térjen el nagyon a parkolóhely tengelyétől.' },
      { code: '7/3', text: 'Másodszori javítással még elfogadható, de hibapont.' },
      { code: '8/4', text: 'Ha a második javítás után sem sikerül, sikertelen a vizsga.' },
      { code: '8/6', text: 'Irányjelzés és körültekintés be- és kiálláskor is kötelező.' },
      { code: '8/34', text: 'Várakozáskor a kéziféket be kell húzni.' },
    ],
  }
  return base
}

export const M1 = build('right')
export const M2 = build('left')
