# KreszPass – forgalmi vizsga gyakorló

Böngészős, telefonra telepíthető alkalmazás (PWA) a forgalmi vizsga útvonalainak begyakorlására. A cél a
**helyzetfelismerés gyorsítása**: az útvonal valódi kereszteződéseinél, lámpáinál, zebráinál időre kell
válaszolni, és a hibák a hivatalos **forgalmi vizsga minősítő lap (13/2014/03)** kódjaira képződnek le.

Minden felhasznált csomag nyílt forráskódú, minden szolgáltatás ingyenes, API-kulcs nem kell
(a Mapillary utcaképhez egy ingyenes regisztrációs token kell, de nélküle is működik).

## Használat

1. **Új útvonal**: az *Útpontok* módban kattints a térképre a vizsgaútvonal mentén, majd *Útra illesztés*.
   GPX vagy KML fájl is importálható. Az *Utcák alapján* részben elég beírni a települést és a vizsgaútvonal
   utcáit sorrendben (pl. „Budaörsi út – Villányi út – Fadrusz utca – Bartók Béla út”, útszám is lehet: „1-es út”):
   az útvonal pontosan ezeken az utcákon halad, az egyirányú utcákat betartva. Ha két egymást követő utca nem
   találkozik, a hibaüzenet megmondja, melyik utcán lehet átjutni. A *Véletlen útvonal* gyakorláshoz készít egy
   kb. 5, 10 vagy 15 km-es körutat a megadott település vagy kerület (pl. „Újpest”, „Budapest”) utcáin, az
   egyirányú utcákat betartva, autópálya nélkül; nagy területen minden kattintás más városrészbe visz.
2. **Helyzetek felismerése**: az OpenStreetMap-adatokból felismeri a STOP és elsőbbségadás táblákat,
   lámpákat, zebrákat, körforgalmakat, sebességváltozásokat és a kanyarodásokat.
   Ahol az adatokban nincs tábla, az úttípusból következtet. Ezeket *ellenőrizendő* jelöli, nézd át őket.
3. **Gyakorlás**: minden helyzet előtt „közeledsz” (Mapillary utcakép, vagy menetirányba forgatott térkép
   és felülnézeti vázlat), majd időre válaszolsz. Azonnali visszajelzést kapsz a lap kódjával.
4. **Próbavizsga**: visszajelzés nélkül végigmész az útvonalon, a végén kitöltött minősítő lapot kapsz,
   megfelelt/nem felelt meg eredménnyel.
5. **Ismétlés**: a rosszul vagy lassan megválaszolt helyzetek FSRS ütemezéssel jönnek vissza.
6. **Statisztika**: hibatérkép az útvonalon, leggyakoribb hibakódok, korábbi munkamenetek.
7. **Teljes útvonal**: megszakítás nélkül végigvezet az útvonalon (a sebesség beállítható), a vizsgabiztos hangosan
   mondja az irányt („A következő kereszteződésnél forduljon balra.”), minden helyzetnél megállsz és válaszolsz.
8. **Gyenge pontok és felkészültség**: az útvonal kártyáján a felkészültség százalékban (a helyzetek legutóbbi három
   válasza alapján), a *Gyenge pontok* gomb a 10 leggyengébb helyzetet gyakoroltatja. A szerkesztőben a helyzetek az
   eredményeid szerint is színezhetők.
9. **Mozdulat-gyakorlás** (bekapcsolható): kereszteződés, körforgalom, vasúti átjáró, megálló és akadály előtt tükör (`M`),
   index (`←` `→`), fékezés (`Szóköz`), vagy a képernyőn lévő gombokkal. A sorrendet és az időzítést a lap kódjai szerint
   értékeli (4/4, 4/5, 6/8, 8/6, 8/30, 8/26…). Körforgalomba behajtáskor nem kell jelezni, kivéve az első kijáratnál.
10. **Körforgalom lépésről lépésre**: a valós adatokból számolt kijárat („a 2. kijáraton hajtson ki”), két kérdés: a behajtás
    előtt (elsőbbség, irányjelzés, kétsávos körben a sávválasztás), majd a körben a kijárat előtt (kihajtás jelzése,
    zebra, bejáratnál várakozó, átsorolás a külső sávba). A 3D nézetben a kör ágainak száma a valóságos.
11. **Villamos- és autóbuszmegállók**: járdasziget nélküli villamosmegállónál a villamos elindulásáig várni kell
    (KRESZ 35. § (2)); a járdasziget meglétét a szerkesztőben lehet jelölni. Lakott területen az induló autóbuszt el kell
    engedni (24. § (3)).
