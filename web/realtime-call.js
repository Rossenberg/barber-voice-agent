// The voice call used on the landing page and on /realtime/: OpenAI Realtime hears the caller and thinks
// (text out, with the calendar as tools), ElevenLabs speaks the reply with a native Armenian voice
// (OpenAI's own Armenian voice has a strong accent). Every call is logged for review and cost reports.
import { createListener } from "/listener.js";

/**
 * @param {object} opts
 * @param {"female"|"male"} opts.voice
 * @param {"elevenlabs"|"openai"} [opts.speech] who speaks; "openai" is only for comparison on /realtime/
 * @param {string} [opts.caller] demo caller ID
 * @param {string} [opts.biz] which business answers (its slug); none = the demo barbershop
 * @param {object} ui
 * @param {(text: string, cls: string) => HTMLElement} ui.add       show a message ("user" | "agent" | "tool")
 * @param {(key: string) => string} ui.t                             text for: tool.check, tool.checked, tool.book, tool.booked, tool.failed, tool.error, voice.error
 * @param {(state: string) => void} ui.state                         connected | hearing | answering | listening | unstable | failed
 * @param {(el: HTMLElement, ms: number) => void} [ui.latency]       first sound of a reply, ms after the caller stopped
 * @param {(speaking: boolean) => void} [ui.speaking]
 */
