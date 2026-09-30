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
 * Használat:  npm run signs            (csak a hiányzókat tölti le)
 *             npm run signs -- --force (mindent újratölt)
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'public', 'signs')
const MANIFEST = join(ROOT, 'src', 'data', 'signs.json')
const API = 'https://commons.wikimedia.org/w/api.php'
const USER_AGENT = 'KreszPass/0.2 (personal driving-exam practice app; build-time sign download)'
const FORCE = process.argv.includes('--force')
/** Szabványos Wikimedia bélyegkép-szélesség (lásd mediawiki.org/wiki/Common_thumbnail_sizes) */
const WIDTH = 500

/** @typedef {'elsobbsegi'|'tilalmi'|'utasito'|'veszely'|'tajekoztato'} Group */

/** @type {Array<{ code: string; name: string; group: Group }>} */
const SIGNS = [
  // Elsőbbséget szabályozó táblák
  { code: 'B-001', name: 'Elsőbbségadás kötelező', group: 'elsobbsegi' },
  { code: 'B-002', name: 'Állj! Elsőbbségadás kötelező', group: 'elsobbsegi' },
  { code: 'B-003', name: 'Főútvonal', group: 'elsobbsegi' },
  { code: 'B-004', name: 'Főútvonal vége', group: 'elsobbsegi' },
  { code: 'B-005', name: 'Elsőbbségadás a szembejövő forgalomnak', group: 'elsobbsegi' },
  { code: 'B-006', name: 'Elsőbbség a szembejövő forgalommal szemben', group: 'elsobbsegi' },

  // Veszélyt jelző táblák
  { code: 'A-007', name: 'Útszűkület', group: 'veszely' },
  { code: 'A-014', name: 'Bukkanó', group: 'veszely' },
  { code: 'A-016', name: 'Csúszós úttest', group: 'veszely' },
  { code: 'A-020', name: 'Gyalogos-átkelőhely', group: 'veszely' },
  { code: 'A-021', name: 'Gyermekek', group: 'veszely' },
  { code: 'A-022', name: 'Kerékpárosok', group: 'veszely' },
  { code: 'A-025', name: 'Útépítés', group: 'veszely' },
  { code: 'A-026', name: 'Jelzőlámpa', group: 'veszely' },
  { code: 'A-027', name: 'Útkereszteződés egyenrangú utak között', group: 'veszely' },
  { code: 'A-028', name: 'Útkereszteződés alárendelt úttal', group: 'veszely' },
  { code: 'A-029', name: 'Alárendelt útcsatlakozás balról', group: 'veszely' },
  { code: 'A-030', name: 'Alárendelt útcsatlakozás jobbról', group: 'veszely' },
  { code: 'A-037', name: 'Kétirányú forgalom', group: 'veszely' },
  { code: 'A-040', name: 'Villamos', group: 'veszely' },
  { code: 'A-053', name: 'Egyéb veszély', group: 'veszely' },
  { code: 'A-054', name: 'Gyalogosok', group: 'veszely' },
  { code: 'A-056', name: 'Körforgalmú útkereszteződés', group: 'veszely' },

  // Tilalmi táblák
  { code: 'C-001', name: 'Behajtani tilos', group: 'tilalmi' },
  { code: 'C-002', name: 'Mindkét irányból behajtani tilos', group: 'tilalmi' },
  { code: 'C-003', name: 'Gépkocsival behajtani tilos', group: 'tilalmi' },
  { code: 'C-028', name: 'Balra bekanyarodni tilos', group: 'tilalmi' },
  { code: 'C-029', name: 'Jobbra bekanyarodni tilos', group: 'tilalmi' },
  { code: 'C-030', name: 'Megfordulni tilos', group: 'tilalmi' },
  { code: 'C-031', name: 'Előzni tilos', group: 'tilalmi' },
  { code: 'C-043', name: 'Minden korlátozás vége', group: 'tilalmi' },
  { code: 'C-045', name: 'Előzési tilalom vége', group: 'tilalmi' },
  { code: 'C-047', name: 'Várakozni tilos', group: 'tilalmi' },
  { code: 'C-048', name: 'Megállni tilos', group: 'tilalmi' },
  ...[5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130].map((v) => ({
    code: `C-033-${v}`,
    name: `Sebességkorlátozás: ${v} km/h`,
    group: /** @type {Group} */ ('tilalmi'),
  })),

  // Utasítást adó táblák
  { code: 'D-001', name: 'Kötelező haladási irány: egyenesen', group: 'utasito' },
  { code: 'D-002', name: 'Kötelező haladási irány: balra', group: 'utasito' },
  { code: 'D-003', name: 'Kötelező haladási irány: jobbra', group: 'utasito' },
  { code: 'D-004', name: 'Kötelező haladási irány: egyenesen vagy balra', group: 'utasito' },
  { code: 'D-005', name: 'Kötelező haladási irány: egyenesen vagy jobbra', group: 'utasito' },
  { code: 'D-010', name: 'Kötelező haladási irány: jobbra vagy balra', group: 'utasito' },
  { code: 'D-014', name: 'Kötelező elhaladási irány: jobbra', group: 'utasito' },
  { code: 'D-015', name: 'Kötelező elhaladási irány: balra', group: 'utasito' },
  { code: 'D-023', name: 'Kerékpárút', group: 'utasito' },
  { code: 'D-025', name: 'Gyalogút', group: 'utasito' },

  // Tájékoztató táblák
  { code: 'E-012', name: 'Egyirányú forgalmú út', group: 'tajekoztato' },
  { code: 'E-020', name: 'Lakott terület kezdete', group: 'tajekoztato' },
  { code: 'E-021', name: 'Lakott terület vége', group: 'tajekoztato' },
  { code: 'E-028', name: 'Övezeti sebességkorlátozás (30 km/h)', group: 'tajekoztato' },
  { code: 'E-029', name: 'Övezeti sebességkorlátozás vége', group: 'tajekoztato' },
  { code: 'E-032', name: 'Gyalogos övezet', group: 'tajekoztato' },
  { code: 'E-033', name: 'Gyalogos övezet vége', group: 'tajekoztato' },
  { code: 'E-038', name: 'Kijelölt gyalogos-átkelőhely', group: 'tajekoztato' },
  { code: 'E-043', name: 'Lakó-pihenő övezet', group: 'tajekoztato' },
  { code: 'E-044', name: 'Lakó-pihenő övezet vége', group: 'tajekoztato' },
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

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const titleOf = (code) => `File:Hungary road sign ${code}.svg`
  const info = new Map()

  for (let i = 0; i < SIGNS.length; i += 50) {
    const batch = SIGNS.slice(i, i + 50)
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      prop: 'imageinfo',
      iiprop: 'url|extmetadata',
      iiurlwidth: String(WIDTH),
      iiextmetadatafilter: 'LicenseShortName|Artist',
      titles: batch.map((s) => titleOf(s.code)).join('|'),
    })
    const json = await (await request(`${API}?${params}`)).json()
    for (const page of json.query.pages) {
      const ii = page.imageinfo?.[0]
      if (!ii) throw new Error(`Nincs ilyen fájl a Commonson: ${page.title}`)
      info.set(page.title, ii)
    }
    await sleep(1000)
  }

  const manifest = []
  for (const sign of SIGNS) {
    const ii = info.get(titleOf(sign.code))
    const file = `${sign.code}.png`
    const target = join(OUT_DIR, file)
    if (FORCE || !(await exists(target))) {
      const buf = Buffer.from(await (await request(ii.thumburl)).arrayBuffer())
      if (buf.subarray(1, 4).toString() !== 'PNG') throw new Error(`Nem PNG: ${ii.thumburl}`)
      await writeFile(target, buf)
      console.log(`letöltve  ${file}  (${Math.round(buf.length / 1024)} kB)`)
      await sleep(1500)
    } else console.log(`megvan    ${file}`)
    manifest.push({
      ...sign,
      file,
      source: ii.descriptionurl,
      license: ii.extmetadata?.LicenseShortName?.value ?? 'Public domain',
      author: stripHtml(ii.extmetadata?.Artist?.value),
    })
  }

  const previous = (await exists(MANIFEST)) ? await readFile(MANIFEST, 'utf8') : ''
  const next = JSON.stringify(manifest, null, 2) + '\n'
  if (previous !== next) await writeFile(MANIFEST, next)
  console.log(`\n${manifest.length} tábla, jegyzék: src/data/signs.json`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
