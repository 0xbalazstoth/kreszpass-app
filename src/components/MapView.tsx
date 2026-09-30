import type { FeatureCollection, LineString } from 'geojson'
import { GeolocateControl, LngLatBounds, Map as MlMap, NavigationControl, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// A MapLibre 6 külön ES-modul workert használ. A Vite-tal lefordíttatjuk, és megadjuk az URL-jét,
// különben a függőség-előcsomagolás után nem találja.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useRef, useState } from 'react'
import { signUrl } from '../data/signs'
import { LIGHT_ICON } from '../features/drive/mapSigns'
import type { LngLat } from '../lib/geo'

/** Ingyenes, API-kulcs nélküli vektoros térképstílus */
export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
const DEFAULT_CENTER: LngLat = [19.0402, 47.4979] // Budapest
/** Ingyenes domborzati csempék (AWS Open Data, Mapzen Terrarium formátum), kulcs nélkül */
const TERRAIN_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'

setWorkerUrl(workerUrl)

export interface MapPin {
  id: string
  lngLat: LngLat
  label: string
  color: string
  selected?: boolean
  /** Valódi KRESZ tábla kódja, a térképen a helyén jelenik meg */
  sign?: string
}

/** Első személyű kamera-út az útvonal mentén */
export interface FlyAlong {
  path: LngLat[]
  bearings: number[]
  durationMs: number
  key: string
  zoom?: number
  pitch?: number
}

/** Jelzőlámpa jele (nincs róla táblakép), 128 px magasra rajzolva */
function drawLightIcon(): ImageData | null {
  const canvas = document.createElement('canvas')
  canvas.width = 56
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#111827'
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.roundRect(2, 2, 52, 124, 12)
  ctx.fill()
  ctx.stroke()
  for (const [i, color] of ['#ef4444', '#facc15', '#22c55e'].entries()) {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(28, 26 + i * 38, 14, 0, Math.PI * 2)
    ctx.fill()
  }
  return ctx.getImageData(0, 0, 56, 128)
}

/** A táblaképek egyszer töltődnek be, kis méretre (128 px magas) rasztereve */
const signImages = new Map<string, Promise<ImageData | null>>()
function loadSignImage(code: string): Promise<ImageData | null> {
  let p = signImages.get(code)
  if (!p && code === LIGHT_ICON) p = Promise.resolve(drawLightIcon())
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const h = 128
        const w = Math.max(1, Math.round((img.naturalWidth / img.naturalHeight) * h))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve(null)
        ctx.drawImage(img, 0, 0, w, h)
        resolve(ctx.getImageData(0, 0, w, h))
      }
      img.onerror = () => resolve(null)
      img.src = signUrl(code)
    })
    signImages.set(code, p)
  }
  return p
}

function lerpBearing(a: number, b: number, t: number): number {
  let d = ((b - a + 540) % 360) - 180
  if (d === -180) d = 180
  return a + d * t
}

interface Props {
  line?: LineString | null
  waypoints?: LngLat[]
  pins?: MapPin[]
  /** Aktuális pozíció (pl. vezetés közben) */
  position?: { lngLat: LngLat; bearing: number } | null
  onMapClick?: (lngLat: LngLat) => void
  onPinClick?: (id: string) => void
  /** Ha változik, a térkép az útvonalra/pontokra igazodik */
  fitKey?: string
  /** Erre a pontra repül */
  focus?: { lngLat: LngLat; zoom?: number; bearing?: number; pitch?: number; key: string } | null
  interactive?: boolean
  className?: string
  cursor?: string
  /** Domborzat (3D terep) */
  terrain?: boolean
  /** Kamera-út az útvonal mentén (vezetés közbeni közeledés) */
  flyAlong?: FlyAlong | null
  /** Számozott körök a helyzeteknél (vezetés közben csak a táblák látszanak) */
  showPinCircles?: boolean
  /** Letisztult nézet vezetéshez: üzletek, látnivalók jelei nélkül, összecsukott forrásmegjelöléssel */
  quiet?: boolean
}

const empty: FeatureCollection = { type: 'FeatureCollection', features: [] }