12. **Váratlan helyzetek**: az útvonal egyenes szakaszain (beállítható: nincs / kevés / sok) akadály a sávban szembejövővel
    vagy anélkül, útépítés, a parkoló autók közül kiguruló labda, kinyíló ajtó, kerékpáros, hátulról érkező mentőautó
    (visszapillantó tükörrel és szirénával). Ugyanazon az útvonalon mindig ugyanott vannak, de hogy mi történik, változik.

**Manőverek.** A vizsga hét manővere (M1–M7: 90°-os beállás előre jobbra/balra és kiállás, 90°-os beállás hátra,
párhuzamos parkolás előre- és hátramenetben, „Y” és „U” megfordulás) lépésről lépésre: mikor, merre és mennyit kell
kormányozni, melyik sebességfokozatban, hová nézz, mihez igazodj, és milyen hibakódot kockáztatsz. A mozdulatok egy átlagos
kisautó valós méreteivel és fordulókörével vannak kiszámolva: a felülnézeti rajz és a vezetőülésből látott 3D nézet
(a tükrök képével) ugyanazt mutatja, és a tesztek ellenőrzik, hogy a kocsi a helyén áll meg, sehol nem ér a parkoló
autókhoz, a kereke a szegélyhez, és a leírt referenciapontok (pl. „a jobb hátsó kerék a második vonalnál”) stimmelnek.

Billentyűzettel az 1–4 gombok választanak, az Enter továbblép. Bekapcsolható a kérdések felolvasása és a
hangos válasz (a sorszám kimondásával), ha a böngésző támogatja.

## Vezetés (szimulátor)

Az útvonallistán a **Vezetés** gombbal a mentett útvonaladon magad vezetsz: kormányzol, gázt adsz, fékezel, indexelsz,
tükörbe és hátra nézel. Nincs kérdés: a helyzet maga a kérdés, a mozdulataid a válasz.

- **A város a valódi térképből épül** (a helyi OpenStreetMap-adatokból): az utak valódi szélességgel és sávszámmal, a sáv
  megszűnésénél fokozatosan keskenyedve, kereszteződések lekerekített sarkokkal, járdák szegélykővel, felezővonal, megállási
  vonal, zebra, táblák, működő jelzőlámpák, házsorok, fák, lámpák.
- **Táblák mindenhol**: az OpenStreetMap-ben felvett táblák mellett a szabályokkal összhangban kitalált táblázás: a különböző
  rangú utak kereszteződésében Főútvonal és Elsőbbségadás kötelező (cápafoggal), körforgalom, az egyirányú utca két végén
  „Egyirányú forgalmú út” és „Behajtani tilos”, sebességkorlátozás, ahol változik a megengedett sebesség. Az egyenrangú
  lakóutcák kereszteződésében nincs tábla (jobbkéz-szabály).
- **Útbaigazító panel** (bal felül, mindig látszik): a következő manőver nyíllal, a távolsága és az utca neve, ahová érsz;
  hosszú egyenesen „Kövesse az utat”. Ha rossz irányba fordulsz, szabályos kerülőt mutat vissza az útvonalra.
- **Vizsgabiztos**: hangosan és kiírva mondja az irányt („A következő kereszteződésnél forduljon jobbra.”, közvetlenül előtte
  „Itt forduljon jobbra.”, lámpás és négyágú kereszteződésben „haladjon tovább egyenesen”), a végén kéri a
  megállást a járda mellett. Közben a minősítő lap kódjaival figyeli az elindulást (bal tükör, vállon át hátranézés, index),
  a gyorshajtást, a STOP táblát, a piros és a sárga jelzést, a kanyarodás előtti irányjelzést és tükörbe nézést, a
  körforgalomból kihajtást, a bekapcsolva felejtett indexet, a bal oldalon haladást, az egyirányú utcát, a szegélyre
  felhajtást és az ütközést.
- **Élő forgalom**: más autók a KRESZ szerint közlekednek (sávban, követési távolsággal, indexelnek, megállnak a pirosnál és
  a STOP táblánál, elsőbbséget adnak a főúton haladónak, a jobbról érkezőnek, balra kanyarodva a szemből jövőnek, a
  körforgalomban haladónak), a gyalogosok a járdán sétálnak és a zebrán átkelnek. Minden vezetés más: a kereszteződéseidhez
  időzítve érkezik egy-egy autó, a zebrák elé gyalogos, így tényleg el kell döntened, kié az elsőbbség. A vizsgabiztos
  figyeli az elsőbbség megadását (8/24), a gyalogos átengedését a zebrán (8/27), a követési távolságot (5/6) és az ütközést
  (8/3, a vizsga véget ér). A forgalom sűrűsége a grafikai minőséghez igazodik.
