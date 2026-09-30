#!/usr/bin/env node
/**
 * A magyar KRESZ jelzőtáblák letöltése a Wikimedia Commonsról.
 *
 * A táblák a magyar jog szerint közkincsek ({{PD-HU-exempt|type=road signs}}), ezért szabadon
 * felhasználhatók. A Wikimedia API kötelezően kér egy leíró User-Agent fejlécet, ezért a letöltés
 * Node-ból, build előtt fut, és a fájlok a repóba kerülnek (az app így offline is működik).
 * A Wikimedia kérésére szabványos méretű (500 px) PNG bélyegképeket kérünk az imageinfo API-n át,
 * nem az eredeti, sokszor 100–250 kB-os SVG-ket.
 *
 * A lista a jelenleg érvényes, utakon használt KRESZ táblákat tartalmazza (a nyomtatható KRESZ-táblalista
 * szerint, csoportonként), a Commons régi („Historic”) változatai nélkül. Néhány tábla egy fő táblából és
 * egy alatta lévő kiegészítő táblából áll (pl. „Elsőbbségadás kötelező előjelző”): ezeket a két Commons-képből
 * egymás alá rakott SVG-ként állítjuk elő (`parts`).
 *
 * Használat:  npm run signs            (csak a hiányzókat tölti le)
 *             npm run signs -- --force (mindent újratölt)
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'public', 'signs')
/** A kiegészítő táblák csak az összerakáshoz kellenek, az appba nem kerülnek */
const PARTS_DIR = join(ROOT, '.cache', 'sign-parts')
const MANIFEST = join(ROOT, 'src', 'data', 'signs.json')
const API = 'https://commons.wikimedia.org/w/api.php'
const USER_AGENT = 'KreszPass/0.3 (personal driving-exam practice app; build-time sign download)'
const FORCE = process.argv.includes('--force')
/** Szabványos Wikimedia bélyegkép-szélesség (lásd mediawiki.org/wiki/Common_thumbnail_sizes) */
const WIDTH = 500

/** @typedef {'utvonal'|'elsobbsegi'|'utasito'|'megallas'|'veszely'|'vasut'|'tajekoztato'|'tilalmi'} Group */
/**
 * code: Commons-kód („A-001”, „KRESZ-8a”), a hivatalos KRESZ ábrája („NJT-…”), vagy összetett tábla.
 * parts: fő tábla és kiegészítő tábla (mindkettő Commons-kép).
 * njt: a Nemzeti Jogszabálytárban közzétett KRESZ-ábra (kép útvonala, a tábla kivágása: [x, y, szélesség, magasság]).
 * @typedef {{ code: string; name: string; group: Group; parts?: string[]; njt?: { src: string; crop: number[] } }} SignDef
 */

/**
 * A Commonson nem szereplő táblák a hivatalos KRESZ-szövegből (1/1975. KPM–BM rendelet 1–2. függelék, Nemzeti
 * Jogszabálytár). A jogszabály és ábrái nem állnak szerzői jogi védelem alatt (Szjt. 1. § (4)). Egy képen több ábra és
 * a feliratuk is szerepelhet, ezért a táblát kivágjuk (az eredeti kép változatlan, csak a látható része szűkül).
 */
const njt = (code, name, group, src, crop) => /** @type {SignDef} */ ({ code, name, group, njt: { src, crop } })
const NJT_BASE = 'https://njt.jog.gov.hu/picture/'
const NJT_SOURCE = 'https://njt.hu/jogszabaly/1975-1-20-24'

/** Összetett tábla: fő tábla + kiegészítő tábla (mindkettő Commons-kód) */
const combo = (main, plate, name, group) => /** @type {SignDef} */ ({ code: `${main}+${plate}`, name, group, parts: [main, plate] })

