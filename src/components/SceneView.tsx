import { signsForScene } from '../data/signs'
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
  const signs = signsForScene(scene)
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
      {signs.cross.map((code) => (
        <g key={code}>
          <SignGlyph code={code} x={95} y={205} size={28} />
          <SignGlyph code={code} x={205} y={95} size={28} />
        </g>
      ))}
      {!scene.light && signs.mine.map((code, i) => <SignGlyph key={code} code={code} x={210} y={212 + i * 38} size={36} />)}
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
  const signs = signsForScene(scene)
  const ped = scene.pedestrian?.where === 'my_crossing' ? scene.pedestrian : undefined
  const hasZebra = scene.mySign === 'crossing'
  return (
    <>
      <rect x="115" y="0" width="70" height="300" fill={ROAD} />
      <path d="M115 0V300M185 0V300" stroke={ROAD_EDGE} strokeWidth="3" />
      <path d="M150 0V300" stroke={MARK} strokeWidth="2" strokeDasharray="12 10" />
      {hasZebra && <Zebra x={117} y={120} w={66} h={22} vertical={false} />}
      {scene.rail && (
        <g aria-label="vasúti átjáró">
          <rect x="0" y="112" width="300" height="26" fill="#8b8173" />
          {Array.from({ length: 30 }, (_, i) => (
            <rect key={i} x={i * 10 + 2} y="114" width="4" height="22" fill="#5b4a37" />
          ))}
          <path d="M0 118H300M0 132H300" stroke="#d1d5db" strokeWidth="2.5" />
          {scene.rail.barrierDown && <rect x="148" y="146" width="40" height="5" fill="#dc2626" stroke="#fff" strokeWidth="1" />}
          {scene.rail.light !== 'none' && (
            <g>
              <rect x="193" y="146" width="30" height="14" rx="3" fill="#111827" />
              <circle cx="201" cy="153" r="4.5" fill={scene.rail.light === 'red_flash' ? '#ef4444' : '#3a1a1a'} />
              <circle cx="215" cy="153" r="4.5" fill={scene.rail.light === 'white_flash' ? '#f8fafc' : '#3a3a3a'} />
            </g>
          )}
          {signs.approach.map((code, i) => (
            <SignGlyph key={code} code={code} x={215 + i * 26} y={262} size={24} />
          ))}
        </g>
      )}
      {signs.mine.map((code) => (
        <SignGlyph key={code} code={code} x={215} y={scene.mySign === 'speed' ? 150 : 110} size={scene.mySign === 'speed' ? 56 : 36} />
      ))}
      {scene.blocker && (
        <g aria-label="álló jármű a szomszéd sávban">
          <rect x="120" y="148" width="26" height="62" rx="4" fill="#9ca3af" stroke="#111827" strokeWidth="1.5" />
          <rect x="123" y="151" width="20" height="8" rx="2" fill="#bfdbfe" />
        </g>
      )}
      {ped && <Pedestrian x={ped.state === 'crossing' ? 160 : 198} y={131} />}
      {scene.rail?.queue && [95, 55, 15].map((y) => <Car key={y} x={167} y={y} rot={0} color="#9ca3af" />)}
      {scene.rail?.train && (
        <g aria-label="közeledő vonat">
          <rect x="-10" y="116" width="90" height="18" rx="4" fill="#1e3a8a" />
          <rect x="72" y="119" width="6" height="12" fill="#fffbe6" />
        </g>
      )}
      {scene.rail?.slowAhead && <rect x="157" y="160" width="20" height="30" rx="4" fill="#15803d" stroke="#111827" aria-label="lassú mezőgazdasági jármű" />}
      {scene.hazard && <HazardShapes scene={scene} />}
      {scene.transit && <TransitShapes scene={scene} />}
    </>
  )
}

/** Váratlan helyzetek vázlata: akadály, útépítés, labda, ajtó, kerékpáros, mentőautó */
function HazardShapes({ scene }: { scene: Scene }) {
  switch (scene.hazard) {
    case 'parked_oncoming':
    case 'parked_clear':
      return (
        <g aria-label="álló jármű a sávunkban">
          <rect x="156" y="110" width="24" height="56" rx="4" fill="#e5e7eb" stroke="#111827" strokeWidth="1.5" />
          <circle cx="160" cy="163" r="3" fill="#f59e0b" />
          <circle cx="176" cy="163" r="3" fill="#f59e0b" />
          {scene.hazard === 'parked_oncoming' && <Car x={133} y={70} rot={180} color="#dc2626" label="szembejövő autó" />}
        </g>
      )
    case 'roadworks':
      return (
        <g aria-label="úton folyó munkák">
          {[0, 1, 2, 3, 4].map((i) => (
            <circle key={i} cx={182 - i * 7} cy={175 - i * 8} r="3.5" fill="#f97316" />
          ))}
          <rect x="153" y="60" width="30" height="80" fill="#7c6247" opacity=".8" />
          <rect x="153" y="136" width="30" height="6" fill="#dc2626" />
        </g>
      )
    case 'ball_child':
      return (
        <g aria-label="labda gurul az úttestre">
          <rect x="185" y="0" width="26" height="300" fill={ROAD} />
          {[40, 90, 170, 220].map((y) => (
            <Car key={y} x={198} y={y} rot={0} color="#9ca3af" />
          ))}
          <circle cx="172" cy="130" r="5" fill="#ef4444" stroke="#111827" />
          <circle cx="206" cy="130" r="6" fill="#f59e0b" stroke="#111827" />
        </g>
      )
    case 'door_open':
      return (
        <g aria-label="kinyíló ajtó">
          <rect x="185" y="0" width="26" height="300" fill={ROAD} />
          <Car x={198} y={120} rot={0} color="#9ca3af" />
          <path d="M188 112 L176 124" stroke="#111827" strokeWidth="4" />
        </g>
      )
    case 'cyclist':
      return (
        <g aria-label="kerékpáros előttünk">
          <rect x="175" y="120" width="7" height="22" rx="3" fill="#0e7490" />
          <Car x={133} y={60} rot={180} color="#dc2626" />
          <Car x={133} y={140} rot={180} color="#f59e0b" />
        </g>
      )
    case 'emergency':
      return (
        <g aria-label="mentőautó mögöttünk">
          <rect x="157" y="262" width="20" height="36" rx="4" fill="#fafafa" stroke="#111827" strokeWidth="1.5" />
          <rect x="159" y="266" width="7" height="4" fill="#3b82f6" className="blink" />
          <rect x="168" y="266" width="7" height="4" fill="#3b82f6" />
        </g>
      )
    default:
      return null
  }
}

