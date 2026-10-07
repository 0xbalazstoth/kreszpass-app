import type { Phase } from '../../domain/faults/types'

/** A lépések szerepe szövegesen (a lépéslistán és a nézet fölötti szalagon) */
export const PHASE_LABEL: Record<Phase, string> = { setup: 'Helyzet', wrong: 'Hibás', right: 'Helyes', step: 'Lépés' }
