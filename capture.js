// Record ~12 seconds of mono audio and return it resampled to 22050 Hz —
// exactly the format Tunepal's transcriber expects (SAMPLE_RATE * SAMPLE_TIME samples).

const TP_RATE = 22050, TP_SECONDS = 12;

async function record12s(onProgress) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
  });
  const AC = window.AudioContext || window.webkitAudioContext;
  const ac = new AC();
  const src = ac.createMediaStreamSource(stream);
  const proc = ac.createScriptProcessor(4096, 1, 1);
  const inRate = ac.sampleRate;
  const need = inRate * TP_SECONDS;
  const chunks = [];
  let got = 0;

  await new Promise((resolve) => {
    proc.onaudioprocess = (e) => {
      const d = e.inputBuffer.getChannelData(0);
      chunks.push(new Float32Array(d));
      got += d.length;
      if (onProgress) onProgress(Math.min(1, got / need));
      if (got >= need) resolve();
    };
    src.connect(proc);
    proc.connect(ac.destination); // required for onaudioprocess to fire
  });

  proc.disconnect(); src.disconnect();
  stream.getTracks().forEach(t => t.stop());

  const total = chunks.reduce((a, c) => a + c.length, 0);
  const raw = new Float32Array(total);
  let o = 0; for (const c of chunks) { raw.set(c, o); o += c.length; }
  ac.close();

  return resampleLinear(raw, inRate, TP_RATE, TP_RATE * TP_SECONDS);
}

// Simple linear resampler. Good enough for pitch transcription; swap for a
// windowed-sinc resampler later if you want to match the native path exactly.
function resampleLinear(input, inRate, outRate, outLen) {
  const out = new Float32Array(outLen);
  const ratio = inRate / outRate;
  for (let i = 0; i < outLen; i++) {
    const t = i * ratio, i0 = Math.floor(t), frac = t - i0;
    const a = input[i0] || 0, b = input[i0 + 1] || 0;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { record12s, resampleLinear, TP_RATE, TP_SECONDS };
}
