# Lucas' Balloon Ride — Build Spec (single release)

> Working title. A breath-controlled kids' game: blow on the device to keep a hot-air balloon in the air.
> Runs on Android phones, laptops (Windows/Mac/Linux browsers), and iPhone/iPad Safari, as an installable PWA plus a Play Store build.
> **This document is the source of truth.** Read it fully before writing code. Build everything here in one release, in the build order in section 14, and do not mark the work done until every gate in section 15 passes.

---

## 0. Ground rules for the build

- **Audience:** young kids, roughly ages 3–7, playing with parents nearby. No reading required to play. Big shapes, friendly visuals, no harsh failure.
- **Brand:** Lucas & Friends, by RV AppStudios. **No ads, no in-app purchases, no analytics, no network calls at runtime.** Everything works offline after the first load.
- **Privacy:** the microphone is only *measured* (loudness and frequency shape). Audio is **never recorded, stored, or transmitted**. Say so in the privacy notice and the settings screen.
- **Input:** after one initial tap (required by browsers to start audio and grant mic permission), the entire game is playable by **breath only**. Touch, mouse, and keyboard are used for menus, plus an optional accessibility fallback (section 9).
- **Font:** SN Pro, weight Black 900, for all UI text. Self-host the font files (WOFF2) so they work offline. Fallback stack: `"SN Pro", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
- **Quality bar:** TypeScript strict mode, zero lint errors, zero console errors or warnings in normal play, all tests green. When this spec is ambiguous, choose the safest kid-friendly behaviour and record the decision in `DECISIONS.md`.

---

## 1. Tech stack

| Concern | Choice |
|---|---|
| Language | TypeScript (`strict: true`, `noUncheckedIndexedAccess: true`) |
| Bundler / dev server | Vite (current stable) |
| Rendering | HTML5 Canvas 2D with a custom fixed-timestep loop. No game engine; keep it small and testable. |
| UI screens | Plain DOM + CSS over the canvas (menus, settings, dialogs) |
| Audio input | Web Audio API: `getUserMedia` → `MediaStreamAudioSourceNode` → `AnalyserNode` |
| Audio output | Web Audio API (synthesized SFX; music from small OGG/MP3 files or synthesized) |
| PWA | `vite-plugin-pwa` (Workbox), precaching every asset for full offline play |
| Android store build | Capacitor (current stable), wrapping the same web build |
| Unit tests | Vitest |
| End-to-end tests | Playwright (Chromium with fake mic input, WebKit for Safari layout) |
| Lint / format | ESLint (typescript-eslint) + Prettier |
| Hosting | GitHub Pages (HTTPS is required for mic access) |

Pin exact dependency versions in `package.json`, and commit the lockfile.

### Scripts (must exist)

```
npm run dev          # local dev server
npm run build        # production build to /dist
npm run preview      # serve /dist locally over https or localhost
npm run typecheck    # tsc --noEmit
npm run lint         # eslint, zero warnings allowed
npm run test         # vitest unit tests
npm run test:e2e     # playwright
npm run test:levels  # automated level-solvability bot (section 15.3)
npm run gen:audio    # generates test WAV fixtures (section 15.2)
npm run verify       # typecheck + lint + test + gen:audio + test:e2e + test:levels + build
npm run android      # build + cap sync + open Android Studio
```

---

## 2. Project structure

```
/src
  main.ts                 boot, service worker registration, screen router
  config.ts               ALL tunable numbers (detector, physics, difficulty)
  /audio
    BreathDetector.ts     PURE: frames in -> breath state out (no Web Audio inside)
    features.ts           PURE: rms, dBFS, band energy, spectral flatness, pitch
    MicInput.ts           Web Audio wiring, permission, device selection, lifecycle
    Calibration.ts        calibration state machine
    HumDetector.ts        PURE: tonal hum detection (accessibility fallback)
    Sfx.ts / Music.ts     output audio, volume, ducking
  /engine
    Loop.ts               fixed 60 Hz update, variable render, delta clamp
    Physics.ts            PURE: balloon forces and integration
    Collision.ts          PURE: circle vs rect/circle/polygon
    Camera.ts             scrolling, fair look-ahead across screen sizes
    Rng.ts                PURE: seeded PRNG (mulberry32) + date seed
    Pool.ts               object pooling (no allocations in the hot loop)
  /game
    entities/             Balloon, Star, Coin, Bird, Cloud, WindZone, RainZone, Firefly, PowerUp...
    modes/                Adventure, EndlessSky, Daily, Party, CalmBreathing, MiniCandles, MiniSailboat, MiniBubbles
    levels/               world-1.json ... world-6.json + schema.ts (validated at load)
    Progress.ts           stars, coins, unlocks, streaks
    Unlocks.ts            skins, characters, QR codes
  /render
    Renderer.ts           DPR-aware canvas, layers, parallax backgrounds
    art/                  procedural vector drawing for all art (see section 11)
  /ui
    screens/              Splash, MicCheck, MainMenu, WorldMap, LevelSelect, Pause, Results, Settings, Profiles, Shop, Party*, Calm*, Privacy
    ParentalGate.ts
    i18n/                 en.json (+ structure for more languages)
  /storage
    Storage.ts            versioned schema, migrations, corruption recovery
  /debug
    Overlay.ts            ?debug=1 live detector graph + fps + state
