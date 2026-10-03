import type { Look } from '../../domain/maneuvers/types'
import type { SimAction } from '../sim'
import type { Controls } from '../vehicle'

/**
 * Billentyűzetes vezetés. A gáz, a fék és a kormány fokozatosan fut fel (mint egy valódi pedál és kormány), a kormány
 * elengedve visszaáll középre. Tükör és vállon át nézés: amíg a gomb le van nyomva.
 *
 *   W / ↑      gáz             S / ↓      fék
 *   A / ←      balra           D / →      jobbra
 *   Q / E      index balra / jobbra (újra nyomva kikapcsol)
 *   H          vészvillogó     Szóköz     kézifék      R  előre / hátra (álló helyzetben)
 *   1 / 2 / 3  bal / belső / jobb tükör   Z / C  vállon át balra / jobbra
 */

export const KEY_HELP: Array<[string, string]> = [
  ['W / ↑', 'gáz'],
  ['S / ↓', 'fék'],
  ['A D / ← →', 'kormány'],
  ['Q / E', 'index balra / jobbra'],
  ['1 2 3', 'bal, belső, jobb tükör'],
  ['Z / C', 'hátranézés balra / jobbra'],
  ['Szóköz', 'kézifék'],
  ['R', 'előre / hátra'],
  ['H', 'vészvillogó'],
  ['V', 'nézet'],
  ['Esc', 'szünet'],
]

const ACTION_KEYS: Record<string, SimAction> = {
  KeyQ: 'indicator_left',
  KeyE: 'indicator_right',
  KeyH: 'hazard',
  KeyR: 'gear',
  Space: 'handbrake',
}

const LOOK_KEYS: Record<string, Look> = {
  Digit1: 'mirror_left',
  Digit2: 'mirror_inner',
  Digit3: 'mirror_right',
  KeyZ: 'shoulder_left',
  KeyC: 'shoulder_right',
}

/** A kormány kitérésének sebessége (teljes kitérés / s) lenyomva, és visszatérése elengedve */
const STEER_RATE = 1.6
const RETURN_RATE = 3
const PEDAL_RATE = 3

/**
 * A billentyű neve a rajta lévő betű szerint (a magyar QWERTZ billentyűzeten a Z és az Y helyet cserél, a fizikai
 * helyet jelentő `code` ott Y-t mondana a Z-re). Betűn és számon kívül (nyilak, Szóköz, Esc) a fizikai hely számít.
 */
function keyName(e: KeyboardEvent): string {
  if (/^[a-z]$/i.test(e.key)) return `Key${e.key.toUpperCase()}`
  if (/^[0-9]$/.test(e.key)) return `Digit${e.key}`
  return e.code
}

export class KeyboardInput {
  private down = new Set<string>()
  /** Lenyomott fizikai billentyű → a neve lenyomáskor (felengedéskor ugyanazt vesszük ki, ha közben a Shift változott) */
  private names = new Map<string, string>()
  private actions: SimAction[] = []
  private ui: string[] = []
  private ctl: Controls = { throttle: 0, brake: 0, steer: 0, handbrake: false }

  onKeyDown = (e: KeyboardEvent): void => {
    // Szövegmezőben gépelés nem vezetés
    if (/^(INPUT|SELECT|TEXTAREA)$/.test((e.target as Element | null)?.tagName ?? '')) return
    // Böngésző- és rendszer-gyorsbillentyűk (Cmd/Ctrl + betű) maradjanak a böngészőé
    if (e.metaKey || e.ctrlKey) return
    const k = keyName(e)
    if (k in ACTION_KEYS || k in LOOK_KEYS || /^(Arrow|Key[WASD]|Space)/.test(k)) e.preventDefault()
    if (e.repeat) return
    this.names.set(e.code, k)
    this.down.add(k)
    const a = ACTION_KEYS[k]
    if (a) this.actions.push(a)
    if (k === 'KeyV' || k === 'Escape') this.ui.push(k)
  }

  onKeyUp = (e: KeyboardEvent): void => {
    const k = this.names.get(e.code) ?? keyName(e)
    this.names.delete(e.code)
    this.down.delete(k)
    // A Mac a Cmd lenyomása alatt felengedett betűkről nem szól: a Cmd elengedésekor mindent felengedünk
    if (e.key === 'Meta') this.onBlur()
  }

  /** Ablakváltáskor minden billentyű „felengedett” (különben beragadna a gáz) */
  onBlur = (): void => {
    this.down.clear()
    this.names.clear()
  }

  attach(target: Window): () => void {
    target.addEventListener('keydown', this.onKeyDown)
    target.addEventListener('keyup', this.onKeyUp)
    target.addEventListener('blur', this.onBlur)
    return () => {
      target.removeEventListener('keydown', this.onKeyDown)
      target.removeEventListener('keyup', this.onKeyUp)
      target.removeEventListener('blur', this.onBlur)
    }
  }

  private has(...codes: string[]): boolean {
    return codes.some((c) => this.down.has(c))
  }

  sample(dt: number): Controls {
    const c = this.ctl
    const ramp = (v: number, want: number, up: number, down: number) => (want > v ? Math.min(want, v + up * dt) : Math.max(want, v - down * dt))
    const gas = this.has('KeyW', 'ArrowUp') ? 1 : 0
    const brake = this.has('KeyS', 'ArrowDown') ? 1 : 0
    const left = this.has('KeyA', 'ArrowLeft')
    const right = this.has('KeyD', 'ArrowRight')
    const want = left === right ? 0 : left ? -1 : 1
    let steer = c.steer
    if (want === 0) steer = ramp(steer, 0, RETURN_RATE, RETURN_RATE)
    else steer = ramp(steer, want, want * steer < 0 ? RETURN_RATE : STEER_RATE, want * steer < 0 ? RETURN_RATE : STEER_RATE)
    this.ctl = {
      throttle: ramp(c.throttle, gas, PEDAL_RATE, PEDAL_RATE * 2),
      brake: ramp(c.brake, brake, PEDAL_RATE * 1.5, PEDAL_RATE * 2),
      steer,
      handbrake: false,
    }
    return this.ctl
  }

  look(): Look {
    for (const [code, look] of Object.entries(LOOK_KEYS)) if (this.down.has(code)) return look
    return 'ahead'
  }

  takeActions(): SimAction[] {
    const a = this.actions
    this.actions = []
    return a
  }

  takeUi(): string[] {
    const u = this.ui
    this.ui = []
    return u
  }
}
