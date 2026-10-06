import { useEffect, useMemo, useRef } from 'react'
import { SignGlyph } from '../../components/SignIcon'
import { CarShape, SiteBox } from '../../components/topdown'
import { pathPoints, toDeg, transformOf } from '../../components/topdownGeom'
import { BODY_SIZE, bodyGap } from '../../domain/faults/bodies'
import type { Actor, Blink, Phase } from '../../domain/faults/types'
import { CAR, carToWorld, wheelAngle } from '../../domain/maneuvers/geometry'
import type { LightState } from '../../domain/questions'
import type { LessonClock } from './clock'

const PHASE_COLOR: Record<Phase, string> = { setup: '#2563eb', wrong: '#dc2626', right: '#16a34a' }

const LAMP_ON: Record<string, string> = { red: '#ef4444', yellow: '#facc15', green: '#22c55e' }
const LAMP_OFF = '#1f2937'
/** A fényszóró fénykévéjének hossza a felülnézeten (m), éjszakai helyszínen */
const BEAM: Record<string, number> = { off: 0, low: 30, fog: 14, high: 75 }

function lampsLit(state: LightState): Record<'red' | 'yellow' | 'green', boolean> {
  return {
    red: state === 'red' || state === 'red_yellow',
    yellow: state === 'yellow' || state === 'red_yellow' || state === 'flashing_yellow',
    green: state === 'green',
  }
}

/** Irányjelző-pontok a szereplő sarkainál (a póz koordinátáiban) */
function blinkSpots(a: Actor): { left: [number, number][]; right: [number, number][] } {
  if (a.kind === 'own' || a.kind === 'car') {
    const w = CAR.width / 2
    return {
      left: [
        [-w, -CAR.front + 0.15],
        [-w, CAR.rearOverhang - 0.15],
      ],
      right: [
        [w, -CAR.front + 0.15],
        [w, CAR.rearOverhang - 0.15],
      ],
    }
  }
  if (a.kind === 'ped') return { left: [], right: [] }
  const [w, d] = BODY_SIZE[a.kind]
  return {
    left: [
      [-w / 2, -d / 2 + 0.2],
      [-w / 2, d / 2 - 0.2],
    ],
    right: [
      [w / 2, -d / 2 + 0.2],
      [w / 2, d / 2 - 0.2],
    ],
  }
}

function ActorShape({ a }: { a: Actor }) {
  switch (a.kind) {
    case 'own':
      return (
        <>
          <path data-beam fill="#fde047" fillOpacity={0.3} />
          <CarShape color={a.color ?? '#2563eb'} own liveWheels />
          <g data-wheels>
            {[-0.76, 0.76].map((x) => (
              <rect key={x} data-x={x} x={x - 0.1} y={-CAR.wheelbase - 0.31} width={0.2} height={0.62} rx={0.05} fill="#111827" />
            ))}
          </g>
        </>
      )
    case 'car':
      return <CarShape color={a.color ?? '#9ca3af'} />
    case 'bus': {
      const [w, d] = BODY_SIZE.bus
      return (
        <>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={0.3} fill={a.color ?? '#1d4ed8'} stroke="#111827" strokeWidth={0.05} />
          <rect x={-w / 2 + 0.25} y={-d / 2 + 0.4} width={w - 0.5} height={1.2} rx={0.15} fill="#cbd5e1" />
        </>
      )
    }
    case 'ambulance': {
      const [w, d] = BODY_SIZE.ambulance
      return (
        <>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={0.3} fill="#fafafa" stroke="#111827" strokeWidth={0.05} />
          <rect x={-0.2} y={-0.7} width={0.4} height={1.4} fill="#dc2626" />
          <rect x={-0.7} y={-0.2} width={1.4} height={0.4} fill="#dc2626" />
          <rect data-siren x={-w / 2 + 0.2} y={-d / 2 + 1.1} width={w - 0.4} height={0.35} fill="#3b82f6" />
        </>
      )
    }
    case 'bike':
      return (
        <>
          <rect x={-0.08} y={-0.9} width={0.16} height={1.8} rx={0.06} fill="#111827" />
          <rect x={-0.3} y={-0.25} width={0.6} height={0.18} rx={0.06} fill="#374151" />
          <circle r={0.26} cy={0.05} fill={a.color ?? '#f59e0b'} stroke="#111827" strokeWidth={0.04} />
        </>
      )
    case 'ped':
      return (
        <>
          <ellipse rx={0.3} ry={0.2} fill={a.color ?? '#7c3aed'} stroke="#111827" strokeWidth={0.04} />
          <circle r={0.15} cy={-0.02} fill="#f1c9a5" stroke="#111827" strokeWidth={0.03} />
        </>
      )
  }
}

interface Props {
  clock: LessonClock
  step: number
  className?: string
}

/**
 * A lecke felülnézetben, méretarányosan: úttest, járdák, burkolati jelek, táblák (valódi képek), lámpák, a szereplők
 * a lépés pillanatnyi állapotában, irányjelzővel; a saját autó útja a lépés színével (kék: helyzet, piros: hibás,
 * zöld: helyes), és a lépés jelölései (élő távolság, kiemelt terület, felirat). Hosszú útnál a nézet követi a kocsit.
 */
