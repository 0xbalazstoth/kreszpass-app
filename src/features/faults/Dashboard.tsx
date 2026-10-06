import { useEffect, useRef } from 'react'
import type { LessonClock } from './clock'

/** Pont a körön: a szög fokban, 0 = felfelé, az óramutató járásával egyezően nő */
function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)]
}

function arcPath(cx: number, cy: number, r: number, from: number, to: number): string {
  const [x1, y1] = polar(cx, cy, r, from)
  const [x2, y2] = polar(cx, cy, r, to)
  return `M${x1} ${y1} A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`
}

const SWEEP = 240
const START = -120
const MAX_KMH = 160
const MAX_RPM = 8000

function Gauge({ cx, cy, r, max, step, label, red, needle, value }: { cx: number; cy: number; r: number; max: number; step: number; label: string; red?: number; needle: React.Ref<SVGGElement>; value: React.Ref<SVGTextElement> }) {
  const ticks = []
  for (let v = 0; v <= max; v += step) {
    const deg = START + (SWEEP * v) / max
    const [x1, y1] = polar(cx, cy, r - 2, deg)
    const [x2, y2] = polar(cx, cy, r - 8, deg)
    const [tx, ty] = polar(cx, cy, r - 15, deg)
    ticks.push(
      <g key={v}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#e5e7eb" strokeWidth={1.4} />
        <text x={tx} y={ty + 2.6} className="dash-num" textAnchor="middle">
          {max > 1000 ? v / 1000 : v}
        </text>
      </g>,
    )
  }
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="#0f172a" stroke="#334155" strokeWidth={2} />
      {red !== undefined && <path d={arcPath(cx, cy, r - 4, START + (SWEEP * red) / max, START + SWEEP)} stroke="#ef4444" strokeWidth={4} fill="none" />}
      {ticks}
      <text x={cx} y={cy + 20} className="dash-unit" textAnchor="middle">
        {label}
      </text>
      <text ref={value} x={cx} y={cy + 32} className="dash-value" textAnchor="middle">
        0
      </text>
      <g ref={needle} transform={`rotate(${START} ${cx} ${cy})`}>
        <path d={`M${cx - 1.6} ${cy} L${cx} ${cy - r + 9} L${cx + 1.6} ${cy} Z`} fill="#f97316" />
      </g>
      <circle cx={cx} cy={cy} r={3.5} fill="#f97316" />
    </g>
  )
}

/** Visszajelző lámpa: kör alakú háttér, benne rövid jel */
function Lamp({ x, y, color, text, label, refEl }: { x: number; y: number; color: string; text: string; label: string; refEl: React.Ref<SVGGElement> }) {
  return (
    <g ref={refEl} opacity={0.18}>
      <title>{label}</title>
      <circle cx={x} cy={y} r={7.5} fill={color} />
      <text x={x} y={y + 3} className="dash-lamp" textAnchor="middle">
        {text}
      </text>
    </g>
  )
}

/**
 * A saját autó műszerfala: sebességmérő, fordulatszámmérő, fokozat, kormány, a három pedál lenyomása és a
 * visszajelzők (kézifék, öv, irányjelző, fényszóró, motor). Minden képkockánál a lecke órájából frissül.
 */
