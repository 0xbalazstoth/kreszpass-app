import type { LightState, Scene, SceneCar } from '../domain/questions'
import { SignGlyph } from './SignIcon'

interface Props {
  scene: Scene
  /** Közeledés animációja (ms); 0 = álló kép */
  approachMs?: number
  className?: string
}

const ROAD = '#6b7280'
const ROAD_EDGE = '#4b5563'
const MARK = '#f9fafb'

function Car({ x, y, rot, color, label }: { x: number; y: number; rot: number; color: string; label?: string }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`} aria-label={label}>
      <rect x="-10" y="-17" width="20" height="34" rx="5" fill={color} stroke="#111827" strokeWidth="1.5" />
      <rect x="-7" y="-11" width="14" height="7" rx="2" fill="#bfdbfe" />
      <rect x="-7" y="8" width="14" height="5" rx="2" fill="#93c5fd" opacity=".7" />
    </g>
  )
}

function Pedestrian({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} aria-label="gyalogos">
      <circle r="9" fill="#f59e0b" stroke="#111827" strokeWidth="1.5" />
      <circle r="4" fill="#111827" />
    </g>
  )
}

function Zebra({ x, y, w, h, vertical }: { x: number; y: number; w: number; h: number; vertical: boolean }) {
  const stripes = []
  const n = 6
  for (let i = 0; i < n; i++) {
    stripes.push(
      vertical ? (
        <rect key={i} x={x} y={y + (i * h) / n + 1} width={w} height={h / n - 3} fill={MARK} />
      ) : (
        <rect key={i} x={x + (i * w) / n + 1} y={y} width={w / n - 3} height={h} fill={MARK} />
      ),
    )
  }
  return <g>{stripes}</g>
}

function TrafficLight({ x, y, state }: { x: number; y: number; state: LightState }) {
  const on = {
    red: state === 'red' || state === 'red_yellow',
    yellow: state === 'yellow' || state === 'red_yellow' || state === 'flashing_yellow',
    green: state === 'green',
  }
  return (
    <g transform={`translate(${x} ${y})`} aria-label={`jelzőlámpa: ${state}`}>
      <rect x="-11" y="-30" width="22" height="60" rx="5" fill="#111827" />
      <circle cy="-18" r="7" fill={on.red ? '#ef4444' : '#3f1d1d'} />
      <circle cy="0" r="7" fill={on.yellow ? '#fbbf24' : '#3f341d'} className={state === 'flashing_yellow' ? 'blink' : undefined} />
      <circle cy="18" r="7" fill={on.green ? '#22c55e' : '#1d3f27'} />
    </g>
  )
}

/** Partner autó elhelyezése a kereszteződésben (jobb oldali közlekedés) */
function carPos(c: SceneCar): { x: number; y: number; rot: number } {
  switch (c.from) {
    case 'left':
      return { x: c.waiting ? 95 : 55, y: 167, rot: 90 }
    case 'right':
      return { x: c.waiting ? 205 : 245, y: 133, rot: -90 }
    case 'ahead':
      return { x: 133, y: c.waiting ? 95 : 55, rot: 180 }
  }
}

function turnPath(turn: Scene['turn']): string {
  switch (turn) {
    case 'straight':
      return 'M167 196 L167 70'
    case 'right':
      return 'M167 196 Q167 167 200 167 L250 167'
    case 'left':
      return 'M167 196 Q167 133 120 133 L55 133'
  }
}

function JunctionScene({ scene }: { scene: Scene }) {
  const pedTarget = scene.pedestrian?.where === 'target_road'
  const pedX = scene.turn === 'left' ? 92 : 208
  return (
    <>
      <rect x="115" y="0" width="70" height="300" fill={ROAD} />
      <rect x="0" y="115" width="300" height="70" fill={ROAD} />
      <path d="M115 0V115H0M185 0V115H300M115 300V185H0M185 300V185H300" stroke={ROAD_EDGE} strokeWidth="3" fill="none" />
      <path d="M150 0V110M150 190V300M0 150H110M190 150H300" stroke={MARK} strokeWidth="2" strokeDasharray="12 10" />
      <path d="M150 190H185" stroke={MARK} strokeWidth="4" />
      {pedTarget && <Zebra x={pedX - 8} y={117} w={16} h={66} vertical />}
      {scene.crossSign && (
        <>
          <SignGlyph type={scene.crossSign} x={95} y={205} size={28} />
          <SignGlyph type={scene.crossSign} x={205} y={95} size={28} />
        </>
      )}
      {scene.mySign && !scene.light && <SignGlyph type={scene.mySign} speed={scene.speed} x={210} y={212} size={36} />}
      {scene.light && <TrafficLight x={207} y={214} state={scene.light} />}
      {scene.cars.map((c, i) => {
        const p = carPos(c)
        return <Car key={i} {...p} color="#dc2626" label={`autó ${c.from}`} />
      })}
      {pedTarget && <Pedestrian x={pedX} y={150} />}
      <path d={turnPath(scene.turn)} stroke="#2563eb" strokeWidth="4" fill="none" strokeDasharray="8 6" markerEnd="url(#arrow)" />
    </>
  )
}

function RoadScene({ scene }: { scene: Scene }) {
  const ped = scene.pedestrian?.where === 'my_crossing' ? scene.pedestrian : undefined
  const hasZebra = scene.mySign === 'crossing'
  return (
    <>
      <rect x="115" y="0" width="70" height="300" fill={ROAD} />
      <path d="M115 0V300M185 0V300" stroke={ROAD_EDGE} strokeWidth="3" />
      <path d="M150 0V300" stroke={MARK} strokeWidth="2" strokeDasharray="12 10" />
      {hasZebra && <Zebra x={117} y={120} w={66} h={22} vertical={false} />}
      {scene.mySign && <SignGlyph type={scene.mySign} speed={scene.speed} x={215} y={scene.mySign === 'speed' ? 150 : 110} size={scene.mySign === 'speed' ? 56 : 36} />}
      {scene.blocker && (
        <g aria-label="álló jármű a szomszéd sávban">
          <rect x="120" y="148" width="26" height="62" rx="4" fill="#9ca3af" stroke="#111827" strokeWidth="1.5" />
          <rect x="123" y="151" width="20" height="8" rx="2" fill="#bfdbfe" />
        </g>
      )}
      {ped && <Pedestrian x={ped.state === 'crossing' ? 160 : 198} y={131} />}
    </>
  )
}

function RoundaboutScene({ scene }: { scene: Scene }) {
  const exitPed = scene.pedestrian?.where === 'exit_crossing'
  return (
    <>
      <rect x="115" y="0" width="70" height="300" fill={ROAD} />
      <rect x="0" y="115" width="300" height="70" fill={ROAD} />
      <circle cx="150" cy="150" r="88" fill={ROAD} />
      <circle cx="150" cy="150" r="42" fill="#4ade80" stroke={MARK} strokeWidth="3" />
      <path d="M150 0V52M150 248V300M0 150H52M248 150H300" stroke={MARK} strokeWidth="2" strokeDasharray="10 8" />
      {exitPed && <Zebra x={117} y={20} w={66} h={18} vertical={false} />}
      <path d="M150 232H185" stroke={MARK} strokeWidth="3" strokeDasharray="6 5" />
      {scene.mySign && <SignGlyph type={scene.mySign} x={212} y={250} size={34} />}
      {scene.cars.map((c, i) => (
        <Car key={i} x={c.from === 'left' ? 92 : 208} y={c.from === 'left' ? 196 : 104} rot={c.from === 'left' ? 145 : -35} color="#dc2626" />
      ))}
      {exitPed && <Pedestrian x={160} y={29} />}
      <path d="M167 238 Q200 205 212 160 Q220 110 175 70 L167 40" stroke="#2563eb" strokeWidth="4" fill="none" strokeDasharray="8 6" markerEnd="url(#arrow)" />
    </>
  )
}

/**
 * Felülnézeti vázlat: saját autó (kék) lent, a kérdés szereplői (piros autók, gyalogos, lámpa, táblák).
 * Utcakép nélkül is ad képet a helyzetről, utcaképpel együtt pedig a mozgó szereplőket mutatja.
 */
export function SceneView({ scene, approachMs = 0, className }: Props) {
  const ourY = scene.layout === 'roundabout' ? 262 : 222
  return (
    <svg viewBox="0 0 300 300" className={`scene ${className ?? ''}`} role="img" aria-label="A helyzet felülnézeti vázlata">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill="#2563eb" />
        </marker>
      </defs>
      <rect width="300" height="300" fill="#d9e8d3" />
      {scene.layout === 'junction' && <JunctionScene scene={scene} />}
      {scene.layout === 'road' && <RoadScene scene={scene} />}
      {scene.layout === 'roundabout' && <RoundaboutScene scene={scene} />}
      <g className={approachMs ? 'approach' : undefined} style={approachMs ? { animationDuration: `${approachMs}ms` } : undefined}>
        <Car x={167} y={ourY} rot={0} color="#2563eb" label="saját autó" />
      </g>
    </svg>
  )
}
