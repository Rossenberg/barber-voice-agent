#!/usr/bin/env node
// Compare speech-recognition setups on real caller audio: for each variant a throwaway copy of the agent
// is created, the clips are streamed to it over the Agents WebSocket like a live call, and we print what
// the agent "heard" (user_transcript). Clips: raw 16 kHz mono 16-bit PCM files.
//   node scripts/asr-lab.mjs clip1.pcm clip2.pcm ...
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(readFileSync(join(ROOT, "backend/.env"), "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const { agent_id } = JSON.parse(readFileSync(join(ROOT, "agent/elevenlabs.json"), "utf8"));
const clips = process.argv.slice(2);
if (!clips.length) { console.error("usage: node scripts/asr-lab.mjs <clip.pcm> ..."); process.exit(1); }

async function api(method, path, body) {
  const res = await fetch("https://api.elevenlabs.io" + path, { method, headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}\n${text.slice(0, 600)}`);
  return text ? JSON.parse(text) : {};
}

const main = await api("GET", `/v1/convai/agents/${agent_id}`);
const VARIANTS = {
  current: (c) => c,
  "realtime, Armenian only": (c) => { delete c.language_presets; delete c.agent.prompt.built_in_tools.language_detection; return c; },
  "realtime, no keywords": (c) => { c.asr.keywords = []; return c; },
  scribe_v2_turbo: (c) => { c.asr.provider = "scribe_v2_turbo"; return c; },
  "scribe_v2_turbo, Armenian only": (c) => { c.asr.provider = "scribe_v2_turbo"; delete c.language_presets; delete c.agent.prompt.built_in_tools.language_detection; return c; },
  elevenlabs: (c) => { c.asr.provider = "elevenlabs"; return c; },
};

/** Streams one clip like a live caller and resolves with what the agent transcribed. */
function hear(agentId, pcm) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${agentId}`);
    let started = false, done = false;
    const finish = (text) => { if (done) return; done = true; try { ws.close(); } catch {} resolve(text); };
    setTimeout(() => finish("(timeout)"), 30_000);
    ws.onopen = () => ws.send(JSON.stringify({ type: "conversation_initiation_client_data", dynamic_variables: { caller_phone: "unknown", greeting: "Բարև ձեզ", today: "2026-10-25 (Sunday)" } }));
    ws.onmessage = async (e) => {
      const m = JSON.parse(e.data);
      if (m.type === "ping") ws.send(JSON.stringify({ type: "pong", event_id: m.ping_event.event_id }));
      if (m.type === "user_transcript") finish(m.user_transcription_event.user_transcript);
      if (m.type === "agent_response" && !started) {
        started = true;
        await new Promise((r) => setTimeout(r, 2500)); // let the greeting play out
        const chunk = 3200; // 100 ms
        const silence = Buffer.alloc(chunk * 20); // 2 s of silence ends the turn
        const audio = Buffer.concat([pcm, silence]);
        for (let i = 0; i < audio.length && !done; i += chunk) {
          ws.send(JSON.stringify({ user_audio_chunk: audio.subarray(i, i + chunk).toString("base64") }));
          await new Promise((r) => setTimeout(r, 100));
        }
      }
    };
    ws.onerror = () => finish("(ws error)");
  });
}

for (const [name, mutate] of Object.entries(VARIANTS)) {
  const cfg = mutate(structuredClone(main.conversation_config));
  delete cfg.agent.prompt.tools;
  let id;
  try {
    id = (await api("POST", "/v1/convai/agents/create", { name: `ASR lab (temporary): ${name}`, conversation_config: cfg })).agent_id;
    console.log(`\n=== ${name}`);
    for (const clip of clips) console.log(`  ${basename(clip)}: ${await hear(id, readFileSync(clip))}`);
  } catch (e) {
    console.log(`\n=== ${name}: ERROR ${e.message}`);
  } finally {
    if (id) await api("DELETE", `/v1/convai/agents/${id}`).catch(() => {});
  }
}
