#!/usr/bin/env node
// Creates (or updates) the barbershop voice agent in ElevenLabs: tool secret → 2 webhook tools → agent.
// Safe to re-run: IDs are kept in agent/elevenlabs.json and existing objects are updated.
// Prices, hours and the greeting are NOT baked in: the landing page passes them as dynamic variables
// from the dashboard, so the barber's changes apply to the next call without re-running this script.
//
// Usage: node scripts/setup-elevenlabs.mjs        (needs ELEVENLABS_API_KEY and TOOL_SECRET in backend/.env)

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE = join(ROOT, "backend/.env");
const STATE_FILE = join(ROOT, "agent/elevenlabs.json");
const CONFIG_JS = join(ROOT, "web/config.js");

const BACKEND_URL = "https://barber-voice-agent.gasparyaninvest.workers.dev";
const SITE_HOSTS = ["barber-voice-agent.gasparyaninvest.workers.dev", "localhost"];
const API = "https://api.elevenlabs.io";

const VOICES = {
  female: { id: "cgSgspJ2msm6clMCkdW9", name: "Անի" }, // Jessica
  male: { id: "JBFqnCBsd6RMkjVDRZzb", name: "Արամ" }, // George
};

const AGENT = {
  name: "Blade Barbershop — voice assistant",
  // 3.5 Flash with low thinking: ~1.1–1.5 s per reply with clean Armenian (scripts/llm-lab.mjs, simulate.mjs).
  // Flash-Lite and "minimal" thinking were as fast but leaked tool names into speech.
  // gemini-3.8-flash (the ~/voice-agent-demo winner) took 1.1–1.6 s per reply on real calls.
  llm: "gemini-3.5-flash",
  reasoningEffort: "low",
  ttsModel: "eleven_v4_turbo", // ~100 ms, speaks Armenian; Flash/Multilingual v2 don't
  maxDurationSec: 240,
  dailyCallLimit: 150,
  concurrencyLimit: 3,
  // Words speech recognition should expect (barbershop slang).
  asrKeywords: ["թրաշ", "դզեմ", "ֆեյդ", "մեքենայով", "մորուք", "սափրում", "էգուց", "ախպեր", "կարամ", "կտրվածք", "ուկլադկա"],
  languages: {
    en: { firstMessage: "Hi, this is {{shop_name}}. How can I help?" },
    ru: { firstMessage: "Здравствуйте, {{shop_name}}. Чем помочь?" },
  },
};

// Defaults so the agent also works from the ElevenLabs "Test AI agent" button.
const PLACEHOLDERS = {
  assistant_name: VOICES.female.name,
  shop_name: "Blade Barbershop",
  address: "Երևան, Կենտրոն",
  greeting: "Բարև ձեզ, Blade Barbershop, ես Անին եմ։ Ինչո՞վ օգնեմ։",
  today: "see system time",
  hours: "Monday–Saturday 10:00–21:00; Sunday 11:00–19:00",
  services: "- haircut | Կտրվածք | Haircut | 45 min | 10000 AMD",
  extra_instructions: "-",
  caller_phone: "unknown",
};

const TOOLS = [
  {
    name: "check_availability",
    path: "/tools/check-availability",
    description: "Check if a time is free at the barbershop, or list free times on a date. Always call before confirming any time. Returns nearest_free_times when the requested time is taken, and next_free_days when the day is closed or full.",
    properties: {
      date: { type: "string", description: "Date in YYYY-MM-DD, Yerevan time. Work out 'today', 'tomorrow' (էգուց/վաղը) etc. from today's date." },
      time: { type: "string", description: "Optional requested start time, HH:MM 24h, e.g. 11:00 or 15:30." },
      service_id: { type: "string", description: "Service id from the price list, e.g. haircut, fade_cut, beard_trim. Default haircut." },
    },
    required: ["date"],
  },
  {
    name: "create_booking",
    path: "/tools/create-booking",
    description: "Book the client. Call only after the client agreed to a time that check_availability confirmed as free.",
    properties: {
      service_id: { type: "string", description: "Service id from the price list." },
      date: { type: "string", description: "YYYY-MM-DD, Yerevan time." },
      time: { type: "string", description: "Start time HH:MM 24h." },
      client_name: { type: "string", description: "Client's first name." },
      phone: { type: "string", description: "Client's phone number, e.g. +37491234567 or 091234567. Empty if the client didn't give one." },
      conversation_id: { type: "string", dynamic_variable: "system__conversation_id" },
    },
    required: ["service_id", "date", "time"],
  },
];

// ---------------------------------------------------------------- helpers

