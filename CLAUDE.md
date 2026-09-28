# Freaking Food Tracker — werkafspraken voor Claude

Android-app (Expo SDK 57, React Native 0.86, React 19.2, TypeScript) om eten te loggen, kcal/macro's/micro's
te volgen en gewicht bij te houden. Eigenaar: Joshua van Gelder (Nederlands; antwoord in het Nederlands).

## Werkwijze met Joshua
- Joshua werkt alleen vanaf zijn telefoon + GitHub. **Nooit bestanden op zijn werklaptop.** Alleen thuis heeft hij
  een Windows-pc, en die alleen als het echt nodig is.
- Hij installeert de APK uit GitHub Releases. Elke push naar `main` = nieuwe build + release `build-N`.
- Kort en concreet rapporteren; na een push de snelle `checks`-job meteen controleren (is binnen ~2 min klaar),
  niet lang wachten. De APK-build duurt ~10 min.
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
- `src/nav.tsx`: routes `tabs | add | scan | product | manual | profile | import | micros`.
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
- `src/logic/importer.ts`: `fft-import` v1 JSON (Foodvisor-overzet), ids `import:<slug>`, dagtotalen `summary:<datum>`.
- `modules/barcode-photo`: lokale Expo-module met zxing-cpp voor de fotoscan.
- Schermen in `src/screens/`, UI-bouwstenen in `src/ui.tsx`, kleuren/fonts in `src/theme.ts` (accent #15803D).

## Voorwaarden databronnen
- NEVO (RIVM): waarden **ongewijzigd** laten, bron + versie tonen ("Gebaseerd op gegevens van NEVO-online versie
  2025/9.0, RIVM, Bilthoven"), nooit geld vragen. Berekeningen (porties, totalen) mogen.
- Open Food Facts: ODbL, bron vermelden.

## Stand en roadmap
Zie de projectdocumenten in Claude ("Food Tracker App"): `claude/plan-food-tracker.md` en
`claude/overdracht-food-tracker.md`.
