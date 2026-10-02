import type { Look } from '../../domain/maneuvers/types'
import type { BotDriver } from '../bot'
import type { Examiner } from '../examiner/examiner'
import type { Sim, SimAction } from '../sim'
import { NO_CONTROLS, type Controls } from '../vehicle'

/** Bemutató: a robotsofőr vezet (a kezelőszerveket ő „nyomja”), a vezető nézi, mikor mit kell tenni */
export class BotInput {
  private bot: BotDriver
  private sim: Sim
  private examiner: Examiner
  private actions: SimAction[] = []
  private lookNow: Look = 'ahead'

  constructor(bot: BotDriver, sim: Sim, examiner: Examiner) {
    this.bot = bot
    this.sim = sim
    this.examiner = examiner
  }

  sample(): Controls {
    if (this.examiner.end) return { ...NO_CONTROLS, brake: 1 }
    const r = this.bot.drive(this.sim.state, this.examiner.progress.s)
    this.actions.push(...r.actions)
    this.lookNow = r.look
    return r.controls
  }

  look(): Look {
    return this.lookNow
  }

  takeActions(): SimAction[] {
    const a = this.actions
    this.actions = []
    return a
  }
}
