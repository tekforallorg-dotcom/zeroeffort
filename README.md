# ZeroEffort

**Talk to your drone. Get the shot.**

ZeroEffort is a consumer-first, natural-language drone companion app. It turns forgotten drones into prompt-controlled flying cameras.

---

## Quick Start

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 18+ (LTS recommended) | [nodejs.org](https://nodejs.org/) or `nvm install --lts` |
| npm | 9+ (comes with Node) | `npm -v` to check |
| Git | 2.x | [git-scm.com](https://git-scm.com/) |
| Expo CLI | latest | Comes via `npx expo` (no global install needed) |
| Supabase CLI | latest | `npm install -g supabase` |
| Android Studio | latest | For Android emulator / device builds |
| Xcode | 15+ | macOS only, for iOS builds |

### 1. Clone and install

```bash
git clone https://github.com/tekforallorg-dotcom/zeroeffort.git
cd zeroeffort
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in your Supabase credentials:
```
EXPO_PUBLIC_SUPABASE_URL=https://kxmvwbsandvlbehbxsgr.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key-from-supabase-dashboard>
```

> **Where to find these:** Supabase Dashboard → `zero effort` project → Settings → API → Project URL and `anon` public key.

### 3. Deploy the Edge Function (Claude API relay)

```bash
npx supabase login
npx supabase link --project-ref kxmvwbsandvlbehbxsgr
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxx
npx supabase functions deploy parse-command
```

> **IMPORTANT:** The Anthropic API key lives ONLY in the Edge Function secret. Never in the mobile app. Never in `.env`.

### 4. Run on device

**Android (Samsung A25 — primary target):**
```bash
# With USB debugging enabled:
npx expo run:android

# Or use Expo Go for quick preview:
npx expo start
# Then scan QR code with Expo Go app
```

**iOS (requires Mac):**
```bash
cd ios && pod install && cd ..
npx expo run:ios
```

---

## Project Structure

```
zeroeffort/
├── app/                          # Expo Router (file-based navigation)
│   ├── _layout.tsx               # Root layout: fonts, splash, providers
│   └── (tabs)/                   # Tab navigator
│       ├── _layout.tsx           # Tab bar config (4 tabs)
│       ├── index.tsx             # Home — drone status, prompt, quick shots
│       ├── fly.tsx               # Fly — live control, timeline, emergency
│       ├── gallery.tsx           # Gallery — outputs with shot labels
│       └── history.tsx           # History — flights, saved shots, recaps
├── src/
│   ├── theme/
│   │   └── index.ts              # Design tokens: Colors, Typography, Surfaces
│   ├── components/
│   │   └── SafeScreen.tsx        # Safe area + status bar wrapper
│   ├── plugins/                  # DronePlugin interface + adapters
│   │   ├── interface.ts          # (Slice 3) DronePlugin contract
│   │   └── mock/MockAdapter.ts   # (Slice 3) Simulated drone
│   ├── core/
│   │   ├── intentParser.ts       # (Slice 4) Hybrid command parsing
│   │   └── safetyGate.ts         # (Slice 4) Safety validation pipeline
│   └── lib/
│       └── supabase.ts           # (Slice 2) Supabase client
├── supabase/
│   └── functions/
│       └── parse-command/        # (Slice 2) Claude API Edge Function
│           └── index.ts
├── assets/                       # Icons, splash, fonts
├── app.json                      # Expo config
├── package.json
├── tsconfig.json                 # Strict TS + path aliases
├── babel.config.js               # Reanimated plugin
├── .env.example                  # Template (never commit .env)
└── .gitignore
```

---

## Architecture

```
ONE project in VS Code
ONE TypeScript codebase
         ↓
React Native (Expo) compiles to:
    ┌────┴────┐
    ▼         ▼
 Android     iOS
```

### Command Pipeline

```
User speaks or types
        ↓
Device STT (free, native)
        ↓
Local parser (deterministic) OR Claude API (flexible)
        ↓
Safety Gate — validates against live drone state
        ↓
Plugin Adapter — SDK calls (Mock → Solo → DJI)
        ↓
Drone executes
```

**Claude is the translator. Your code is the pilot.** Claude API never directly controls the drone.

### Plugin Contract

One interface, many adapters:
```typescript
const drone: DronePlugin = new MockAdapter()   // dev
const drone: DronePlugin = new SoloAdapter()   // 3DR Solo
const drone: DronePlugin = new DJIAdapter()    // DJI
```

---

## Design System: Aero-Metallic Minimal

- **Dark-first** — obsidian/carbon base surfaces
- **One accent** — Electric Sky Blue (#34C8FF)
- **Material depth** — milled plates, smoked glass, inner bevels
- **Ice Glow** — accent as intelligent signal, not decoration
- **Fonts** — Space Grotesk (display), Inter (body), JetBrains Mono (telemetry)
- **Motion** — Reanimated 2, spring physics, breathing mic pulse

---

## Supported Drones (v1 Target)

| Drone | Status | Platform |
|-------|--------|----------|
| MockAdapter (sim) | ✅ Built | Both |
| 3DR Solo | ⏳ Next | Both |
| DJI Mini 4 Pro | Future | Android only (SDK V5) |

---

## Build Slices (Roadmap)

1. ✅ Scaffold + Design System
2. Supabase Schema + Edge Function
3. Plugin Interface + MockAdapter
4. Safety Gate + Command Pipeline
5. Home Screen (full)
6. Fly Screen (full)
7. Gallery + History
8. Voice Input
9. Auth + Onboarding
10. Solo MAVLink Adapter

---

## Tech Stack

- **Mobile:** React Native + Expo (TypeScript, strict)
- **Navigation:** Expo Router (file-based)
- **Animation:** React Native Reanimated 2
- **Backend:** Supabase (auth, DB, storage, edge functions)
- **AI:** Claude API (intent parsing only, via Edge Function)
- **Deployment:** EAS Build (mobile), Vercel (landing page later)

---

## License

Proprietary — Tek4All / ZeroEffort. All rights reserved.
