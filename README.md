# UMNIK — AI chat assistant for businesses (website chat + Instagram Direct)

Landing page with a live chat demo + owner cabinet (`/app/`). Live: https://umnik.weboostai.workers.dev

> **Voice is off the live site since 2026-11-01** (Armenian recognition isn't reliable enough yet). All voice code is kept in
> [`voice-lab/`](voice-lab/README.md); backend voice endpoints answer 404 unless `VOICE_ENABLED=1`. Run it locally with `scripts/voice-lab.sh`.
> The site as it was with voice: git tag `voice-archive-2026-11-01`. The notes below the line describe the voice setup.

---

- **Voice:** ElevenLabs Agents — Gemini 3.8 Flash, TTS `eleven_v4_turbo` (Jessica = Անի, George = Արամ), ASR Scribe Realtime (high) with slang keywords. Starts in Armenian, switches to English/Russian.
- **Backend:** Cloudflare Worker + D1 (`backend/`). Serves `web/` and the API:
  - `GET /api/public/config` — prices, hours, greeting, on/off; the landing page passes them to the agent as dynamic variables, so dashboard edits apply on the next call.
  - `POST /tools/check-availability`, `/tools/create-booking` — ElevenLabs webhook tools (Bearer `TOOL_SECRET`).
  - `/api/admin/*` — dashboard (password `ADMIN_PASSWORD`, signed session token).

## Run / deploy

```
cd backend && npm install
npm run db:migrate:local && npm run dev          # http://localhost:8878
npm run db:migrate:remote && npm run deploy
node scripts/setup-elevenlabs.mjs                # after changing agent/system-prompt.md
node scripts/simulate.mjs                        # text test calls (Armenian slang, English)
```

Secrets live in `backend/.env` (ElevenLabs key, TOOL_SECRET, ADMIN_PASSWORD, SESSION_SECRET) and as Worker secrets.