/** @type {SignDef[]} */
const SIGNS = [
  // Útvonaltípust jelző táblák
  { code: 'E-016', name: 'Autópálya', group: 'utvonal' },
  { code: 'E-017', name: 'Autópálya vége', group: 'utvonal' },
  combo('E-016', 'KRESZ-KSZ-4km', 'Autópálya kezdete … kilométerre', 'utvonal'),
  { code: 'E-018', name: 'Autóút', group: 'utvonal' },
  { code: 'E-019', name: 'Autóút vége', group: 'utvonal' },
  combo('E-018', 'KRESZ-KSZ-4km', 'Autóút kezdete … kilométerre', 'utvonal'),
  { code: 'KRESZ-8a', name: 'Útdíjfizetési kötelezettség', group: 'utvonal' },
  { code: 'KRESZ-8c', name: 'Útdíjfizetési kötelezettség a jelölt járműtípus és súlyhatár esetén', group: 'utvonal' },
  { code: 'KRESZ-8d', name: 'Útdíjfizetési kötelezettség vége a jelölt járműtípus és súlyhatár esetén', group: 'utvonal' },
  { code: 'KRESZ-8b', name: 'Útdíjfizetési kötelezettség vége', group: 'utvonal' },
  { code: 'B-003', name: 'Főútvonal', group: 'utvonal' },
  { code: 'B-004', name: 'Főútvonal vége', group: 'utvonal' },
  combo('B-003', 'H-001', 'Kanyarodó főútvonal', 'utvonal'),
  combo('B-004', 'H-017', 'Főútvonal vége előjelző', 'utvonal'),

  // Elsőbbséget szabályozó táblák
  { code: 'B-001', name: 'Elsőbbségadás kötelező', group: 'elsobbsegi' },
  { code: 'B-002', name: 'Állj! Elsőbbségadás kötelező', group: 'elsobbsegi' },
  combo('B-001', 'H-008', 'Elsőbbségadás kötelező a vastag vonallal jelzett úton érkező jármű részére', 'elsobbsegi'),
  combo('B-001', 'H-111', 'Elsőbbségadás kötelező a keresztező kerékpársávon közlekedők részére is', 'elsobbsegi'),
  combo('B-001', 'H-017', 'Elsőbbségadás kötelező előjelző', 'elsobbsegi'),
  combo('B-001', 'H-011', 'Állj! Elsőbbségadás kötelező előjelző', 'elsobbsegi'),
  combo('B-002', 'H-008', 'Állj! Elsőbbségadás kötelező a vastag vonallal jelzett úton érkező jármű részére', 'elsobbsegi'),
  combo('B-002', 'H-111', 'Állj! Elsőbbségadás kötelező a keresztező kerékpársávon közlekedők részére is', 'elsobbsegi'),
  { code: 'B-005', name: 'A szembejövő forgalom elsőbbsége', group: 'elsobbsegi' },
  { code: 'B-006', name: 'Elsőbbség a szembejövő forgalommal szemben', group: 'elsobbsegi' },

  // Utasítást adó táblák
  { code: 'D-001', name: 'Kötelező haladási irány egyenesen', group: 'utasito' },
  { code: 'D-002', name: 'Kötelező haladási irány balra', group: 'utasito' },
  { code: 'D-003', name: 'Kötelező haladási irány jobbra', group: 'utasito' },
  { code: 'D-004', name: 'Kötelező haladási irány egyenesen vagy balra', group: 'utasito' },
  { code: 'D-005', name: 'Kötelező haladási irány egyenesen vagy jobbra', group: 'utasito' },
  { code: 'D-010', name: 'Kötelező haladási irány jobbra vagy balra', group: 'utasito' },
  { code: 'D-014', name: 'Kerülési irány jobbra', group: 'utasito' },
  { code: 'D-015', name: 'Kerülési irány balra', group: 'utasito' },
  { code: 'D-016', name: 'Kerülési irány jobbra vagy balra', group: 'utasito' },
  { code: 'D-017', name: 'Körforgalom', group: 'utasito' },
  { code: 'D-021', name: 'Kötelező legkisebb sebesség', group: 'utasito' },
  { code: 'D-022', name: 'Kötelező legkisebb sebesség vége', group: 'utasito' },
  { code: 'D-033', name: 'Hólánc használata kötelező', group: 'utasito' },
  { code: 'D-034', name: 'Hólánc használata kötelező vége', group: 'utasito' },
  { code: 'D-023', name: 'Kerékpárút', group: 'utasito' },
  { code: 'D-024', name: 'Kerékpárút vége', group: 'utasito' },
  { code: 'D-025', name: 'Gyalogút', group: 'utasito' },
  { code: 'D-026', name: 'Gyalogút vége', group: 'utasito' },
  { code: 'D-027', name: 'Gyalog- és kerékpárút', group: 'utasito' },
  { code: 'D-028', name: 'Gyalog- és kerékpárút vége', group: 'utasito' },
  { code: 'D-029', name: 'Útburkolati jellel elválasztott gyalog- és kerékpárút', group: 'utasito' },
  { code: 'D-030', name: 'Útburkolati jellel elválasztott gyalog- és kerékpárút vége', group: 'utasito' },
  { code: 'E-032', name: 'Gyalogos övezet', group: 'utasito' },
  { code: 'E-033', name: 'Gyalogos övezet vége', group: 'utasito' },
  { code: 'E-036', name: 'Gyalogos és kerékpáros övezet', group: 'utasito' },
  { code: 'E-037', name: 'Gyalogos és kerékpáros övezet vége', group: 'utasito' },
  { code: 'D-037', name: 'Kötelező haladási irány a kerékpárosok részére', group: 'utasito' },
  { code: 'D-038', name: 'Kötelező haladási irány a menetrend szerint közlekedő autóbusz részére', group: 'utasito' },
  { code: 'D-018', name: 'Kötelező haladási irány veszélyes anyagot szállító jármű részére', group: 'utasito' },

  // Megállási és várakozási tilalmat jelző táblák
  { code: 'C-048', name: 'Megállni tilos', group: 'megallas' },
  { code: 'C-047', name: 'Várakozni tilos', group: 'megallas' },
  { code: 'E-026', name: 'Korlátozott várakozási övezet', group: 'megallas' },
  { code: 'E-027', name: 'Korlátozott várakozási övezet vége', group: 'megallas' },

  // Veszélyt jelző táblák
  { code: 'A-002', name: 'Veszélyes útkanyarulat jobbra', group: 'veszely' },
  { code: 'A-001', name: 'Veszélyes útkanyarulat balra', group: 'veszely' },
  { code: 'A-003', name: 'Egymás utáni veszélyes útkanyarulatok (az első balra)', group: 'veszely' },
  { code: 'A-004', name: 'Egymás utáni veszélyes útkanyarulatok (az első jobbra)', group: 'veszely' },
  { code: 'A-005', name: 'Veszélyes lejtő', group: 'veszely' },
  { code: 'A-006', name: 'Veszélyes emelkedő', group: 'veszely' },
  { code: 'A-007', name: 'Útszűkület', group: 'veszely' },
  { code: 'A-037', name: 'Szembejövő forgalom', group: 'veszely' },
  { code: 'A-020', name: 'Gyalogosátkelés', group: 'veszely' },
  { code: 'A-021', name: 'Gyermekek', group: 'veszely' },
  { code: 'A-025', name: 'Úton folyó munkák', group: 'veszely' },
  { code: 'A-054', name: 'Gyalogosok', group: 'veszely' },
  { code: 'A-057', name: 'Torlódás', group: 'veszely' },
  { code: 'A-056', name: 'Körforgalmú útkereszteződés', group: 'veszely' },
  { code: 'A-015', name: 'Útzár', group: 'veszely' },
  { code: 'A-017', name: 'Kavicsfelverődés', group: 'veszely' },
  { code: 'A-018', name: 'Kőomlás', group: 'veszely' },
  { code: 'A-051', name: 'Mélyrepülés', group: 'veszely' },
  { code: 'A-052', name: 'Oldalszél', group: 'veszely' },
  { code: 'A-014', name: 'Bukkanó', group: 'veszely' },
  { code: 'A-013', name: 'Egyenetlen úttest', group: 'veszely' },
  { code: 'A-016', name: 'Csúszós úttest', group: 'veszely' },
  { code: 'A-023', name: 'Állatok', group: 'veszely' },
  { code: 'A-024', name: 'Vadon élő állatok', group: 'veszely' },
  { code: 'A-026', name: 'Forgalomirányító fényjelző készülék', group: 'veszely' },
  { code: 'A-027', name: 'Egyenrangú utak kereszteződése', group: 'veszely' },
  { code: 'A-040', name: 'Villamos', group: 'veszely' },
  { code: 'A-010', name: 'Kompátkelés vagy nyitható híd', group: 'veszely' },
  { code: 'A-011', name: 'Rakpart vagy meredek part', group: 'veszely' },
  { code: 'A-039', name: 'Sorompó nélküli vasúti átjáró', group: 'veszely' },
  combo('A-039', 'H-022', 'Sorompó nélküli vasúti átjáró, ami fénysorompóval biztosított', 'veszely'),
  { code: 'A-038', name: 'Sorompóval biztosított vasúti átjáró', group: 'veszely' },
  combo('A-038', 'H-022', 'Fény- és félsorompóval biztosított vasúti átjáró', 'veszely'),
  { code: 'A-028', name: 'Útkereszteződés alárendelt úttal', group: 'veszely' },
  { code: 'A-029', name: 'Alárendelt útcsatlakozás balról', group: 'veszely' },
  { code: 'A-030', name: 'Alárendelt útcsatlakozás jobbról', group: 'veszely' },
  { code: 'A-031', name: 'Útkereszteződés alárendelt úttal és az út torkolati irányával', group: 'veszely' },
  { code: 'A-036', name: 'Útkereszteződés alárendelt úttal, az útkereszteződés alaprajzi vázlatával', group: 'veszely' },
  { code: 'A-022', name: 'Kerékpárosok', group: 'veszely' },
  combo('A-022', 'H-029', 'Kerékpárosok keresztirányú közlekedése', 'veszely'),
  { code: 'A-053', name: 'Egyéb veszély', group: 'veszely' },
  combo('A-053', 'H-031', 'Nyomvályús útszakasz', 'veszely'),
  combo('A-053', 'H-021', 'A vasúti jármű áthaladását jelzőőr biztosítja', 'veszely'),
  combo('A-053', 'H-033', 'Forgalmi rend változás', 'veszely'),
  combo('A-053', 'H-023', 'Járdasziget nélküli villamosmegálló', 'veszely'),

  // Vasúti átjárót jelző táblák
  { code: 'A-041', name: 'Vasúti átjáró kezdete (egyvágányú, Andráskereszt)', group: 'vasut' },
  { code: 'A-042', name: 'Vasúti átjáró kezdete (többvágányú, Andráskereszt)', group: 'vasut' },
  { code: 'A-045', name: 'Vasúti átjárót előjelző tábla (3 csík)', group: 'vasut' },
  { code: 'A-047', name: 'Vasúti átjárót előjelző tábla (2 csík)', group: 'vasut' },
  { code: 'A-049', name: 'Vasúti átjárót előjelző tábla (1 csík)', group: 'vasut' },

  // Tájékoztatást adó jelzőtáblák
  { code: 'E-012', name: 'Egyirányú forgalmú út', group: 'tajekoztato' },
  { code: 'E-013', name: 'Egyirányú forgalmú út a jelölt irányban', group: 'tajekoztato' },
  combo('E-012', 'H-116', 'Egyirányú forgalmú út, kivéve autóbuszok', 'tajekoztato'),
  combo('E-012', 'H-115', 'Egyirányú forgalmú út, kivéve kerékpárosok', 'tajekoztato'),
  { code: 'E-038', name: 'Kijelölt gyalogosátkelőhely', group: 'tajekoztato' },
  { code: 'E-046', name: 'Várakozóhely', group: 'tajekoztato' },
  combo('E-046', 'H-066', 'Várakozóhely kerékpároknak', 'tajekoztato'),
  { code: 'E-048', name: 'Várakozóhely a közlekedési korlátozás alá eső nehéz tehergépkocsik részére', group: 'tajekoztato' },
  { code: 'E-054', name: 'Várakozóhely mozgáskorlátozott személyt szállító járműveknek', group: 'tajekoztato' },
  combo('E-046', 'H-041', 'Várakozóhely, ahol a jobb oldali kerékkel a járdán állva kell várakozni', 'tajekoztato'),
  combo('E-046', 'H-016', 'Várakozóhely időtartam-korlátozással', 'tajekoztato'),
  combo('E-046', 'H-050', 'Díjköteles várakozóhely', 'tajekoztato'),
  { code: 'E-034', name: 'Várakozási övezet', group: 'tajekoztato' },
  { code: 'E-035', name: 'Várakozási övezet vége', group: 'tajekoztato' },
  { code: 'E-053', name: 'Parkolj és utazz', group: 'tajekoztato' },
  { code: 'E-014', name: 'Besorolás rendjét jelző tábla', group: 'tajekoztato' },
  { code: 'merge_lanes', name: 'Forgalmi sáv vége', group: 'tajekoztato' },
  { code: 'E-050', name: 'Kerékpáros közvetett kapcsolat', group: 'tajekoztato' },
  { code: 'E-006', name: 'Autóbusz forgalmi sáv', group: 'tajekoztato' },
  { code: 'E-008', name: 'Kerékpársáv', group: 'tajekoztato' },
  { code: 'E-009', name: 'Kerékpársáv vége', group: 'tajekoztato' },
  { code: 'E-005', name: 'Kerékpárosok által is használható autóbusz forgalmi sáv', group: 'tajekoztato' },
  { code: 'E-010', name: 'Út melletti kerékpárút', group: 'tajekoztato' },
  { code: 'E-011', name: 'Út melletti kerékpárút vége', group: 'tajekoztato' },
  njt('NJT-117g', 'Nyitott kerékpársáv', 'tajekoztato', '49/49bc1975_24__20000001A501_016_5.jpg', [4, 2, 78, 99]),
  njt('NJT-117h', 'Nyitott kerékpársáv vége', 'tajekoztato', '0c/0c7f1975_24__20000001A501_016_6.jpg', [4, 2, 78, 99]),
  { code: 'E-001', name: 'Kapaszkodósáv', group: 'tajekoztato' },
  { code: 'E-002', name: 'Kapaszkodósáv vége', group: 'tajekoztato' },
  { code: 'E-043', name: 'Lakó-pihenő övezet', group: 'tajekoztato' },
  { code: 'E-044', name: 'Lakó-pihenő övezet vége', group: 'tajekoztato' },
  { code: 'G-202', name: 'Helynévtábla', group: 'tajekoztato' },
  { code: 'E-020', name: 'Lakott terület kezdete', group: 'tajekoztato' },
  { code: 'E-021', name: 'Lakott terület vége', group: 'tajekoztato' },
  { code: 'G-351', name: 'Útirány előjelző tábla', group: 'tajekoztato' },
  { code: 'G-076', name: 'Útirányjelző tábla', group: 'tajekoztato' },
  { code: 'G-653', name: 'Útvonal megerősítő tábla', group: 'tajekoztato' },
  { code: 'KRESZ-142-KPÚ-1', name: 'Kerékpáros útirányjelző tábla', group: 'tajekoztato' },
  { code: 'KRESZ-146', name: 'Terelőút', group: 'tajekoztato' },
  { code: 'KRESZ-146a', name: 'Kerülő útirányt jelző tábla', group: 'tajekoztato' },
  { code: 'F-004', name: 'Üzemanyagtöltő állomás', group: 'tajekoztato' },
  { code: 'F-016', name: 'Ólommentes benzint árusító üzemanyagtöltő állomás', group: 'tajekoztato' },
  { code: 'F-017', name: 'Ólommentes benzint és autógázt is árusító üzemanyagtöltő állomás', group: 'tajekoztato' },
  { code: 'E-039', name: 'Autóbuszmegállóhely', group: 'tajekoztato' },
  { code: 'E-040', name: 'Trolibuszmegállóhely', group: 'tajekoztato' },
  { code: 'E-041', name: 'Villamosmegállóhely', group: 'tajekoztato' },
  { code: 'tunnel_information', name: 'Alagút', group: 'tajekoztato' },
  njt('NJT-103c', 'Alagút vége', 'tajekoztato', '45/450a1975_24__20000001A0E1_014_7.jpg', [6, 11, 216, 290]),
  { code: 'G-301', name: 'Zsákutca', group: 'tajekoztato' },
  { code: 'G-302', name: 'Zsákutca kerékpáros továbbhaladási lehetőséggel', group: 'tajekoztato' },
  { code: 'F-001', name: 'Elsősegélyhely', group: 'tajekoztato' },
  { code: 'E-045', name: 'Kórház', group: 'tajekoztato' },
  { code: 'F-002', name: 'Műszaki segélyhely', group: 'tajekoztato' },
  { code: 'F-003', name: 'Távbeszélő állomás', group: 'tajekoztato' },
  { code: 'F-014', name: 'Nyilvános illemhely', group: 'tajekoztato' },
  { code: 'F-030', name: 'Rendőrség', group: 'tajekoztato' },
  { code: 'F-006', name: 'Étterem', group: 'tajekoztato' },
  { code: 'F-007', name: 'Büfé', group: 'tajekoztato' },
  { code: 'I-045', name: 'Iható víz', group: 'tajekoztato' },
  { code: 'F-021', name: 'Idegenforgalmi tájékoztatás', group: 'tajekoztato' },
  { code: 'F-005', name: 'Szálloda, motel', group: 'tajekoztato' },
  { code: 'F-012', name: 'Bérelhető faház', group: 'tajekoztato' },
  { code: 'F-011', name: 'Táborozásra, illetőleg lakókocsik részére kijelölt hely', group: 'tajekoztato' },
  { code: 'I-026', name: 'Múzeum', group: 'tajekoztato' },
  njt('NJT-2F-19', 'Műemlék épület', 'tajekoztato', '4e/4eab1975_24__20000001A374_015_105.jpg', [7, 6, 149, 149]),
  { code: 'I-034', name: 'Műemlék vár; várrom', group: 'tajekoztato' },
  { code: 'I-032', name: 'Műemlék templom', group: 'tajekoztato' },
  { code: 'F-019', name: 'Vasútállomás', group: 'tajekoztato' },
  { code: 'F-008', name: 'Jelzett turistaút; erdei tornapálya', group: 'tajekoztato' },
  { code: 'F-029', name: 'Komp vagy nyitható híd', group: 'tajekoztato' },
  njt('NJT-2F-27', 'Arborétum, nemzeti park', 'tajekoztato', '35/357c1975_24__20000001A374_015_113.jpg', [6, 7, 148, 142]),
  { code: 'F-020', name: 'Repülőtér', group: 'tajekoztato' },
  njt('NJT-2F-29', 'Sípálya', 'tajekoztato', '79/79c01975_24__20000001A374_015_115.jpg', [7, 7, 149, 148]),
  { code: 'F-015', name: 'Fürdőhely', group: 'tajekoztato' },
  njt('NJT-2F-31', 'Lovaglás', 'tajekoztato', 'de/de361975_24__20000001A374_015_117.jpg', [5, 5, 153, 150]),
  { code: 'E-042', name: 'Taxiállomás', group: 'tajekoztato' },
  njt('NJT-109b', 'Magánút', 'tajekoztato', '6d/6dc31975_24__20000001A501_016_3.jpg', [6, 6, 112, 111]),
  { code: 'F-018', name: 'Hajóállomás', group: 'tajekoztato' },
  { code: 'G-305', name: 'Gyalogos alul- vagy felüljáró', group: 'tajekoztato' },
  { code: 'F-031', name: 'Az úton erre illetékes hatóság ellenőrzést végez', group: 'tajekoztato' },
  { code: 'F-037', name: 'Közösségi internet-hozzáférési (eMagyarország) pont', group: 'tajekoztato' },
  njt('NJT-2F-36', 'Közúti forgalom ellenőrzése', 'tajekoztato', '52/52621975_24__20000001A501_016_10.jpg', [5, 4, 105, 140]),
  njt('NJT-2F-37', 'Közúti forgalom ellenőrzésének vége', 'tajekoztato', '52/52621975_24__20000001A501_016_10.jpg', [126, 4, 105, 140]),

  // Járművek forgalmára vonatkozó tilalmi táblák
  { code: 'C-029', name: 'Jobbra bekanyarodni tilos', group: 'tilalmi' },
  { code: 'C-028', name: 'Balra bekanyarodni tilos', group: 'tilalmi' },
  { code: 'C-030', name: 'Megfordulni tilos', group: 'tilalmi' },
  ...[5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130].map((v) => ({
    code: `C-033-${v}`,
    name: `Sebességkorlátozás: ${v} km/h`,
    group: /** @type {Group} */ ('tilalmi'),
  })),
  { code: 'C-044', name: 'Sebességkorlátozás vége', group: 'tilalmi' },
  { code: 'C-031', name: 'Előzni tilos', group: 'tilalmi' },
  { code: 'C-045', name: 'Előzési tilalom vége', group: 'tilalmi' },
  { code: 'C-032', name: 'Tehergépkocsival előzni tilos', group: 'tilalmi' },
  { code: 'C-046', name: 'Tehergépkocsira vonatkozó előzési tilalom vége', group: 'tilalmi' },
  { code: 'C-026', name: 'Legkisebb követési távolság', group: 'tilalmi' },
  { code: 'C-027', name: 'Legkisebb követési távolság tehergépkocsival', group: 'tilalmi' },
  { code: 'C-043', name: 'Mozgó járművekre vonatkozó tilalmak vége', group: 'tilalmi' },
  { code: 'C-035', name: 'Kötelező megállás', group: 'tilalmi' },
  { code: 'C-021', name: 'Szélességkorlátozás', group: 'tilalmi' },
  { code: 'C-022', name: 'Magasságkorlátozás', group: 'tilalmi' },
  { code: 'C-025', name: 'Hosszúságkorlátozás', group: 'tilalmi' },
  { code: 'C-023', name: 'Súlykorlátozás', group: 'tilalmi' },
  { code: 'C-024', name: 'Tengelyterhelés-korlátozás', group: 'tilalmi' },
  { code: 'C-002', name: 'Mindkét irányból behajtani tilos', group: 'tilalmi' },
  { code: 'C-001', name: 'Behajtani tilos', group: 'tilalmi' },
  { code: 'C-003', name: 'Gépjárművel, mezőgazdasági vontatóval és lassú járművel behajtani tilos', group: 'tilalmi' },
  { code: 'C-005', name: 'Kerékpárral behajtani tilos', group: 'tilalmi' },
  { code: 'C-006', name: 'Segédmotoros kerékpárral behajtani tilos', group: 'tilalmi' },
  { code: 'C-004', name: 'Motorkerékpárral behajtani tilos', group: 'tilalmi' },
  { code: 'C-042', name: 'Autóbusszal behajtani tilos', group: 'tilalmi' },
  { code: 'C-007', name: 'Tehergépkocsival behajtani tilos', group: 'tilalmi' },
  { code: 'C-008', name: 'A megjelölt súlyhatárt meghaladó tehergépkocsival behajtani tilos', group: 'tilalmi' },
  { code: 'C-016', name: 'Mezőgazdasági vontatóval behajtani tilos', group: 'tilalmi' },
  { code: 'C-009', name: 'Járműszerelvénnyel behajtani tilos', group: 'tilalmi' },
  { code: 'C-010', name: 'A megjelölt súlyhatárt meghaladó járműszerelvénnyel behajtani tilos', group: 'tilalmi' },
  { code: 'C-015', name: 'Kézikocsival bemenni tilos', group: 'tilalmi' },
  { code: 'C-014', name: 'Állati erővel vont járművel behajtani tilos', group: 'tilalmi' },
  { code: 'C-019', name: 'Behajtani tilos gépjárművel és motorkerékpárral', group: 'tilalmi' },
  { code: 'C-020', name: 'Behajtani tilos kerékpárral, kézikocsival és állati erővel vont járművel', group: 'tilalmi' },
  { code: 'C-012', name: 'Veszélyes anyagot szállító járművel behajtani tilos', group: 'tilalmi' },
  njt('NJT-53e', 'Környezetvédelmi övezet', 'tilalmi', '85/85591975_24__20000001A501_016_1.jpg', [3, 2, 111, 111]),
  njt('NJT-53f', 'Környezetvédelmi övezet vége', 'tilalmi', '85/85591975_24__20000001A501_016_1.jpg', [3, 147, 111, 112]),
  { code: 'E-028', name: 'Korlátozott sebességű övezet', group: 'tilalmi' },
  { code: 'E-029', name: 'Korlátozott sebességű övezet vége', group: 'tilalmi' },
  { code: 'E-030', name: 'Korlátozott forgalmú övezet', group: 'tilalmi' },
  { code: 'E-031', name: 'Korlátozott forgalmú övezet vége', group: 'tilalmi' },
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function request(url, attempt = 1) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if ((res.status === 429 || res.status >= 500) && attempt <= 6) {
    const retryAfter = Number(res.headers.get('retry-after'))
    const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 5000 * attempt
    console.warn(`  ${res.status}, újrapróbálás ${wait} ms múlva…`)
    await sleep(wait)
    return request(url, attempt + 1)
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`)
  return res
}

const stripHtml = (s = '') => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/** A Commons két elnevezést használ: „Hungary road sign X.svg” és a KRESZ-ábraszám szerinti „KRESZ-….svg” */
const titleOf = (code) => (code.startsWith('KRESZ-') ? `File:${code}.svg` : `File:Hungary road sign ${code}.svg`)

/** Fájlnévbe ékezet és „+” nélkül */
const safe = (code) =>
  code
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_-]/g, '_')

/** Fájlnév a public/signs mappában */
const fileNameOf = (sign) => `${safe(sign.code)}.${sign.parts || sign.njt ? 'svg' : 'png'}`

/** PNG méretei a fejlécből */
function pngSize(buf) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
}

/**
 * Összetett tábla: a fő tábla alatt a kiegészítő tábla, kisebb szélességben, középre igazítva.
 * A képek data URI-ként kerülnek az SVG-be, így <img>-ben, a 3D textúrában és a térképen is önállóan működik.
 */
function comboSvg(main, plate) {
  const W = 500
  const mainH = Math.round((main.h / main.w) * W)
  const plateW = Math.round(W * 0.62)
  const plateH = Math.round((plate.h / plate.w) * plateW)
  const gap = 14
  const H = mainH + gap + plateH
  const img = (p, x, y, w, h) => `<image x="${x}" y="${y}" width="${w}" height="${h}" href="${p.href}"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${img(main, 0, 0, W, mainH)}${img(plate, Math.round((W - plateW) / 2), mainH + gap, plateW, plateH)}</svg>\n`
}

/** A hivatalos KRESZ-ábra kivágása: az eredeti JPEG változatlanul az SVG-ben, a viewBox csak a táblát mutatja */
function cropSvg(jpeg, [x, y, w, h]) {
  const W = 500
  const H = Math.round((h / w) * W)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${x} ${y} ${w} ${h}"><image x="0" y="0" href="data:image/jpeg;base64,${jpeg.toString('base64')}"/></svg>\n`
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  await mkdir(PARTS_DIR, { recursive: true })
  const codes = [...new Set(SIGNS.filter((s) => !s.njt).flatMap((s) => s.parts ?? [s.code]))]
  const info = new Map()

  for (let i = 0; i < codes.length; i += 50) {
    const batch = codes.slice(i, i + 50)
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      prop: 'imageinfo',
      iiprop: 'url|extmetadata',
      iiurlwidth: String(WIDTH),
      iiextmetadatafilter: 'LicenseShortName|Artist',
      titles: batch.map(titleOf).join('|'),
    })
    const json = await (await request(`${API}?${params}`)).json()
    // A Commons a címet normalizálja (aláhúzás → szóköz): a visszafordításhoz a normalized listát használjuk
    const back = new Map((json.query.normalized ?? []).map((n) => [n.to, n.from]))
    for (const page of json.query.pages) {
      const ii = page.imageinfo?.[0]
      if (!ii) throw new Error(`Nincs ilyen fájl a Commonson: ${page.title}`)
      info.set(back.get(page.title) ?? page.title, ii)
    }
    await sleep(1000)
  }

  /** Egy Commons-tábla PNG-je: a fő táblák a public/signs mappába, a kiegészítők a gyorsítótárba */
  async function png(code, dir) {
    const target = join(dir, `${safe(code)}.png`)
    if (!FORCE && (await exists(target))) return { buf: await readFile(target), fresh: false }
    const ii = info.get(titleOf(code))
    const buf = Buffer.from(await (await request(ii.thumburl)).arrayBuffer())
    if (buf.subarray(1, 4).toString() !== 'PNG') throw new Error(`Nem PNG: ${ii.thumburl}`)
    await writeFile(target, buf)
    await sleep(1500)
    return { buf, fresh: true }
  }

  /** Az összerakáshoz: kép data URI-ként, méretekkel */
  async function partImage(code) {
    const { buf } = await png(code, (await exists(join(OUT_DIR, `${safe(code)}.png`))) ? OUT_DIR : PARTS_DIR)
    return { href: `data:image/png;base64,${buf.toString('base64')}`, ...pngSize(buf) }
  }

  const manifest = []
  for (const sign of SIGNS) {
    const file = fileNameOf(sign)
    const target = join(OUT_DIR, file)
    if (sign.parts) {
      if (FORCE || !(await exists(target))) {
        const [mainCode, plateCode] = sign.parts
        await writeFile(target, comboSvg(await partImage(mainCode), await partImage(plateCode)))
        console.log(`összerakva ${file}`)
      } else console.log(`megvan    ${file}`)
    } else if (sign.njt) {
      if (FORCE || !(await exists(target))) {
        const jpeg = Buffer.from(await (await request(NJT_BASE + sign.njt.src)).arrayBuffer())
        if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error(`Nem JPEG: ${sign.njt.src}`)
        await writeFile(target, cropSvg(jpeg, sign.njt.crop))
        console.log(`KRESZ-ábra ${file}`)
        await sleep(800)
      } else console.log(`megvan    ${file}`)
      manifest.push({
        code: sign.code,
        name: sign.name,
        group: sign.group,
        file,
        source: NJT_SOURCE,
        license: 'Public domain (jogszabály ábrája, Szjt. 1. § (4))',
        author: 'Nemzeti Jogszabálytár, KRESZ 1–2. függelék',
      })
      continue
    } else {
      const { buf, fresh } = await png(sign.code, OUT_DIR)
      console.log(`${fresh ? 'letöltve ' : 'megvan   '} ${file}${fresh ? `  (${Math.round(buf.length / 1024)} kB)` : ''}`)
    }
    const infos = (sign.parts ?? [sign.code]).map((c) => info.get(titleOf(c)))
    manifest.push({
      code: sign.code,
      name: sign.name,
      group: sign.group,
      file,
      source: infos.map((ii) => ii.descriptionurl).join(' '),
      license: infos[0].extmetadata?.LicenseShortName?.value ?? 'Public domain',
      author: [...new Set(infos.map((ii) => stripHtml(ii.extmetadata?.Artist?.value)))].join(', '),
    })
  }

  const previous = (await exists(MANIFEST)) ? await readFile(MANIFEST, 'utf8') : ''
  const next = JSON.stringify(manifest, null, 2) + '\n'
  if (previous !== next) await writeFile(MANIFEST, next)
  const byGroup = manifest.reduce((m, s) => ({ ...m, [s.group]: (m[s.group] ?? 0) + 1 }), {})
  console.log(`\n${manifest.length} tábla (${Object.entries(byGroup).map(([g, n]) => `${g}: ${n}`).join(', ')}), jegyzék: src/data/signs.json`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
