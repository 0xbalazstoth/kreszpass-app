import { deg, R_MIN, type Pose, type Segment } from './geometry'
import { CAR_COLORS, LINE } from './sites'
import type { Maneuver, Site } from './types'

/**
 * M4 / M5: parkolás az úttal párhuzamosan, előre- és hátramenetben.
 * A járdaszegély a jobb oldalon, az x = 0 vonalon; a parkoló autók oldala 25 cm-re van tőle. Az előttünk (északon)
 * álló autó hátulja a z = 0 vonalon, a mögötte álló autó eleje a z = G vonalon (G a hely hossza). Észak felé haladunk.
 */

/** A parkoló autók hátsó tengelyének x-e (a jobb oldaluk 25 cm-re a szegélytől) */
const PARKED_X = -0.25 - 0.9

function site(gap: number, targetX: number): Site {
  return {
    asphalt: [{ x: -4.5, z: gap / 2, w: 9, d: 40 }],
    // Szegély és járda a jobb oldalon
    kerbs: [{ x: 0.15, z: gap / 2, w: 0.3, d: 40 }],
    markings: [
      // Az úttest felezővonala (szaggatott)
      ...Array.from({ length: 7 }, (_, i) => ({ x: -7, z: gap / 2 - 18 + i * 6, w: LINE, d: 3 })),
    ],
    cars: [
      { color: CAR_COLORS[1], pose: { x: PARKED_X, z: -0.85, heading: 0 } },
      { color: CAR_COLORS[2], pose: { x: PARKED_X, z: gap + 3.55, heading: 0 } },
    ],
    // A hely közepén, a két autó között egyenlő távolságra
    target: { pose: { x: targetX, z: (gap - 4.4) / 2 + 3.55, heading: 0 }, posTol: 0.25, headTol: 3 },
    bounds: [-9, -7, 2.5, gap + 9],
  }
}

// ---------------------------------------------------------------- M5: hátramenetben

const M5_GAP = 6.5
/** Oldaltávolság az előttünk álló autótól (m) */
const M5_SIDE = 1.0
const M5_X0 = PARKED_X - 1.8 - M5_SIDE
const M5_ANGLE = 45
/** A két ív közti egyenes: így a kocsi épp a parkoló autók vonalába ér */
const M5_STRAIGHT = (PARKED_X - M5_X0 - 2 * R_MIN * (1 - Math.cos(deg(M5_ANGLE)))) / Math.sin(deg(M5_ANGLE))
/** A beállás végén ennyit kell előregurulni, hogy a kocsi középre kerüljön */
const M5_FORWARD = R_MIN * 2 * Math.sin(deg(M5_ANGLE)) + M5_STRAIGHT * Math.cos(deg(M5_ANGLE)) - 0.85 - ((M5_GAP - 4.4) / 2 + 3.55)

const m5Start: Pose = { x: M5_X0, z: 9, heading: 0 }

