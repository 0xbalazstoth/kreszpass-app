import { deg, R_MIN, type Pose } from './geometry'
import { CAR_COLORS, LINE } from './sites'
import type { Maneuver, Site } from './types'

/**
 * M3: beállás parkolóhelyre jobbra hátra, 90°-os szögben.
 * A parkolóhelyek a parkolósáv keleti oldalán (bejárat az x = 0 vonalon, 2,5 × 5 m), a kiválasztott hely a z = 0 körül.
 * Elhaladunk a hely mellett, megállunk, majd teljes jobb kormánnyal tolatunk be: a hátsó tengely közepe 4 m-es íven,
 * a forgáspont a hely utáni (északi) szomszéd hátsó sarka mellett van, így a kocsi jobb oldala megkerüli azt.
 */

const BAY_D = 5
/** A hátrafelé beállt autó hátsó tengelye (a hátulja 30 cm-re a hely végétől) */
const PARKED_AXLE_X = BAY_D - 0.3 - 0.85
/** Elhaladáskor a hátsó tengely x-e: a kocsi jobb oldala kb. 1,6 m-re a parkoló autók végétől */
const APPROACH_X = -2.2
/** A tolatás kezdetén a hátsó tengely z-je: a fordulás végén a kocsi épp a hely közepén van */
const STOP_Z = -R_MIN
/** A hely utáni szomszéd hely túlsó vonala */
const FAR_LINE_Z = -3.75

function site(): Site {
  const lines = [-6.25, -3.75, -1.25, 1.25, 3.75, 6.25].map((z) => ({ x: BAY_D / 2, z, w: BAY_D, d: LINE }))
  const parked = (z: number, color: string, nose = true) => ({
    color,
    pose: nose ? { x: BAY_D - 0.3 - 3.55, z, heading: Math.PI / 2 } : { x: PARKED_AXLE_X, z, heading: -Math.PI / 2 },
  })
  return {
    asphalt: [{ x: -2.5, z: 0, w: 15, d: 36 }],
    kerbs: [{ x: BAY_D + 0.35, z: 0, w: 0.3, d: 36 }],
    markings: [...lines, { x: BAY_D, z: 0, w: LINE, d: 12.5 }],
    cars: [parked(-5, CAR_COLORS[4]), parked(-2.5, CAR_COLORS[6], false), parked(2.5, CAR_COLORS[2]), parked(5, CAR_COLORS[3], false)],
    target: { pose: { x: PARKED_AXLE_X, z: 0, heading: -Math.PI / 2 }, posTol: 0.25, headTol: 3 },
    bounds: [-9, -10, 6.5, 13],
  }
}

const start: Pose = { x: APPROACH_X, z: 10, heading: 0 }
/** Az első lépés (lassítás, jelzés) alatt megtett út */
const APPROACH_STRAIGHT = 6