/public                   icons, manifest, fonts, music
/tests
  unit/  e2e/  fixtures/audio/  levels/
DECISIONS.md              every judgment call made during the build
QA_CHECKLIST.md           manual device test results (section 15.5)
README.md                 setup, run, build, deploy, Android steps
```

**Architecture rule:** everything marked PURE takes plain numbers or arrays and returns plain data. No DOM, no Web Audio, no `Date.now()` inside (pass time in). That is what makes the core logic fully unit-testable.

---

## 3. Breath detection (the core; build and test it first)

### 3.1 Mic setup (`MicInput.ts`)

- Request the mic with processing **disabled**, because phone noise suppression treats breath as noise and erases it:
  ```ts
  { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } }
  ```
  If the browser rejects these constraints, retry with `{ audio: true }` and log this to the debug overlay.
- Create the `AudioContext` **only inside the first user tap**. Call `resume()` on every later user gesture if its state is `suspended` (this is required on iOS Safari).
- `AnalyserNode`: `fftSize = 2048`, `smoothingTimeConstant = 0`. Read `getFloatTimeDomainData` and `getFloatFrequencyData` once per animation frame.
- Compute frequency bins from `audioContext.sampleRate`. **Never hardcode 44100 or 48000.**
- Listen for `track.onended` and `devicechange` (mic unplugged, Bluetooth disconnected). When either fires, pause the game and show a "Mic lost, tap to reconnect" screen.
- Device picker (laptops): `enumerateDevices()` after permission is granted, then persist the chosen `deviceId`, falling back to the default if that device is missing.
- Stop all tracks and suspend the context when the page is hidden. Re-acquire the mic on return.

### 3.2 Features (`features.ts`), computed per frame

| Feature | Definition | Why |
|---|---|---|
| `rmsDb` | 20·log10(RMS of time-domain samples) | overall loudness |
| `lowBandRatio` | energy 20–500 Hz ÷ energy 20–4000 Hz | breath on a mic is dominated by low-frequency turbulence |
| `flatness` | spectral flatness (geometric mean ÷ arithmetic mean of power) over 100–4000 Hz | breath is noise-like (high flatness); speech, singing, and music are tonal (low) |
| `tonality` | peak normalized autocorrelation at lags matching 80–400 Hz | detects hums and voices |

### 3.3 Detector state machine (`BreathDetector.ts`)

Inputs: features, timestamp, calibration (`noiseFloorDb`, `maxBlowDb`), and sensitivity (0.5–2.0).
Outputs: `{ isBlowing: boolean, intensity: 0..1, raw: features }`.

1. **Candidate frame:** `rmsDb > noiseFloorDb + marginDb` AND `flatness > flatnessMin` AND `lowBandRatio > lowBandMin` AND `tonality < tonalityMax`.
2. **Onset debounce:** at least `onsetMs` (default 80 ms) of consecutive candidate frames is required before `isBlowing = true`. This rejects claps, taps, and bumps.
3. **Release hysteresis:** stay blowing until `releaseMs` (default 120 ms) of non-candidate frames, so the balloon doesn't flicker between breaths.
4. **Intensity:** map `rmsDb` linearly from `[noiseFloorDb + marginDb, maxBlowDb]` to `[0, 1]`, scaled by sensitivity, then clamped. Smooth it with separate attack (fast, ~40 ms) and release (~150 ms) time constants.
5. All thresholds live in `config.ts` with sensible defaults. Tune them using the fixtures in section 15.2 and real devices, and record the final values in `DECISIONS.md`.

### 3.4 Calibration (`Calibration.ts` + MicCheck screen)

1. **Quiet:** "Shhh… stay quiet" for 1.5 s. Set `noiseFloorDb` to the median rmsDb plus 2 standard deviations.
2. **Big blow:** "Blow as hard as you can!" for 2 s. Set `maxBlowDb` to the 90th percentile of candidate frames.
3. **Validation:** if `maxBlowDb − noiseFloorDb` is less than `minDynamicRangeDb`, show friendly guidance with an animated picture of where the mic is (phone bottom edge or laptop keyboard/webcam area) and retry. After 3 failures, offer the hum or tap fallback (behind the parental gate).
4. Show a big live meter balloon the whole time so the child can see the game "hearing" them.
5. Persist calibration per profile **and per device ID**. Offer recalibration in settings, and auto-suggest it if the noise floor shifts more than 10 dB at session start.

### 3.5 Speaker feedback (important)

Game music and SFX played through the speaker reach the mic. Mitigations, all required:

- Run calibration with music playing at its current volume, so the noise floor includes it.
- Flatness and tonality filtering rejects most music.
- Default music volume is 40%. Gameplay SFX are short and tonal.
- Apply ducking: drop music 50% while `isBlowing`.
- Add an e2e test in which music plays alone and the balloon must **not** lift (section 15.2).

### 3.6 Hum detector (accessibility fallback)

`HumDetector` accepts steady tonal input from 80–400 Hz with tonality above a threshold, sustained for at least 150 ms. Intensity comes from rmsDb. It is off by default and enabled in settings.

---

## 4. Engine and physics

- Fixed update at 60 Hz with an accumulator. Clamp each frame delta to 100 ms so a backgrounded tab can't teleport the balloon. Rendering is interpolated.
- Balloon forces each step: gravity (down) + `lift = intensity × liftMax` + air drag (linear) + zone forces (wind, rain weight) + power-up modifiers. Clamp vertical velocity to ±`vMax`.
- World: horizontal auto-scroll at the mode's speed. The balloon's x position is fixed on screen.
- Bounds: the top of the world is a soft ceiling (gentle push-back, no damage). The ground is "landing": in Adventure, touching the ground outside a landing pad costs a heart and bounces the balloon up.
- **Kid-friendly failure:** 3 hearts per level. A hit gives 1.5 s of invincibility with a blink, and the balloon bounces away from the hazard. At 0 hearts, a soft "Let's try again!" appears, with no "game over" wording. **Easy mode:** infinite hearts and reduced gravity.
- Collision uses a circle for the balloon against shapes. All collision logic is PURE and unit-tested.
- No allocations in the update loop: pool every entity and particle.

### 4.1 Screen sizes and fairness

- The logical world height is fixed at 1000 units. Scale to the canvas height, accounting for DPR (`devicePixelRatio`, capped at 2 for performance).
- Wider screens show more background but **gameplay look-ahead is capped** at a fixed world distance, so phones and laptops get identical difficulty (this matters for Daily and Party fairness).
- Landscape is the recommended orientation. In portrait, the camera fits the world height and shows a small "rotate for a bigger view" hint once. Both orientations must be fully playable.
- Handle `resize` and `orientationchange` without restarting the level.

---

## 5. Game modes

All modes use the same Balloon, Physics, and BreathDetector.

### 5.1 Adventure (6 worlds × 5 levels = 30 levels)

Each world introduces one new mechanic:

| # | World | New mechanic |
|---|---|---|
| 1 | Sunny Meadow | Basics: float, collect stars, land on the pad |
| 2 | Windy Hills | Wind zones push up, down, or sideways (shown by animated swirl lines) |
| 3 | Bird Forest | Moving obstacles (birds on sine paths, bees) |
| 4 | Rain Clouds | Rain zones add weight, so the player must blow harder; dark clouds are hazards |
| 5 | Night Sky | Limited visibility radius; fireflies light the way |
| 6 | Space | Low gravity, so tiny puffs go far; floating asteroids |

- A level lasts 45–90 s. It ends at a landing pad, and landing gently (low vertical speed) earns a bonus.
- Stars: each level has stars placed along the route. Results show 1–3 stars based on the percentage collected (≥40 / ≥70 / ≥95%). Coins scatter in risk-reward spots.
- Unlocking: the next level unlocks on completion, and the next world after completing 4 of 5 levels.
- Levels are defined as JSON data validated by `levels/schema.ts` at load. An invalid level is a build failure.
- Power-ups (from World 2): shield (absorbs one hit), star magnet (8 s), slow-mo cloud (5 s, at 0.6× speed).

### 5.2 Endless Sky

Procedurally generated from a seeded RNG, with difficulty ramping over distance. Score is distance, and the best per profile is saved. Generated chunks must pass the same solvability check used for levels (section 15.3) in tests.

### 5.3 Daily Sky Challenge

- Seed = local date `YYYY-MM-DD` hashed into mulberry32. Same date means the same level for every player, fully offline.
- A fixed-length (~60 s) generated course mixing mechanics from the worlds the profile has unlocked (worlds 1–3 only if fewer are unlocked).
- Unlimited retries; the reward (coins + streak) is granted once per day. Streak counter: consecutive days completed. A missed day resets it, with a gentle message.
- Around midnight: a run started on day N stays day N's run until it ends.
- Guard against clock tampering only lightly. It's a kids' game; don't block play.

### 5.4 Party Mode (pass the phone)

- 2–6 players, each choosing an avatar (no typing required; names optional).
- Everyone flies the **same seeded Endless course** for fairness. 3 hearts, distance scored.
- Between turns, a full-screen "Pass to [avatar]!" card with a 3-2-1 countdown that starts on tap. The detector re-checks the noise floor quickly (0.8 s) for each player.
- Results: animated podium, ties allowed. Party players don't need saved profiles.

### 5.5 Calm Breathing Mode

- Goal: a gentle breathing exercise for bedtime. **Make no medical or therapy claims** anywhere in the copy.
- Night palette, slow drifting stars, soft ambient music (off by default because of feedback; can be turned on).
- Guide ring: a glowing ring expands during the "breathe in" phase (no blowing expected) and shrinks during "breathe out" (steady, gentle blow).
- Default pattern: in 4 s, out 6 s. Options: 3/5, 4/6, 4/7. Session length 1, 3, or 5 minutes.
- Scoring is steadiness only: the balloon floats nicely while intensity stays inside a gentle band (0.15–0.6). Blowing too hard makes the balloon wobble, never fail. No hearts, no hazards.
- Ends with a sleepy scene (the balloon lands, a moon appears) and a "Goodnight" card.

### 5.6 Mini-games

- **Birthday Candles:** a cake with 3–8 candles. A sustained blow above an intensity threshold for 400 ms blows out the candle nearest the flame cursor, and the cursor moves to the next. Includes a celebration animation.
- **Sailboat Race:** blowing pushes a boat right across gentle waves to a dock before a relaxed timer ends. Intensity maps to speed, with drag.
- **Bubble Blower:** a gentle blow grows a bubble, a too-hard blow pops it (funny pop), and stopping releases it to float away. Score = bubbles released, with size bonuses.

---

## 6. Screens and flow

```
Splash (tap to start)
  -> Mic permission prompt (pre-explained with a friendly picture first)
     -> denied/no mic -> Mic Help screen (how to enable, per platform) + fallback offer behind parental gate
  -> Mic Check + Calibration (skip if valid calibration exists for this device)
  -> Profile select (first run: create profile = pick avatar)
  -> Main Menu: Adventure | Endless Sky | Daily | Mini-games | Calm | Party | Shop | Settings (gated)
  -> Mode screens -> Gameplay -> Pause -> Results -> (retry | next | menu)
