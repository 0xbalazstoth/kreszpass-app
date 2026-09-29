import { useEffect, useRef, useState } from 'react'
import { fetchImages } from '../../data/mapillary'
import { DEFAULT_SETTINGS, type Settings } from '../../domain/types'
import { db, getSettings, saveSettings } from '../../db'
import { bboxOf } from '../../lib/geo'

interface Backup {
  app: 'kreszpass'
  version: 1
  exportedAt: number
  routes: unknown[]
  situations: unknown[]
  sessions: unknown[]
  cards: unknown[]
}

export function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [confirmWipe, setConfirmWipe] = useState(false)
  const file = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getSettings().then(setS)
  }, [])

  if (!s) return <p className="muted">Betöltés…</p>

  const set = (patch: Partial<Settings>) => setS({ ...s, ...patch })
  const valid = s.okMs > 0 && s.lateMs > s.okMs && s.timeoutMs > s.lateMs && s.frameMs >= 200

  async function save() {
    if (!valid || !s) {
      setMsg({ kind: 'error', text: 'Az időküszöböknek növekvő sorrendben kell lenniük.' })
      return
    }
    await saveSettings(s)
    setMsg({ kind: 'ok', text: 'Elmentve.' })
  }

  async function testToken() {
    setMsg(null)
    try {
      // Budapest, Deák tér környéke
      const imgs = await fetchImages(s!.mapillaryToken.trim(), bboxOf([[19.0535, 47.4975]], 150))
      setMsg({ kind: 'ok', text: `A token működik (${imgs.length} kép a tesztterületen).` })
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : String(e) })
    }
  }

  async function exportData() {
    const backup: Backup = {
      app: 'kreszpass',
      version: 1,
      exportedAt: Date.now(),
      routes: await db.routes.toArray(),
      situations: await db.situations.toArray(),
      sessions: await db.sessions.toArray(),
      cards: await db.cards.toArray(),
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `kreszpass-mentes-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function importData(f: File) {
    try {
      const b = JSON.parse(await f.text()) as Backup
      if (b.app !== 'kreszpass' || b.version !== 1) throw new Error('Ez nem KreszPass mentés')
      // A dátumok JSON-ból szövegként jönnek vissza
      const cards = (b.cards as Array<{ card: Record<string, unknown> }>).map((c) => ({
        ...c,
        card: { ...c.card, due: new Date(c.card.due as string), last_review: c.card.last_review ? new Date(c.card.last_review as string) : undefined },
      }))
      await db.transaction('rw', [db.routes, db.situations, db.sessions, db.cards], async () => {
        await db.routes.bulkPut(b.routes as never[])
        await db.situations.bulkPut(b.situations as never[])
        await db.sessions.bulkPut(b.sessions as never[])
        await db.cards.bulkPut(cards as never[])
      })
      setMsg({ kind: 'ok', text: `Visszatöltve: ${b.routes.length} útvonal, ${b.sessions.length} munkamenet.` })
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : String(e) })
    }
  }

  async function wipe() {
    await Promise.all([db.routes.clear(), db.situations.clear(), db.sessions.clear(), db.cards.clear(), db.osmCache.clear()])
    setConfirmWipe(false)
    setMsg({ kind: 'ok', text: 'Minden adat törölve.' })
  }

  return (
    <section className="settings">
      <h1>Beállítások</h1>

      <div className="card">
        <h2>Mapillary utcakép (ingyenes)</h2>
        <p className="hint">
          Regisztrálj a mapillary.com oldalon, majd a Dashboard → Developers menüben hozz létre egy alkalmazást. A „Client Token”
          értékét másold ide. Token nélkül a gyakorlás térképpel és felülnézeti vázlattal működik.
        </p>
        <label>
          Client token
          <input
            value={s.mapillaryToken}
            onChange={(e) => {
              const v = e.target.value.trim()
              set({ mapillaryToken: v })
              void saveSettings({ mapillaryToken: v })
            }}
            placeholder="MLY|…"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <div className="actions">
          <button className="btn" onClick={testToken} disabled={!s.mapillaryToken}>
            Token tesztelése
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Időküszöbök</h2>
        <p className="hint">
          Ezek döntik el, mikor számít a helyes válasz késésnek (6/4) vagy lassú felismerésnek (6/2). Ahogy gyorsulsz, szigoríts rajtuk.
        </p>
        <div className="field-grid">
          <label>
            Időben (ms-ig)
            <input type="number" min={500} step={250} value={s.okMs} onChange={(e) => set({ okMs: Number(e.target.value) })} />
          </label>
          <label>
            Kissé késve, 6/4 (ms-ig)
            <input type="number" min={500} step={250} value={s.lateMs} onChange={(e) => set({ lateMs: Number(e.target.value) })} />
          </label>
          <label>
            Időkorlát, utána 8/25 (ms)
            <input type="number" min={1000} step={500} value={s.timeoutMs} onChange={(e) => set({ timeoutMs: Number(e.target.value) })} />
          </label>
          <label>
            Utcakép képkocka ideje (ms)
            <input type="number" min={200} step={100} value={s.frameMs} onChange={(e) => set({ frameMs: Number(e.target.value) })} />
          </label>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={save} disabled={!valid}>
            Mentés
          </button>
          <button className="btn" onClick={() => setS({ ...DEFAULT_SETTINGS, mapillaryToken: s.mapillaryToken })}>
            Alapértékek
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Adatok</h2>
        <p className="hint">
          Minden adat csak ebben a böngészőben tárolódik. Másik eszközre mentéssel és visszatöltéssel viheted át.
        </p>
        <div className="actions">
          <button className="btn" onClick={exportData}>
            Mentés fájlba
          </button>
          <button className="btn" onClick={() => file.current?.click()}>
            Visszatöltés fájlból
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) importData(f)
              e.target.value = ''
            }}
          />
          {confirmWipe ? (
            <span className="confirm">
              Minden útvonal és eredmény törlődik.{' '}
              <button className="btn danger" onClick={wipe}>
                Igen, mindent törlök
              </button>{' '}
              <button className="btn" onClick={() => setConfirmWipe(false)}>
                Mégse
              </button>
            </span>
          ) : (
            <button className="btn ghost" onClick={() => setConfirmWipe(true)}>
              Minden adat törlése
            </button>
          )}
        </div>
      </div>

      {msg && <p className={`status ${msg.kind}`}>{msg.text}</p>}

      <div className="card">
        <h2>Források</h2>
        <p className="hint">
          Térkép: © OpenStreetMap közreműködők, OpenFreeMap. Útvonaltervezés: OSRM demó szerver. Utcakép: Mapillary (CC BY-SA). Minden
          szolgáltatás ingyenes. Kérjük, ne terheld őket feleslegesen: az OpenStreetMap-lekérdezések eredményét a program két hétig
          helyben tárolja.
        </p>
      </div>
    </section>
  )
}
