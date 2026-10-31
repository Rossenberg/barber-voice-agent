# Voice lab (off the live site)

The Armenian voice assistant is paused on the public site (2026-11-01): recognition errors are too frequent for live phone lines.
Everything is kept here so we can keep training and testing it locally.

- `realtime-call.js`, `listener.js` — the browser call (OpenAI Realtime + ElevenLabs + Silero VAD)
- `try/` — per-business test page with call + chat (`/try/?biz=<slug>`)
- `realtime/`, `lab/` — debug pages; `dashboard/` — the old BarberVoice demo admin
- backend voice endpoints (`/api/realtime-session`, `/api/rt-tool`, `/api/rt-log`, `/api/tts`, `/api/stt`, `/api/stt-compare`, `/tools/*`) stay in `backend/src/index.ts`, but answer 404 unless `VOICE_ENABLED=1`
- the full site with voice, as it was: git tag `voice-archive-2026-11-01`

Run locally: `scripts/voice-lab.sh`, then open http://localhost:8878/try/?biz=blade
Voice tests: `scripts/brain-test.mjs` (without `CHANNEL=chat`), `scripts/bench.mjs`.

To bring voice back live: move these files back into `web/`, restore the call UI from the tag, and set the `VOICE_ENABLED` var to `1` in wrangler.
