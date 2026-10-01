import { deg, R_MIN, type Pose } from './geometry'
import { CAR_COLORS, LINE } from './sites'
import type { Maneuver, Site } from './types'

/**
 * M6 / M7: megfordulás. Kétirányú utca, a jobb oldali szegély az x = 0, a bal oldali az x = −W vonalon; a kocsi a jobb
 * szélen áll, észak felé, és a végén dél felé halad a túloldali sávban.
 */

function street(width: number, extraCars: boolean): Site {
  const dashes = Array.from({ length: 9 }, (_, i) => ({ x: -width / 2, z: -24 + i * 6, w: LINE, d: 3 }))
  return {
    asphalt: [{ x: -width / 2, z: 0, w: width, d: 60 }],
    kerbs: [
      { x: 0.15, z: 0, w: 0.3, d: 60 },
      { x: -width - 0.15, z: 0, w: 0.3, d: 60 },
    ],
    markings: dashes,
    // Parkoló autók a jobb oldalon, a megfordulás helye előtt és mögött (nem zavarnak, de valószerű)
    cars: extraCars
      ? [
          { color: CAR_COLORS[3], pose: { x: -1.15, z: 12, heading: 0 } },
          { color: CAR_COLORS[5], pose: { x: -1.15, z: -14, heading: 0 } },
        ]
      : [],
    target: { pose: { x: 0, z: 0, heading: Math.PI }, posTol: 99, headTol: 3 },
    bounds: [-width - 2.5, -10, 2.5, 8],
  }
}

// ---------------------------------------------------------------- M6: „Y” megfordulás

const Y_WIDTH = 7.5
const Y_FIRST = 75
const Y_BACK = 30
const yStart: Pose = { x: -1.2, z: 0, heading: 0 }

const ySite = street(Y_WIDTH, true)
// A végén dél felé, a túloldali (nyugati) sávban: az irány számít, a helyet a sáv adja (ezt a tesztek külön nézik)
ySite.target = { pose: { x: -Y_WIDTH * 0.7, z: 0, heading: Math.PI }, posTol: 99, headTol: 3 }

export const M6: Maneuver = {
  id: 'M6',
  title: 'Megfordulás hátramenet közbeiktatásával („Y” megfordulás)',
  summary: 'Szűk utcában megfordulás három mozdulattal: előre balra, hátra jobbra, előre balra.',
  site: ySite,
  start: yStart,
  steps: [
    {
      title: 'Megállás a jobb szélen, körültekintés',
      how: [
        'Olyan helyen fordulj meg, ahol szabad: belátható, nincs tiltó tábla, nincs záróvonal, nem kanyarban vagy bukkanóban.',
        'Állj meg a jobb szélen, a szegély mellett; kéziféket nem kell behúzni, ha rögtön indulsz.',
        'Nézz a belső és a bal tükörbe, majd fordulj hátra balra (holttér): mindkét irányból szabad legyen az út.',
        'Adj balra irányjelzést.',
      ],
      motion: [],
      gear: 'D',
      indicator: 'left',
      look: 'shoulder_left',
      mistakes: [
        { code: '8/6', text: 'Elmaradt a körültekintés vagy az irányjelzés.' },
        { code: '8/28', text: 'Nem tájékozódik a forgalomról: elindul, pedig jön valaki.' },
      ],
    },
    {
      title: 'Előre, teljes kormány balra',
      how: [
        'Lassan indulj el, és közben tekerd a kormányt teljesen balra (kb. 1,5 fordulat).',
        'Lépéstempóban gurulj át a túloldalra, és figyeld előre a túloldali szegélyt.',
        'Az utolsó fél méteren, még gurulás közben, kezdd el jobbra tekerni a kormányt: így a hátramenet már jó kerékállással indul.',
        'Állj meg, mielőtt az első kerék a szegélyhez ér (kb. 25–30 cm-re). A kocsi orra a szegély fölé nyúlhat, a kerék nem érhet hozzá.',
      ],
      cue: 'Az első kerék kb. 25–30 cm-re a túloldali szegélytől',
      motion: [{ kind: 'arc', radius: R_MIN, angle: deg(Y_FIRST), dir: 'left', gear: 'D' }],
      gear: 'D',
      indicator: 'left',
      look: 'ahead',
      mistakes: [
        { code: '8/19', text: 'Kerékkel a szegélyhez ér vagy felhajt rá.' },
        { code: '8/7', text: 'Megálláskor a kocsi a tervezett iránnyal ellentétesen több mint 50 cm-t gurul.' },
      ],
    },
    {
      title: 'Hátra, teljes kormány jobbra',
      how: [
        'Fékkel tartsd a kocsit, kapcsolj hátramenetbe. Nézz körül mindkét irányba: az utca keresztben foglalt, jöhet valaki.',
        'Tolatva tekerd a kormányt teljesen jobbra: a kocsi hátulja a kiindulási oldal felé fordul, az orra a megfordulás irányába.',
        'Fordulj hátra a jobb vállad fölött, és figyeld a szegélyt mögötted. Csak annyit tolass, amennyi a kifordulóshoz kell.',
        'A megállás előtt, még gurulva, kezdd balra tekerni a kormányt.',
      ],
      motion: [{ kind: 'arc', radius: R_MIN, angle: deg(Y_BACK), dir: 'right', gear: 'R' }],
      gear: 'R',
      indicator: 'left',
      look: 'shoulder_right',
      mistakes: [
        { code: '4/5', text: 'Tolatás előtt nem ellenőrzi a forgalmat.' },
        { code: '8/19', text: 'Hátsó kerékkel a szegélyhez ér.' },
      ],
    },
    {
      title: 'Előre, teljes kormány balra, majd egyenesbe',
      how: [
        'Kapcsolj 1. fokozatba, nézz körül, és indulj el teljes bal kormánnyal.',
        'Amikor a kocsi párhuzamos az úttal (most már az ellenkező irányba néz), tekerd egyenesbe a kormányt.',
        'Sorolj be a jobb oldali sávba, kapcsold ki az irányjelzőt, és gyorsíts fel a forgalom tempójára.',
      ],
      motion: [
        { kind: 'arc', radius: R_MIN, angle: deg(180 - Y_FIRST - Y_BACK), dir: 'left', gear: 'D' },
        { kind: 'straight', dist: 4, gear: 'D' },
      ],
      gear: 'D',
      indicator: 'left',
      look: 'ahead',
      mistakes: [{ code: '8/21', text: 'Megfordulás után a bal oldalon marad (nem sorol be jobbra).' }],
    },
  ],
  exam: [
    { code: '8/19', text: 'A kerék a szegélyhez ér vagy felhajt rá: sikertelen vizsga.' },
    { code: '8/7', text: 'Több mint 50 cm-t elgurul a tervezettel ellentétes irányba.' },
    { code: '8/6', text: 'Irányjelzés és körültekintés kötelező, minden irányváltás előtt.' },
    { code: '8/4', text: 'Ha több mozdulat kell, mint amennyit a második javítás megenged, sikertelen.' },
  ],
}

