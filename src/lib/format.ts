export function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m)} m`
}

export function formatSeconds(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '–'
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('hu-HU', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function percent(part: number, total: number): string {
  return total ? `${Math.round((part / total) * 100)}%` : '–'
}
