import { MANEUVERS } from '../../domain/maneuvers'
import { GROUP_TITLE, GROUPS, SITUATIONS } from '../../domain/situations'
import { href } from '../../lib/router'
import { ManeuverDiagram } from './ManeuverDiagram'
import { SituationCard } from './SituationCard'

/** A vizsga hét manővere: kártyák felülnézeti vázlattal (kiinduló helyzet, útvonal, cél) */
export function ManeuversPage() {
  return (
    <section className="maneuvers">
      <div className="card">
        <h1>Manőverek</h1>
        <p>
          A forgalmi vizsga hét manővere lépésről lépésre: mikor, merre és mennyit kell kormányozni, hová nézz, mihez igazodj, és mit néz a
          vizsgabiztos. Minden mozdulat valós méretekkel, egy átlagos kisautó fordulókörével van kiszámolva: amit a rajzon és a 3D nézetben
          látsz, az a valóságban is így megy.
        </p>
      </div>
      <ul className="maneuver-grid">
        {MANEUVERS.map((m) => (
          <li key={m.id}>
            <a className="card maneuver-card" href={href(`maneuvers/${m.id}`)}>
              <ManeuverDiagram maneuver={m} className="maneuver-thumb" />
              <span className="badge">{m.id}</span>
              <h2>{m.title}</h2>
              <p>{m.summary}</p>
              <span className="muted">{m.steps.length} lépés</span>
            </a>
          </li>
        ))}
      </ul>

      <div className="card">
        <h2>Forgalmi helyzetek</h2>
        <p>
          A vizsgán gyakran előforduló, sokszor elrontott helyzetek lépésenként: mire figyelj, merre nézz, mikor jelezz, hol állj meg. Minden
          lépésnél ott vannak a gyakori hibák is, a minősítő lap kódjával.
        </p>
      </div>
      {GROUPS.map((g) => {
        const list = SITUATIONS.filter((s) => s.group === g)
        if (!list.length) return null
        return (
          <section key={g} className="situation-group">
            <h2>{GROUP_TITLE[g]}</h2>
            <ul className="maneuver-grid">
              {list.map((s) => (
                <li key={s.id}>
                  <SituationCard lesson={s} />
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </section>
  )
}
