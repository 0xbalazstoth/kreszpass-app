let webgl: boolean | undefined

/** Van-e WebGL a böngészőben (egyszer ellenőrizzük) */
export function webglAvailable(): boolean {
  if (webgl !== undefined) return webgl
  try {
    const c = document.createElement('canvas')
    webgl = Boolean(c.getContext('webgl2') ?? c.getContext('webgl'))
  } catch {
    webgl = false
  }
  return webgl
}
