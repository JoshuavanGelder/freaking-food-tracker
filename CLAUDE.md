# Freaking Food Tracker — werkafspraken voor Claude

Android-app (Expo SDK 57, React Native 0.86, React 19.2, TypeScript) om eten te loggen, kcal/macro's/micro's
te volgen en gewicht bij te houden. Eigenaar: Joshua van Gelder (Nederlands; antwoord in het Nederlands).

## Werkwijze met Joshua
- Joshua werkt alleen vanaf zijn telefoon + GitHub. **Nooit bestanden op zijn werklaptop.** Alleen thuis heeft hij
  een Windows-pc, en die alleen als het echt nodig is.
- Hij installeert de APK uit GitHub Releases. Elke push naar `main` = nieuwe build + release `build-N`.
- Kort en concreet rapporteren; na een push de snelle `checks`-job meteen controleren (is binnen ~2 min klaar),
  niet lang wachten. De APK-build staat meestal na ~6 min als release klaar.
- Scanner voor GS1 DataBar (AH vers vlees) werkt niet; **geparkeerd op verzoek van Joshua** — niet aan werken
  tenzij hij erom vraagt. Code intypen werkt wel.

## Bouwen en controleren (sandbox zonder npm)
- `npm install` werkt lokaal niet (registry 403). Wel beschikbaar: node 22, globale `tsc`, python3 + openpyxl.
- Logica-tests: `npm test` (node --experimental-strip-types --test). Tests importeren met `.ts`-extensie.
- **Runtime-imports tussen `src/logic/*.ts` bestanden vermijden** (alleen `import type`), anders werken de
  node-tests niet (extensieloze import) — daarom staat bv. `NEVO_MICRO_ORDER` dubbel in nevo.ts (test bewaakt dat).
- Typecheck lokaal: `./scripts/typecheck-local.sh` (stubs in `scripts/typecheck-stubs.d.ts`; TS7031 'pressed' negeren).
- CI: `.github/workflows/android.yml`
  - job `checks`: npm install, `expo install --fix`, autolink-controle, `test:scan` en `tsc` → resultaten als
    annotations (`::warning title=...`), max ~10 per stap.
  - job `build`: `npm test` → `expo prebuild` → Gradle `assembleRelease` (arm64) → release (alleen main).
- CI-status lezen via de API (job-logs zijn geblokkeerd, annotations niet):
  - `curl -s https://api.github.com/repos/JoshuavanGelder/freaking-food-tracker/actions/runs?per_page=1`
  - `.../actions/runs/<id>/jobs`, `.../check-suites/<suite>/check-runs`, `.../check-runs/<id>/annotations`
  - Gradle-fouten staan als annotations met title `gradle`.
- Bekende valkuilen: `.gitignore` gebruikt `/android/` (niet `android/`, anders valt `modules/barcode-photo/android`
  weg); zxing-cpp moet 2.3.0 blijven (nieuwere = Kotlin 2.3, Expo gebruikt 2.1); geen
  `@react-native-community/datetimepicker` (brak de build).
- Commit-trailers: `Co-Authored-By: Claude …` + `Claude-Session: …` zoals de sessie aangeeft.

## Architectuur
- `App.tsx`: fonts, AppProvider, eigen route-stack (geen react-navigation), tabs Vandaag/Gewicht/Vrienden/Doelen.
- `src/nav.tsx`: routes `tabs | add | scan | product | manual | profile | import | cloud | friend | micros | favmeal`. `nav.pickFor` = id van de
  favoriete maaltijd waaraan producten worden toegevoegd (zoeken/scannen/product werken dan als kiezer, `nav.popTo('favmeal')`).
- `src/store.tsx`: state in AsyncStorage (`fft-state-v1`): profile, goals, log (LogEntry {id,date,meal,food,grams};
  het hele `Food` wordt in de entry gekopieerd), weights, foods, favorites, recent, lastPortion, favMeals, imports.
- `src/logic/calc.ts`: BMR (Mifflin-St Jeor), doel, macroplannen, `Per100` (kcal,e,k,v,fiber,salt,satFat,sugar,micro),
  forGrams/sumNutrition, datum- en gewichtstrend-hulpfuncties.
- `src/logic/off.ts`: Open Food Facts (limiet 15 product-/10 zoekopvragingen per minuut → alleen zoeken op enter),
  barcode-normalisatie (GS1), eenheid g/ml, portie-detectie, kcal-sanity-check, micro's (g → mg/µg).
- `src/logic/nevo.ts` + `src/data/nevo.json` + `src/data/nevo.ts`: NEVO 2025/9.0 (2328 basisproducten) in de app,
  zoeken tijdens typen (synoniemen, samenstellingen, rauw boven bereid). `withNevoData()` vult oude NEVO-entries aan.
  Data opnieuw maken: `python3 scripts/nevo-convert.py NEVO2025_v9.0.csv` (RIVM-zip, niet in de repo).
- `src/logic/micros.ts`: 8 vitamines + 8 mineralen (MICRO_KEYS), normen Gezondheidsraad 2018 per geslacht/leeftijd,
  zout max 6 g (= natrium × 2,5), verzadigd vet max 10 en%, `summarizeMicros` met dekking en top-bronnen.
