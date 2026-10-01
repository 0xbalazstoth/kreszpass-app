import { webglAvailable } from './webgl'

/** A three.js-t tartalmazó 3D csomag betöltése (külön fájlba kerül) */
export const loadScene3D = () => import('./Scene3D')

/** A manőverek 3D nézete (külön fájl, ugyanazokkal a three.js részekkel) */
export const loadManeuverScene3D = () => import('./ManeuverScene3D')

/** A 3D csomag előtöltése (pl. a vezetés indítóképernyőjén), hogy az első közeledés ne akadjon */
export function preloadScene3D(): void {
  if (webglAvailable()) void loadScene3D()
}