export const M5: Maneuver = {
  id: 'M5',
  title: 'Parkolás úttal párhuzamosan hátramenetben',
  summary: 'A klasszikus beállás két autó közé: megállsz az első autó mellett, majd jobb, egyenes, bal kormánnyal tolatsz be.',
  site: site(M5_GAP, PARKED_X),
  start: m5Start,
  steps: [
    {
      title: 'Hely felmérése, irányjelzés, megállás az első autó mellett',
      how: [
        'Haladj lassan, és nézd meg, elég-e a hely: kb. a kocsid hossza + 1,5–2 m kell.',
        'Belső és jobb tükör, majd jobbra irányjelzés: a mögötted jövő így tudja, hogy megállsz és tolatni fogsz.',
        'Állj meg a hely előtti (előtted lévő) parkoló autó mellett, vele párhuzamosan, kb. 1 m oldaltávolságra.',
        'Úgy állj meg, hogy a két autó hátulja egy vonalban legyen (oldalra nézve a hátsó lökhárítók egymás mellett).',
      ],
      cue: 'A két autó hátulja egy vonalban, kb. 1 m oldaltávolság',
      motion: [{ kind: 'straight', dist: m5Start.z + 0.85, gear: 'D' }],
      gear: 'D',
      indicator: 'right',
      look: 'mirror_right',
      mistakes: [
        { code: '8/6', text: 'Elmaradt az irányjelzés vagy a körültekintés.' },
        { code: '6/3', text: 'Túl messze vagy túl közel áll meg a parkoló autótól.' },
      ],
    },
    {
      title: 'Hátramenet, körültekintés',
      how: [
        'Fékkel tartsd a kocsit, kapcsolj hátramenetbe; a tolatólámpa jelzi a szándékodat.',
        'Nézz körül: belső tükör, bal tükör (a mögötted érkező forgalom), jobb tükör (a járda és a mögötte álló autó), majd fordulj hátra a jobb vállad fölött.',
        'Ha a forgalom miatt nem tudsz elindulni, várj: a mögötted érkezőnek látnia kell a tolatólámpát.',
      ],
      ref: { car: 'rear_bumper', at: [0, 0], axis: 'z', label: 'Az előtted álló autó hátulja' },
      motion: [],
      gear: 'R',
      indicator: 'right',
      look: 'shoulder_right',
      mistakes: [{ code: '4/5', text: 'Tolatás előtt nem ellenőrzi a mögöttes és a melletti forgalmat.' }],
    },
    {
      title: 'Teljes kormány jobbra, tolatás kb. 45°-ig',
      how: [
        'Indulj lassan hátra, és közben tekerd a kormányt teljesen jobbra (kb. 1,5 fordulat): a kocsi hátulja a járda felé fordul.',
        'Nézz hátra a hátsó ablakon át és a jobb tükörbe: a jobb hátsó kerék a szegély felé közeledik, a mögötted álló autó eleje is látszik.',
        'Tolass, amíg a kocsi kb. 45°-os szögben áll az úttesthez képest. Jó jel: a bal tükörben a mögötted álló autó teljes eleje (mindkét fényszórója) látszik.',
        'Közben pillants előre is: az eleje kilendül az úttest felé, a szemből vagy mögüled érkezőkre figyelj.',
      ],
      cue: 'Kb. 45°-ban állsz: a bal tükörben a hátsó autó teljes eleje',
      motion: [{ kind: 'arc', radius: R_MIN, angle: deg(M5_ANGLE), dir: 'right', gear: 'R' }],
      gear: 'R',
      indicator: 'right',
      look: 'mirror_left',
    },
    {
      title: 'Kormány egyenesbe, egyenesen hátra',
      how: [
        'Tekerd vissza a kormányt egyenesbe (1,5 fordulat balra), és tolass egyenesen, ferdén a hely felé.',
        'Ez rövid szakasz, kb. fél méter. Ezzel a kocsi hátulja beljebb kerül a helyre, így a balra fordulásnál a hátsó kerék nem éri el a szegélyt.',
        'A jobb tükörben figyeld a szegélyt és a mögötted álló autót.',
      ],
      cue: 'Kb. fél méter egyenesen',
      motion: [{ kind: 'straight', dist: M5_STRAIGHT, gear: 'R' }],
      gear: 'R',
      indicator: 'right',
      look: 'mirror_right',
    },
    {
      title: 'Teljes kormány balra, amíg párhuzamos',
      how: [
        'Lassan tolatva tekerd a kormányt teljesen balra (kb. 3 fordulat a jobb oldali végállásból, 1,5 a középállástól): a kocsi eleje a járda felé fordul, a hátulja beáll a hely közepére.',
        'Figyeld előre a jobb első sarkot (az előtted álló autó hátulja mellett halad el) és hátra a mögötted álló autót: a hátsó lökhárítód ne érjen hozzá.',
        'Amikor a kocsi párhuzamos a szegéllyel (és a parkoló autókkal), állj meg.',
      ],
      cue: 'A kocsi párhuzamos a szegéllyel',
      motion: [{ kind: 'arc', radius: R_MIN, angle: deg(M5_ANGLE), dir: 'left', gear: 'R' }],
      gear: 'R',
      indicator: 'right',
      look: 'back',
      mistakes: [
        { code: '8/19', text: 'Kerékkel felhajt a szegélyre.' },
        { code: '8/3', text: 'Hozzáér a mögötte vagy előtte álló autóhoz.' },
      ],
    },
    {
      title: 'Kormány egyenesbe, igazítás középre',
      how: [
        'Tekerd egyenesbe a kormányt (1,5 fordulat jobbra).',
        'Kapcsolj 1. fokozatba, és gurulj előre kb. fél métert, hogy a két autó között középen állj (elöl és hátul is legyen kb. egy méter, hogy ők is ki tudjanak állni).',
        'Ellenőrizd: a kocsi párhuzamos a szegéllyel, legfeljebb kb. 30 cm-re tőle.',
      ],
      motion: [{ kind: 'straight', dist: M5_FORWARD, gear: 'D' }],
      gear: 'D',
      indicator: 'right',
      look: 'ahead',
      mistakes: [
        { code: '7/7', text: 'A kocsi tengelye nagyon eltér a szegély vonalától (ferdén áll).' },
        { code: '7/8', text: 'Másodszori javítással sikerült beállni.' },
      ],
    },
    {
      title: 'Megállás és rögzítés',
      how: ['Fékkel állj meg, kapcsolj üresbe.', 'Húzd be a kéziféket, kapcsold ki az irányjelzőt.'],
      motion: [],
      gear: 'N',
      look: 'ahead',
      mistakes: [{ code: '8/34', text: 'Várakozáskor nem rögzíti a járművet a rögzítőfékkel.' }],
    },
  ],
  exam: [
    { code: '7/7', text: 'A kocsi tengelye ne térjen el nagyon a járdaszegély vonalától.' },
    { code: '7/8', text: 'Másodszori javítással még elfogadható, de hibapont.' },
    { code: '8/4', text: 'Ha a második javítás után sem sikerül, sikertelen a vizsga.' },
    { code: '8/19', text: 'A kerék a szegélyhez ér vagy felhajt rá: sikertelen vizsga.' },
    { code: '4/5', text: 'Tolatás előtt és közben folyamatosan nézz körül.' },
    { code: '8/34', text: 'Várakozáskor a kéziféket be kell húzni.' },
  ],
}