export function FaultDiagram({ clock, step, className }: Props) {
  const lesson = clock.lesson
  const { world, actors } = lesson
  const svg = useRef<SVGSVGElement>(null)
  const actorEls = useRef<Record<string, SVGGElement | null>>({})
  const current = lesson.steps[step]
  const base = clock.states[step]
  const own = actors.find((a) => a.kind === 'own')
  const [w, n, e, s] = world.bounds

  const paths = useMemo(
    () =>
      Object.entries(current.moves ?? {})
        .filter(([, m]) => m.path.length)
        .map(([id, m]) => ({ id, own: id === own?.id, pts: pathPoints(base.poses[id], m.path) })),
    [current, base, own],
  )

  useEffect(() => {
    let raf = 0
    const draw = (now: number) => {
      const f = clock.now()
      const on = Math.floor(now / 380) % 2 === 0
      for (const a of actors) {
        const el = actorEls.current[a.id]
        if (!el) continue
        const af = f.actors[a.id]
        el.setAttribute('transform', transformOf(af.pose))
        const blink: Blink = af.blink
        el.querySelectorAll<SVGElement>('[data-blink]').forEach((b) => {
          const side = b.dataset.blink
          b.style.visibility = on && (blink === 'hazard' || blink === side) ? 'visible' : 'hidden'
        })
        if (a.kind === 'own') {
          const beam = el.querySelector('[data-beam]')
          const len = world.night ? BEAM[f.controls.lights] : 0
          if (beam && beam.getAttribute('data-len') !== String(len)) {
            beam.setAttribute('data-len', String(len))
            const y = -CAR.front
            beam.setAttribute('d', len ? `M-0.7 ${y} L0.7 ${y} L${len * 0.14 + 0.7} ${y - len} L${-len * 0.14 - 0.7} ${y - len} Z` : '')
          }
          const angle = toDeg(wheelAngle(af.segment))
          el.querySelectorAll('[data-wheels] rect').forEach((r) => {
            const x = Number(r.getAttribute('data-x'))
            r.setAttribute('transform', `rotate(${angle} ${x} ${-CAR.wheelbase})`)
          })
        }
        if (a.kind === 'ambulance') el.querySelector('[data-siren]')?.setAttribute('fill', Math.floor(now / 160) % 2 ? '#1e3a8a' : '#60a5fa')
      }
      svg.current?.querySelectorAll<SVGGElement>('[data-light]').forEach((g) => {
        const state = f.signals[g.dataset.light!] ?? 'red'
        const lit = lampsLit(state)
        g.querySelectorAll<SVGCircleElement>('[data-lamp]').forEach((c) => {
          const lamp = c.dataset.lamp as 'red' | 'yellow' | 'green'
          const flashOff = state === 'flashing_yellow' && !on
          c.setAttribute('fill', lit[lamp] && !flashOff ? LAMP_ON[lamp] : LAMP_OFF)
        })
      })
      svg.current?.querySelectorAll<SVGGElement>('[data-gap]').forEach((g) => {
        const [ia, ib] = g.dataset.gap!.split('|')
        const A = actors.find((x) => x.id === ia)
        const B = actors.find((x) => x.id === ib)
        if (!A || !B) return
        const gap = bodyGap(A.kind, f.actors[ia].pose, B.kind, f.actors[ib].pose)
        const line = g.querySelector('line')
        line?.setAttribute('x1', String(gap.from[0]))
        line?.setAttribute('y1', String(gap.from[1]))
        line?.setAttribute('x2', String(gap.to[0]))
        line?.setAttribute('y2', String(gap.to[1]))
        const text = g.querySelector('text')
        if (text) {
          text.setAttribute('x', String((gap.from[0] + gap.to[0]) / 2 + 0.8))
          text.setAttribute('y', String((gap.from[1] + gap.to[1]) / 2))
          text.textContent = `${gap.d.toLocaleString('hu-HU', { maximumFractionDigits: 1 })} m`
        }
      })
      // Követő nézet: a kocsi a kép alsó harmadában, előtte több látszik
      if (world.view && own && svg.current) {
        const [vw, vh] = world.view
        const p = f.actors[own.id].pose
        const [cx, cz] = carToWorld(p, vh * 0.18, 0)
        const x = Math.min(Math.max(cx - vw / 2, w), Math.max(w, e - vw))
        const z = Math.min(Math.max(cz - vh / 2, n), Math.max(n, s - vh))
        svg.current.setAttribute('viewBox', `${x} ${z} ${Math.min(vw, e - w)} ${Math.min(vh, s - n)}`)
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [clock, actors, own, world.view, world.night, w, n, e, s])

  const f0 = clock.now()
  const viewBox = world.view ? `${w} ${n} ${Math.min(world.view[0], e - w)} ${Math.min(world.view[1], s - n)}` : `${w} ${n} ${e - w} ${s - n}`
  const colour = PHASE_COLOR[current.phase]
  // Feliratméret: a látható szélesség kb. 1/24-e, 0,7 és 2,2 m között
  const viewW = world.view ? Math.min(world.view[0], e - w) : e - w
  const fontSize = Math.min(2.2, Math.max(0.7, viewW / 24))

  return (
    <svg ref={svg} viewBox={viewBox} className={`maneuver-diagram fault-diagram ${className ?? ''}`} style={{ '--fd-fs': `${fontSize}px` } as React.CSSProperties} role="img" aria-label={`${lesson.code} felülnézetben`}>
      <rect x={w - 50} y={n - 50} width={e - w + 100} height={s - n + 100} fill="#cfe3c6" />
      {(world.buildings ?? []).map((b, i) => (
        <rect key={`b${i}`} x={b.x - b.w / 2} y={b.z - b.d / 2} width={b.w} height={b.d} fill="#d8d2c4" stroke="#b9b2a2" strokeWidth={0.1} />
      ))}
      {world.asphalt.map((r, i) => (
        <SiteBox key={`a${i}`} r={r} fill="#6b7280" />
      ))}
      {world.sidewalks.map((r, i) => (
        <SiteBox key={`s${i}`} r={r} fill="#d1d5db" />
      ))}
      {world.markings.map((r, i) => (
        <SiteBox key={`m${i}`} r={r} fill="#f9fafb" />
      ))}
      {world.night && <rect x={w - 50} y={n - 50} width={e - w + 100} height={s - n + 100} fill="#0b1220" fillOpacity={0.55} />}
      {(world.puddles ?? []).map((r, i) => (
        <ellipse key={`p${i}`} cx={r.x} cy={r.z} rx={r.w / 2} ry={r.d / 2} fill="#60a5fa" fillOpacity={0.55} />
      ))}
      {(current.marks ?? []).map((m, i) =>
        m.kind === 'zone' ? (
          <g key={`z${i}`}>
            <rect
              x={m.rect.x - m.rect.w / 2}
              y={m.rect.z - m.rect.d / 2}
              width={m.rect.w}
              height={m.rect.d}
              fill={m.bad ? '#dc2626' : '#16a34a'}
              fillOpacity={0.28}
              stroke={m.bad ? '#dc2626' : '#16a34a'}
              strokeWidth={0.1}
              strokeDasharray="0.4 0.25"
            />
            {m.label && (
              <text x={m.rect.x} y={m.rect.z - m.rect.d / 2 - 0.4} className="fd-label" textAnchor="middle" fill={m.bad ? '#b91c1c' : '#15803d'}>
                {m.label}
              </text>
            )}
          </g>
        ) : null,
      )}
      {paths.map((p) => (
        <polyline
          key={p.id}
          points={p.pts}
          fill="none"
          stroke={p.own ? colour : '#111827'}
          strokeOpacity={p.own ? 0.85 : 0.35}
          strokeWidth={p.own ? 0.22 : 0.12}
          strokeDasharray={p.own ? undefined : '0.5 0.35'}
        />
      ))}
      {(world.signs ?? []).map((sg, i) => (
        <g key={`sg${i}`}>
          <circle cx={sg.x} cy={sg.z} r={0.12} fill="#4b5563" />
          <SignGlyph code={sg.code} size={1.9} x={sg.x + (sg.x >= 0 ? 1.1 : -1.1)} y={sg.z} />
        </g>
      ))}
      {(world.lights ?? []).map((l, i) => (
        <g key={`l${i}`} data-light={l.id} transform={`translate(${l.x + 0.6} ${l.z})`}>
          <rect x={-0.42} y={-1.15} width={0.84} height={2.3} rx={0.2} fill="#111827" />
          {(['red', 'yellow', 'green'] as const).map((c, j) => (
            <circle key={c} data-lamp={c} cy={-0.72 + j * 0.72} r={0.28} fill={LAMP_OFF} />
          ))}
        </g>
      ))}
      {actors.map((a) => {
        const spots = blinkSpots(a)
        return (
          <g
            key={a.id}
            ref={(el) => {
              actorEls.current[a.id] = el
            }}
            transform={transformOf(f0.actors[a.id].pose)}
          >
            <ActorShape a={a} />
            {(['left', 'right'] as const).map((side) =>
              spots[side].map(([x, y], i) => <circle key={`${side}${i}`} data-blink={side} cx={x} cy={y} r={0.22} fill="#f59e0b" style={{ visibility: 'hidden' }} />),
            )}
          </g>
        )
      })}
      {(current.marks ?? []).map((m, i) =>
        m.kind === 'gap' ? (
          <g key={`g${i}`} data-gap={`${m.a}|${m.b}`}>
            <line stroke={m.bad ? '#dc2626' : '#16a34a'} strokeWidth={0.14} strokeDasharray="0.3 0.2" />
            <text className="fd-label" fill={m.bad ? '#b91c1c' : '#15803d'} />
          </g>
        ) : m.kind === 'label' ? (
          <text key={`t${i}`} x={m.at[0]} y={m.at[1]} className="fd-label" textAnchor="middle" fill={m.bad ? '#b91c1c' : '#15803d'}>
            {m.text}
          </text>
        ) : null,
      )}
    </svg>
  )
}
