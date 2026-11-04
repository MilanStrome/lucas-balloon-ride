# Lucas' Balloon Ride

A breath-controlled kids' game (ages 3–7) by **Lucas & Friends · RV AppStudios**: blow on the
device to keep a hot-air balloon in the air. Installable PWA for Android, laptops and
iPhone/iPad Safari, plus a Capacitor Android build for the Play Store.

No ads, no in-app purchases, no analytics, no network calls at runtime. The microphone is only
_measured_ (loudness and frequency shape); audio is never recorded, stored or transmitted.

- Spec: [GAME_SPEC.md](GAME_SPEC.md) · judgment calls: [DECISIONS.md](DECISIONS.md) ·
  asset sources: [ASSETS.md](ASSETS.md) · device QA: [QA_CHECKLIST.md](QA_CHECKLIST.md)

## Options for grown-ups

Settings (behind a simple math question) include **Unlock all levels** (on by default; turn it
off to unlock each level by finishing the one before, and the next world after 4 of 5) and
**Tap / hold to fly**. Kids can also pick **Try another way** on the start screen to play with
tap & hold instead of blowing.

## Install

Requires Node 24+ (tested with 24.12) and npm 11.

```bash
npm ci
npx playwright install chromium webkit
```

## Develop

```bash
npm run dev
```

Opens on http://localhost:5173. The mic needs a secure context: `localhost` counts; for a
phone on your LAN use `npm run build && npm run preview` behind HTTPS (or a tunnel).

Debug mode: add `?debug=1` for the live detector graph, fps, state and mic log, plus number
keys `0`–`9` to set intensity by hand (`Backspace` returns to real input).

## Test

| Command                   | What it runs                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `npm run typecheck`       | `tsc --noEmit` (strict, `noUncheckedIndexedAccess`)                                          |
| `npm run lint`            | ESLint, zero warnings allowed                                                                |
| `npm run test`            | Vitest unit tests + coverage gate (≥ 90 % lines on audio/engine/storage/progress/unlocks)    |
| `npm run gen:audio`       | Writes WAV fixtures to `tests/fixtures/audio/`                                               |
| `npm run test:e2e`        | Playwright: Chromium with fake-mic fixtures, WebKit layout run, prod-build checks, perf/heap |
| `npm run test:levels`     | Level-solvability bot: 30 Adventure levels, 200 Endless chunks, 2 × 60 Daily seeds           |
| `npm run test:lighthouse` | Lighthouse on the production build (Perf ≥ 90, A11y ≥ 95, Best Practices ≥ 95)               |
| `npm run verify`          | All of the above + production build                                                          |

`PERF_FULL=1 npm run test:e2e -- perf` runs the performance test at the spec's full durations
(2 min fps run, heap at minute 1 vs 10).

The perf test enables GPU rasterization in Chromium (see DECISIONS.md); on a CI runner without
a GPU, Chromium falls back to SwiftShader and the fps number reflects the runner, not the game.

## Build

```bash
npm run build      # validates all levels (build fails on an invalid level), then builds /dist
npm run preview    # serves /dist on http://localhost:4173
```

## Deploy to GitHub Pages

The Vite `base` is relative (`./`), so the same build works on `https://<user>.github.io/<repo>/`,
a custom domain, and inside Capacitor.

1. Push to `main`. The workflow in `.github/workflows/deploy.yml` runs `npm run verify` and
   publishes `dist/` with GitHub Pages (Settings › Pages › Source: **GitHub Actions**).
2. HTTPS is on by default for `github.io`; for a custom domain tick **Enforce HTTPS** (the mic
   does not work over plain HTTP).
3. `public/404.html` sends unknown paths back to the app root and keeps `?unlock=` codes.
   `public/.nojekyll` stops Jekyll from hiding files.

## Android (Capacitor)

```bash
npm run android    # build + cap sync + open Android Studio
```

- App id `com.rvappstudios.lucasballoonride`, target/compile SDK 36, min SDK 24.
- `AndroidManifest.xml` declares `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS`, no locked
  orientation, and an App Links intent filter for the QR URLs.
- `MicPermissionPlugin.java` requests `RECORD_AUDIO` before the web layer calls
  `getUserMedia`; Capacitor's `BridgeWebChromeClient` then grants the WebView's own audio-capture
  request. `MainActivity` keeps the app in immersive full screen.
