# Balloon Ride — Game Overview

A breath-controlled game for young children (about 3–7 years old). Kids **blow on the phone,
tablet or laptop** to fly a hot-air balloon: blow to rise, stop to sink. No reading is needed to
play, and there is no harsh "game over".

By RV AppStudios. No ads, no in-app purchases, no tracking, and it works offline.

---

## How to play

1. Tap **Tap to start!** and allow the microphone.
2. **Mic check:** stay quiet for a moment, then blow as hard as you can. The game learns how
   loud the room is and how strong the child's blow is. (It only runs the first time on each
   device.)
3. Pick a buddy (an animal face). A name is optional.
4. Choose a game from the menu.

**Controls**

| Action            | How                                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Rise              | Blow at the microphone (bottom edge of a phone, near the keyboard or camera on a laptop)                                |
| Rise faster       | Blow harder                                                                                                             |
| Hover             | Blow gently and steadily                                                                                                |
| Sink              | Stop blowing                                                                                                            |
| Other way to play | **Try another way** on the start screen: tap and hold anywhere to fly (blowing still works too). Space bar on a laptop. |
| Pause             | Pause button, or switch apps / turn the phone                                                                           |
| Resume            | Blow, or tap **Resume**                                                                                                 |

The balloon's flame grows when the game hears the child, and white puffs stream out while
they blow, so kids can see it's working.

---

## Game modes

### Adventure — 6 worlds × 5 levels

Each level is a 45–75 second flight. Collect stars, avoid obstacles, and land gently on the
striped landing pad at the end (stop blowing over the pad to land).

| World           | What's new                                                                     |
| --------------- | ------------------------------------------------------------------------------ |
| 1. Sunny Meadow | The basics: float, collect stars, land on the pad                              |
| 2. Windy Hills  | Wind areas push the balloon up, down, faster or slower (shown by swirly lines) |
| 3. Bird Forest  | Moving birds and bees                                                          |
| 4. Rain Clouds  | Rain makes the balloon heavier (blow harder); dark storm clouds to avoid       |
| 5. Night Sky    | It's dark: only the area around the balloon and the fireflies is lit           |
| 6. Space        | Low gravity, so tiny puffs go far; floating asteroids                          |

- **Stars:** 1 to 3 stars per level, based on how many were collected (40%, 70%, 95%).
  Finishing always earns at least 1 star.
- **Hearts:** 3 per level. Bumping a bird, cloud, tree or the ground costs a heart and the
  balloon bounces away with a short blinking safe time. Losing all hearts shows a friendly
  **"Let's try again!"**.
- **Gentle landing:** landing slowly on the pad earns bonus coins.
- **Power-ups** (from World 2): shield (blocks one bump), star magnet (8 s), slow-motion cloud (5 s).
- **Unlocking:** all levels are open by default. Grown-ups can switch off **Unlock all levels**
  in Settings so each level opens after finishing the one before (and each world after 4 of 5).

Every level has been checked by an automatic player to make sure it can be finished without
losing a heart, with almost all the stars, and without needing a hard or long blow.

### Endless Sky

A never-ending flight that slowly gets faster and trickier. The score is the distance flown,
and the best distance is saved for each player.

### Daily Sky

A new 1-minute course every day, the same for everyone on that date (works offline).
Finishing it earns coins once per day and builds a **streak** of days in a row. Missing a day
just starts a new streak, with a kind message.

### Party (pass the phone)

2–6 players each pick a buddy, then take turns flying the same course. A
**"Pass to…"** card and a 3-2-1 countdown come between turns. At the end, a podium shows who
flew furthest (ties share a place).

### Calm Breathing

A quiet bedtime breathing game. A glowing ring grows while the child breathes in and shrinks
while they blow out gently. Choose the rhythm (3/5, 4/6 or 4/7 seconds) and 1, 3 or 5 minutes.
The balloon floats nicely when the blow is steady; blowing too hard only makes it wobble.
It ends with the balloon landing, a moon, and **"Goodnight!"**.
_(It's a gentle game, not a medical or therapy tool.)_

### Mini-games

| Game             | Goal                                                                                |
| ---------------- | ----------------------------------------------------------------------------------- |
| Birthday Candles | Blow steadily to put out the candles on a cake, one by one (3–8 candles)            |
| Sailboat Race    | Blow the boat across the waves to the dock before time runs out                     |
| Bubble Blower    | Blow gently to grow a bubble, stop to let it float away. Blow too hard and it pops! |

---

## Coins, shop and rewards

- Coins are earned only by playing (stars, coins in the sky, gentle landings, Daily, mini-games).
  There is no real money anywhere in the game.
- The **Shop** sells balloon designs (stripes, dots, hearts, stars, rainbow, galaxy and more)
  and riders that sit in the basket.
- **Puzzle-box QR codes** can unlock special balloons and riders: scanning the code opens the
  game and shows a celebration.

---

## For grown-ups (Settings)

Settings sit behind a simple math question so small children don't change them by accident.

| Section              | Options                                                                                                                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Breath control       | Sensitivity, check the mic again, live mic meter, hold-to-lift or puff-to-hop, choose the microphone                                                                                    |
| Sound & display      | Music and sound volume, vibration, graphics quality, language                                                                                                                           |
| Accessibility & kids | Easy mode (unlimited hearts, gentler gravity), hum to fly, tap/hold to fly, unlock all levels, rest-break reminders (every 3 minutes of blowing), colorblind-safe colors, reduce motion |
| Profile & data       | Up to 4 players, change buddy, see progress, reset progress (asks twice), privacy notice                                                                                                |

---

## Safety and privacy

- The microphone is only **measured** (how loud, what kind of sound). Sound is **never
  recorded, saved or sent anywhere**.
- Talking, laughing, singing, clapping and music don't make the balloon rise; only blowing does.
- No ads, no purchases, no accounts, no analytics. Progress is saved only on the device.
- Rest-break reminders and gentle levels help avoid tiring or dizzy kids. Grown-ups should
  still keep an eye out and stop if a child feels light-headed.

---

## Where it runs

- **Phones and tablets:** Android Chrome and iPhone/iPad Safari. It can be added to the home
  screen and then works like an app, even offline.
- **Laptops:** Chrome, Edge and Safari on Windows and Mac.
- **Android app:** a Play Store version is prepared from the same game.

Landscape gives the biggest view, but portrait works too.

---

## Under the hood (short version)

- Web game built with TypeScript and HTML5 canvas. All art and sounds are drawn and
  synthesized in code, so nothing is downloaded while playing.
- Breath detection listens for the "whooshy", low-pitched sound of breath and ignores
  tuneful sounds like voices and music.
- Tested automatically with recorded-style sounds (blowing, talking, claps, music), a level-solving
  robot, speed and memory checks, and accessibility checks.
- More detail for developers: `README.md`, `DECISIONS.md`, `GAME_SPEC.md`.
