import { useMemo, useState } from 'react'
import { MapView, type MapPin } from '../../components/MapView'
import { DriveScene } from '../../components/scene3d'
import { InsetButtons, InsetShow } from '../../components/InsetButtons'
import { useDraggableInset } from '../../components/useDraggableInset'
import type { Scene } from '../../domain/questions'
import { formatDistance } from '../../lib/format'
import { flyPath } from '../drive/fly'
import type { RoadPlace } from './roadDrill'

interface Props {
  place: RoadPlace
  /** A tábla közeledése (flash), a válasz, vagy a visszajelzés */
  phase: 'flash' | 'answer' | 'feedback'
  approachMs: number
  view3d: boolean
  terrain: boolean
}

/** A térképes repülés ennyivel a tábla előtt indul, és ennyivel utána áll meg (m) */
const FLY_BEFORE_M = 150
const FLY_AFTER_M = 5

/**
 * Egy valódi tábla az útvonalon: 3D-ben elhaladunk mellette, a térkép a valódi helyére repül.
 * A kérdés idején a tábla már mögöttünk van, a térképen sem látszik; a visszajelzésnél újra megjelenik.
 */
export function RoadSignView({ place, phase, approachMs, view3d, terrain }: Props) {
  const [mainView, setMainView] = useState<'scene' | 'map'>('scene')
  const { ref: insetBox, hidden: insetHidden, setHidden: setInsetHidden } = useDraggableInset<HTMLDivElement>()
  const { sign, line } = place
  const key = `${place.routeId}:${sign.code}:${Math.round(sign.d)}`
  const scene = useMemo<Scene>(() => ({ layout: 'road', turn: 'straight', cars: [], roadSign: sign.code }), [sign.code])
  const fly = useMemo(() => flyPath(line, sign.d - FLY_BEFORE_M, sign.d + FLY_AFTER_M, approachMs, key), [line, sign.d, approachMs, key])
  const pins: MapPin[] = phase === 'answer' ? [] : [{ id: key, lngLat: sign.lngLat, label: '', color: '#1d4ed8', sign: sign.code }]

  const scenePane = (
    <div className={`pane ${mainView === 'scene' ? 'pane-main' : 'pane-inset'}`}>
      <DriveScene key={key} scene={scene} animate approachMs={approachMs} enabled={view3d} />
      {mainView !== 'scene' && <InsetButtons swapLabel="3D nézet nagyban" onSwap={() => setMainView('scene')} onHide={() => setInsetHidden(true)} />}
    </div>
  )
  const mapPane = (
    <div className={`pane ${mainView === 'map' ? 'pane-main' : 'pane-inset'}`}>
      <MapView
        className="drive-map"
        line={line}
        pins={pins}
        showPinCircles={false}
        quiet
        interactive={false}
        terrain={terrain}
        flyAlong={phase === 'flash' ? fly : null}
        focus={phase === 'flash' && fly ? null : { lngLat: sign.lngLat, zoom: 18, pitch: 60, key }}
      />
      {mainView !== 'map' && <InsetButtons swapLabel="Térkép nagyban" onSwap={() => setMainView('map')} onHide={() => setInsetHidden(true)} />}
    </div>
  )

  return (
    <div className={`drive-visual${insetHidden ? ' inset-hidden' : ''}`} ref={insetBox}>
      {scenePane}
      {mapPane}
      {insetHidden && <InsetShow label={mainView === 'scene' ? 'Térkép' : '3D'} onShow={() => setInsetHidden(false)} />}
      <p className="road-place">
        {place.routeName || 'Névtelen útvonal'} · {formatDistance(sign.d)}
      </p>
    </div>
  )
}
