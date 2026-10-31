// Our own "ears": Silero VAD (a small neural network running in the browser) decides when the caller
// starts and stops talking, and each finished phrase is handed over as a 16 kHz mono WAV for Gemini.
// A plain loudness detector failed on phones: auto-gain lifts background noise, so phrases never
// "ended" and arrived 10–20 s late. Needs the onnxruntime-web and vad-web scripts (window.vad).

const VAD_ASSETS = "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.31/dist/";
const ORT_ASSETS = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/";
const RATE = 16000;
const DEBUG = new URLSearchParams(location.search).has("debug"); // ?debug logs what the VAD hears

function toWav(samples) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
  return new Blob([buf], { type: "audio/wav" });
}

/**
 * @param {{ onStart?: () => void, onPhrase: (wav: Blob) => void, isPaused: () => boolean, redemptionMs?: number, minSpeechMs?: number }} handlers
 * Phrases that start while isPaused() is true (the assistant is talking) are dropped, so its own
 * voice leaking into the mic is never sent as the caller's words.
 */
export async function createListener({ onStart, onPhrase, isPaused, redemptionMs = 400, minSpeechMs = 250 }) {
  if (!window.vad?.MicVAD) throw new Error("vad-web is not loaded");
  const state = { level: 0 };
  let startedWhilePaused = false, inSpeech = false, resumedAt = 0;
  let maxProb = 0, maxLevel = 0, lastLog = Date.now();

  const mic = await window.vad.MicVAD.new({
    model: "v5",
    baseAssetPath: VAD_ASSETS,
    onnxWASMBasePath: ORT_ASSETS,
    startOnLoad: false,
    getStream: () => navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }),
    positiveSpeechThreshold: 0.5,
    negativeSpeechThreshold: 0.35,
    redemptionMs, // this much non-speech ends the phrase
    preSpeechPadMs: 300, // keep the first syllable
    minSpeechMs, // shorter is ignored as clicks and coughs
    onFrameProcessed: (probs, frame) => {
      let sum = 0;
      for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
      state.level = Math.min(1, Math.sqrt(sum / frame.length) * 12);
      // They started over the end of the assistant's reply (a quick «հա») and are still talking after it
      // stopped: that's the caller, not its echo — take the phrase instead of dropping all of it.
      if (inSpeech && startedWhilePaused && !isPaused()) {
        resumedAt ||= Date.now();
        // 250 ms lost a quick «այո» said right as the reply ended; an echo dies out well before 120 ms
        if (Date.now() - resumedAt > 120 && probs.isSpeech > 0.5) {
          startedWhilePaused = false;
          if (DEBUG) console.log("VAD speech kept: went on after the assistant stopped");
          onStart?.();
        }
      } else resumedAt = 0;
      if (DEBUG) {
        maxProb = Math.max(maxProb, probs.isSpeech);
        maxLevel = Math.max(maxLevel, state.level);
        if (Date.now() - lastLog > 1000) {
          console.log(`VAD level ${maxLevel.toFixed(2)} speech ${maxProb.toFixed(2)} paused ${isPaused()}`);
          maxProb = 0; maxLevel = 0; lastLog = Date.now();
        }
      }
    },
    onSpeechStart: () => {
      inSpeech = true;
      startedWhilePaused = isPaused();
      if (DEBUG) console.log("VAD speech start", startedWhilePaused ? "(dropped: assistant talking)" : "");
      if (!startedWhilePaused) onStart?.();
    },
    onVADMisfire: () => {
      inSpeech = false;
      if (DEBUG) console.log("VAD misfire (too short)");
    },
    onSpeechEnd: (audio) => {
      inSpeech = false;
      if (DEBUG) console.log(`VAD speech end ${(audio.length / RATE).toFixed(1)}s`);
      if (startedWhilePaused || isPaused()) return;
      onPhrase(toWav(audio));
    },
  });
  await mic.start();

  return {
    state,
    async stop() {
      await mic.destroy();
    },
  };
}
