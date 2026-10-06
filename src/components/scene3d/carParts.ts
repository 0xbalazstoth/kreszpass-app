import { BufferAttribute, BufferGeometry, Matrix4, MeshStandardMaterial, type Material, type Mesh } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { carPaint, windowGlass } from './materials'
import { loadGltf } from './models'

/** A személyautók közös anyagai (a valósághű szedán és a saját modell is ezeket használja) */
export const tyre = new MeshStandardMaterial({ color: '#16171a', roughness: 0.92 })
export const rim = new MeshStandardMaterial({ color: '#c3c7cc', roughness: 0.3, metalness: 0.9 })
export const head = new MeshStandardMaterial({ color: '#fffaf0', emissive: '#fff4d6', emissiveIntensity: 0.6, roughness: 0.1, metalness: 0.3 })
export const tail = new MeshStandardMaterial({ color: '#8b0d0d', emissive: '#b91c1c', emissiveIntensity: 0.5, roughness: 0.2 })
/** Világító irányjelző */
export const amberOn = new MeshStandardMaterial({ color: '#f59e0b', emissive: '#f59e0b', emissiveIntensity: 2.5, toneMapped: false })

/** A Quaternius szedán (CC0) mérete és a mi kocsink hossza (4,4 m): a modell erre van méretezve */
const SEDAN_LENGTH = 4.22
export const SEDAN_SCALE = 4.4 / SEDAN_LENGTH

/** A szedán egy anyaga (a fényezés színe példányonként változik) és az összes ilyen anyagú része egy geometriában */
export interface SedanPart {
  geometry: BufferGeometry
  material: Material
  /** A karosszéria: ennek a színét adjuk meg autónként */
  paint: boolean
}

/**
 * A geometria lebegőpontos másolata (hely, normál, UV). A modell kvantált (16 bites, −1…1 közé normált) csúcsadatokkal
 * van tárolva: azon közvetlenül nem lehet méretezni-forgatni (az 1-nél nagyobb értékek levágódnának, szétesne a kocsi).
 */
function floatCopy(src: BufferGeometry): BufferGeometry {
  const g = new BufferGeometry()
  for (const k of ['position', 'normal', 'uv']) {
    const a = src.getAttribute(k)
    if (!a) continue
    const out = new Float32Array(a.count * a.itemSize)
    for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) out[i * a.itemSize + c] = a.getComponent(i, c)
    g.setAttribute(k, new BufferAttribute(out, a.itemSize))
  }
  if (src.index) g.setIndex(Array.from(src.index.array))
  return g
}

/**
 * Sok egyforma autóhoz (élő forgalom): a szedán részei anyagonként egy-egy geometriába vonva, a jelenet irányába
 * fordítva és méretezve. Ebből példányosított hálók készülnek: az összes autó néhány rajzolási hívás.
 */
export async function sedanParts(): Promise<SedanPart[] | null> {
  const m = await loadGltf('car_sedan')
  if (!m) return null
  const root = m.scene
  root.updateMatrixWorld(true)
  const inv = new Matrix4().copy(root.matrixWorld).invert()
  // A modell a +Z felé néz: megfordítjuk (−Z), és a mi hosszunkra méretezzük
  const fit = new Matrix4().makeRotationY(Math.PI).multiply(new Matrix4().makeScale(SEDAN_SCALE, SEDAN_SCALE, SEDAN_SCALE))
  const byName = new Map<string, BufferGeometry[]>()
  root.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh) return
    const name = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material).name
    const g = floatCopy(mesh.geometry)
    g.applyMatrix4(new Matrix4().multiplyMatrices(fit, new Matrix4().multiplyMatrices(inv, mesh.matrixWorld)))
    // Az összevonáshoz azonos jellemzők kellenek: a fényezéshez, lámpákhoz elég a hely, a normál és az UV
    const list = byName.get(name) ?? []
    list.push(g)
    byName.set(name, list)
  })
  const materialOf: Record<string, Material> = { Windows: windowGlass(), Headlights: head, TailLights: tail, Grey: rim, Black: tyre }
  const parts: SedanPart[] = []
  for (const [name, list] of byName) {
    // Csak a mindegyikben meglévő jellemzők maradnak (különben nem vonhatók össze)
    for (const k of ['normal', 'uv']) if (!list.every((g) => g.attributes[k])) for (const g of list) if (g.attributes[k]) g.deleteAttribute(k)
    const geometry = mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)))
    if (!geometry) continue
    const paint = name === 'Blue'
    parts.push({ geometry, material: paint ? carPaint('#ffffff').clone() : (materialOf[name] ?? tyre), paint })
  }
  return parts
}

/** Az irányjelzők helye a kocsin (bal első, bal hátsó, jobb első, jobb hátsó) */
export const INDICATOR_SPOTS: Array<{ x: number; y: number; z: number; side: 'left' | 'right' }> = [
  { x: -0.82, y: 0.55, z: -2.17, side: 'left' },
  { x: -0.84, y: 0.72, z: 2.1, side: 'left' },
  { x: 0.82, y: 0.55, z: -2.17, side: 'right' },
  { x: 0.84, y: 0.72, z: 2.1, side: 'right' },
]

