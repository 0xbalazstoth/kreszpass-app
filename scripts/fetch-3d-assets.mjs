#!/usr/bin/env node
/**
 * A 3D jelenetek valósághű anyagai a Poly Haven-ről (polyhaven.com, minden eszköz CC0, közkincs):
 * fényképből készült PBR textúrák (aszfalt, járdalap, szegély, homlokzatok, fű), HDR égbolt a fényekhez és a
 * tükröződésekhez, valamint néhány utcabútor-modell (közvilágítási lámpa, beton útelzáró elem). A gyalogosok, a munkás és a
 * személyautó Quaternius CC0 modelljei a Poly Pizzáról (poly.pizza), csak a járás és az állás animációval.
 *
 * A textúrákat letöltés után kicsinyítjük (sharp), hogy az app ne legyen nehéz: a színtérkép legfeljebb 1024 px,
 * a normál- és az ARM-térkép (ambient occlusion, érdesség, fémesség) 512 px. A fájlok a public/3d mappába kerülnek,
 * a forrásuk és a licencük a public/3d/manifest.json-ba.
 *
 * Használat:  npm run assets3d            (csak a hiányzókat tölti le)
 *             npm run assets3d -- --force (mindent újratölt)
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { dedup, prune, quantize } from '@gltf-transform/functions'
import sharp from 'sharp'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public', '3d')
const API = 'https://api.polyhaven.com'
const FORCE = process.argv.includes('--force')

/** Felületek: azonosító az appban → Poly Haven azonosító */
const TEXTURES = {
  asphalt: 'asphalt_04',
  pavement: 'concrete_pavement',
  kerb: 'concrete_wall_001',
  plaster: 'beige_wall_001',
  plaster_rough: 'beige_wall_002',
  plaster_grey: 'grey_plaster_02',
  brick: 'brick_wall_02',
  grass: 'grass_ground',
}
const HDRI = { sky: 'kloofendal_48d_partly_cloudy_puresky' }
const MODELS = { street_lamp: 'street_lamp_01', road_barrier: 'concrete_road_barrier' }

/** Poly Pizza modellek: azonosító az appban → [Poly Pizza oldal, a GLB fájl, név, szerző] (mind CC0) */
const POLY_PIZZA = {
  woman: ['AQsd9ngvKU', '906a0cbe-b0a4-4312-b898-0f974b6f6771', 'Woman', 'Quaternius'],
  woman_casual: ['jpKRgGDxhk', '51d5abdd-bb87-4b8d-9967-21738ffb8437', 'Woman Casual', 'Quaternius'],
  man: ['HMnuH5geEG', '3746be88-6799-4817-929b-6bc067c47caa', 'Man', 'Quaternius'],
  man_suit: ['mQnGoME1ez', '66b57880-bcb0-479a-8d72-5c3e88afaa39', 'Man in Suit', 'Quaternius'],
  man_casual: ['kZ3DmIoGip', '90a9e2d4-053f-42f1-99a2-8f5e1180ea7f', 'Casual Character', 'Quaternius'],
  worker: ['Yg2bQZO6Hj', '3a5f3056-ffe6-42eb-bd52-122afcbd22b2', 'Worker', 'Quaternius'],
  car_sedan: ['Cz6yDaUcM9', '59a67a6c-490e-472e-bae6-5a4d2541f1c7', 'Car', 'Quaternius'],
}

/** Az animációk közül csak a járás és az állás marad, egységes névvel („Walk”, „Idle”) */
const KEEP_ANIMATIONS = [
  [/(^|\|)(Female_|Man_)?Walk$/, 'Walk'],
  [/(^|\|)(Female_|Man_)?Idle$/, 'Idle'],
]

const exists = async (p) => {
  try {
    return (await stat(p)).size > 0
  } catch {
    return false
  }
}

async function get(url, as = 'json') {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'KreszPass/0.4 (driving-exam practice app; build-time asset download)' } })
      if (!res.ok) throw new Error(`${res.status} ${url}`)
      return as === 'json' ? res.json() : Buffer.from(await res.arrayBuffer())
    } catch (e) {
      if (attempt >= 4) throw e
      await new Promise((r) => setTimeout(r, 1500 * attempt))
    }
  }
}

/** Kép kicsinyítése JPEG-be (a normáltérkép minőségét kicsit magasabbra hagyjuk) */
async function shrink(buf, max, quality = 82) {
  return sharp(buf).resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true }).jpeg({ quality, mozjpeg: true }).toBuffer()
}

async function info(id) {
  const a = await get(`${API}/info/${id}`)
  return { name: a.name, authors: Object.keys(a.authors ?? {}) }
}

const manifest = []
let total = 0
const count = async (p) => (total += (await stat(p)).size)

