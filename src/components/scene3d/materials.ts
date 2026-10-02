import {
  BoxGeometry,
  CanvasTexture,
  Color,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  type BufferGeometry,
  type Texture,
} from 'three'

/**
 * Valósághű felületek a Poly Haven fényképes PBR-textúráiból (CC0, lásd public/3d/manifest.json).
 * Az anyagok közösek: a csempézést nem a textúra ismétlése, hanem a geometria méterben számolt UV-koordinátái adják,
 * így egy anyag minden méretű felületen ugyanakkora (valódi méretű) mintázatot mutat.
 * A textúrák a háttérben töltődnek: addig (és ha nem érhetők el) a felület egyszínű marad.
 */

export type SurfaceName = 'asphalt' | 'pavement' | 'kerb' | 'plaster' | 'plaster_rough' | 'plaster_grey' | 'brick' | 'grass'

/** Ennyi méter egy textúra-csempe az adott felületen */
export const TILE_M: Record<SurfaceName, number> = {
  asphalt: 4,
  pavement: 3,
  kerb: 1.5,
  plaster: 3,
  plaster_rough: 3,
  plaster_grey: 3,
  brick: 2.2,
  grass: 5,
}

/** A betöltésig (vagy textúra nélkül) látszó szín */
const BASE: Record<SurfaceName, string> = {
  asphalt: '#55595e',
  pavement: '#b9b6ae',
  kerb: '#c8c6c0',
  plaster: '#d9cdb8',
  plaster_rough: '#cdbb9f',
  plaster_grey: '#b8b5ae',
  brick: '#9a5a44',
  grass: '#6f8a55',
}

/** A fényképes színtérkép árnyalása, hogy a jelenet fényeinél valószerű legyen (pl. sötétebb aszfalt, zöldebb fű) */
const TINT: Partial<Record<SurfaceName, string>> = {
  asphalt: '#6c7076',
  grass: '#b4d08e',
  pavement: '#e6e2da',
}

const base = () => `${import.meta.env.BASE_URL}3d/`
const loader = new TextureLoader()
const textures = new Map<string, Promise<Texture | null>>()

function loadTexture(url: string, srgb: boolean): Promise<Texture | null> {
  let p = textures.get(url)
  if (!p) {
    p = new Promise((resolve) => {
      loader.load(
        url,
        (t) => {
          t.wrapS = RepeatWrapping
          t.wrapT = RepeatWrapping
          t.anisotropy = 8
          if (srgb) t.colorSpace = SRGBColorSpace
          resolve(t)
        },
        undefined,
        () => resolve(null),
      )
    })
    textures.set(url, p)
  }
  return p
}

const materials = new Map<string, MeshStandardMaterial>()

/**
 * Közös PBR-anyag egy felülethez; a `tint` a színtérképet színezi (pl. pasztell homlokzatok).
 * `normalMaps`: a domborzati (normál) térkép csak közepes és magas minőségen.
 */
export function surface(name: SurfaceName, opts: { tint?: string; normalMaps?: boolean } = {}): MeshStandardMaterial {
  const key = `${name}|${opts.tint ?? ''}|${opts.normalMaps ? 'n' : ''}`
  let m = materials.get(key)
  if (m) return m
  m = new MeshStandardMaterial({ color: opts.tint ?? BASE[name], roughness: 0.9, metalness: 0 })
  materials.set(key, m)
  const mat = m
  const dir = `${base()}textures/${name}/`
  void loadTexture(`${dir}diff.jpg`, true).then((t) => {
    if (!t) return
    mat.map = t
    // A színtérkép mellett a színezés csak árnyalja a felületet
    mat.color = new Color(opts.tint ?? TINT[name] ?? '#ffffff')
    mat.needsUpdate = true
  })
  void loadTexture(`${dir}arm.jpg`, false).then((t) => {
    if (!t) return
    // ARM: R = árnyékolás (AO), G = érdesség, B = fémesség
    mat.aoMap = t
    mat.roughnessMap = t
    mat.roughness = 1
    mat.needsUpdate = true
  })
  if (opts.normalMaps) {
    void loadTexture(`${dir}nor.jpg`, false).then((t) => {
      if (!t) return
      mat.normalMap = t
      mat.needsUpdate = true
    })
  }
  return mat
}

/** Vízszintes sík (az x–z síkban fekszik) méterben számolt UV-vel */
export function groundPlane(w: number, d: number, tileM: number): PlaneGeometry {
  const g = new PlaneGeometry(w, d)
  scaleUv(g, w / tileM, d / tileM)
  return g
}

/** Doboz, amelynek minden lapján a csempe valódi méretű (a lapok sorrendje: +x, −x, +y, −y, +z, −z) */
export function worldBox(w: number, h: number, d: number, tileM: number): BoxGeometry {
  const g = new BoxGeometry(w, h, d)
  const uv = g.getAttribute('uv')
  const faces: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ]
  faces.forEach(([fu, fv], f) => {
    for (let i = f * 4; i < f * 4 + 4; i++) uv.setXY(i, (uv.getX(i) * fu) / tileM, (uv.getY(i) * fv) / tileM)
  })
  uv.needsUpdate = true
  return g
}

export function scaleUv(g: BufferGeometry, su: number, sv: number) {
  const uv = g.getAttribute('uv')
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv)
  uv.needsUpdate = true
}

// ---------------------------------------------------------------- burkolati jel, üveg, fényezés

let wornPaint: MeshStandardMaterial | null = null

/** Kissé kopott fehér útburkolati festék: zajos átlátszósággal, hogy ne hasson tökéletes fehér csíknak */
export function roadPaint(): MeshStandardMaterial {
  if (wornPaint) return wornPaint
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 128
  const g = c.getContext('2d')
  if (g) {
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, 128, 128)
    // Kopott foltok
    for (let i = 0; i < 900; i++) {
      const a = Math.random() * 0.55
      g.fillStyle = `rgba(0,0,0,${a})`
      g.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 3, 1 + Math.random() * 3)
    }
  }
  const t = new CanvasTexture(c)
  t.wrapS = RepeatWrapping
  t.wrapT = RepeatWrapping
  wornPaint = new MeshStandardMaterial({ color: '#ecebe4', roughness: 0.75, alphaMap: t, transparent: true, alphaTest: 0.25 })
  return wornPaint
}

let glass: MeshPhysicalMaterial | null = null

/** Ablaküveg: sötét, kis érdességű, az égboltot tükrözi */
export function windowGlass(): MeshPhysicalMaterial {
  glass ??= new MeshPhysicalMaterial({ color: '#25303b', roughness: 0.06, metalness: 0.2, envMapIntensity: 1.4, clearcoat: 1, clearcoatRoughness: 0.05 })
  return glass
}

const paints = new Map<string, MeshPhysicalMaterial>()

/** Autófényezés: lakkréteggel, a környezetet tükrözve */
export function carPaint(color: string): MeshPhysicalMaterial {
  let m = paints.get(color)
  if (!m) {
    m = new MeshPhysicalMaterial({ color, roughness: 0.38, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.1 })
    paints.set(color, m)
  }
  return m
}

/** Karosszéria-változat */
export type CarShapeKind = 'sedan' | 'hatch'

/** A szín alapján determinisztikusan választott karosszéria-típus, hogy ne legyen minden autó egyforma */
export function carKindFor(color: string): CarShapeKind {
  let h = 0
  for (let i = 0; i < color.length; i++) h = (h * 31 + color.charCodeAt(i)) | 0
  return Math.abs(h) % 3 === 0 ? 'hatch' : 'sedan'
}
