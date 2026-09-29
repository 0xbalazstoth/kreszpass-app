import Dexie, { type Table } from 'dexie'
import type { OsmData } from './data/osm'
import { DEFAULT_SETTINGS, type ExamSession, type Route, type Settings, type Situation, type SituationCard } from './domain/types'

export interface OsmCacheEntry {
  key: string
  data: OsmData
  at: number
}

class KreszDb extends Dexie {
  routes!: Table<Route, string>
  situations!: Table<Situation, string>
  sessions!: Table<ExamSession, string>
  cards!: Table<SituationCard, string>
  settings!: Table<Settings, string>
  osmCache!: Table<OsmCacheEntry, string>

  constructor() {
    super('kreszpass')
    this.version(1).stores({
      routes: 'id, updatedAt',
      situations: 'id, routeId, [routeId+d]',
      sessions: 'id, routeId, startedAt',
      cards: 'situationId, routeId, card.due',
      settings: 'id',
      osmCache: 'key, at',
    })
  }
}

export const db = new KreszDb()

export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get('settings')
  return { ...DEFAULT_SETTINGS, ...s }
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const cur = await getSettings()
  await db.settings.put({ ...cur, ...patch, id: 'settings' })
}

export async function deleteRoute(routeId: string): Promise<void> {
  await db.transaction('rw', [db.routes, db.situations, db.cards, db.sessions], async () => {
    await db.routes.delete(routeId)
    await db.situations.where('routeId').equals(routeId).delete()
    await db.cards.where('routeId').equals(routeId).delete()
    await db.sessions.where('routeId').equals(routeId).delete()
  })
}

export async function replaceSituations(routeId: string, list: Situation[]): Promise<void> {
  await db.transaction('rw', [db.situations, db.cards], async () => {
    await db.situations.where('routeId').equals(routeId).delete()
    await db.cards.where('routeId').equals(routeId).delete()
    await db.situations.bulkPut(list)
  })
}

export async function situationsOf(routeId: string): Promise<Situation[]> {
  return db.situations.where('[routeId+d]').between([routeId, Dexie.minKey], [routeId, Dexie.maxKey]).toArray()
}