// ---------------------------------------------------------------- M4: előremenetben

const M4_GAP = 9
/** Oldaltávolság a mögötte álló autótól elhaladáskor (m) */
const M4_SIDE = 0.5
const M4_X0 = PARKED_X - 1.8 - M4_SIDE
const M4_ANGLE = 22
/**
 * Előremenetben a kocsi eleje kifelé lendül: egy mozdulattal csak kb. 85 cm-re lehet a szegély mellé állni úgy,
 * hogy az első kerék ne érjen a szegélyhez. A végén egy rövid, ívelt hátramenettel kerül a szegély mellé.
 */
const M4_FIRST_X = -0.85 - 0.9
const M4_FINAL_X = -0.3 - 0.9
const M4_TURN_Z = 10.45
const M4_STRAIGHT = (M4_FIRST_X - M4_X0 - 2 * R_MIN * (1 - Math.cos(deg(M4_ANGLE)))) / Math.sin(deg(M4_ANGLE))
/** Az igazító hátramenet ívei: így a kocsi a két ív után épp a szegély mellé kerül */
const M4_ADJUST = Math.acos(1 - (M4_FINAL_X - M4_FIRST_X) / (2 * R_MIN))
const M4_END_Z = M4_TURN_Z - 2 * R_MIN * Math.sin(deg(M4_ANGLE)) - M4_STRAIGHT * Math.cos(deg(M4_ANGLE)) + 2 * R_MIN * Math.sin(M4_ADJUST)
const M4_TARGET_Z = (M4_GAP - 4.4) / 2 + 3.55

const m4Start: Pose = { x: M4_X0, z: M4_TURN_Z + 6, heading: 0 }

const m4Adjust: Segment[] = [
  { kind: 'arc', radius: R_MIN, angle: M4_ADJUST, dir: 'right', gear: 'R' },
  { kind: 'arc', radius: R_MIN, angle: M4_ADJUST, dir: 'left', gear: 'R' },
]