/** Villamos- és autóbuszmegálló vázlata */
function TransitShapes({ scene }: { scene: Scene }) {
  const t = scene.transit!
  if (t.kind === 'bus')
    return (
      <g aria-label="autóbusz a megállóban">
        <rect x="185" y="90" width="22" height="90" fill={ROAD} />
        <rect x="186" y="100" width="20" height="72" rx="4" fill="#1d4ed8" stroke="#111827" strokeWidth="1.5" />
        {t.state === 'departing' && <circle cx="189" cy="104" r="3.5" fill="#f59e0b" className="blink" />}
        {t.state === 'standing' && <Pedestrian x={180} y={94} />}
      </g>
    )
  if (t.island)
    return (
      <g aria-label="villamos járdaszigetes megállóban">
        <rect x="80" y="0" width="35" height="300" fill={ROAD} />
        <rect x="118" y="60" width="12" height="110" fill="#b8bec7" stroke="#6b7280" />
        <rect x="88" y="50" width="22" height="130" rx="4" fill="#f5c400" stroke="#111827" strokeWidth="1.5" />
        <Zebra x={130} y={172} w={55} h={12} vertical={false} />
        <Pedestrian x={150} y={178} />
      </g>
    )
  return (
    <g aria-label="villamos a sávunkban">
      <path d="M160 0V300M174 0V300" stroke="#9ca3af" strokeWidth="2" />
      <rect x="155" y={t.state === 'arriving' ? 40 : 20} width="24" height="130" rx="4" fill="#f5c400" stroke="#111827" strokeWidth="1.5" />
      {t.state === 'doors_open' && [50, 90, 130].map((y) => <Pedestrian key={y} x={184} y={y} />)}
    </g>
  )
}

function RoundaboutScene({ scene }: { scene: Scene }) {
  const signs = signsForScene(scene)
  const info = scene.roundabout ?? { exits: 4, exit: 2, lanes: 1, phase: 'entry' as const }
  const n = Math.max(3, Math.min(6, info.exits))
  // Ágak a valós kijáratszámmal; a behajtás alul (délen), a kör az óramutatóval ellentétesen halad
  const armA = (k: number) => -Math.PI / 2 + (k * 2 * Math.PI) / n
  const pt = (a: number, r: number) => [150 + r * Math.cos(a), 150 - r * Math.sin(a)] as const
  const exitK = Math.min(info.exit, n)
  const exitA = armA(exitK)
  const [ex, ey] = pt(exitA, 150)
  const [lx, ly] = pt(exitA, 118)
  const inR = 66
  const [sx, sy] = pt(armA(0) + 0.25, inR)
  const [tx, ty] = pt(exitA - 0.25, inR)
  const large = exitA - armA(0) > Math.PI ? 1 : 0
  const exitPed = scene.pedestrian?.where === 'exit_crossing'
  const [zx, zy] = pt(exitA, 104)
  return (
    <>
      {Array.from({ length: n }, (_, k) => {
        const [x, y] = pt(armA(k), 160)
        return <path key={k} d={`M150 150L${x} ${y}`} stroke={ROAD} strokeWidth="70" />
      })}
      <circle cx="150" cy="150" r="88" fill={ROAD} />
      <circle cx="150" cy="150" r="42" fill="#4ade80" stroke={MARK} strokeWidth="3" />
      {info.lanes >= 2 && <circle cx="150" cy="150" r="65" fill="none" stroke={MARK} strokeWidth="2" strokeDasharray="8 8" />}
      {exitPed && <circle cx={zx} cy={zy} r="10" fill="none" stroke={MARK} strokeWidth="6" strokeDasharray="3 3" />}
      <path d="M150 232H185" stroke={MARK} strokeWidth="3" strokeDasharray="6 5" />
      {signs.mine.map((code, i) => (
        <SignGlyph key={code} code={code} x={212 + i * 30} y={250} size={28} />
      ))}
      {signs.approach.map((code) => (
        <SignGlyph key={code} code={code} x={212} y={288} size={24} />
      ))}
      {scene.cars.map((c, i) => (
        <Car key={i} x={c.from === 'left' ? 92 : 208} y={c.from === 'left' ? 196 : 104} rot={c.from === 'left' ? 145 : -35} color="#dc2626" />
      ))}
      {exitPed && <Pedestrian x={zx} y={zy} />}
      <path d={`M167 238 L${sx} ${sy} A${inR} ${inR} 0 ${large} 0 ${tx} ${ty} L${ex} ${ey}`} stroke="#2563eb" strokeWidth="4" fill="none" strokeDasharray="8 6" markerEnd="url(#arrow)" />
      <g aria-label={`${info.exit}. kijárat`}>
        <circle cx={lx} cy={ly} r="11" fill="#2563eb" />
        <text x={lx} y={ly + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">
          {info.exit}.
        </text>
      </g>
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
