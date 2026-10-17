# Dino Runner

Dino Runner is a PixelMug MPS mini game. A tiny dinosaur runs on the 32x16 display, jumps over obstacles, plays short prompt sounds, and reports the final score back to the WebApp when the round ends.

## Features

- 32x16 MicroPython game powered by `micropyxel`.
- Jump control from either the PixelMug touch key or the WebApp BLE button.
- Ready, intro, running, and game-over states on device.
- Four-digit score display, capped at `9999`.
- Persistent best score stored on device in `dino_score.json`.
- Obstacle difficulty ramps up as score increases by reducing spawn gaps.
- The hardest obstacle grants a `+100` bonus after it is cleared.
- Prompt sounds for jump, hit, score milestones, and the hardest-obstacle bonus.

## Structure

```text
dino-runner/
  bot/      Bubble bot entrypoint and static WebApp server
  webapp/   Vue 3 + Vite mobile WebApp
  mpy/      MicroPython device-side game and MPS manifest
```

Important device assets live under `mpy/assets/`:

```text
assets/dino_assets.png  Sprite sheet and background
assets/jump.ogg         Jump prompt sound, preloaded
assets/hit.ogg          Collision prompt sound, preloaded
assets/score.ogg        Score milestone prompt sound, preloaded
assets/plus.ogg         Bonus prompt sound, played on demand
```

`plus.ogg` is intentionally not preloaded because it is larger than the other short prompts.

## Device App

The MicroPython app entry file is:

```text
mpy/__main__.py
```

The app depends on:

- `micropyxel`
- `maopaoBleApp`
- `audio_service`
- `mpy_button`

The MPS manifest is `mpy/mps.json`; the current app version is `1.0.5`.

## Controls

- Touch the PixelMug button to start, jump, or restart after game over.
- Press the WebApp jump button to send a BLE jump command.
- While the game is ready, the first jump starts the intro animation.
- While the game is over, the next jump restarts the game.

## BLE Protocol

Jump input uses the simple RAW channel: one byte `0x4A` (`J`). The WebApp
calls `BleAppClient.sendSimpleRaw`; the device receives it via `on_simple`.
The old encrypted `dinoJump`, `jump`, and realtime `jump` inputs are removed.
State queries (`dinoGetState` / `getState`), handshake and game-over reports
remain on the authenticated application channel, as in Duck Hunt.

The existing pointer-down input stays immediate (the following click is
suppressed to avoid duplicates); keyboard/click activation remains supported.
There is no added input cooldown. One write is in flight and at most one latest
pending jump is retained for 250 ms. Disconnect/device changes/view teardown
clear pending input. Failed jumps are not retried; an already-issued bridge
write cannot be cancelled. Device-queued jumps older than 250 ms of logical
VM time and malformed packets are ignored. Airborne jumps are still ignored
by the original game rules. Simple write completion is not a gameplay ACK.

Update both the MPS and WebApp together. No firmware change is required on
firmware that already supports the simple channel. No per-jump debug logging
or vConsole is added.

The current device app does not implement pause, resume, restart, or difficulty configuration BLE methods. Restart is handled by sending another jump command while the device is in `gameover` state.

When a round ends, the MicroPython app sends:

```json
{
  "event": "dinoGameOver",
  "state": "gameover",
  "score": 123,
  "bestScore": 456
}
```

The WebApp stores the best score locally and forwards the game-over score summary to the Bubble bot as `app.dinoBestScore` WebApp data.

## Build WebApp

Install dependencies once:

```sh
npm --prefix webapp install
```

Build the WebApp:

```sh
npm run build
```

Run the local Vite dev server:

```sh
npm run dev
```

Preview the production build:

```sh
npm run preview
```

## Run Bot

Required:

```sh
set BUBBLE_BOT_TOKEN=your-bot-token
```

Optional:

```sh
set BUBBLE_API_BASE_URL=https://api.devjeejio.com:5443/im/
set WEBAPP_HOST=your-lan-ip
set WEBAPP_PORT=8799
set WEBAPP_URL=https://your-public-webapp-url/index.html
set MPS_ID=9898564609
set MPS_VERSION=1.0.5
set APP_LOCALE=zh-CN
set DEBUG=false
```

Start:

```sh
npm run bot
```

If `WEBAPP_URL` is not set, the bot serves `webapp/dist` on `WEBAPP_PORT` and uses `WEBAPP_HOST` to generate the WebApp URL. The bot appends `mps_id`, `mps_version`, and `lang` query parameters when opening the WebApp.

## Bot Commands

- `/bindDevice`: sends the PixelMug binding card.
- `/dinoRunner`: opens the Dino Runner WebApp.
- `/webapp` and `/start`: also open the Dino Runner WebApp.

## Notes

- `dino_assets.png` is loaded with `include_colors=True` and drawn with color key `0`; pure black pixels map to color index `0`, so they are treated as transparent by `blt`.
- Scores are saved on the device after game over, not continuously during play.

## MPS ID

- qa: 6670033921
- release: 9898564609