- **Gyakorlás** (minden hiba azonnal megjelenik), **Vizsga** (értékelés csak a végén, mint a valóságban) és **Bemutató**
  (a robotsofőr hibátlanul végigvezet: figyeld, mikor néz tükörbe, indexel, lassít).
- A vezetés végén a megszokott minősítő lap készül; a helyzetekhez tartozó hibák a statisztikában is megjelennek.
- Kezelés: W/↑ gáz, S/↓ fék, A D/← → kormány, Q/E index, 1 2 3 tükrök, Z/C hátranézés, Szóköz kézifék, R előre/hátra,
  H vészvillogó, V nézet, Esc szünet.
- A szimuláció logikája (`src/sim/`) böngésző nélkül is fut: a tesztekben egy robotsofőr valódi újpesti útvonalakon
  hibátlanul végigvezet forgalommal is, egy hanyag robot pedig megkapja a gyorshajtás és az elmulasztott index hibáit, az
  elsőbbséget nem adó a 8/24-et; öt perc sűrű forgalomban sincs ütközés és holtpont az autók között.

## 3D és valódi táblák

- **3D nézet a vezetőülésből.** Minden helyzetnél a three.js-szel rajzolt kereszteződésbe „hajtasz be”: valódi KRESZ táblák
  oszlopon, működő (villogó, piros-sárga) lámpák, mozgó autók irányjelzővel, gyalogosok. A kérdés kb. 10 méterrel a
  stopvonal előtt jön, amikor dönteni kell, és a vezető a partner felé fordítja a fejét.
- **3D térképes repülés.** A kis ablakban a térkép az igazi útvonaladon repül végig 3D épületekkel és domborzattal,
  a helyzetek pontján a valódi táblával. A ⤢ gombbal a két nézet felcserélhető.
- **Táblafelismerés.** A *Táblák* menüben két mód van. *Táblakép*: a tábla végig látszik, és minél gyorsabban kell kiválasztani
  a jelentését. *Az utakon*: egy (véletlen) mentett útvonalad valódi tábláit látod a helyükön: a 3D nézetben elhaladsz
  a tábla mellett, a térkép a valódi helyére repül, és amikor a tábla már mögötted van, választod ki a jelentését.
  A táblák az OpenStreetMap-ben kitáblázott táblákból és az útvonal ellenőrzött helyzeteiből jönnek, egy véletlen
  szakaszon, haladási sorrendben. Mindkét mód ugyanabba az ismétlésbe számít: a rosszul vagy lassan felismert táblák
  visszajönnek. Itt található a táblatár is.
- **Valós táblák a helyszínen.** A kérdés fő tábláján felül a helyszínen ténylegesen álló táblák is megjelennek a 3D nézetben
  és a térképen: az OpenStreetMap-ben kitáblázott jelzőtáblák (pl. sebességkorlátozás, lakott terület), a főútvonal, és
  egyirányú utcába kanyarodva az „Egyirányú forgalmú út” tábla. A szerkesztő listája is mutatja őket.
- **Vasúti átjárók.** Az OSM-ből felismert átjáróknál sínek, Andráskereszt, fénysorompó (villogó piros / fehér) és sorompó;
  előtte figyelmeztető és háromcsíkos előjelző tábla. Kérdések a megállás helyéről, a sínek mögötti torlódásról, az
  előzési tilalomról, a közeledő vonatról és a felnyílt sorompó melletti piros fényről (KRESZ 39. §).
- A körforgalom kijáratszámát, a villamos- és autóbuszmegállókat a régebben felismert útvonalaknál a helyzetfelismerés
  újrafuttatásával kapod meg.
- **Valósághű 3D.** Fényképes PBR-textúrák (aszfalt, járdalap, szegélykő, vakolt és téglahomlokzatok, fű), HDR égbolt a
  fényekhez és a tükröződésekhez, napfény árnyékokkal, közvilágítási lámpák és fák a járdán, kidolgozott autómodellek
  (lakkozott fényezés, az égboltot tükröző üvegezés, működő irányjelzők) és járó-álló, animált gyalogosok, gyerek, útépítő munkás.
  A busz, a villamos, a vonat, a mentő, a kisteherautó és a traktor saját (programból rajzolt) modell. A *3D minőség* (Beállítások)
  automatikusan az eszközhöz igazodik: alacsony minőségen árnyék és HDR égbolt nélkül, gyengébb telefonra.
- Gyengébb telefonon a Beállításokban a 3D nézet és a domborzat kikapcsolható: ilyenkor felülnézeti vázlat látszik.

A táblák a Wikimedia Commonsról származnak (magyar KRESZ táblák, közkincs: PD-HU-exempt). Újraletöltés:

```bash
npm run signs            # csak a hiányzókat tölti le
npm run signs -- --force # mindent újratölt
```

## Értékelés

