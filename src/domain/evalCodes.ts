/**
 * Forgalmi vizsga minősítő lap (Típus: 13/2014/03) teljes kódlistája.
 * Az 1–7. blokk hibái hibavonalak, a 8. blokk bármelyike sikertelen vizsgát jelent.
 * A lap szerint a megengedett hibavonalak száma: 10.
 */

export const MAX_FAULT_LINES = 10

export interface EvalCode {
  code: string
  block: number
  text: string
  /** 8. blokk: sikertelenséget okozó hiba */
  fatal: boolean
  /** A szimulátor ki tudja-e váltani (a fizikai kezelési hibákat nem) */
  simulable: boolean
}

export interface EvalBlock {
  block: number
  title: string
  /** Manőver-sorok a 7. blokkban (nem kódok, csak fejlécek a lapon) */
  items: Array<EvalCode | { maneuver: string; text: string }>
}

const c = (code: string, text: string, simulable = false): EvalCode => ({
  code,
  block: Number(code.split('/')[0]),
  text,
  fatal: code.startsWith('8/'),
  simulable,
})

const m = (maneuver: string, text: string) => ({ maneuver, text })

export const EVAL_BLOCKS: EvalBlock[] = [
  {
    block: 1,
    title: 'Elindulás előtti teendők',
    items: [c('1/1', 'a kötelezően előírt ellenőrzéseket egyszeri figyelmeztetéssel, de önállóan tudta elvégezni')],
  },
  {
    block: 2,
    title: 'Elindulás, gyorsítás',
    items: [
      c('2/1', 'a biztonsági övet nem csatolta be'),
      c('2/2', 'elinduláskor a motort lefullasztja'),
      c('2/3', 'a pedálokat, a kormányt és a kézifékeket nem összehangoltan kezeli'),
      c('2/4', 'nem a forgalmi helyzetnek megfelelően (lassan vagy „erőszakosan”) indul el a járművel'),
      c('2/5', 'a járművel nem egyenletesen gyorsítva indul el'),
    ],
  },
  {
    block: 3,
    title: 'Lassítás, megállás',
    items: [
      c('3/1', 'megálláskor a motort lefullasztja'),
      c('3/2', 'a fékpedált nem a szükséges erővel nyomja, és a fékezőerőt nem képes módosítani'),
      c('3/3', 'lassítása nem egyenletes'),
      c('3/4', 'megállás előtt „üresbe” kapcsolja a sebességváltót („üresben” gurul)'),
    ],
  },
  {
    block: 4,
    title: 'Nyomtartás, irányváltoztatás, kanyarodás',
    items: [
      c('4/1', 'kormányfogása bizonytalan, merev, helytelen'),
      c('4/2', 'jobbra tartás okán a parkoló járműveket „szlalomozva” kerülgeti'),
      c('4/3', 'kanyarban szakaszosan kormányoz, szabályos területen, de helytelen íven kanyarodik'),
      c('4/4', 'nem megfelelő az irányjelzés és a fékezés sorrendje', true),
      c('4/5', 'a mögöttes és a jármű melletti forgalmat nem rendszeresen ellenőrzi', true),
      c('4/6', 'előzéskor, kikerüléskor, sávváltoztatáskor hirtelen kormánymozdulattal (meredeken) húzódik ki'),
      c('4/7', 'az előtte lévő akadályt nem veszi kellő időben észre', true),
      c('4/8', 'a jobbra vagy balra kanyarodásra kínálkozó alkalmat nem használja ki'),
      c('4/9', 'a besorolást késve, de egyébként szabályosan hajtja végre', true),
      c('4/10', 'nem a továbbhaladási szándékának megfelelő sávba sorol be, de útját a besorolás szerint szabályosan folytatja', true),
      c('4/11', 'az úttesten lévő vizet a gyalogosokra fröcsköli'),
    ],
  },
  {
    block: 5,
    title: 'Haladási sebesség megválasztása',
    items: [
      c('5/1', 'indokolatlanul és rendszeresen magas fordulatszámon működteti a motort'),
      c('5/2', 'felkapcsolásoknál nem gyorsítja fel eléggé a járművet, a motor rángat'),
      c('5/3', 'visszakapcsoláskor nem a haladási sebességnek megfelelő sebességi fokozatba kapcsol'),
      c('5/4', 'nem a forgalmi viszonyoknak megfelelően gyorsít, lassít, vezetése „darabos”', true),
      c('5/5', 'nem törekszik a forgalmi-, időjárási-, látási- és útviszonyoknak, valamint a jármű sajátosságainak megfelelő sebesség megválasztására (indokolatlanul lassan halad)', true),
      c('5/6', 'a követési távolságot helytelenül választja meg'),
      c('5/7', 'álló járművek mellett a sebességhez mérten túl közel halad el'),
    ],
  },
  {
    block: 6,
    title: 'Közúti jelzések figyelembevétele',
    items: [
      c('6/1', 'a kereszteződés előtt – a körülményekhez képest – túlságosan távol kezd lassítani', true),
      c('6/2', 'a közlekedési helyzetet lassan ismeri fel', true),
      c('6/3', 'a helyes besorolás után elsőbbségadás vagy manőver céljából nem ott áll meg a járművel, ahonnan a helyzetet felismerhetné', true),
      c('6/4', 'a közúti jelzésekre kissé késve, de helyesen reagál', true),
      c('6/5', 'piros-sárga jelzésnél nem készül fel az indulásra', true),
      c('6/6', 'tilos jelzésnél benyomott tengelykapcsoló pedállal, sebességi fokozatba kapcsolva áll a járművel', true),
      c('6/7', 'a járdán lévő gyalogosokat az úttestre „csalogatja”', true),
      c('6/8', 'nem kellő ideig, vagy nem kellő időben, de nem félrevezetően ad irányjelzést', true),
      c('6/9', 'nem győződik meg arról, hogy jelzését észlelték-e a közlekedő partnerek', true),
      c('6/10', 'a közlekedési partnerek jelzéseire nem megfelelően reagál (lassan, de még időben reagál)', true),
      // A lapon a 6/11 kimarad, a kivilágítás kódja 6/12.
      c('6/12', 'a járművek kivilágítására vonatkozó előírásokat helytelenül alkalmazza'),
    ],
  },
  {
    block: 7,
    title: 'Manőverezési feladatok',
    items: [
      m('M1', 'Beállás várakozóhelyre jobbra előre 90°-os szögben, majd kiállás'),
      m('M2', 'Beállás várakozóhelyre balra előre 90°-os szögben, majd kiállás'),
      c('7/1', 'a parkolás után nem a parkolóhely közepére helyezte el a járművet'),
      c('7/2', 'a jármű hossztengelye nagymértékben eltér a parkolóhely tengelyétől'),
      c('7/3', 'másodszori javítással sikerült a feladatot végrehajtani'),
      m('M3', 'Beállás várakozóhelyre jobbra hátra 90°-os szögben'),
      c('7/4', 'a parkolás után nem a parkolóhely közepére helyezte el a járművet'),
      c('7/5', 'a jármű hossztengelye nagymértékben eltér a parkolóhely tengelyétől'),
      c('7/6', 'másodszori javítással sikerült a feladatot végrehajtani'),
      m('M4', 'Parkolás úttal párhuzamosan előremenetben'),
      m('M5', 'Parkolás úttal párhuzamosan hátramenetben'),
      c('7/7', 'a jármű hossztengelye nagymértékben eltér a járdaszegély vonalától'),
      c('7/8', 'másodszori javítással sikerült a feladatot végrehajtani'),
      m('M6', 'Megfordulás hátramenet közbeiktatásával („Y” megfordulás)'),
      m('M7', 'Megfordulás egy ívben („U” megfordulás)'),
    ],
  },
  {
    block: 8,
    title: 'Sikertelenséget okozó hibák',
    items: [
      c('8/1', 'közlekedési szabályt sért', true),
      c('8/2', 'a KRESZ szerinti ellenőrzést nem képes elvégezni'),
      c('8/3', 'veszélyhelyzetet teremt, vagy balesetet okoz', true),
      c('8/4', 'a meghatározott feladatot a második javítás után sem képes a megfelelő módon végrehajtani'),
      c('8/5', 'az üzemi fék hatásosságának ellenőrzését elmulasztja'),
      c('8/6', 'az irányjelzést vagy a körültekintést elmulasztja', true),
      c('8/7', 'a tervezett haladási iránnyal ellentétes irányba a jármű több mint 50 cm-t elgurul'),
      c('8/8', 'balesetveszélyes manőver miatt a szakoktatónak kell beavatkoznia'),
      c('8/9', 'figyelmét a technikai kezelés elvonja a forgalomtól'),
      c('8/10', 'a sebességváltás közben elrántja a kormányt, vagy haladási irányától hagyja eltérni a járművet (nem képes megtartani)'),
      c('8/11', 'nem képes felvenni a forgalom ritmusát, akadályozza a forgalmat, vagy a vizsga időtartama alatt túlnyomórészt indokolatlanul lassan halad', true),
      c('8/12', 'rendszeresen kis követési távolságot tartva zavarja az előtte haladót'),
      c('8/13', 'sebessége megtévesztő az elsőbbségadás tekintetében', true),
      c('8/14', 'egyenrangú útkereszteződésbe úgy hajt be, hogy elsőbbségadási kötelezettségének nem tudna eleget tenni (fékkészenlét hiánya)', true),
      c('8/15', 'durva fékezéssel áll meg az úttesten áthaladó gyalogosok előtt', true),
      c('8/16', 'gyorshajtást, vagy relatív gyorshajtást követ el', true),
      c('8/17', 'nem képes folyamatosan kormányozva irányítani a járművet'),
      c('8/18', 'elveszti a jármű feletti uralmát'),
      c('8/19', 'a járművel felhajt a járdára (járdaszegélyre, útpadkára – akár már egy kerékkel is)'),
      c('8/20', 'nem biztonságosan kanyarodik, indokolatlanul benyomja a tengelykapcsoló pedált'),
      c('8/21', 'indokolatlanul vagy szabálytalanul igénybe veszi a menetirány szerinti bal oldalt', true),
      c('8/22', 'a besorolást, sávváltoztatást szabálytalanul, figyelmetlenül hajtja végre', true),
      c('8/23', 'az útkereszteződésben nem követi a forgalmi sávját', true),
      c('8/24', 'elsőbbségadási kötelezettségének nem tesz eleget', true),
      c('8/25', 'a közlekedési helyzetet nem ismeri fel', true),
      c('8/26', 'nem a közúti jelzéseknek megfelelően közlekedik', true),
      c('8/27', 'nem megfelelően reagál a gyalogosok viselkedésére', true),
      c('8/28', 'a forgalmi helyzetekről nem tájékozódik, figyelmetlen', true),
      c('8/29', 'rendszeresen akadályozza a forgalmat', true),
      c('8/30', 'megtévesztő irányjelzést ad', true),
      c('8/31', 'a megkülönböztető jelzést használó járművet nem veszi észre, vagy arra nem megfelelően reagál', true),
      c('8/32', 'rendszeresen hirtelen, blokkolva fékez (a lassulást nem érzékeli), képtelen egyenletes lassításra'),
      c('8/33', 'a fék- és tengelykapcsoló pedált többször nem a megfelelő sorrendben működteti'),
      c('8/34', 'várakozás céljából történő megálláskor a rögzítő fékkel nem rögzíti a járművet'),
    ],
  },
]

export const EVAL_CODES: Record<string, EvalCode> = Object.fromEntries(
  EVAL_BLOCKS.flatMap((b) => b.items).filter((i): i is EvalCode => 'code' in i).map((i) => [i.code, i]),
)

export function isEvalCode(code: string): boolean {
  return code in EVAL_CODES
}
