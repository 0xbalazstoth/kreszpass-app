import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const KEY = 'kreszpass.insetPos'
const HIDDEN_KEY = 'kreszpass.insetHidden'
/** Ennyi pixel elmozdulás után indul a húzás (alatta koppintásnak számít) */
const THRESHOLD = 6
/** A betétablak ennyire marad a nézet szélétől */
const MARGIN = 8

/** A betétablak helye a szabad terület arányában (0 = bal/felső, 1 = jobb/alsó szél) */
interface Pos {
  fx: number
  fy: number
}

function loadPos(): Pos | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    return v && typeof v.fx === 'number' && typeof v.fy === 'number' ? v : null
  } catch {
    return null
  }
}

function savePos(pos: Pos) {
  try {
    localStorage.setItem(KEY, JSON.stringify(pos))
  } catch {
    // privát ablakban nincs tároló: akkor csak erre a látogatásra marad meg
  }
}

function loadHidden(): boolean {
  try {
    return localStorage.getItem(HIDDEN_KEY) === '1'
  } catch {
    return false
  }
}

function saveHidden(hidden: boolean) {
  try {
    localStorage.setItem(HIDDEN_KEY, hidden ? '1' : '0')
  } catch {
    // privát ablakban nincs tároló
  }
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** A bal felső sarok mozgástere a nézeten belül */
function room(box: HTMLElement, el: HTMLElement) {
  return { w: Math.max(0, box.clientWidth - el.offsetWidth - 2 * MARGIN), h: Math.max(0, box.clientHeight - el.offsetHeight - 2 * MARGIN) }
}

function setPlace(el: HTMLElement, left: string, top: string, edge: string) {
  el.style.left = left
  el.style.top = top
  el.style.right = edge
  el.style.bottom = edge
}

/** A mostani betétablakot a megjegyzett helyre teszi; a nagy nézetről (csere után) leveszi a kézi helyet */
function place(box: HTMLElement, pos: Pos | null) {
  for (const el of box.querySelectorAll<HTMLElement>(':scope > .pane')) {
    if (!pos || !el.classList.contains('pane-inset')) {
      setPlace(el, '', '', '')
      continue
    }
    const r = room(box, el)
    setPlace(el, `${MARGIN + pos.fx * r.w}px`, `${MARGIN + pos.fy * r.h}px`, 'auto')
  }
}

/**
 * A nézet kis betétablaka (`.pane-inset`) egérrel vagy ujjal áthúzható a nézeten belül. A helyét a szabad terület
 * arányában jegyzi meg, így átméretezésnél, nézetcserénél és a többi oldalon is ott marad, ahová tették.
 * El is rejthető (ezt is megjegyzi). A `ref` a `.drive-visual` konténerre kerül, rejtve az `inset-hidden` osztállyal.
 */
export function useDraggableInset<T extends HTMLElement>() {
  const [box, setBox] = useState<T | null>(null)
  const [hidden, setHiddenState] = useState(loadHidden)
  const pos = useRef<Pos | null>(loadPos())
  const setHidden = (h: boolean) => {
    setHiddenState(h)
    saveHidden(h)
  }

  // Minden rajzolás után (pl. nézetcsere): a betét a helyére, a nagy nézet a teljes területre
  useLayoutEffect(() => {
    if (box) place(box, pos.current)
  })

  useEffect(() => {
    if (!box) return
    const ro = new ResizeObserver(() => place(box, pos.current))
    ro.observe(box)

    let drag: { id: number; x: number; y: number; left: number; top: number; el: HTMLElement; moved: boolean } | null = null
    let suppressClickUntil = 0

    const down = (e: PointerEvent) => {
      if (e.button !== 0) return
      const target = e.target as Element
      const el = target.closest<HTMLElement>('.pane-inset')
      if (!el || el.parentElement !== box || target.closest('button, a, input, select')) return
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, left: el.offsetLeft, top: el.offsetTop, el, moved: false }
    }
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return
      const dx = e.clientX - drag.x
      const dy = e.clientY - drag.y
      if (!drag.moved) {
        if (Math.hypot(dx, dy) < THRESHOLD) return
        drag.moved = true
        drag.el.classList.add('dragging')
      }
      const r = room(box, drag.el)
      const next = { fx: r.w ? clamp01((drag.left + dx - MARGIN) / r.w) : 0, fy: r.h ? clamp01((drag.top + dy - MARGIN) / r.h) : 0 }
      pos.current = next
      setPlace(drag.el, `${MARGIN + next.fx * r.w}px`, `${MARGIN + next.fy * r.h}px`, 'auto')
    }
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return
      if (drag.moved) {
        drag.el.classList.remove('dragging')
        if (pos.current) savePos(pos.current)
        suppressClickUntil = performance.now() + 300
      }
      drag = null
    }
    // A húzás végén ne fusson le a betét kattintása (pl. a felülnézet kattintható elemei)
    const click = (e: MouseEvent) => {
      if (performance.now() < suppressClickUntil) {
        e.stopPropagation()
        e.preventDefault()
      }
    }

    box.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    box.addEventListener('click', click, true)
    return () => {
      ro.disconnect()
      box.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      box.removeEventListener('click', click, true)
    }
  }, [box])

  return { ref: setBox, hidden, setHidden }
}