```

- **Pause:** opens automatically on `visibilitychange`, window blur, mic loss, or orientation change during play. Resume by **blowing** (a "Blow to continue!" prompt) or by tapping Resume.
- **Results:** stars, coins, new unlocks, and buttons: retry, next, menu. Big icons, minimal text.
- All buttons are at least 56 px, with visible focus states. Menus are keyboard-navigable on laptops (arrows, Enter, Esc = back).
- **Escape/back:** Android hardware back (in Capacitor) and the browser back button behave as in-app back and never close the app mid-level without pausing first.

---

## 7. Settings (behind the parental gate)

**Breath control:** sensitivity slider (0.5–2.0), recalibrate, live mic meter, control style (hold-to-lift / puff-to-hop), mic device picker (when more than one device exists).
**Sound & display:** music volume, SFX volume, vibration (Android, via `navigator.vibrate`, feature-detected), graphics quality (auto/high/low: low disables parallax and particles), language.
**Accessibility & kids:** easy mode, hum-as-input, tap/hold fallback, rest-break reminders (a gentle "take a breather" card after every 3 minutes of continuous blowing play, default on), colorblind-safe palette, reduce motion (respects `prefers-reduced-motion` by default).
**Profile & data:** manage profiles (up to 4), avatar and balloon skin, view progress, reset progress (double confirmation), privacy notice.

**Parental gate:** "Hold this button for 3 seconds" combined with a simple randomized math question. Required for Settings, the Privacy page, Reset, and enabling fallbacks.

---

## 8. Progress, shop, unlocks

- Coins are earned in play only (no real money anywhere). The Shop sells balloon skins and characters for coins.
- 12+ balloon skins (patterns and colors), plus Lucas & Friends character riders.
- **Character slots:** design the rider system to load character art from `/public/characters/<id>/` (idle, happy, and hit poses as PNG or SVG). Ship with clearly labeled placeholder characters drawn procedurally. RV AppStudios will drop in the real Lucas & Friends art; adding a character must require only an entry in `characters.json`, with no code changes.

### 8.1 QR unlock (puzzle box tie-in)

- URL format: `https://<host>/?unlock=<CODE>`, where CODE is 8–12 non-guessable characters (no ambiguous characters such as 0/O, 1/l).
- `unlocks.json` maps `CODE → { type: "skin" | "character", id, label }`. Use one code per puzzle product.
- On load: read the param, validate it, and store it as a *pending unlock* (it must survive the first-run flow before a profile exists). Apply it to the active profile with a celebration screen, then strip the param from the URL with `history.replaceState`.
- An invalid code shows a friendly "Hmm, that code didn't work" message. An already-owned code shows "You already have this!"
- Codes are client-side and therefore discoverable. That is acceptable for cosmetic unlocks; note it in `DECISIONS.md`.
- Capacitor: add an Android intent filter / App Links for the same URL so scanning opens the installed app. Document the `assetlinks.json` setup in the README.
- Include a script `npm run gen:qr` that outputs print-ready PNG/SVG QR codes for every entry in `unlocks.json`.