- `src/logic/mine.ts`: zoeken in recent/favorieten/eigen producten (komt in AddScreen na de NEVO-treffers).
- `src/logic/exporter.ts`: export als JSON (`fft-export` v1) voor "deze week" (afgelopen 7 dagen incl. vandaag) en "alles";
  opslaan in een gekozen map (`Directory.pickDirectoryAsync`, SAF) of delen via expo-sharing (`src/screens/ExportSection.tsx`,
  op Doelen → Gegevens). "Alles" bevat in `backup` de volledige app-state.
- `src/logic/backup.ts`: reservekopie uit een "Alles"-export terugzetten (`parseBackup`, `mergeBackup`): samenvoegen,
  bestaande gegevens winnen, dubbelen (zelfde id / datum / inhoud) komen er niet bij. In `ImportScreen` (bestand kiezen
  met `File.pickFileAsync` of plakken); ook bereikbaar vanaf de onboarding ("Ik heb een reservekopie").
- `src/logic/importer.ts`: `fft-import` v1 JSON (Foodvisor-overzet), ids `import:<slug>`, dagtotalen `summary:<datum>`.
- Cloud (Supabase, zonder supabase-js; gewone fetch naar `/auth/v1` en `/rest/v1`):
  - `src/cloudConfig.ts`: URL + publishable key (leeg = cloud uit, app werkt lokaal). Nooit de secret key in de app.
  - `supabase/schema.sql`: tabellen `profiles` (profiel/doelen/prefs/naam, `share` + `invite_code` voor fase 3), `libraries`
    (producten/favorieten/favoriete maaltijden als één jsonb), `entries`, `weights`; RLS = alleen eigen rijen;
    trigger zet `synced_at` (pull-cursor).
  - `src/logic/sync.ts` (pure, getest): snapshot met hashes van de laatst gesynchroniseerde versie; wat afwijkt = lokale
    wijziging → push; anders mag de server bijwerken. Eerste sync: profiel van de server, bibliotheek samengevoegd.
  - `src/cloud.ts`: inloggen met Google via `expo-web-browser` `openAuthSessionAsync` naar `/auth/v1/authorize`
    (impliciete flow, sessie in het #-deel van `freakingfoodtracker://login`; scheme in app.config.js; die url staat bij
    Supabase → URL Configuration; Google OAuth-client = type Web application met redirect `<project>/auth/v1/callback`).
    E-mailcodes werken niet: de ingebouwde Supabase-mail stuurt alleen naar teamleden. Sessie verversen, `syncNow`
    (pull → push, één tegelijk, veiligheidsstop bij massaal verwijderen). Opslag `fft-cloud-v1`.
  - Supabase-project: `uhvxbppakfeaqzchyjbb` (eu-west-1). Publishable key alleen als `apikey`-header.
  - Vrienden (fase 3): tabel `friendships` (twee rijen per vriendschap) + security-definer-functies `add_friend(code)`,
    `remove_friend`, `friends()`, `friend_days`, `friend_entries`, `friend_weights` die alleen teruggeven wat de ander deelt
    (`profiles.share`: totals, log, weight, goals; ontbreekt = aan) en `friend_favorites` (sleutel `favorites`; ontbreekt = **uit**). `profiles.target` = dagdoel, door `syncNow` verstuurd
    (`targetOf`). App: `src/cloud.ts` (rpc-aanroepen), `src/logic/friends.ts` (samenvatting, code), `FriendsScreen`
    (code delen/invullen, lijst, wat je deelt) en `FriendScreen` (route `friend`; onderaan `FavoritesCard`: favoriete producten
    en maaltijden van de vriend, kiezen aan welke maaltijd van vandaag, toevoegen of als eigen favoriet bewaren;
    `parseFriendFavorites` in `friends.ts` controleert wat uit de cloud komt).
  - Database-wijzigingen via de Supabase-koppeling worden bij Joshua geannuleerd: geef hem de SQL om in de SQL Editor te
    plakken; lezen/controleren via de koppeling werkt wel.
  - `App.tsx` `useAutoSync`: na laden, bij openen/sluiten van de app en 8 s na een wijziging. Scherm `CloudScreen`
    (route `cloud`, ook vanaf de onboarding).
- Update-melding: `src/update.ts` (hook + opslag `fft-update-v1`) kijkt bij openen/terugkomen (hooguit elke 3 uur) naar
  `releases/latest` op GitHub (alleen als de repo openbaar is; anders stil), vergelijkt het buildnummer (`extra.build` in
  app.config.js = `GITHUB_RUN_NUMBER`, tag `build-N`) en toont `UpdateBanner` op Vandaag en `UpdateSection` op Doelen.
  Pure logica in `src/logic/update.ts`. De releasetekst begint met de commit-titel (workflow maakt `release-notes.md`).
- `modules/barcode-photo`: lokale Expo-module met zxing-cpp voor de fotoscan.
- Schermen in `src/screens/`, UI-bouwstenen in `src/ui.tsx`, kleuren/fonts in `src/theme.ts` (accent #15803D).

## Voorwaarden databronnen
- NEVO (RIVM): waarden **ongewijzigd** laten, bron + versie tonen ("Gebaseerd op gegevens van NEVO-online versie
  2025/9.0, RIVM, Bilthoven"), nooit geld vragen. Berekeningen (porties, totalen) mogen.
- Open Food Facts: ODbL, bron vermelden.

## Stand en roadmap
Zie de projectdocumenten in Claude ("Food Tracker App"): `claude/plan-food-tracker.md` en
`claude/overdracht-food-tracker.md`.