export const M3: Maneuver = {
  id: 'M3',
  title: 'Beállás parkolóhelyre jobbra hátra 90°-os szögben',
  summary: 'Elhaladsz a hely mellett, megállsz, majd teljes jobb kormánnyal tolatva fordulsz be a merőleges helyre.',
  site: site(),
  start,
  steps: [
    {
      title: 'Lassítás, hely kiválasztása, irányjelzés',
      how: [
        'Haladj lépéstempóban, 1. fokozatban, a tengelykapcsoló csúsztatásával.',
        'Válaszd ki a szabad helyet, és nézd meg, nincs-e rajta akadály.',
        'Nézz a belső és a jobb tükörbe, majd adj jobbra irányjelzést: a mögötted jövő így tudja, hogy meg fogsz állni, és nem áll túl közel mögéd.',
        'Haladj a parkoló autóktól kb. 1,5 m-re (a kocsid jobb oldala és a parkoló autók vége között): ez a távolság kell a tolatáshoz.',
      ],
      motion: [{ kind: 'straight', dist: APPROACH_STRAIGHT, gear: 'D' }],
      gear: 'D',
      indicator: 'right',
      look: 'mirror_right',
      mistakes: [{ code: '8/6', text: 'Elmaradt az irányjelzés vagy a körültekintés.' }],
    },
    {
      title: 'Elhaladás a hely mellett, megállás',
      how: [
        'Gurulj el a kiválasztott hely mellett, egyenesen, a parkoló autókkal párhuzamosan.',
        'A jobb tükörben figyeld a burkolati vonalakat: a hely után következő szomszéd helyet is el kell hagynod.',
        'Állj meg, amikor a jobb hátsó kereked kb. 25 cm-rel túlhaladt a szomszéd hely túlsó vonalán (a kiválasztott helytől számított második vonalon). A kerék helyét a tükörben a kocsi hátsó ajtajának vége mutatja.',
      ],
      cue: 'Jobb hátsó kerék a második vonal után kb. 25 cm-rel',
      motion: [{ kind: 'straight', dist: start.z - APPROACH_STRAIGHT - STOP_Z, gear: 'D' }],
      gear: 'D',
      indicator: 'right',
      look: 'mirror_right',
      mistakes: [{ code: '6/3', text: 'Rossz helyen áll meg: túl korán vagy túl messze, ahonnan nem lehet egy ívvel beállni.' }],
    },
    {
      title: 'Hátramenet, körültekintés',
      how: [
        'Fékkel tartsd az autót, nyomd be a tengelykapcsolót, és kapcsolj hátramenetbe (a tolatólámpa jelzi a mögötted lévőknek).',
        'Az irányjelző maradjon jobbra.',
        'Nézz körül: belső tükör, bal és jobb tükör, majd fordulj hátra a jobb vállad fölött, és nézd meg a parkolóhelyet és a mögötted lévő teret. Gyalogos, autó a parkolósávban: várd meg, amíg elhalad.',
      ],
      ref: { car: 'rear_axle', at: [0, FAR_LINE_Z], axis: 'z', label: 'A második vonal' },
      motion: [],
      gear: 'R',
      indicator: 'right',
      look: 'shoulder_right',
      mistakes: [{ code: '4/5', text: 'Tolatás előtt nem ellenőrzi a mögöttes és a melletti forgalmat.' }],
    },
    {
      title: 'Teljes kormány jobbra, tolatás ívben',
      how: [
        'Lépéstempóban indulj hátra, és közben tekerd a kormányt teljesen jobbra (kb. 1,5 fordulat). Tolatáskor a kocsi hátulja arra fordul, amerre a kormányt tekered.',
        'Nézz felváltva hátra és a tükrökbe. A jobb tükörben a jobb oldali (hely utáni) szomszéd autó sarkát figyeld: a kocsid jobb oldala ezt kerüli meg, kb. 25–30 cm-re.',
        'A bal tükörben a másik szomszéd autó elejét figyeld: amikor a kocsid hátulja befordult a helyre, a két tükörben egyformán látszanak a vonalak.',
        'Közben pillants előre is: a bal első sarok kilendül a parkolósáv felé.',
      ],
      cue: 'A két tükörben a két vonal egyforma távolságra: a kocsi párhuzamos',
      motion: [{ kind: 'arc', radius: R_MIN, angle: deg(90), dir: 'right', gear: 'R' }],
      gear: 'R',
      indicator: 'right',
      look: 'mirror_right',
      mistakes: [
        { code: '8/3', text: 'Hozzáér a szomszéd autóhoz.' },
        { code: '7/6', text: 'Másodszori javítással sikerült beállni.' },
      ],
    },
    {
      title: 'Kormány egyenesbe, egyenesen hátra',
      how: [
        'Amikor a kocsi párhuzamos a vonalakkal, tekerd vissza a kormányt egyenesbe (1,5 fordulat balra).',
        'Tolass lassan, egyenesen, amíg a kocsi hátulja kb. 30 cm-re van a hely végétől (szegély, fal). Hátranézve vagy a tükörben a szegélyt figyeld, és fékezz időben.',
        'Az eleje a végén nagyjából a szomszéd autók végével van egy vonalban.',
      ],
      motion: [{ kind: 'straight', dist: PARKED_AXLE_X - (APPROACH_X + R_MIN), gear: 'R' }],
      gear: 'R',
      indicator: 'right',
      look: 'back',
      mistakes: [
        { code: '7/4', text: 'Nem a parkolóhely közepén áll.' },
        { code: '7/5', text: 'A kocsi tengelye nagyon eltér a parkolóhely tengelyétől.' },
        { code: '8/19', text: 'Hátsó kerékkel felhajt a szegélyre.' },
      ],
    },
    {
      title: 'Megállás és rögzítés',
      how: [
        'Fékkel állj meg, nyomd be a tengelykapcsolót, kapcsold üresbe.',
        'Húzd be a kéziféket.',
        'Kapcsold ki az irányjelzőt.',
      ],
      motion: [],
      gear: 'N',
      look: 'ahead',
      mistakes: [{ code: '8/34', text: 'Várakozáskor nem rögzíti a járművet a rögzítőfékkel.' }],
    },
  ],
  exam: [
    { code: '7/4', text: 'A parkolás után a kocsi a parkolóhely közepén álljon.' },
    { code: '7/5', text: 'A kocsi tengelye ne térjen el nagyon a parkolóhely tengelyétől.' },
    { code: '7/6', text: 'Másodszori javítással még elfogadható, de hibapont.' },
    { code: '8/4', text: 'Ha a második javítás után sem sikerül, sikertelen a vizsga.' },
    { code: '4/5', text: 'Tolatás előtt és közben folyamatosan nézz körül.' },
    { code: '8/34', text: 'Várakozáskor a kéziféket be kell húzni.' },
  ],
}
