#!/usr/bin/env node
// Speed + Armenian quality of candidate LLMs: for each one a throwaway copy of the agent gets the same
// typed caller lines over the Agents WebSocket (text-only, so we time the LLM alone).
//   node scripts/llm-lab.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(readFileSync(join(ROOT, "backend/.env"), "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const { agent_id } = JSON.parse(readFileSync(join(ROOT, "agent/elevenlabs.json"), "utf8"));
const SITE = "https://barber-voice-agent.gasparyaninvest.workers.dev";

const ALL = [
  ["gemini-3.8-flash", null],
  ["gemini-3.8-flash", "low"],
  ["gemini-3.5-flash", "minimal"],
  ["gemini-3.5-flash-lite", "minimal"],
  ["gemini-3.1-flash-lite", "minimal"],
];
// optional filter: node scripts/llm-lab.mjs gemini-3.8-flash:low gemini-3.5-flash:minimal
const pick = process.argv.slice(2);
const CANDIDATES = pick.length ? pick.map((p) => { const [m, e] = p.split(":"); return [m, e && e !== "default" ? e : null]; }) : ALL;
const LINES = ["Բարև բարև, Արամ ջան, ոնց ես ախպերս", "Թրաշս դզեմ, ինչ արժե՞", "Էգուց տասնմեկին տեղ կա՞"];

async function api(method, path, body) {
  const res = await fetch("https://api.elevenlabs.io" + path, { method, headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}\n${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : {};
}

const cfg = await (await fetch(`${SITE}/api/public/config`)).json();
const vars = {
  assistant_name: "Արամ", shop_name: cfg.shop_name, address: cfg.address, greeting: "Բարև ձեզ", today: `${cfg.today} (Sunday)`,
  hours: cfg.hours_text, services: cfg.services_text, extra_instructions: "-", caller_phone: "+37491234567",
};

function talk(agentId) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${agentId}`);
    const out = [];
    let i = -1, sentAt = 0, gotFirst = false;
    const next = () => {
      i++;
      if (i >= LINES.length) { ws.close(); return resolve(out); }
      gotFirst = false;
      sentAt = Date.now();
      ws.send(JSON.stringify({ type: "user_message", text: LINES[i] }));
    };
    setTimeout(() => { ws.close(); resolve(out); }, 60_000);
    ws.onopen = () => ws.send(JSON.stringify({ type: "conversation_initiation_client_data", dynamic_variables: vars, conversation_config_override: { conversation: { text_only: true } } }));
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.type === "ping") ws.send(JSON.stringify({ type: "pong", event_id: m.ping_event.event_id }));
      if (m.type === "conversation_initiation_metadata") setTimeout(next, 300);
      if (m.type === "agent_response" && i >= 0) {
        const text = m.agent_response_event.agent_response;
        out.push(`${gotFirst ? "      " : `${((Date.now() - sentAt) / 1000).toFixed(2)}s`}  ${text}`);
        if (!gotFirst) { gotFirst = true; clearTimeout(talk.t); }
        clearTimeout(talk.t);
        talk.t = setTimeout(next, 2500); // wait for follow-up sentences (e.g. after a tool call)
      }
    };
  });
}

const main = await api("GET", `/v1/convai/agents/${agent_id}`);
for (const [llm, effort] of CANDIDATES) {
  const c = structuredClone(main.conversation_config);
  delete c.agent.prompt.tools;
  c.agent.prompt.llm = llm;
  c.agent.prompt.reasoning_effort = effort;
  let id;
  try {
    id = (await api("POST", "/v1/convai/agents/create", { name: `LLM lab (temporary): ${llm} ${effort}`, conversation_config: c, platform_settings: { overrides: { conversation_config_override: { conversation: { text_only: true } } } } })).agent_id;
    console.log(`\n=== ${llm} (${effort ?? "default"})`);
    for (const line of await talk(id)) console.log(line);
  } catch (e) {
    console.log(`\n=== ${llm} ${effort}: ERROR ${e.message}`);
  } finally {
    if (id) await api("DELETE", `/v1/convai/agents/${id}`).catch(() => {});
  }
}
