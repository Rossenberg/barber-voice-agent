# BarberVoice — Armenian voice assistant for barbershops

Landing page with a live voice demo + barber dashboard. Live: https://barber-voice-agent.weboostai.workers.dev (dashboard at `/dashboard/`).

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
