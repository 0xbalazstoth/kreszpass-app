import { SIGN_BY_CODE, signUrl } from '../data/signs'

interface GlyphProps {
  code: string
  size?: number
  /** SVG-n belüli középpont */
  x?: number
  y?: number
}

/** Valódi KRESZ tábla SVG-n belül (a felülnézeti vázlathoz) */
export function SignGlyph({ code, size = 40, x = 0, y = 0 }: GlyphProps) {
  return (
    <image
      href={signUrl(code)}
      x={x - size / 2}
      y={y - size / 2}
      width={size}
      height={size}
      preserveAspectRatio="xMidYMid meet"
      aria-label={SIGN_BY_CODE.get(code)?.name}
    />
  )
}

interface IconProps {
  code: string
  size?: number
  className?: string
}

/** Valódi KRESZ tábla önálló képként */
export function SignIcon({ code, size = 40, className }: IconProps) {
  const name = SIGN_BY_CODE.get(code)?.name ?? code
  return (
    <img
      src={signUrl(code)}
      width={size}
      height={size}
      alt={name}
      title={name}
      className={`sign-icon ${className ?? ''}`}
      loading="lazy"
      decoding="async"
    />
  )
}
