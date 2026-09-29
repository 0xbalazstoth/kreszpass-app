# KreszPass – forgalmi vizsga gyakorló

Böngészős, telefonra telepíthető alkalmazás (PWA) a forgalmi vizsga útvonalainak begyakorlására. A cél a
**helyzetfelismerés gyorsítása**: az útvonal valódi kereszteződéseinél, lámpáinál, zebráinál időre kell
válaszolni, és a hibák a hivatalos **forgalmi vizsga minősítő lap (13/2014/03)** kódjaira képződnek le.

Minden felhasznált csomag nyílt forráskódú, minden szolgáltatás ingyenes, API-kulcs nem kell
(a Mapillary utcaképhez egy ingyenes regisztrációs token kell, de nélküle is működik).

## Használat

1. **Új útvonal**: az *Útpontok* módban kattints a térképre a vizsgaútvonal mentén, majd *Útra illesztés*.
   GPX vagy KML fájl is importálható.
2. **Helyzetek felismerése**: az OpenStreetMap-adatokból felismeri a STOP és elsőbbségadás táblákat,
   lámpákat, zebrákat, körforgalmakat, sebességváltozásokat és a kanyarodásokat.
   Ahol az adatokban nincs tábla, az úttípusból következtet. Ezeket *ellenőrizendő* jelöli, nézd át őket.
3. **Gyakorlás**: minden helyzet előtt „közeledsz” (Mapillary utcakép, vagy menetirányba forgatott térkép
   és felülnézeti vázlat), majd időre válaszolsz. Azonnali visszajelzést kapsz a lap kódjával.
4. **Próbavizsga**: visszajelzés nélkül végigmész az útvonalon, a végén kitöltött minősítő lapot kapsz,
   megfelelt/nem felelt meg eredménnyel.
5. **Ismétlés**: a rosszul vagy lassan megválaszolt helyzetek FSRS ütemezéssel jönnek vissza.
6. **Statisztika**: hibatérkép az útvonalon, leggyakoribb hibakódok, korábbi munkamenetek.

Billentyűzettel az 1–4 gombok választanak, az Enter továbblép. Bekapcsolható a kérdések felolvasása és a
hangos válasz (a sorszám kimondásával), ha a böngésző támogatja.

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
| Táblák, lámpák, zebrák | Overpass API (OpenStreetMap). Az eredményt két hétig helyben tároljuk |
| Útra illesztés | OSRM demó szerver |
| Utcakép (nem kötelező) | Mapillary Graph API, CC BY-SA képek |

Az adatok csak a böngészőben (IndexedDB) tárolódnak. Más eszközre a Beállítások → *Mentés fájlba* és
*Visszatöltés fájlból* funkcióval vihetők át.

## Felépítés

```text
src/domain/     minősítő lap kódjai, kérdéssablonok, pontozás (tiszta logika, tesztelve)
src/data/       Overpass, OSRM, Mapillary, GPX/KML import, helyzetfelismerés
src/features/   útvonalak és szerkesztő, vezetés, minősítő lap, statisztika, beállítások
src/components/ térkép (MapLibre), jelzőtáblák és felülnézeti vázlat (SVG)
```

A szimuláció mentális gyakorlás: kiegészíti, de nem helyettesíti az oktatóval való vezetést.