// ---------------------------------------------------------------- M7: „U” megfordulás

const U_WIDTH = 12
const uStart: Pose = { x: -1.2, z: 2, heading: 0 }
const uSite = street(U_WIDTH, true)
uSite.target = { pose: { x: -1.2 - 2 * R_MIN, z: 0, heading: Math.PI }, posTol: 99, headTol: 3 }

export const M7: Maneuver = {
  id: 'M7',
  title: 'Megfordulás egy ívben („U” megfordulás)',
  summary: 'Széles úton egyetlen ívben, teljes bal kormánnyal fordulsz meg.',
  site: uSite,
  start: uStart,
  steps: [
    {
      title: 'Megállás a jobb szélen, körültekintés',
      how: [
        'Egy ívben csak széles úton lehet megfordulni (a kocsinak kb. 11 m kell). Ahol tilos, ott ne: tábla, záróvonal, be nem látható hely.',
        'Állj meg a jobb szélen. Nézz a belső és a bal tükörbe, fordulj hátra balra (holttér), és nézz előre is.',
        'Adj balra irányjelzést, és várd meg, amíg mindkét irányból szabad az út: a megfordulónak mindenkinek elsőbbséget kell adnia.',
      ],
      motion: [],
      gear: 'D',
      indicator: 'left',
      look: 'shoulder_left',
      mistakes: [
        { code: '8/24', text: 'Nem ad elsőbbséget a szemből vagy mögüle érkezőnek.' },
        { code: '8/6', text: 'Elmaradt a körültekintés vagy az irányjelzés.' },
      ],
    },
    {
      title: 'Teljes kormány balra, egy ívben',
      how: [
        'Indulj el, és már az elinduláskor tekerd a kormányt teljesen balra (kb. 1,5 fordulat).',
        'Egyenletes, lassú tempóban fordulj, a kormányt végig teljesen elforgatva tartsd.',
        'Figyeld előre a túloldali szegélyt: az első kerekek kb. 1,3 m-re maradnak tőle.',
      ],
      motion: [{ kind: 'arc', radius: R_MIN, angle: deg(180), dir: 'left', gear: 'D' }],
      gear: 'D',
      indicator: 'left',
      look: 'ahead',
      mistakes: [{ code: '8/19', text: 'Kerékkel a túloldali szegélyhez ér.' }],
    },
    {
      title: 'Kormány egyenesbe, besorolás',
      how: [
        'Amikor a kocsi az ellenkező irányba néz, tekerd egyenesbe a kormányt.',
        'Haladj a jobb oldali sávban, kapcsold ki az irányjelzőt, és gyorsíts fel a forgalom tempójára.',
      ],
      motion: [{ kind: 'straight', dist: 4, gear: 'D' }],
      gear: 'D',
      look: 'ahead',
    },
  ],
  targetAfter: 1,
  exam: [
    { code: '8/24', text: 'Megfordulás közben mindenkinek elsőbbséget kell adni.' },
    { code: '8/19', text: 'A kerék a szegélyhez ér vagy felhajt rá: sikertelen vizsga.' },
    { code: '8/6', text: 'Irányjelzés és körültekintés kötelező.' },
  ],
}
