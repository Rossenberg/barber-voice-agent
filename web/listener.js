// Our own "ears": captures the mic, detects when the caller starts and stops talking (energy VAD),
// and hands over each finished phrase as a 16 kHz mono WAV. Used instead of ElevenLabs' realtime
// recognition, which is weak on spoken Armenian.

const RATE = 16000;
const FRAME = 320; // 20 ms at 16 kHz
const START_FRAMES = 3; // 60 ms of voice starts a phrase
const END_FRAMES = 20; // 400 ms of silence ends it
const PRE_ROLL = 15; // keep 300 ms before the start so the first syllable isn't cut
const MIN_VOICE_FRAMES = 12; // ignore clicks shorter than 240 ms of voice
const MAX_FRAMES = 15 * 50; // force-end after 15 s

const WORKLET = `
class Tap extends AudioWorkletProcessor {
  process(inputs) { const ch = inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true; }
}
registerProcessor("tap", Tap);`;

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
 * @param {{ onStart?: () => void, onPhrase: (wav: Blob) => void, isPaused: () => boolean }} handlers
 */
export async function createListener({ onStart, onPhrase, isPaused }) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const ctx = new AudioContext();
  await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" })));
  const source = ctx.createMediaStreamSource(stream);
  const tap = new AudioWorkletNode(ctx, "tap");
  const mute = ctx.createGain();
  mute.gain.value = 0;
  source.connect(tap).connect(mute).connect(ctx.destination);
  if (ctx.state === "suspended") await ctx.resume(); // iOS Safari starts audio contexts suspended

  const ratio = ctx.sampleRate / RATE;
  let carry = new Float32Array(0); // resampled samples waiting to fill a frame
  let pos = 0; // fractional read position for resampling
  let floor = 0.004; // adaptive background-noise level
  let speaking = false, voiceRun = 0, silenceRun = 0, voiceFrames = 0;
  let pre = [], phrase = [];
  const state = { level: 0 };

  function reset() {
    speaking = false; voiceRun = 0; silenceRun = 0; voiceFrames = 0; phrase = []; pre = [];
  }

  function onFrame(frame) {
    let sum = 0;
    for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
    const rms = Math.sqrt(sum / frame.length);
    state.level = Math.min(1, rms * 12);
    if (isPaused()) { if (speaking || pre.length) reset(); return; }

    const threshold = Math.max(0.012, floor * 3.5);
    const voiced = rms > threshold;
    if (!speaking) {
      floor = voiced ? floor : floor * 0.95 + rms * 0.05;
      pre.push(frame);
      if (pre.length > PRE_ROLL) pre.shift();
      voiceRun = voiced ? voiceRun + 1 : 0;
      if (voiceRun >= START_FRAMES) {
        speaking = true; phrase = [...pre]; pre = []; silenceRun = 0; voiceFrames = voiceRun;
        onStart?.();
      }
      return;
    }
    phrase.push(frame);
    if (voiced) { voiceFrames++; silenceRun = 0; } else silenceRun++;
    if (silenceRun >= END_FRAMES || phrase.length >= MAX_FRAMES) {
      const enough = voiceFrames >= MIN_VOICE_FRAMES;
      const frames = phrase.slice(0, phrase.length - Math.max(0, silenceRun - 5)); // trim trailing silence
      reset();
      if (enough) {
        const all = new Float32Array(frames.length * FRAME);
        frames.forEach((f, i) => all.set(f, i * FRAME));
        onPhrase(toWav(all));
      }
    }
  }

  tap.port.onmessage = ({ data }) => {
    // Downsample to 16 kHz by averaging (input is usually 44.1 or 48 kHz).
    const out = [];
    while (pos + ratio <= data.length) {
      let s = 0, n = 0;
      for (let i = Math.floor(pos); i < Math.floor(pos + ratio); i++) { s += data[i]; n++; }
      out.push(n ? s / n : 0);
      pos += ratio;
    }
    pos -= data.length;
    if (pos < 0) pos = 0;
    const merged = new Float32Array(carry.length + out.length);
    merged.set(carry);
    merged.set(out, carry.length);
    let i = 0;
    for (; i + FRAME <= merged.length; i += FRAME) onFrame(merged.slice(i, i + FRAME));
    carry = merged.slice(i);
  };

  return {
    state,
    async stop() {
      tap.port.onmessage = null;
      stream.getTracks().forEach((t) => t.stop());
      await ctx.close().catch(() => {});
    },
  };
}
