import type { Look } from '../../domain/maneuvers/types'

/** Merre néz a vezető, szövegesen */
export const LOOK_LABEL: Record<Look, string> = {
  ahead: 'előre',
  down: 'le, a váltóra',
  left: 'balra',
  right: 'jobbra',
  mirror_left: 'bal tükör',
  mirror_right: 'jobb tükör',
  mirror_inner: 'belső tükör',
  shoulder_left: 'hátra, a bal váll fölött',
  shoulder_right: 'hátra, a jobb váll fölött',
  back: 'hátra, a hátsó ablakon át',
}
