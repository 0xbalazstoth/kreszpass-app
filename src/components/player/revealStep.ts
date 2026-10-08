/**
 * Az aktív lépést a lépéslista görgethető paneljén láthatóvá teszi: ha az eleje nem látszik, a ragadós fejléc
 * (`.player-head`: gombok, státusz) alá görget. Telefonon a panel kicsi, a lépés gyakran magasabb nála.
 */
export function revealStep(item: HTMLElement) {
  const panel = item.closest<HTMLElement>('.drive-side')
  if (!panel) return
  const head = panel.querySelector<HTMLElement>('.player-head')
  const box = panel.getBoundingClientRect()
  const top = head && getComputedStyle(head).position === 'sticky' ? head.getBoundingClientRect().bottom : box.top
  const r = item.getBoundingClientRect()
  // Látszik az eleje, és vagy egészen belefér, vagy úgysem férne be: nem kell görgetni
  if (r.top >= top && (r.bottom <= box.bottom || r.top < box.bottom - 80)) return
  panel.scrollBy({ top: r.top - top - 6, behavior: 'smooth' })
}
