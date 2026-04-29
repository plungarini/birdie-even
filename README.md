# Birdie

**Hear a bird? Know it instantly.**

Birdie is a real-time bird identification app for the [Even Realities Glasses](https://www.evenrealities.com/) smart glasses. It listens to the world around you, analyzes bird songs with [BirdNET](https://birdnet.cornell.edu/), and shows the species name, confidence, and photo right on your glasses HUD — no need to pull out your phone.

## What it does

Birdie turns your G2 glasses into an ambient birdwatching companion. Whether you're on a hike, in your garden, or just curious about that chirp outside your window, Birdie continuously captures short audio clips, runs them through an AI model trained by the Cornell Lab of Ornithology, and surfaces detections directly in your field of view. The companion phone UI provides a full detection history, live waveform, and rich settings.

## Key Features

- **Real-time bird recognition** – Powered by BirdNET AI for accurate species identification from audio.
- **G2 HUD + Phone UI** – Dual-layer architecture: a lightweight heads-up display on the glasses, and a detailed React-based companion app on your phone.
- **Dual microphone support** – Use the G2 glasses microphone or fall back to the phone microphone.
- **eBird enrichment** – Results are enriched with eBird taxonomy: localized common names, species images, and direct links to species pages.
- **Location-aware analysis** – Optional GPS coordinates improve BirdNET accuracy for your region.
- **Live waveform visualization** – See audio activity in real time on both the HUD and the phone UI.
- **Persistent session history** – Tracks every species heard during a session, with best confidence, count, and timestamps.
- **Configurable thresholds** – Adjust inference interval, mic gain, confidence threshold, and sensitivity to match your environment.
- **Multi-language names** – Localized bird common names via eBird taxonomy.
- **Resilient networking** – Automatic retry with countdown on network or server errors.

## How it works / User flow

1. **Launch** – Open Birdie from the Even Hub. The glasses show an idle screen; the phone shows the companion UI.
2. **Start listening** – Tap the glasses (or press **Start listening** on the phone) to begin capture.
3. **Capture & analyze** – Audio is recorded in short overlapping chunks, converted to WAV, and sent to the BirdNET backend.
4. **Detect** – When a bird is identified above your confidence threshold, its name, scientific name, confidence score, and image pop up on the HUD.
5. **Review** – The phone UI updates live with a waveform, a blinking detection card, and a scrollable history of all species heard.
6. **Stop / Exit** – Tap once to stop listening. Double-tap the glasses to exit the app cleanly.

## Tech Stack

| Layer             | Tech                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------- |
| **Glasses HUD**   | Raw `@evenrealities/even_hub_sdk` (TypeScript) – direct container rendering, no framework     |
| **Phone UI**      | React 19 + Vite + Tailwind CSS + [`even-toolkit`](https://github.com/fabioglimb/even-toolkit) |
| **State sharing** | Custom lightweight store (`src/store.ts`) – shared between HUD and phone layers               |
| **Backend proxy** | [Hono](https://hono.dev/) on Cloudflare Workers – forwards audio, enriches responses          |
| **AI inference**  | Python FastAPI + [`birdnetlib`](https://github.com/joeweiss/birdnetlib) + ffmpeg              |
| **Data sources**  | [eBird API](https://documenter.getpostman.com/view/664302/S1ENwy59) (taxonomy & images)       |
| **Build tool**    | Vite 8 + TypeScript 5                                                                         |
| **Packaging**     | `@evenrealities/evenhub-cli` → `.ehpk` for Even Hub distribution                              |

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Start dev server, QR code generator, and local backend proxy
npm run dev

# 3. Scan the QR code with the Even App to load on your glasses

# 4. (Optional) Run the Even Hub Simulator in another terminal
npm run emulator

# 5. Package for distribution
npm run pack       # outputs birdie.ehpk
```

### Environment setup

Copy `.env.example` to `.env` and fill in:

```bash
VITE_WORKER_URL=https://your-worker.your-subdomain.workers.dev
```

For local development, Vite proxies `/analyze` to the Wrangler dev server on port `3001` automatically.

The BirdNET Python server (in `birdnet-server/`) can be deployed separately — see `birdnet-server/deploy.ps1` for a Windows deployment helper.

## Why Birdie exists

Smart glasses are at their best when they augment the world without pulling you out of it. Birdie solves a simple but magical problem: **you hear something interesting, and you want to know what it is — immediately, hands-free, without opening an app on your phone.** By combining the G2's always-available HUD with world-class bioacoustics AI, Birdie makes casual birdwatching effortless and turns every walk into a live nature documentary.
