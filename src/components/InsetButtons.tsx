/** A kis betétablak gombjai a jobb felső sarkában: elrejtés (–) és nagyba (⤢) */
export function InsetButtons({ swapLabel, onSwap, onHide }: { swapLabel: string; onSwap: () => void; onHide: () => void }) {
  return (
    <>
      <button className="pane-hide" onClick={onHide} aria-label="Kis ablak elrejtése" title="Elrejtés">
        –
      </button>
      <button className="pane-swap" onClick={onSwap} aria-label={swapLabel}>
        ⤢
      </button>
    </>
  )
}

/** Az elrejtett betétablak visszahozása; ott van, ahol alaphelyzetben a betét */
export function InsetShow({ label, onShow }: { label: string; onShow: () => void }) {
  return (
    <button className="inset-show" onClick={onShow} aria-label={`${label} megjelenítése kis ablakban`}>
      ▣ {label}
    </button>
  )
}