| Válasz | Lapkód |
| --- | --- |
| Helyes, időben (alapból 4 s alatt) | nincs hiba |
| Helyes, kissé késve (7 s alatt) | 6/4 |
| Helyes, lassan | 6/2 |
| Rossz válasz | a válaszhoz rendelt kód, többnyire 8-as |
| Nincs válasz (12 s) | 8/25 |

Az 1–7. blokk hibái hibavonalak, legfeljebb 10 megengedett. A 8. blokk bármelyike sikertelen vizsga.
A küszöbök a Beállításokban állíthatók. A járműkezelési hibákat (kuplung, lefulladás, manőverek) a szimulátor
nem méri. Ezeket a lap halványan mutatja.

## Fejlesztés

```bash
npm install
npm run dev      # fejlesztői szerver
npm test         # egységtesztek (vitest)
npm run lint     # oxlint
npm run build    # production build a dist/ mappába
```

## Helyi térképadatok (megbízható helyzetfelismerés)

A helyzetfelismerés nem a nyilvános Overpass szervertől függ, hanem az apphoz csomagolt OpenStreetMap-adatokból
dolgozik. Ezeket egy script készíti el Magyarország teljes, ingyenes Geofabrik-kivonatából (kb. 330 MB letöltés,
a feldolgozás kb. 20 másodperc):

```bash
npm run osm              # letölti (ha 7 napnál régebbi) és elkészíti a public/osm csempéket
npm run osm -- --refresh # mindenképp friss letöltés
```

Az eredmény kb. 8000 kis csempe (tömörítve kb. 22 MB összesen); egy útvonalhoz csak az érintett néhány csempe
töltődik le, a saját szerverről. A generált fájlok nincsenek a verziókezelésben (`.gitignore`), ezért közzététel
előtt futtasd a `npm run osm` parancsot. Ha a helyi csomag hiányzik, vagy az útvonal kilóg belőle, az app a
nyilvános Overpass szerverre vált, türelmes újrapróbálással.

## Közzététel ingyen

A `dist/` mappa statikus fájlokból áll, bármilyen statikus tárhelyre feltehető. A relatív útvonalak és a
hash-alapú navigáció miatt alkönyvtárban is működik.

- **Cloudflare Pages**: build parancs `npm run build`, kimeneti mappa `dist`.
- **GitHub Pages**: a `dist` tartalmát kell közzétenni (például a `actions/deploy-pages` művelettel).

iPhone-on Safariban megnyitva a *Megosztás → Hozzáadás a Főképernyőhöz* menüvel telepíthető.

## Felhasznált ingyenes szolgáltatások

| Mire | Szolgáltatás |
| --- | --- |
| Térkép | OpenFreeMap vektoros csempék, © OpenStreetMap közreműködők |
| Táblák, lámpák, zebrák | Helyi OSM-csomag a Geofabrik kivonatából (ODbL); tartalék: Overpass API |
| Útra illesztés | OSRM demó szerver |
| Utcák és területek keresése (útvonal utcanevekből, véletlen útvonal) | OpenStreetMap Nominatim (kulcs nélkül, legfeljebb 1 kérés/s) |
| Utcakép (nem kötelező) | Mapillary Graph API, CC BY-SA képek |
| KRESZ táblák | Wikimedia Commons, közkincs (PD-HU-exempt), a repóban tárolva |
| Domborzat | Mapzen Terrarium csempék, AWS Open Data |
| 3D | three.js, React Three Fiber |
| 3D textúrák, égbolt, lámpa, útelzáró | Poly Haven (polyhaven.com), CC0 közkincs; `npm run assets3d` tölti le, a forrás és a szerzők a `public/3d/manifest.json`-ban |
| 3D gyalogosok, munkás, személyautó | Quaternius modelljei a Poly Pizzáról (poly.pizza), CC0 közkincs; szintén az `npm run assets3d` tölti le |

Az adatok csak a böngészőben (IndexedDB) tárolódnak. Más eszközre a Beállítások → *Mentés fájlba* és
*Visszatöltés fájlból* funkcióval vihetők át.

## Felépítés

```text
src/domain/     minősítő lap kódjai, kérdéssablonok, pontozás (tiszta logika, tesztelve)
src/data/       Overpass, OSRM, Mapillary, GPX/KML import, helyzetfelismerés
src/features/   útvonalak és szerkesztő, vezetés, minősítő lap, statisztika, beállítások
src/components/ térkép (MapLibre), jelzőtáblák, felülnézeti vázlat (SVG), 3D jelenet (scene3d/)
scripts/        a KRESZ táblák letöltése, a helyi OSM-csempék készítése (build-osm.ts)
```

A szimuláció mentális gyakorlás: kiegészíti, de nem helyettesíti az oktatóval való vezetést.