---

## 9. Input fallbacks (accessibility, off by default)

Breath is the primary input. All three of the following are enabled behind the parental gate:

1. **Hum mode** (section 3.6).
2. **Tap/hold mode:** holding anywhere on the screen = intensity 0.7, Space key on laptops. For kids who can't blow, or when no mic is available.
3. **Debug keyboard** (`?debug=1` only, never in production UI): number keys 0–9 set intensity. Used for manual testing.

---

## 10. Storage (`Storage.ts`)

- Single key `lbr.save` containing `{ schemaVersion, profiles[], settings, calibrationByDevice, pendingUnlocks[], daily }`.
- Every read is wrapped in try/catch. If the save is corrupt, back up the raw string to `lbr.save.corrupt.<timestamp>`, start fresh, and never crash.
- Write a migration function per schema version, each unit-tested.
- Debounce writes (≤ 1 per second, plus on pause and visibility hidden).
- Storage quota or private-mode failure: the game must still run fully in memory, showing a small one-time notice.
- On Capacitor, the same API backed by the Preferences plugin, through an adapter.

---

## 11. Art, audio, feel

- **Art:** procedural vector drawing in code (paths, gradients kept minimal): rounded, chunky, bright, toddler-friendly. Each world has a 3-layer parallax background. No external image downloads at runtime.
- **Balloon:** an envelope with stripes from the skin, a basket, and a rider. It squashes slightly on lift and wobbles on hit. Burner flame size follows intensity, giving instant visual feedback that the game hears the child.
- **Feedback:** a breath particle stream appears whenever `isBlowing`; collecting a star gives a sparkle and a rising chime.
- **SFX:** synthesized with Web Audio (chime, pop, whoosh, bounce, cheer) so there are no licensing issues. Music: one short loop per world plus a calm track, CC0 or synthesized. Record the source of every asset in `ASSETS.md`.
- **Performance budget:** steady 60 fps on a mid-range Android phone (about 4 GB RAM, 2021). It must stay ≥ 45 fps with 4× CPU throttling in Chrome DevTools. Initial load ≤ 3 MB gzipped.

