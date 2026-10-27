#!/usr/bin/env node
// Real cost per minute of /realtime/ calls, from what each call logged (role "usage" in realtime_log).
//   node scripts/cost-report.mjs          (last 10 calls)
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// USD per 1M tokens, gpt-realtime-2.1 (developers.openai.com/api/docs/pricing, 2026-10-27)
const OPENAI = { text_in: 4, cached_text_in: 0.4, audio_in: 32, cached_audio_in: 0.4, text_out: 24, audio_out: 64 };
const TRANSCRIBE_PER_MIN = 0.0045; // gpt-transcribe
const TTS_PER_1K_CHARS = 0.04; // ElevenLabs v4 Turbo (ElevenAPI pricing page)

const sql = "SELECT call_id, text FROM realtime_log WHERE role = 'usage' AND call_id IN (SELECT call_id FROM realtime_log WHERE role = 'usage' GROUP BY call_id ORDER BY MAX(id) DESC LIMIT 10) ORDER BY id";
const out = execFileSync("npx", ["wrangler", "d1", "execute", "barber-voice-agent", "--remote", "--json", "--command", sql], { cwd: join(ROOT, "backend"), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
const rows = JSON.parse(out)[0].results;

const calls = new Map();
for (const r of rows) {
  const c = calls.get(r.call_id) ?? { seconds: 0, openai: 0, transcribe: 0, tts: 0, chars: 0, tokens: { audio_in: 0, cached: 0, text_in: 0, text_out: 0 } };
  const u = JSON.parse(r.text);
  if (u.kind === "call") c.seconds = u.seconds;
  if (u.kind === "tts") { c.chars += u.chars; c.tts += (u.chars / 1000) * TTS_PER_1K_CHARS; }
  if (u.kind === "transcribe") c.transcribe += u.usage?.seconds ? (u.usage.seconds / 60) * TRANSCRIBE_PER_MIN : 0;
  if (u.kind === "openai") {
    const inD = u.usage.input_token_details ?? {}, outD = u.usage.output_token_details ?? {};
    const cachedD = inD.cached_tokens_details ?? {};
    const cachedText = cachedD.text_tokens ?? 0, cachedAudio = cachedD.audio_tokens ?? 0;
    const text = Math.max(0, (inD.text_tokens ?? 0) - cachedText), audio = Math.max(0, (inD.audio_tokens ?? 0) - cachedAudio);
    c.openai += (text * OPENAI.text_in + cachedText * OPENAI.cached_text_in + audio * OPENAI.audio_in + cachedAudio * OPENAI.cached_audio_in + (outD.text_tokens ?? 0) * OPENAI.text_out + (outD.audio_tokens ?? 0) * OPENAI.audio_out) / 1e6;
    c.tokens.audio_in += inD.audio_tokens ?? 0; c.tokens.cached += inD.cached_tokens ?? 0; c.tokens.text_in += inD.text_tokens ?? 0; c.tokens.text_out += outD.text_tokens ?? 0;
  }
  calls.set(r.call_id, c);
}

let totalSec = 0, totalCost = 0;
for (const [id, c] of calls) {
  const cost = c.openai + c.transcribe + c.tts;
  if (!c.seconds) { console.log(`${id.slice(0, 8)}  (no end time — call not hung up properly)  $${cost.toFixed(4)}`); continue; }
  totalSec += c.seconds; totalCost += cost;
  console.log(`${id.slice(0, 8)}  ${(c.seconds / 60).toFixed(1)} min  OpenAI $${c.openai.toFixed(4)}  voice $${c.tts.toFixed(4)} (${c.chars} chars)  transcript $${c.transcribe.toFixed(4)}  = $${cost.toFixed(4)}  → $${(cost / (c.seconds / 60)).toFixed(3)}/min   [tokens: text in ${c.tokens.text_in} (cached ${c.tokens.cached}), audio in ${c.tokens.audio_in}, text out ${c.tokens.text_out}]`);
}
if (totalSec) console.log(`\nAll: ${(totalSec / 60).toFixed(1)} min, $${totalCost.toFixed(3)} → $${(totalCost / (totalSec / 60)).toFixed(3)} per minute`);