export const M4: Maneuver = {
  id: 'M4',
  title: 'Parkolás úttal párhuzamosan előremenetben',
  summary: 'Hosszabb helyre előre, ferdén beállva, majd egy rövid hátramenettel a szegély mellé igazítva.',
  site: site(M4_GAP, M4_FINAL_X),
  start: m4Start,
  steps: [
    {
      title: 'Hely felmérése, irányjelzés',
      how: [
        'Előremenetben csak hosszabb helyre lehet beállni: kb. két autónyi (kb. 8–9 m) hely kell.',
        'Belső és jobb tükör, majd jobbra irányjelzés időben.',
        'Haladj lassan a parkoló autók mellett, tőlük kb. 50 cm-re, velük párhuzamosan.',
      ],
      motion: [{ kind: 'straight', dist: 6, gear: 'D' }],
      gear: 'D',
      indicator: 'right',
      look: 'mirror_right',
      mistakes: [{ code: '8/6', text: 'Elmaradt az irányjelzés vagy a körültekintés.' }],
    },
    {
      title: 'Teljes kormány jobbra, befordulás',
      how: [
        'Amikor a vállad (a vezetőülés) a mögötte álló autó elejével egy vonalba ér, lépéstempóban tekerd a kormányt teljesen jobbra.',
        'A jobb tükörben figyeld a mögötte álló autó bal első sarkát: a kocsid jobb oldala elhalad mellette.',
        'Kb. 20–25°-os szögig fordulj be (a kocsi orra a járda felé mutat).',
      ],
      cue: 'A vállad a mögötte álló autó elejénél',
      ref: { car: 'driver', at: [0, M4_GAP], axis: 'z', label: 'A mögötte álló autó eleje' },
      motion: [{ kind: 'arc', radius: R_MIN, angle: deg(M4_ANGLE), dir: 'right', gear: 'D' }],
      gear: 'D',
      indicator: 'right',
      look: 'mirror_right',
    },
    {
      title: 'Kormány egyenesbe, ferdén a szegély felé',
      how: [
        'Tekerd egyenesbe a kormányt, és gurulj ferdén, egyenesen a szegély felé.',
        'Figyeld a jobb első kereket: amikor kb. 15 cm-re van a szegélytől (a kocsi orra ekkor már kicsit a szegély fölé nyúlik), jön a balra kormányzás.',
        'Ne menj ennél közelebb: a kerék a szegélyhez érne, ami sikertelen vizsgát jelent.',
      ],
      cue: 'A jobb első kerék kb. 15 cm-re a szegélytől',
      motion: [{ kind: 'straight', dist: M4_STRAIGHT, gear: 'D' }],
      gear: 'D',
      indicator: 'right',
      look: 'ahead',
    },
    {
      title: 'Teljes kormány balra, amíg párhuzamos',
      how: [
        'Lassan gurulva tekerd a kormányt teljesen balra: a kocsi eleje a járdától elfordul, a hátulja beáll.',
        'Figyeld előre az előtted álló autó hátulját, és a jobb tükörben a szegélyt.',
        'Amikor a kocsi párhuzamos a szegéllyel, állj meg. Ekkor még kb. 85 cm-re vagy a szegélytől: balra kormányzáskor a kocsi eleje kifelé lendül, ezért előremenetben ennél közelebb nem lehet egy mozdulattal beállni.',
      ],
      cue: 'Párhuzamos a szegéllyel, kb. 85 cm-re tőle',
      motion: [{ kind: 'arc', radius: R_MIN, angle: deg(M4_ANGLE), dir: 'left', gear: 'D' }],
      gear: 'D',
      indicator: 'right',
      look: 'ahead',
      mistakes: [{ code: '8/19', text: 'Az első kerék a szegélyhez ér vagy felhajt rá.' }],
    },
    {
      title: 'Igazítás: rövid hátramenet a szegély mellé',
      how: [
        'Hátramenet, körültekintés: belső tükör, bal tükör, hátranézés a jobb váll fölött.',
        'Lassan tolatva tekerd a kormányt teljesen jobbra, és tolass kb. másfél métert: a kocsi hátulja a szegély felé fordul.',
        'Ezután tekerd teljesen balra, és tolass még kb. másfél métert, amíg a kocsi újra párhuzamos: így oldalt, a szegély felé csúszott (a hátulja jön közelebb, az eleje követi).',
        'A mögötte álló autóig hagyj kb. fél–egy métert.',
      ],
      cue: 'A szegélytől kb. 30 cm-re, párhuzamosan',
      motion: m4Adjust,
      gear: 'R',
      indicator: 'right',
      look: 'shoulder_right',
      mistakes: [{ code: '7/8', text: 'Ha több javítás kell: másodszori javítással még elfogadható, de hibapont.' }],
    },
    {
      title: 'Előre középre, megállás és rögzítés',
      how: [
        'Kormány egyenesben, 1. fokozat, gurulj előre, amíg a két autó között középen állsz.',
        'Fékkel állj meg, üres, kézifék, irányjelző ki.',
      ],
      motion: [{ kind: 'straight', dist: M4_END_Z - M4_TARGET_Z, gear: 'D' }],
      gear: 'D',
      look: 'ahead',
      mistakes: [
        { code: '7/7', text: 'A kocsi tengelye nagyon eltér a szegély vonalától.' },
        { code: '8/34', text: 'Várakozáskor nem rögzíti a járművet a rögzítőfékkel.' },
      ],
    },
  ],
  exam: [
    { code: '7/7', text: 'A kocsi tengelye ne térjen el nagyon a járdaszegély vonalától.' },
    { code: '7/8', text: 'Másodszori javítással még elfogadható, de hibapont.' },
    { code: '8/4', text: 'Ha a második javítás után sem sikerül, sikertelen a vizsga.' },
    { code: '8/19', text: 'A kerék a szegélyhez ér vagy felhajt rá: sikertelen vizsga.' },
    { code: '8/6', text: 'Irányjelzés és körültekintés kötelező.' },
  ],
}