---

## 12. PWA, hosting, Android

- **Manifest:** name, short_name, icons (192, 512, maskable), `display: standalone`, `orientation: any`, theme colors.
- **Service worker:** precache all assets, giving full offline play after the first visit. When an update is available, show "New version ready, refresh" in the menu, and never during gameplay.
- **GitHub Pages:** set the correct Vite `base`, add a 404 fallback, and use HTTPS only.
- **Capacitor Android:**
  - Declare `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS` in AndroidManifest.
  - Request the runtime permission before calling getUserMedia, and verify that the WebView permission request is granted.
  - Lock to no specific orientation.
  - Immersive full screen.
  - Hardware back handled (section 6).
  - Target the current required API level.
- **Play Store Families policy readiness:** no ads SDKs, no analytics, no data collection. A privacy policy page is included at `/privacy.html`. Document the Data Safety answers ("no data collected") in the README.

---

## 13. Known edge cases (each must be handled and tested)

1. Mic permission denied, then granted later from browser settings: detect it on return and continue.
2. No microphone hardware.
3. Mic disconnected mid-level (Bluetooth headset off, USB unplug).
4. Multiple mics on a laptop, or a chosen device that no longer exists.
5. iOS Safari: AudioContext suspended until a gesture, and the mic stops when the tab is backgrounded.
6. Sample rates of 44.1k and 48k (and others): bin math stays correct.
7. A browser that rejects the disabled-processing constraints, falling back to defaults.
8. A loud room (calibration fails, so show guidance) or a near-silent room.
9. Game music/SFX feeding back into the mic (section 3.5).
10. Talking, laughing, singing, clapping, or tapping the device must not lift the balloon. Shouting may lift it slightly at most.
11. A tab hidden for minutes, then resumed: no time jump, the game stays paused.
12. Orientation change and resize mid-level.
13. Low-end device: auto quality drops to low if average fps < 40 for 5 s.
14. A level completed exactly at midnight (Daily).
15. Corrupt save, full storage, or private browsing.
16. Double-taps or rapid menu taps: no duplicate screens or double rewards (make transitions idempotent).
17. A QR link opened before any profile exists, an invalid code, or an already-owned code.
18. Two tabs open: the last writer wins without corruption (listen to the `storage` event and reload state when it's safe).
19. Very long sessions (30+ minutes): no memory growth (verify with the heap snapshot test in 15.4).
20. Android back button and browser back during gameplay, results, and calibration.

---

## 14. Build order (one release, but in this sequence)

Do not move to the next step until the current step's tests pass.

1. Scaffold: Vite + TS strict, ESLint/Prettier, Vitest, Playwright, CI script `verify`, font self-hosted.
2. `features.ts` + `BreathDetector.ts` + `HumDetector.ts`, built pure, with full unit tests on synthetic signals.
3. `gen:audio` fixtures + `MicInput.ts` + Calibration + MicCheck screen + debug overlay. E2E with the fake mic.
4. Engine: loop, physics, collision, camera, RNG, pooling, each with unit tests.
5. Balloon + one Sunny Meadow level end-to-end (play, hearts, stars, landing, results).
6. Level schema + level bot (section 15.3) + all 30 Adventure levels.
7. Storage + profiles + progress + shop + skins + character slot system.
8. Endless, Daily, Party, Calm, and the three mini-games.
9. Settings + parental gate + all fallbacks + i18n structure.
10. QR unlock + `gen:qr`.
11. Art pass, audio pass, feel and juice, performance pass.
12. PWA + GitHub Pages deploy config + Capacitor Android.
13. Full QA (section 15), fixing everything found and re-running `verify` until it is green.

---

## 15. Testing and QA — "bug-free" gates

### 15.1 Unit tests (Vitest): target ≥ 90% line coverage on `/audio`, `/engine`, `/storage`, `/game/Progress.ts`, `/game/Unlocks.ts`

- **features:** RMS/dB of known sine and noise; flatness ≈ 1 for white noise and ≈ 0 for a pure tone; band ratios correct at both 44.1k and 48k.
- **BreathDetector:**
  - Low-passed noise (blow) → detected within onsetMs + 1 frame.
  - Harmonic tones with formants (speech-like) → not detected.
  - 20 ms impulses (claps) → not detected.
  - Silence → not detected.
  - Hysteresis: no flicker across a 60 ms gap.
  - Intensity is monotonic with input level and clamped to 0..1.
  - Sensitivity scaling is correct.
- **Calibration:** correct floor and max; retry logic; rejection when dynamic range is low.
- **Physics:** zero intensity → falls; equilibrium intensity → hovers within ±2 units over 10 s; velocity clamp; delta clamp.
- **Collision:** table-driven edge cases (tangent, inside, corner).
- **Rng:** same seed gives the same sequence; date seed is stable; different dates differ.
- **Storage:** every migration, corruption recovery, quota failure, in-memory fallback.
- **Unlocks/Progress:** star thresholds, coin math, no double reward, QR validation, pending unlock before a profile exists.
- **Daily:** midnight boundary, streak logic.

### 15.2 End-to-end (Playwright)

- `gen:audio` writes WAV fixtures to `/tests/fixtures/audio/`: silence, room noise, soft blow, hard blow, intermittent blows, speech-like, singing tone, claps, music loop, music + blow.
- Run Chromium with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<fixture>.wav`.
- Test hooks: a test build exposes `window.__lbr` (read-only state: screen, balloon y/vy, isBlowing, intensity, hearts, stars). It **must not exist in production builds**; add a test asserting this.
- Required scenarios:
  - Full first run: splash → permission → calibration → profile → menu.
  - Blow fixture → balloon rises; silence → balloon falls; speech, claps, and music fixtures → balloon does **not** rise.
  - Complete level 1-1 driven by a scripted intensity sequence (test hook) → results show stars → progress persists after reload.
  - Mic denied → Mic Help screen, and the fallback offer sits behind the gate.
  - Pause on `visibilitychange`, and resume by blowing.
  - Daily seed is the same across two fresh contexts on the same mocked date.
  - Party: 3 players complete turns → podium shows correct order.
  - QR: `?unlock=VALID` on a fresh install → after profile creation the skin is owned and the URL is cleaned; an invalid code shows the friendly error.
  - Settings require the parental gate.
  - Offline: load once, go offline, reload → the game is fully playable.
  - Viewports: 360×740 portrait, 740×360 landscape, 1366×768, 1920×1080, with no overlap or clipping (screenshot assertions on the main screens).
  - WebKit project: layout and menus render; the AudioContext resume path is exercised.
  - Zero console errors or warnings across all e2e runs (fail the test on any console error).

### 15.3 Level solvability bot (`npm run test:levels`)

- A headless simulation runs the real Physics + Collision with a search-based controller (beam search over discretized intensity 0–1 in steps of 0.1, at 10 Hz decisions).
- Every one of the 30 levels must be completable without losing a heart, and must be completable while collecting ≥ 95% of the stars (three stars must be possible).
- Run the same check on 200 Endless chunks and 60 consecutive Daily seeds.
- Fairness check: a level fails the bot if it needs intensity above 0.85 sustained for more than 3 s, or rapid toggling faster than 4 Hz. Kids can't do that.

### 15.4 Performance and stability

- Playwright + CDP: 4× CPU throttle, 2 minutes of Endless → average fps ≥ 45, no long tasks over 100 ms during play.
- Heap snapshot at minute 1 and minute 10 of Endless → growth < 5 MB.
- Lighthouse (PWA build): Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, installable.

### 15.5 Manual device QA (`QA_CHECKLIST.md`)

Real microphones differ, and automated tests cannot fully replace this. Create a checklist table and fill in pass/fail with notes for each device:

- Android low-end + mid-range, Chrome (browser and installed PWA)
- Capacitor APK on Android
- Windows laptop Chrome and Edge (built-in mic + a headset)
- MacBook Safari and Chrome
- iPhone Safari (browser and Add to Home Screen)

For each device: calibration succeeds; blow lifts; talking, clapping, and music don't lift; every mode is played once; the QR link works; offline works; rotate mid-level works; mic unplug mid-level works.

### 15.6 Definition of done

- `npm run verify` passes with zero failures and zero lint warnings.
- No `TODO`/`FIXME` left in `/src` (move anything deferred to `DECISIONS.md`).
- No console errors in production play.
- README covers: install, dev, test, build, deploy to GitHub Pages, Android build/sign, adding a character, adding a QR code.
- `DECISIONS.md`, `ASSETS.md`, and `QA_CHECKLIST.md` are complete.
- A final self-review pass over every file against this spec, listing any deviations with reasons.