export function Dashboard({ clock }: { clock: LessonClock }) {
  const speedNeedle = useRef<SVGGElement>(null)
  const rpmNeedle = useRef<SVGGElement>(null)
  const speedText = useRef<SVGTextElement>(null)
  const rpmText = useRef<SVGTextElement>(null)
  const gear = useRef<SVGTextElement>(null)
  const wheel = useRef<SVGGElement>(null)
  const pedals = useRef<Record<'clutch' | 'brake' | 'gas', SVGRectElement | null>>({ clutch: null, brake: null, gas: null })
  const left = useRef<SVGPathElement>(null)
  const right = useRef<SVGPathElement>(null)
  const handbrake = useRef<SVGGElement>(null)
  const belt = useRef<SVGGElement>(null)
  const lights = useRef<SVGGElement>(null)
  const engine = useRef<SVGGElement>(null)
  const lightText = useRef<SVGTextElement>(null)

  useEffect(() => {
    let raf = 0
    const draw = (now: number) => {
      const c = clock.now().controls
      const on = Math.floor(now / 380) % 2 === 0
      speedNeedle.current?.setAttribute('transform', `rotate(${START + (SWEEP * Math.min(MAX_KMH, c.speed)) / MAX_KMH} 52 58)`)
      rpmNeedle.current?.setAttribute('transform', `rotate(${START + (SWEEP * Math.min(MAX_RPM, c.rpm)) / MAX_RPM} 150 58)`)
      if (speedText.current) speedText.current.textContent = `${Math.round(c.speed)}`
      if (rpmText.current) rpmText.current.textContent = `${Math.round(c.rpm / 50) * 50}`
      if (gear.current) {
        gear.current.textContent = c.gear
        gear.current.setAttribute('fill', c.gear === 'R' ? '#f87171' : c.gear === 'N' ? '#facc15' : '#f8fafc')
      }
      wheel.current?.setAttribute('transform', `rotate(${(c.steer ?? 0) * 360} 222 90)`)
      for (const k of ['clutch', 'brake', 'gas'] as const) {
        const el = pedals.current[k]
        if (!el) continue
        const h = 62 * Math.max(0, Math.min(1, c[k]))
        el.setAttribute('y', String(84 - h))
        el.setAttribute('height', String(h))
      }
      left.current?.setAttribute('opacity', on && (c.indicator === 'left' || c.indicator === 'hazard') ? '1' : '0.15')
      right.current?.setAttribute('opacity', on && (c.indicator === 'right' || c.indicator === 'hazard') ? '1' : '0.15')
      handbrake.current?.setAttribute('opacity', c.handbrake ? '1' : '0.18')
      belt.current?.setAttribute('opacity', !c.seatbelt && on ? '1' : '0.18')
      lights.current?.setAttribute('opacity', c.lights === 'off' ? '0.18' : '1')
      if (lightText.current) lightText.current.textContent = c.lights === 'high' ? 'TF' : c.lights === 'fog' ? 'K' : 'TL'
      lights.current?.querySelector('circle')?.setAttribute('fill', c.lights === 'high' ? '#2563eb' : c.lights === 'fog' ? '#f59e0b' : '#16a34a')
      engine.current?.setAttribute('opacity', c.engine ? '0.18' : '1')
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [clock])

  const pedal = (k: 'clutch' | 'brake' | 'gas', x: number, label: string, color: string) => (
    <g>
      <title>{k === 'clutch' ? 'Tengelykapcsoló' : k === 'brake' ? 'Fék' : 'Gáz'}</title>
      <rect x={x} y={22} width={18} height={62} rx={3} fill="#1e293b" stroke="#334155" />
      <rect
        ref={(el) => {
          pedals.current[k] = el
        }}
        x={x}
        y={84}
        width={18}
        height={0}
        rx={3}
        fill={color}
      />
      <text x={x + 9} y={97} className="dash-unit" textAnchor="middle">
        {label}
      </text>
    </g>
  )

  return (
    <svg viewBox="0 0 330 124" className="dashboard" role="img" aria-label="Műszerfal: sebesség, fordulatszám, fokozat, pedálok">
      <rect x={0} y={0} width={330} height={124} rx={12} fill="#020617" />
      <Gauge cx={52} cy={58} r={46} max={MAX_KMH} step={20} label="km/h" needle={speedNeedle} value={speedText} />
      <Gauge cx={150} cy={58} r={46} max={MAX_RPM} step={1000} label="×1000/perc" red={6000} needle={rpmNeedle} value={rpmText} />
      <path ref={left} d="M88 10 l7 -5 v3 h6 v4 h-6 v3 z" fill="#22c55e" opacity={0.15} />
      <path ref={right} d="M114 10 l-7 -5 v3 h-6 v4 h6 v3 z" fill="#22c55e" opacity={0.15} />
      <rect x={204} y={16} width={36} height={40} rx={6} fill="#0f172a" stroke="#334155" />
      <text ref={gear} x={222} y={46} className="dash-gear" textAnchor="middle" fill="#f8fafc">
        N
      </text>
      <g ref={wheel}>
        <circle cx={222} cy={90} r={13} fill="none" stroke="#e5e7eb" strokeWidth={3} />
        <circle cx={222} cy={90} r={3} fill="#e5e7eb" />
        <path d="M209.5 91 L219 90.5 M234.5 91 L225 90.5 M222 93 L222 102.5" stroke="#e5e7eb" strokeWidth={2.6} />
        <rect x={220.5} y={75} width={3} height={4} fill="#f59e0b" />
      </g>
      {pedal('clutch', 252, 'K', '#a78bfa')}
      {pedal('brake', 276, 'F', '#ef4444')}
      {pedal('gas', 300, 'G', '#22c55e')}
      <Lamp refEl={handbrake} x={22} y={114} color="#dc2626" text="P" label="Kézifék behúzva" />
      <Lamp refEl={belt} x={42} y={114} color="#dc2626" text="Ö" label="Biztonsági öv nincs becsatolva" />
      <g ref={lights} opacity={0.18}>
        <title>Világítás</title>
        <circle cx={62} cy={114} r={7.5} fill="#16a34a" />
        <text ref={lightText} x={62} y={117} className="dash-lamp" textAnchor="middle">
          TL
        </text>
      </g>
      <Lamp refEl={engine} x={82} y={114} color="#f59e0b" text="M" label="A motor áll" />
    </svg>
  )
}