const env = Object.fromEntries(
  readFileSync(ENV_FILE, "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
if (!env.ELEVENLABS_API_KEY) fail("ELEVENLABS_API_KEY is missing in backend/.env");
if (!env.TOOL_SECRET) fail("TOOL_SECRET is missing in backend/.env");

const state = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : {};
const saveState = () => writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n");

function fail(msg) {
  console.error(`✘ ${msg}`);
  process.exit(1);
}

async function api(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`${method} ${path} → ${res.status}\n${text.slice(0, 1500)}`);
    err.status = res.status;
    throw err;
  }
  return text ? JSON.parse(text) : {};
}

// ---------------------------------------------------------------- steps

async function ensureSecret() {
  if (state.tool_secret_id) return;
  const res = await api("POST", "/v1/convai/secrets", { type: "new", name: "barber_voice_tool_auth", value: `Bearer ${env.TOOL_SECRET}` });
  state.tool_secret_id = res.secret_id;
  saveState();
  console.log("✓ secret stored");
}

async function ensureTools() {
  state.tools ??= {};
  for (const tool of TOOLS) {
    const tool_config = {
      type: "webhook",
      name: tool.name,
      description: tool.description,
      response_timeout_secs: 15,
      // say "one moment, let me check" first, with a soft typing sound, instead of silence while the
      // LLM decides, the tool runs and the LLM answers again (that silence was ~5 s on a real call)
      pre_tool_speech: "force",
      tool_call_sound: "typing",
      api_schema: {
        url: `${BACKEND_URL}${tool.path}`,
        method: "POST",
        request_headers: { Authorization: { secret_id: state.tool_secret_id } },
        request_body_schema: { type: "object", description: `Arguments for ${tool.name}`, properties: tool.properties, required: tool.required },
      },
    };
    const id = state.tools[tool.name];
    if (id) await api("PATCH", `/v1/convai/tools/${id}`, { tool_config });
    else {
      state.tools[tool.name] = (await api("POST", "/v1/convai/tools", { tool_config })).id;
      saveState();
    }
    console.log(`✓ tool ${tool.name}`);
  }
}

const systemTool = (name) => ({ type: "system", name, description: "", params: { system_tool_type: name } });

async function ensureAgent() {
  const body = {
    name: AGENT.name,
    tags: ["barber-voice-agent"],
    conversation_config: {
      agent: {
        first_message: "{{greeting}}",
        language: "hy",
        dynamic_variables: { dynamic_variable_placeholders: PLACEHOLDERS },
        prompt: {
          prompt: readFileSync(join(ROOT, "agent/system-prompt.md"), "utf8"),
          llm: AGENT.llm,
          reasoning_effort: AGENT.reasoningEffort,
          temperature: 0.3,
          tool_ids: Object.values(state.tools),
          built_in_tools: { end_call: systemTool("end_call"), language_detection: systemTool("language_detection") },
        },
      },
      tts: { model_id: AGENT.ttsModel, voice_id: VOICES.female.id },
      asr: { quality: "high", provider: "scribe_realtime", keywords: AGENT.asrKeywords },
      language_presets: Object.fromEntries(
        Object.entries(AGENT.languages).map(([code, l]) => [code, { overrides: { agent: { first_message: l.firstMessage, language: code } } }]),
      ),
      conversation: { max_duration_seconds: AGENT.maxDurationSec },
      // the page sends Gemini transcripts (~2 s after the caller stops), so wait longer before "are you there?"
      turn: { turn_timeout: 15 },
    },
    platform_settings: {
      auth: { enable_auth: false, allowlist: SITE_HOSTS.map((hostname) => ({ hostname })) },
      // the landing page picks the voice (female/male) and the starting language; nothing else can be overridden
      overrides: { conversation_config_override: { tts: { voice_id: true }, agent: { language: true } } },
      call_limits: { agent_concurrency_limit: AGENT.concurrencyLimit, daily_limit: AGENT.dailyCallLimit },
    },
  };

  if (state.agent_id) {
    await api("PATCH", `/v1/convai/agents/${state.agent_id}`, body);
    console.log("✓ agent updated");
  } else {
    state.agent_id = (await api("POST", "/v1/convai/agents/create", body)).agent_id;
    saveState();
    console.log("✓ agent created");
  }
}

// ---------------------------------------------------------------- run

try {
  await ensureSecret();
  await ensureTools();
  await ensureAgent();
  writeFileSync(
    CONFIG_JS,
    `// Generated by scripts/setup-elevenlabs.mjs — the agent id is public by design.\nwindow.BARBER_VOICE = ${JSON.stringify({ agentId: state.agent_id, voices: VOICES })};\n`,
  );
  console.log(`\nDone. Agent id: ${state.agent_id}`);
  console.log(`Open in ElevenLabs: https://elevenlabs.io/app/agents/agents/${state.agent_id}`);
} catch (err) {
  if (err.status === 401) fail("ElevenLabs rejected the API key (401). Check ELEVENLABS_API_KEY and its permissions.");
  fail(err.message);
}