export async function startCall({ voice, speech = "elevenlabs", caller = "", biz = "" }, ui) {
  const params = new URLSearchParams(location.search);
  const DEBUG = params.has("debug");
  const actx = new AudioContext(); // created right after the tap so iPhone allows sound
  const out = actx.createAnalyser(); // everything the assistant says goes through here (for the orb)
  out.fftSize = 512;
  out.connect(actx.destination);
  const outData = new Uint8Array(out.fftSize);
  let pc = null, stream = null, micTrack = null, dc = null, recorder = null;
  let toolOutputs = []; // calendar results waiting for the current response to finish
  let pendingTurn = null; // waiting for the text transcript of the caller's phrase before replying
  let stoppedAt = 0, agentEl = null, textBuf = "";
  let playEnd = 0, sources = [], unmuteTimer = null, speakGen = 0, playing = false;
  let callId = "", turn = 0, callStartedAt = 0, ended = false;
  let callToken = "";
  const voiceSeed = Math.floor(Math.random() * 1e9); let spokenBefore = ""; // the server's signed pass: who is calling, for finding/changing their bookings
  // One response at a time: asking for a new one while another runs is an error and made the assistant
  // say extra lines («…դեռ ընթացքի մեջ է»), so requests wait for the current response to finish.
  let responseActive = false, responseWanted = false;
  // Our own Silero VAD decides when the caller's phrase ends ("manual" turns). OpenAI's VAD took traffic
  // noise for speech and kept listening, and its mic pause after each reply swallowed a quick «հա».
  // OpenAI's semantic VAD is only the fallback if Silero fails to load.
  let manual = false, inPhrase = false, phraseTimer = null, holdTimer = null, micOn = true, lastAgentText = "";
  let skipText = false, toolInResponse = false, owed = false, retriedFailed = false, phraseCapped = false, owedTimer = null; // a reply dropped because the caller kept talking
  const hasWords = (s) => /\p{L}/u.test(s ?? "");
  // On silence or noise the recognizer sometimes returns its own vocabulary hint as if the caller said it:
  // treat that as no words at all.
  const HINT_ECHO = /Զանգ վարսավիրանոց|Անուններ՝|Հեռախոսահամարը թվերով|երևանյան խոսակցական/;
  const realWords = (s) => hasWords(s) && !HINT_ECHO.test(s);
  const send = (obj) => dc?.readyState === "open" && dc.send(JSON.stringify(obj));

  function requestResponse() {
    clearTimeout(owedTimer);
    if (responseActive) {
      responseWanted = true;
      return;
    }
    responseActive = true;
    owed = false;
    send({ type: "response.create" });
  }

  // Silero heard the caller start talking.
  function phraseStarted() {
    if (!manual) return;
    if (holdTimer) {
      // a short pause and they went on (a number said in pieces): still the same phrase
      clearTimeout(holdTimer);
      holdTimer = null;
      return;
    }
    inPhrase = true;
    phraseCapped = false;
    ui.state("hearing");
    clearTimeout(phraseTimer);
    // loud noise or music can keep the VAD "hearing" forever: answer what we have
    phraseTimer = setTimeout(() => { phraseCapped = true; phraseEnded(); }, 9000);
    // A sound in the mic no longer cancels the reply being prepared: with music or a TV on, every reply got
    // cancelled and the assistant went silent for minutes. A real new phrase is handled once its text arrives.
  }

  // Silero heard a pause. Wait a little in case they go on: a phone number comes in pieces with pauses,
  // and answering after the first piece cut the caller off (and short pieces are recognized badly).
  function phrasePaused() {
    if (!manual || !inPhrase) return;
    clearTimeout(holdTimer);
    const askedNumber = /համար|номер|number/i.test(lastAgentText);
    holdTimer = setTimeout(phraseEnded, askedNumber ? 1000 : 250);
  }

  // The phrase is over: hand the audio to OpenAI and wait for its transcript.
  function phraseEnded() {
    retriedFailed = false;
    clearTimeout(phraseTimer);
    clearTimeout(holdTimer);
    holdTimer = null;
    if (!manual || !inPhrase) return;
    inPhrase = false;
    send({ type: "input_audio_buffer.commit" });
    clearTimeout(pendingTurn);
    pendingTurn = setTimeout(() => replyToTurn(null), 1500); // the transcript usually arrives in 0.3-0.8 s
    stoppedAt = performance.now();
  }

  function log(role, fields) {
    if (!callId) return;
    const form = new FormData();
    form.append("call_id", callId);
    form.append("turn", String(turn));
    form.append("role", role);
    if (callToken) form.append("call_token", callToken); // tells the log which business the call belongs to
    for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null) form.append(k, v);
    fetch("/api/rt-log", { method: "POST", body: form }).catch(() => {});
  }
  // What each call consumed, for the cost per minute (scripts/cost-report.mjs).
  const usage = (data) => log("usage", { text: JSON.stringify(data) });

  function markLatency(el) {
    if (!stoppedAt || !el || el.dataset.ms) return;
    const ms = Math.round(performance.now() - stoppedAt);
    el.dataset.ms = String(ms);
    ui.latency?.(el, ms);
    stoppedAt = 0;
  }

  // Reply to the caller's phrase: hand the model the text transcript too (it understands better with both),
  // or reply from the audio alone if the transcript is late.
  function replyToTurn(transcript) {
    if (!pendingTurn) return;
    clearTimeout(pendingTurn);
    pendingTurn = null;
    if (transcript) {
      const noisy = phraseCapped ? " This was 9+ seconds of nonstop sound — probably music, a TV or other people in the background: if it isn't said to you, ignore it and answer the caller's last real request (or «Ալո, լսո՞ւմ եք ինձ։»)." : "";
      send({ type: "conversation.item.create", item: { type: "message", role: "system", content: [{ type: "input_text", text: `Speech recognizer heard the caller say: «${transcript}». Use it together with the audio; where they differ, trust what makes sense for a barbershop booking.${noisy}` }] } });
    }
    if (inPhrase) {
      owed = true; // they're still talking: answer once, after the rest of it
      // …but background sound can keep a "phrase" going: answer within 2 s anyway
      clearTimeout(owedTimer);
      owedTimer = setTimeout(() => { if (owed) requestResponse(); }, 2000);
      return;
    }
    requestResponse();
  }

  // The mic is muted while our own TTS plays, otherwise OpenAI would hear the assistant's voice as the caller.
  function setMic(on) {
    clearTimeout(unmuteTimer);
    if (on) {
      // A short wait lets the echo die down; it was 400 ms, which swallowed a quick «հա» right after a question.
      unmuteTimer = setTimeout(() => {
        if (!micTrack || ended) return;
        micTrack.enabled = true;
        micOn = true;
        if (manual && !inPhrase) send({ type: "input_audio_buffer.clear" }); // drop the silence sent while muted
      }, manual ? 120 : 400);
    } else {
      if (micTrack) micTrack.enabled = false;
      micOn = false;
    }
  }

  /** Speaks a reply with ElevenLabs (streamed 24 kHz PCM, played as it arrives). */
  async function speak(text, el) {
    // Replies within one caller turn (e.g. «one moment» and then the confirmation) play one after another;
    // a reply left over from an earlier turn is dropped when the caller speaks again (see speech_stopped).
    const gen = speakGen;
    usage({ kind: "tts", chars: text.length });
    // same seed for the whole call and the previous reply as context, so the voice stays the same person
    const res = await fetch("/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, voice, seed: voiceSeed, prev: spokenBefore }) });
    spokenBefore = text;
    if (!res.ok || !res.body) return void ui.add(ui.t("voice.error"), "tool");
    if (gen !== speakGen || ended) return void res.body.cancel();
    setMic(false);
    playing = true;
    ui.speaking?.(true);
    if (actx.state !== "running") await actx.resume().catch(() => {}); // iPhone suspends it: replies went out silent
    const reader = res.body.getReader();
    let rest = new Uint8Array(0), first = true;
    playEnd = Math.max(playEnd, actx.currentTime + 0.05);
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (gen !== speakGen || ended) { reader.cancel(); return; }
      const bytes = new Uint8Array(rest.length + value.length);
      bytes.set(rest);
      bytes.set(value, rest.length);
      const n = bytes.length >> 1;
      rest = bytes.slice(n * 2);
      if (!n) continue;
      const view = new DataView(bytes.buffer, 0, n * 2);
      const buf = actx.createBuffer(1, n, 24000);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < n; i++) ch[i] = view.getInt16(i * 2, true) / 32768;
      const src = actx.createBufferSource();
      src.buffer = buf;
      src.connect(out);
      src.start(playEnd);
      sources.push(src);
      if (first) { first = false; markLatency(el); }
      playEnd += buf.duration;
    }
    const left = Math.max(0, playEnd - actx.currentTime);
    setTimeout(() => {
      if (!ended && actx.currentTime >= playEnd - 0.01) {
        sources = [];
        playing = false;
        setMic(true);
        ui.speaking?.(false);
        ui.state("listening");
      }
    }, left * 1000 + 30);
  }

  function onEvent(e) {
    const ev = JSON.parse(e.data);
    if (DEBUG) console.log(ev.type, ev);
    switch (ev.type) {
      case "input_audio_buffer.speech_started":
        ui.state("hearing");
        break;
      case "input_audio_buffer.speech_stopped":
        // Wait for the transcript before doing anything: noise and the assistant's own echo also end up here,
        // and cutting the reply off on them made it start sentences over and over.
        clearTimeout(pendingTurn);
        pendingTurn = setTimeout(() => replyToTurn(null), 1500); // the transcript usually arrives in 0.3-0.8 s
        stoppedAt = performance.now();
        break;
      case "conversation.item.input_audio_transcription.completed": {
        const text = ev.transcript?.trim() ?? "";
        if (ev.usage) usage({ kind: "transcribe", usage: ev.usage });
        if (!realWords(text)) {
          // just noise: ignore it, don't interrupt or answer
          clearTimeout(pendingTurn);
          pendingTurn = null;
          stoppedAt = 0;
          log("event", { text: "ignored a phrase without words (noise/echo)" });
          if (owed && !inPhrase) requestResponse(); // the reply we dropped for it is still owed
          else if (!playing) ui.state("listening");
          break;
        }
        if (!pendingTurn) {
          // late transcript: the reply already started from the audio alone — just show it
          ui.add(text, "user");
          log("user", { text });
          break;
        }
        // A real new phrase. A reply already being heard plays to the end (cutting it on every sound left
        // callers with music on hearing nothing); one not yet audible is dropped — this phrase gets one answer.
        if (!sources.length) {
          speakGen++;
          if (responseActive && !toolInResponse) {
            skipText = true;
            send({ type: "response.cancel" });
          }
        }
        turn++;
        agentEl = null;
        ui.state("answering");
        ui.add(text, "user");
        if (stoppedAt) usage({ kind: "transcript_delay", ms: Math.round(performance.now() - stoppedAt) });
        replyToTurn(text);
        log("user", { text });
        break;
      }
      case "response.created":
        responseActive = true;
        skipText = false;
        toolInResponse = false;
        // server VAD: muted as soon as the assistant starts answering, so it can't hear its own voice.
        // Manual turns keep the mic open while it thinks (the caller may go on talking); speak() mutes it.
        if (!manual) setMic(false);
        break;
      // OpenAI speaking itself (comparison mode)
      case "output_audio_buffer.started":
        agentEl ??= ui.add("", "agent");
        markLatency(agentEl);
        break;
      case "response.output_audio_transcript.done":
        agentEl ??= ui.add("", "agent");
        agentEl.prepend(ev.transcript ?? "");
        log("agent", { text: ev.transcript ?? "", latency_ms: agentEl.dataset.ms });
        agentEl = null;
        ui.state("listening");
        break;
      // text only: ElevenLabs speaks
      case "response.output_text.delta":
        textBuf += ev.delta ?? "";
        break;
      case "response.output_text.done": {
        const text = (ev.text ?? textBuf).replace(/[‹›]/g, "").trim(); // phrasebook slot marks, never meant to be said
        textBuf = "";
        if (!text || skipText) break;
        lastAgentText = text;
        const el = ui.add(text, "agent");
        speak(text, el).then(() => log("agent", { text, latency_ms: el.dataset.ms }));
        break;
      }
      // the assistant checks the calendar or books
      case "response.function_call_arguments.done": {
        const booking = ev.name === "create_booking";
        toolInResponse = true;
        const pending = ui.add(ui.t(booking ? "tool.book" : "tool.check"), "tool");
        let args = {};
        try { args = JSON.parse(ev.arguments || "{}"); } catch {}
        const ready = fetch("/api/rt-tool", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: ev.name, args, call_token: callToken }) })
          .then((r) => r.json())
          .catch(() => ({ error: "network" }))
          .then((result) => {
            pending.textContent = ui.t(result.error ? "tool.error" : booking ? (result.success ? "tool.booked" : "tool.failed") : "tool.checked");
            if (!result.error) pending.classList.add("ok");
            log("event", { text: `${ev.name} ${JSON.stringify(args)} → ${JSON.stringify(result).slice(0, 600)}` });
            return { call_id: ev.call_id, output: JSON.stringify(result) };
          });
        toolOutputs.push(ready);
        break;
      }
      case "response.done":
        responseActive = false;
        if (ev.response?.usage) usage({ kind: "openai", usage: ev.response.usage });
        // OpenAI sometimes fails a response outright (seen in quick test series): try once more instead of going quiet
        // out of OpenAI credit: retrying won't help — tell the page, don't sit in silence
        if (ev.response?.status === "failed" && /insufficient_quota|credit_balance/.test(JSON.stringify(ev.response.status_details ?? {}))) {
          log("event", { text: "error insufficient_quota: OpenAI credit exhausted" });
          ui.state("quota");
          break;
        }
        if (ev.response?.status === "failed" && !retriedFailed) {
          retriedFailed = true;
          log("event", { text: `response failed, retrying: ${JSON.stringify(ev.response.status_details ?? {}).slice(0, 200)}` });
          setTimeout(requestResponse, 600);
          break;
        }
        if (toolOutputs.length) {
          const outs = toolOutputs;
          toolOutputs = [];
          Promise.all(outs).then((items) => {
            for (const it of items) dc?.send(JSON.stringify({ type: "conversation.item.create", item: { type: "function_call_output", call_id: it.call_id, output: it.output } }));
            requestResponse();
          });
        } else if (responseWanted) {
          responseWanted = false;
          requestResponse();
        } else if (!playing) {
          setMic(true); // nothing to say (or it failed): don't leave the mic muted
        }
        break;
      case "error":
        console.error("realtime", ev.error);
        log("event", { text: `error ${ev.error?.message ?? ""}` });
        break;
    }
  }

  function stop() {
    if (ended) return;
    ended = true;
    if (callStartedAt) usage({ kind: "call", seconds: Math.round((Date.now() - callStartedAt) / 1000), voice, speech });
    clearTimeout(pendingTurn);
    clearTimeout(unmuteTimer);
    clearTimeout(phraseTimer);
    clearTimeout(holdTimer);
    pc?.close();
    recorder?.stop();
    stream?.getTracks().forEach((t) => t.stop());
    sources.forEach((s) => { try { s.stop(); } catch {} });
    actx.close().catch(() => {});
  }

  try {
    // Our own ears first: Silero ends the caller's phrases (and records each one for the log).
    // ?turn=server keeps OpenAI's VAD, for comparison.
    if (params.get("turn") !== "server") {
      recorder = await createListener({
        onStart: phraseStarted,
        onPhrase: (wav) => {
          phrasePaused();
          log("user_audio", { audio: new File([wav], "phrase.wav", { type: "audio/wav" }) });
        },
        isPaused: () => playing || !micOn,
        redemptionMs: 500, // then phrasePaused() waits a bit more
        minSpeechMs: 120, // a quick «հա» is ~0.2 s
      }).catch((err) => (console.error("listener", err), null));
      manual = !!recorder;
    }
    const extra = ["stt", "effort", "nr"].map((k) => (params.get(k) ? `&${k}=${encodeURIComponent(params.get(k))}` : "")).join("");
    const sess = await (await fetch(`/api/realtime-session?voice=${voice}&speech=${speech}&caller=${encodeURIComponent(caller)}${biz ? `&biz=${encodeURIComponent(biz)}` : ""}&turn=${manual ? "manual" : "server"}${extra}`, { method: "POST" })).json();
    callToken = sess.call_token ?? "";
    if (!sess.key) throw new Error(sess.error || "no key");
    pc = new RTCPeerConnection();
    if (speech === "openai") {
      const audio = new Audio();
      audio.autoplay = true;
      pc.ontrack = (e) => (audio.srcObject = e.streams[0]);
    }
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    micTrack = stream.getTracks()[0];
    pc.addTrack(micTrack);
    pc.onconnectionstatechange = () => {
      const st = pc?.connectionState;
      if (st === "failed" || st === "disconnected") {
        ui.state(st === "failed" ? "failed" : "unstable");
        log("event", { text: `connection ${st}` });
      }
    };
    dc = pc.createDataChannel("oai-events");
    dc.onclose = () => log("event", { text: "data channel closed" });
    dc.onmessage = onEvent;
    // Fixed greeting from the dashboard instead of letting the model improvise the shop's name.
    const cfg = await (await fetch(`/api/public/config${biz ? `?biz=${encodeURIComponent(biz)}` : ""}`, { cache: "no-store" })).json();
    if (!cfg.enabled) throw new Error("disabled");
    const greeting = cfg.greeting.replaceAll("{shop}", cfg.shop_name_spoken || cfg.shop_name).replaceAll("{name}", voice === "male" ? "Արամ" : "Անի");
    dc.onopen = () => {
      if (speech === "elevenlabs") {
        dc.send(JSON.stringify({ type: "conversation.item.create", item: { type: "message", role: "assistant", content: [{ type: "output_text", text: greeting }] } }));
        speak(greeting, ui.add(greeting, "agent"));
      } else {
        dc.send(JSON.stringify({ type: "response.create", response: { instructions: `Say exactly this greeting, nothing else: «${greeting}»` } }));
      }
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const res = await fetch("https://api.openai.com/v1/realtime/calls", { method: "POST", body: offer.sdp, headers: { authorization: `Bearer ${sess.key}`, "content-type": "application/sdp" } });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
    await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });
    callId = crypto.randomUUID();
    callStartedAt = Date.now();
    log("event", { text: `turns: ${manual ? "silero" : "openai vad"}` });
    ui.state("connected");
  } catch (err) {
    stop();
    throw err;
  }

  return {
    stop,
    /** 0..1 loudness of whoever is talking, for the orb */
    level: () => {
      out.getByteTimeDomainData(outData);
      let sum = 0;
      for (const v of outData) sum += ((v - 128) / 128) ** 2;
      return Math.max(Math.min(1, Math.sqrt(sum / outData.length) * 4), recorder?.state.level ?? 0);
    },
  };
}
