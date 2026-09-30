import { useEffect, useRef } from 'react'
import { parseStreetList } from '../../data/streetRoute'
import type { StreetRow } from '../../domain/types'
import { newRow, type EditableRow } from './streetRows'

interface Props {
  rows: EditableRow[]
  onChange: (rows: EditableRow[]) => void
  disabled?: boolean
}

/**
 * Utcalista soronként: bal oldalt a település/kerület, jobbra az utca vagy útszám. Az üres település a fölötte
 * lévő soré (a helyőrző mutatja), így csak akkor kell újra beírni, ha az útvonal átlép egy másik településre.
 * Enter új sort nyit; több utca beillesztése (új sor, gondolatjel, vessző) több sorra bomlik.
 */
export function StreetRowsEditor({ rows, onChange, disabled }: Props) {
  const inputs = useRef(new Map<string, HTMLInputElement>())
  /** Az újonnan nyitott sor utcamezője kapja a fókuszt, amint megjelenik */
  const focusNext = useRef<string | null>(null)
  useEffect(() => {
    if (!focusNext.current) return
    inputs.current.get(focusNext.current)?.focus()
    focusNext.current = null
  }, [rows])
  const setFocusId = (id: string) => {
    focusNext.current = id
  }

  const inherited = (i: number) => {
    for (let j = i - 1; j >= 0; j--) if (rows[j].town.trim()) return rows[j].town.trim()
    return ''
  }
  const update = (id: string, patch: Partial<StreetRow>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const insertAfter = (i: number, added: EditableRow[]) => onChange([...rows.slice(0, i + 1), ...added, ...rows.slice(i + 1)])
  const remove = (i: number) => onChange(rows.length > 1 ? rows.filter((_, j) => j !== i) : [newRow()])
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= rows.length) return
    const next = [...rows]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }

  return (
    <div className="street-rows" role="group" aria-label="Utcák sorrendben">
      <div className="street-row street-head" aria-hidden>
        <span />
        <span>Település / kerület</span>
        <span>Utca, út</span>
        <span />
      </div>
      {rows.map((r, i) => {
        const from = inherited(i)
        return (
          <div className="street-row" key={r.id}>
            <span className="row-no">{i + 1}.</span>
            <input
              value={r.town}
              onChange={(e) => update(r.id, { town: e.target.value })}
              placeholder={i === 0 || !from ? 'pl. Budapest XI. ker.' : from}
              aria-label={`${i + 1}. sor települése`}
              title={i > 0 && from && !r.town ? `Üresen hagyva: ${from}` : undefined}
              disabled={disabled}
            />
            <input
              ref={(el) => {
                if (el) inputs.current.set(r.id, el)
                else inputs.current.delete(r.id)
              }}
              value={r.street}
              onChange={(e) => update(r.id, { street: e.target.value })}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                const added = newRow()
                insertAfter(i, [added])
                setFocusId(added.id)
              }}
              onPaste={(e) => {
                const parts = parseStreetList(e.clipboardData.getData('text'))
                if (parts.length < 2) return
                e.preventDefault()
                const [first, ...rest] = parts
                const added = rest.map((street) => newRow('', street))
                onChange([...rows.slice(0, i), { ...r, street: first }, ...added, ...rows.slice(i + 1)])
                setFocusId(added[added.length - 1].id)
              }}
              placeholder={i === 0 ? 'pl. Budaörsi út' : i === 1 ? 'pl. Villányi út' : 'utca, út vagy útszám'}
              aria-label={`${i + 1}. utca`}
              disabled={disabled}
            />
            <span className="row-tools">
              <button type="button" className="icon-btn" onClick={() => move(i, -1)} disabled={disabled || i === 0} aria-label="Feljebb">
                ↑
              </button>
              <button type="button" className="icon-btn" onClick={() => move(i, 1)} disabled={disabled || i === rows.length - 1} aria-label="Lejjebb">
                ↓
              </button>
              <button type="button" className="icon-btn" onClick={() => remove(i)} disabled={disabled} aria-label="Sor törlése">
                ×
              </button>
            </span>
          </div>
        )
      })}
      <button
        type="button"
        className="btn small"
        onClick={() => {
          const added = newRow()
          onChange([...rows, added])
          setFocusId(added.id)
        }}
        disabled={disabled}
      >
        + Utca hozzáadása
      </button>
    </div>
  )
}
