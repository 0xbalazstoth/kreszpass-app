import type { SituationKind } from '../../domain/types'

export const KIND_COLOR: Record<SituationKind, string> = {
  stop: '#b91c1c',
  give_way: '#ea580c',
  priority: '#ca8a04',
  equal: '#7c3aed',
  signals: '#15803d',
  roundabout: '#0369a1',
  crossing: '#0891b2',
  speed_change: '#be185d',
  rail_crossing: '#4b5563',
  tram_stop: '#d97706',
  bus_stop: '#2563eb',
  hazard: '#dc2626',
}

export const KIND_ORDER: SituationKind[] = ['stop', 'give_way', 'priority', 'equal', 'signals', 'roundabout', 'crossing', 'speed_change', 'rail_crossing', 'tram_stop', 'bus_stop']
