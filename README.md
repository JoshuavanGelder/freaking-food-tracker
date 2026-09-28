# Freaking Food Tracker

Android-app om je eten te loggen, je kcal- en macrodoel te volgen en je gewicht bij te houden. Gebouwd met Expo (React Native) en TypeScript.

## Installeren op je telefoon

1. Open op je Android-telefoon de [nieuwste release](../../releases/latest).
2. Tik op het `.apk`-bestand en download het.
3. Open het bestand. De eerste keer vraagt Android of je browser apps mag installeren: sta dat toe.
4. Een nieuwe versie installeer je gewoon over de oude heen; je gegevens blijven bewaard.

Elke push naar `main` bouwt automatisch een nieuwe APK (zie het tabblad Actions). Dat duurt ongeveer 10 à 15 minuten.

## Wat zit erin

- Profiel, doelgewicht en kcal-doel via tempo (kg per week) of zelf kcal per dag invullen
- Macroplannen: gebalanceerd, eiwitrijk, low carb, keto, duursport of een eigen verdeling
- Eten loggen per maaltijd: basisproducten uit NEVO (direct tijdens typen, ook offline), merkproducten via zoeken
  of barcode (Open Food Facts), of zelf invoeren vanaf het etiket
- Portie in porties of gram, recent, favoriete producten en hele maaltijden als favoriet
- Vezels bij alle macro's, plus een scherm met zout, verzadigd vet, 8 vitamines en 7 mineralen (dag of week)
- Gewicht loggen (ook met terugwerkende datum) met trendlijn en prognose
- Eten overzetten uit Foodvisor via een importtekst

Alle gegevens staan alleen op je telefoon.

## Rekenregels

Zie `src/logic/calc.ts` (met tests in `calc.test.ts`, draaien met `npm test`).

- Ruststofwisseling: Mifflin-St Jeor
- Dagelijks verbruik = ruststofwisseling × activiteitsfactor (verbrande kcal van telefoon/horloge tellen niet mee)
- Kcal-doel = verbruik − tempo × 7.700 / 7

## Bronnen

Basisproducten: gebaseerd op gegevens van NEVO-online versie 2025/9.0, RIVM, Bilthoven.
Normen vitamines en mineralen: Gezondheidsraad (2018).
Merkproducten: [Open Food Facts](https://world.openfoodfacts.org), open data onder de Open Database License.