async function texture(key, id) {
  const dir = join(OUT, 'textures', key)
  await mkdir(dir, { recursive: true })
  const files = await get(`${API}/files/${id}`)
  const maps = [
    ['diff', files.Diffuse?.['1k']?.jpg?.url, 1024, 82],
    ['nor', files.nor_gl?.['1k']?.jpg?.url, 512, 88],
    ['arm', files.arm?.['1k']?.jpg?.url, 512, 85],
  ]
  for (const [name, url, max, q] of maps) {
    if (!url) throw new Error(`${id}: nincs ${name} térkép`)
    const out = join(dir, `${name}.jpg`)
    if (FORCE || !(await exists(out))) await writeFile(out, await shrink(await get(url, 'buffer'), max, q))
    await count(out)
  }
  manifest.push({ id: key, kind: 'texture', source: `https://polyhaven.com/a/${id}`, ...(await info(id)), license: 'CC0' })
}

async function hdri(key, id) {
  const dir = join(OUT, 'hdri')
  await mkdir(dir, { recursive: true })
  const out = join(dir, `${key}.hdr`)
  if (FORCE || !(await exists(out))) {
    const files = await get(`${API}/files/${id}`)
    await writeFile(out, await get(files.hdri['1k'].hdr.url, 'buffer'))
  }
  await count(out)
  manifest.push({ id: key, kind: 'hdri', source: `https://polyhaven.com/a/${id}`, ...(await info(id)), license: 'CC0' })
}

async function model(key, id) {
  const dir = join(OUT, 'models', key)
  await mkdir(dir, { recursive: true })
  const files = await get(`${API}/files/${id}`)
  const g = files.gltf['1k'].gltf
  const main = join(dir, `${key}.gltf`)
  if (FORCE || !(await exists(main))) {
    // A glTF a saját fájlnevére hivatkozik a .bin-re és a textúrákra: ezeket ugyanazon a relatív úton mentjük
    await writeFile(main, await get(g.url, 'buffer'))
    for (const [rel, f] of Object.entries(g.include ?? {})) {
      const out = join(dir, rel)
      await mkdir(dirname(out), { recursive: true })
      const buf = await get(f.url, 'buffer')
      if (/\.(jpe?g|png)$/i.test(rel)) {
        // A modell textúrái 512 px-re; a fájlnév marad (a glTF erre hivatkozik), JPEG-nél újratömörítve
        const resized = sharp(buf).resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
        await writeFile(out, /\.png$/i.test(rel) ? await resized.png({ compressionLevel: 9 }).toBuffer() : await resized.jpeg({ quality: 82, mozjpeg: true }).toBuffer())
      } else await writeFile(out, buf)
    }
  }
  await count(main)
  for (const rel of Object.keys(g.include ?? {})) await count(join(dir, rel))
  manifest.push({ id: key, kind: 'model', file: `models/${key}/${key}.gltf`, source: `https://polyhaven.com/a/${id}`, ...(await info(id)), license: 'CC0' })
}

async function polyPizza(key, [page, file, name, author]) {
  const dir = join(OUT, 'models', key)
  await mkdir(dir, { recursive: true })
  const out = join(dir, `${key}.glb`)
  if (FORCE || !(await exists(out))) {
    const io = new NodeIO()
    const doc = await io.readBinary(new Uint8Array(await get(`https://static.poly.pizza/${file}.glb`, 'buffer')))
    for (const anim of doc.getRoot().listAnimations()) {
      const keep = KEEP_ANIMATIONS.find(([re]) => re.test(anim.getName()))
      if (keep) anim.setName(keep[1])
      else anim.dispose()
    }
    // Kvantált csúcsadatok (KHR_mesh_quantization): kb. fele akkora fájl, a three.js közvetlenül betölti
    await doc.transform(prune(), dedup(), quantize())
    await writeFile(out, await io.writeBinary(doc))
  }
  await count(out)
  manifest.push({ id: key, kind: 'model', file: `models/${key}/${key}.glb`, source: `https://poly.pizza/m/${page}`, name, authors: [author], license: 'CC0' })
}

for (const [k, id] of Object.entries(TEXTURES)) {
  process.stdout.write(`textúra ${k} (${id})… `)
  await texture(k, id)
  console.log('kész')
}
for (const [k, id] of Object.entries(HDRI)) {
  process.stdout.write(`égbolt ${k} (${id})… `)
  await hdri(k, id)
  console.log('kész')
}
for (const [k, id] of Object.entries(MODELS)) {
  process.stdout.write(`modell ${k} (${id})… `)
  await model(k, id)
  console.log('kész')
}

for (const [k, def] of Object.entries(POLY_PIZZA)) {
  process.stdout.write(`modell ${k} (${def[2]}, ${def[3]})… `)
  await polyPizza(k, def)
  console.log('kész')
}

const old = (await exists(join(OUT, 'manifest.json'))) ? await readFile(join(OUT, 'manifest.json'), 'utf8') : ''
const json = JSON.stringify(manifest, null, 2) + '\n'
if (json !== old) await writeFile(join(OUT, 'manifest.json'), json)
console.log(`Összesen ${(total / 1e6).toFixed(1)} MB, ${manifest.length} eszköz (mind CC0: Poly Haven, Poly Pizza).`)
