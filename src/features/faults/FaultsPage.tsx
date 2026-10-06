import { EVAL_BLOCKS, MAX_FAULT_LINES } from '../../domain/evalCodes'
import { codeSlug, lessonByCode } from '../../domain/faults'
import { href } from '../../lib/router'

/** A minősítő lap blokkjai és kódjai, mindegyikhez lépésenként lejátszható bemutató (a 7. blokk: Manőverek) */
export function FaultsPage() {
  return (
    <section className="maneuvers faults">
      <div className="card">
        <h1>Minősítő lap</h1>
        <p>
          A forgalmi vizsga minősítő lapjának (13/2014/03) minden hibája animációval. Mindegyik ugyanígy épül fel: először a helyzet, aztán a
          hibás végrehajtás, végül a helyes. Felülnézetben és a vezetőülésből is megnézheted, a műszerfalon pedig követheted a sebességet, a
          fokozatot és a pedálokat.
        </p>
        <p className="muted">
          Az 1–7. blokk hibái hibavonalak, ebből legfeljebb {MAX_FAULT_LINES} lehet a lapon. A 8. blokk bármelyik hibája sikertelen vizsgát
          jelent.
        </p>
      </div>
      {EVAL_BLOCKS.map((b) => (
        <section key={b.block} className="card fault-block">
          <h2>
            {b.block}. {b.title}
          </h2>
          {b.block === 7 ? (
            <p>
              A manőverek hibái (7/1–7/8) a <a href={href('maneuvers')}>Manőverek</a> fülön, a hét manőver lépésenkénti bemutatójánál
              szerepelnek.
            </p>
          ) : (
            <ul className="fault-list">
              {b.items.map((item) => {
                if (!('code' in item)) return null
                const lesson = lessonByCode(item.code)
                const body = (
                  <>
                    <code className={item.fatal ? 'fatal' : ''}>{item.code}</code>
                    <span>{item.text}</span>
                  </>
                )
                return (
                  <li key={item.code}>
                    {lesson ? (
                      <a className="fault-item" href={href(`eval/${codeSlug(item.code)}`)}>
                        {body}
                        <span className="fault-go" aria-hidden>
                          ▶
                        </span>
                      </a>
                    ) : (
                      <span className="fault-item disabled">{body}</span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      ))}
    </section>
  )
}
