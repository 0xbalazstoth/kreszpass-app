import type { FeatureCollection, LineString } from 'geojson'
import { GeolocateControl, LngLatBounds, Map as MlMap, NavigationControl, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// A MapLibre 6 külön ES-modul workert használ. A Vite-tal lefordíttatjuk, és megadjuk az URL-jét,
// különben a függőség-előcsomagolás után nem találja.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useRef, useState } from 'react'
import type { LngLat } from '../lib/geo'

/** Ingyenes, API-kulcs nélküli vektoros térképstílus */
export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
const DEFAULT_CENTER: LngLat = [19.0402, 47.4979] // Budapest

setWorkerUrl(workerUrl)

export interface MapPin {
  id: string
  lngLat: LngLat
  label: string
  color: string
  selected?: boolean
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
    return () => {
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
    if (!loaded || !mapRef.current) return
    const src = mapRef.current.getSource('pins') as GeoJSONSource
    const sorted = [...(props.pins ?? [])].sort((a, b) => Number(a.selected ?? false) - Number(b.selected ?? false))
    src.setData({
      type: 'FeatureCollection',
      features: sorted.map((p) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: p.lngLat },
        properties: { id: p.id, label: p.label, color: p.color, selected: p.selected ?? false },
      })),
    })
  }, [loaded, props.pins])

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