- The hardware back button is in-app back (gameplay pauses first, it never closes mid-level);
  on the main menu it exits.
- Storage uses the Capacitor Preferences plugin through the same `StorageBackend` adapter.

### Sign a release

1. Create a keystore once:
   `keytool -genkey -v -keystore lbr-release.jks -alias lbr -keyalg RSA -keysize 2048 -validity 10000`
2. In Android Studio: **Build › Generate Signed Bundle / APK › Android App Bundle**, choose the
   keystore, build `release`. (Or add a `signingConfigs.release` block in
   `android/app/build.gradle` that reads the passwords from `~/.gradle/gradle.properties`.)
3. Bump `versionCode` / `versionName` in `android/app/build.gradle` for every upload.
4. Use Play App Signing; copy its **SHA-256 certificate fingerprint** into
   `public/.well-known/assetlinks.json` (see below).

### App Links (`assetlinks.json`)

Android verifies App Links by fetching `https://<host>/.well-known/assetlinks.json` from the
**domain root**. Replace `REPLACE_WITH_RELEASE_SIGNING_CERT_SHA256` in
`public/.well-known/assetlinks.json` with the Play signing fingerprint, then:

- **Custom domain:** the file in `public/` is served at the root automatically.
- **`<user>.github.io/<repo>/`:** the root belongs to the `<user>.github.io` repository, so copy
  the file into that repo's `.well-known/` folder.

Keep the intent filter's `android:host` / `android:pathPrefix` in
`android/app/src/main/AndroidManifest.xml` in sync with the real URL.

### Play Store Families / Data safety answers

- Ads: **none**. Analytics/crash SDKs: **none**. In-app purchases: **none**.
- Data collected: **No data collected**. Data shared: **No data shared**.
- Microphone: used on device only to measure breath loudness/shape; audio is not recorded,
  stored or transmitted, so it is not "collected".
- Privacy policy URL: `https://<host>/privacy.html` (shipped in `public/privacy.html`).
- Target audience: ages 5 and under / 6–8; parental gate protects settings and links out
  (there are none).

## Adding a character (Lucas & Friends art)

1. Create `public/characters/<id>/` with `idle`, `happy` and `hit` poses (`.svg` or `.png`,
   square, ~256 px; transparent background).
2. Add one entry to `public/characters/characters.json`:
   ```json
   {
     "id": "lucas-real",
     "label": "Lucas",
     "price": 0,
     "poses": { "idle": "idle.png", "happy": "happy.png", "hit": "hit.png" }
   }
   ```
   `price` is in coins (`0` = free for everyone); add `"qrOnly": true` for puzzle-box-only riders.
   Entries without `poses` use a procedural placeholder (`"placeholder": { "body", "accent", "ears" }`).
3. Rebuild. No code changes are needed; the service worker precaches everything under
   `characters/`. `sample-rider/` is a working example of the image slot.

## Adding a QR unlock code (puzzle box)

1. Add the item (a skin in `src/game/skins.ts` with `qrOnly: true`, or a character entry as above).
2. Add a code to `src/game/unlocks.json`: 8–12 characters from
   `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no `0/O/1/I/L`), one code per product:
   ```json
   "K7MWQ3PZRT": { "type": "skin", "id": "puzzle", "label": "Puzzle Box Balloon" }
   ```
3. `npm run gen:qr -- --host https://<your-host>/<path>/` writes print-ready PNG (1200 px, error
   correction H) and SVG files to `qr-codes/`.
4. The unit tests check every code is well formed and points at a real item.

Codes are client-side and therefore discoverable; that is accepted for cosmetic unlocks
(DECISIONS.md).

## Project layout

See GAME_SPEC.md §2. Notable additions: `src/game/LevelSim.ts` (the pure course simulation
shared by the game and the bot), `src/game/CourseGenerator.ts` (trajectory-first course
generation for Adventure authoring, Endless, Daily and Party), `src/game/CourseRunner.ts`
(single course or endless chunk chain), `tests/levels/bot.ts` (beam-search solver),
`scripts/` (audio fixtures, level authoring/validation, QR, icons, Lighthouse).

Re-author the 30 Adventure levels with `npm run gen:levels` (each level is kept only if the bot
solves it); the JSON in `src/game/levels/` is the source of truth the game loads.
