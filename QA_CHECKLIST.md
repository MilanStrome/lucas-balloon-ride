# Manual device QA (spec 15.5)

Real microphones differ; automated tests cannot replace this. Fill in **Pass / Fail** with a
short note (device model, OS/browser version, room) for every cell, and record any threshold
change in DECISIONS.md.

**Status: not yet run.** The build was produced and verified in an automated environment
(Windows, Chromium with fake-mic fixtures, Playwright WebKit without Web Audio). No physical
device has been tested yet, so every cell below is open.

## Checks per device

1. Calibration succeeds (quiet + big blow) in a normal room.
2. Blowing lifts the balloon; stopping lets it sink.
3. Talking, clapping, laughing, singing and game music do **not** lift it (shouting: slight at most).
4. Every mode played once: Adventure, Endless, Daily, Party, Calm, Candles, Sailboat, Bubbles.
5. QR link `?unlock=<CODE>` works (fresh install and existing profile).
6. Offline: load once, airplane mode, reload, play.
7. Rotate mid-level: no restart; pauses, resumes by blowing.
8. Mic unplug / Bluetooth headset off mid-level: "Mic lost, tap to reconnect".

## Results

| Device / browser                                  | 1 Calib | 2 Lift | 3 No false lift | 4 Modes | 5 QR | 6 Offline | 7 Rotate | 8 Unplug | Notes                                       |
| ------------------------------------------------- | ------- | ------ | --------------- | ------- | ---- | --------- | -------- | -------- | ------------------------------------------- |
| Android low-end, Chrome (browser)                 | –       | –      | –               | –       | –    | –         | –        | –        | not yet run                                 |
| Android low-end, installed PWA                    | –       | –      | –               | –       | –    | –         | –        | –        | not yet run                                 |
| Android mid-range (~4 GB, 2021), Chrome (browser) | –       | –      | –               | –       | –    | –         | –        | –        | not yet run; also confirm steady 60 fps     |
| Android mid-range, installed PWA                  | –       | –      | –               | –       | –    | –         | –        | –        | not yet run                                 |
| Capacitor APK on Android                          | –       | –      | –               | –       | –    | –         | –        | –        | not yet run; also hardware back + App Links |
| Windows laptop, Chrome, built-in mic              | –       | –      | –               | –       | –    | –         | –        | –        | not yet run                                 |
| Windows laptop, Chrome, headset                   | –       | –      | –               | –       | –    | –         | –        | –        | not yet run; device picker                  |
| Windows laptop, Edge, built-in mic                | –       | –      | –               | –       | –    | –         | –        | –        | not yet run                                 |
| Windows laptop, Edge, headset                     | –       | –      | –               | –       | –    | –         | –        | –        | not yet run                                 |
| MacBook, Safari                                   | –       | –      | –               | –       | –    | –         | –        | –        | not yet run; AudioContext resume            |
| MacBook, Chrome                                   | –       | –      | –               | –       | –    | –         | –        | –        | not yet run                                 |
| iPhone, Safari (browser)                          | –       | –      | –               | –       | –    | –         | –        | –        | not yet run; mic after backgrounding        |
| iPhone, Add to Home Screen                        | –       | –      | –               | –       | –    | –         | –        | –        | not yet run                                 |

## What the automated suite already covers

- Fake-mic fixtures (Chromium): calibration, hard/soft blow, intermittent blows, music + blow
  detected; silence falls; speech, claps, music, singing, room noise never lift.
- Pause on visibility/blur/orientation/back, resume by blowing, no time jump; mic unplug path.
- Offline reload and play from the service-worker cache; installability; layouts at
  360×740, 740×360, 1366×768, 1920×1080.
- 4× CPU throttle fps, long tasks and heap growth in Endless (GPU raster).
