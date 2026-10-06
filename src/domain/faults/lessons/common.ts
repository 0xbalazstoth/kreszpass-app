import type { Pose } from '../../maneuvers/geometry'
import type { Actor, ActorKind } from '../types'
import type { World } from '../types'
import { junction, LANE, myLights, STOP_Z, withWorld } from '../world'

/** A saját autó színe (mint a manővereknél) */
export const OWN_COLOR = '#2563eb'
export const PARTNER_COLORS = ['#dc2626', '#0f766e', '#f8fafc', '#111827', '#65a30d', '#f59e0b', '#7c3aed', '#9ca3af']

/** Irányok (radián): 0 = észak, a többi jobbra forogva */
export const N = 0
export const E = Math.PI / 2
export const S = Math.PI
export const W = -Math.PI / 2

/** A mi sávunk közepe és a szembejövő sáv közepe (x) */
export const MY_X = LANE / 2
export const ONCOMING_X = -LANE / 2

export const pose = (x: number, z: number, heading = N): Pose => ({ x, z, heading })

/** A saját autó a mi sávunkban, a z helyen (hátsó tengely), észak felé */
export const me = (z: number, x = MY_X, heading = N): Actor => ({ id: 'me', kind: 'own', color: OWN_COLOR, start: pose(x, z, heading) })

export const actor = (id: string, kind: ActorKind, start: Pose, color?: string): Actor => ({ id, kind, start, color })

/** Az autó első lökhárítója és a hátsó tengely távolsága (a megállási pontok számolásához) */
export const FRONT = 3.55

/** Jobbra kanyarodás a kereszteződésben: a hátsó tengely íve a mi sávunkból a keleti ág jobb sávjába */
export const RIGHT_R = 6
/** Ahol a jobbra kanyarodás íve kezdődik (a hátsó tengely z helye) */
export const rightTurnZ = (R = RIGHT_R) => LANE / 2 + R
/** Balra kanyarodás: nagyobb íven, a kereszteződés közepét jobbról megkerülve, a nyugati ág jobb sávjába */
export const LEFT_R = 9.5
export const leftTurnZ = (R = LEFT_R) => R - LANE / 2

/** A stopvonal előtt itt áll meg a hátsó tengely: az első lökhárító fél méterrel a vonal előtt */
export const STOP_AT = STOP_Z + FRONT + 0.5

/** Lámpás kereszteződés, a mi águnk hosszan (a lassítás, megállás, indulás hibáinak közös helyszíne) */
export const redLightWorld = (): World => withWorld(junction({ arm: 85, myLine: 'stop' }), { lights: myLights('L'), bounds: [-14, -40, 14, 85], view: [28, 46] })