export function MapView(props: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const handlers = useRef({ onMapClick: props.onMapClick, onPinClick: props.onPinClick })
  useEffect(() => {
    handlers.current = { onMapClick: props.onMapClick, onPinClick: props.onPinClick }
  })

  useEffect(() => {
    if (!container.current) return
    let map: MlMap
    try {
      map = new MlMap({
        container: container.current,
        style: MAP_STYLE,
        center: DEFAULT_CENTER,
        zoom: 12,
        // A vezetőülésből nézett repüléshez erősebb döntés kell az alapértelmezett 60°-nál
        maxPitch: 80,
        interactive: props.interactive ?? true,
        attributionControl: { compact: true },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'A térkép nem tölthető be (WebGL szükséges)')
      return
    }
    mapRef.current = map
    // Fejlesztői módban a böngészős teszteléshez elérhető
    if (import.meta.env.DEV) (window as unknown as { __map?: MlMap }).__map = map
    if (props.interactive ?? true) {
      map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right')
      map.addControl(new GeolocateControl({ positionOptions: { enableHighAccuracy: true } }), 'top-right')
    }
    map.on('load', () => {
      map.addSource('route', { type: 'geojson', data: empty })
      map.addSource('waypoints', { type: 'geojson', data: empty })
      map.addSource('pins', { type: 'geojson', data: empty })
      map.addSource('position', { type: 'geojson', data: empty })
      map.addLayer({
        id: 'route-casing',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 9 },
      })
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#1d4ed8', 'line-width': 5 },
      })
      map.addLayer({
        id: 'waypoints',
        type: 'circle',
        source: 'waypoints',
        paint: { 'circle-radius': 5, 'circle-color': '#ffffff', 'circle-stroke-color': '#1d4ed8', 'circle-stroke-width': 2 },
      })
      map.addLayer({
        id: 'pins',
        type: 'circle',
        source: 'pins',
        paint: {
          'circle-radius': ['case', ['get', 'selected'], 12, 9],
          'circle-color': ['get', 'color'],
          'circle-stroke-color': ['case', ['get', 'selected'], '#111827', '#ffffff'],
          'circle-stroke-width': ['case', ['get', 'selected'], 3, 2],
        },
      })
      map.addLayer({
        id: 'pin-labels',
        type: 'symbol',
        source: 'pins',
        layout: { 'text-field': ['get', 'label'], 'text-size': 11, 'text-font': ['Noto Sans Bold'], 'text-allow-overlap': true },
        paint: { 'text-color': '#ffffff' },
      })
      map.addLayer({
        id: 'pin-signs',
        type: 'symbol',
        source: 'pins',
        filter: ['has', 'sign'],
        layout: {
          'icon-image': ['concat', 'sign-', ['get', 'sign']],
          'icon-size': ['interpolate', ['linear'], ['zoom'], 13, 0.16, 16, 0.28, 19, 0.45],
          'icon-anchor': 'bottom',
          'icon-offset': [0, props.showPinCircles === false ? 0 : -40],
          'icon-allow-overlap': true,
          'icon-pitch-alignment': 'viewport',
          'icon-rotation-alignment': 'viewport',
        },
      })
      if (props.quiet) {
        // Az üzletek, látnivalók ikonjai és a szürke 3D épülettömbök csak zavarnák a táblák felismerését
        for (const layer of map.getStyle().layers) {
          const poi = layer.type === 'symbol' && 'source-layer' in layer && /^(poi|aerodrome_label|mountain_peak)$/.test(layer['source-layer'] ?? '')
          if (poi || layer.type === 'fill-extrusion') map.setLayoutProperty(layer.id, 'visibility', 'none')
        }
        // Erősen döntött nézetben a horizont fölött ég legyen, ne fekete sáv
        map.setSky({ 'sky-color': '#bcd6ec', 'horizon-color': '#e8eef4', 'fog-color': '#e8eef4', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.6 })
        container.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show')
      }
      if (props.showPinCircles === false) {
        map.setLayoutProperty('pins', 'visibility', 'none')
        map.setLayoutProperty('pin-labels', 'visibility', 'none')
      }
      if (props.terrain) {
        map.addSource('terrain', {
          type: 'raster-dem',
          tiles: [TERRAIN_TILES],
          encoding: 'terrarium',
          tileSize: 256,
          maxzoom: 15,
          attribution: 'Domborzat: Mapzen, AWS Open Data',
        })
        map.setTerrain({ source: 'terrain', exaggeration: 1.3 })
      }
      map.addLayer({
        id: 'position',
        type: 'circle',
        source: 'position',
        paint: { 'circle-radius': 8, 'circle-color': '#f59e0b', 'circle-stroke-color': '#111827', 'circle-stroke-width': 2 },
      })
      setLoaded(true)
    })
    map.on('click', (e) => {
      const hit = map.queryRenderedFeatures(e.point, { layers: ['pins'] })[0]
      if (hit && handlers.current.onPinClick) handlers.current.onPinClick(String(hit.properties?.id))
      else handlers.current.onMapClick?.([e.lngLat.lng, e.lngLat.lat])
    })
    map.on('mouseenter', 'pins', () => (map.getCanvas().style.cursor = 'pointer'))
    map.on('mouseleave', 'pins', () => (map.getCanvas().style.cursor = ''))
    // A térkép a tárolója méretváltozását is kövesse (pl. kis ablak ↔ fő nézet csere)
    const ro = new ResizeObserver(() => map.resize())
    ro.observe(container.current)
    return () => {
      ro.disconnect()
      map.remove()
      mapRef.current = null
      setLoaded(false)
    }
    // A térképet csak egyszer hozzuk létre
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (mapRef.current && props.cursor !== undefined) mapRef.current.getCanvas().style.cursor = props.cursor
  }, [props.cursor, loaded])

  useEffect(() => {
    if (!loaded || !mapRef.current) return
    const src = mapRef.current.getSource('route') as GeoJSONSource
    src.setData(props.line ? { type: 'Feature', geometry: props.line, properties: {} } : empty)
  }, [loaded, props.line])

  useEffect(() => {
    if (!loaded || !mapRef.current) return
    const src = mapRef.current.getSource('waypoints') as GeoJSONSource
    src.setData({
      type: 'FeatureCollection',
      features: (props.waypoints ?? []).map((c) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: {} })),
    })
  }, [loaded, props.waypoints])

  useEffect(() => {
    const map = mapRef.current
    if (!loaded || !map) return
    let cancelled = false
    const pins = props.pins ?? []
    // Előbb a táblaképeket töltjük be, hogy a szimbólumréteg azonnal meg tudja jeleníteni őket
    const codes = [...new Set(pins.flatMap((p) => (p.sign ? [p.sign] : [])))]
    void Promise.all(
      codes.map(async (code) => {
        const img = await loadSignImage(code)
        if (img && !cancelled && !map.hasImage(`sign-${code}`)) map.addImage(`sign-${code}`, img, { pixelRatio: 1 })
      }),
    ).then(() => {
      if (cancelled) return
      const src = map.getSource('pins') as GeoJSONSource | undefined
      const sorted = [...pins].sort((a, b) => Number(a.selected ?? false) - Number(b.selected ?? false))
      src?.setData({
        type: 'FeatureCollection',
        features: sorted.map((p) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: p.lngLat },
          properties: { id: p.id, label: p.label, color: p.color, selected: p.selected ?? false, ...(p.sign ? { sign: p.sign } : {}) },
        })),
      })
    })
    return () => {
      cancelled = true
    }
  }, [loaded, props.pins])

  useEffect(() => {
    const map = mapRef.current
    const fly = props.flyAlong
    if (!loaded || !map || !fly || fly.path.length === 0) return
    let raf = 0
    const t0 = performance.now()
    const n = fly.path.length
    const step = () => {
      const raw = Math.min(1, (performance.now() - t0) / fly.durationMs)
      const t = 1 - Math.pow(1 - raw, 3) // ugyanaz a lassulás, mint a 3D jelenetben
      const f = t * (n - 1)
      const i = Math.min(n - 2, Math.floor(f))
      const u = n === 1 ? 0 : f - i
      const a = fly.path[Math.max(0, i)]
      const b = fly.path[Math.min(n - 1, i + 1)]
      map.jumpTo({
        center: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u],
        bearing: lerpBearing(fly.bearings[Math.max(0, i)], fly.bearings[Math.min(n - 1, i + 1)], u),
        pitch: fly.pitch ?? 74,
        zoom: fly.zoom ?? 18.3,
      })
      if (raw < 1) raf = requestAnimationFrame(step)
    }
    step()
    return () => cancelAnimationFrame(raf)
    // Csak új kamera-út esetén indul
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, props.flyAlong?.key])

  useEffect(() => {
    if (!loaded || !mapRef.current) return
    const src = mapRef.current.getSource('position') as GeoJSONSource
    src.setData(
      props.position
        ? { type: 'Feature', geometry: { type: 'Point', coordinates: props.position.lngLat }, properties: {} }
        : empty,
    )
  }, [loaded, props.position])

  useEffect(() => {
    const map = mapRef.current
    if (!loaded || !map || props.fitKey === undefined) return
    const coords = [...(props.line?.coordinates ?? []), ...(props.waypoints ?? []), ...(props.pins ?? []).map((p) => p.lngLat)]
    if (coords.length === 0) return
    if (coords.length === 1) {
      map.jumpTo({ center: coords[0] as LngLat, zoom: 16 })
      return
    }
    const b = new LngLatBounds(coords[0] as LngLat, coords[0] as LngLat)
    for (const c of coords) b.extend(c as LngLat)
    map.fitBounds(b, { padding: 50, duration: 0, maxZoom: 17 })
    // Csak a fitKey változására igazítunk
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, props.fitKey])

  useEffect(() => {
    const map = mapRef.current
    if (!loaded || !map || !props.focus) return
    map.easeTo({
      center: props.focus.lngLat,
      zoom: props.focus.zoom ?? 17,
      bearing: props.focus.bearing ?? map.getBearing(),
      pitch: props.focus.pitch ?? map.getPitch(),
      duration: 600,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, props.focus?.key])

  return (
    <div className={`map ${props.className ?? ''}`}>
      <div ref={container} className="map-canvas" />
      {error && <div className="map-error">{error}</div>}
    </div>
  )
}
