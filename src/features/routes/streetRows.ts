import type { StreetRow } from '../../domain/types'

/** Szerkeszthető utcasor (a React-listához azonosítóval) */
export interface EditableRow extends StreetRow {
  id: string
}

export const newRow = (town = '', street = ''): EditableRow => ({ id: crypto.randomUUID(), town, street })
