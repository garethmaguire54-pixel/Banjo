# Tunepal-web — offline "name that tune" for the browser

Built from the real Android Tunepal engine. The pipeline:

```
mic (12s) ──▶ transcribe() ──▶ "ABCADGEC…"  ──▶ edit-distance vs 67k search_keys ──▶ ranked tunes ──▶ ABC ──▶ tab
   capture.js      WASM            (query)              search.js                       corpus        (Bothán)
```

Three pieces. You already have the last one (Bothán renders ABC → tab).

## What's proven and ready

**Search (search.js) — DONE.** A faithful JS port of the app's `OfflineSearch.edSubstringOld`.
Validated against the real 67k-tune corpus:
- perfect query → correct tune at distance 0, confidence 1.00, clear of the field
- ~18%-error query (a realistic noisy recording) → still ranks the correct tune #1 at ~0.8

**Corpus (build-corpus.py) — DONE.** Extracts `tunepal.db` to a web-ready file:
- `--bundle` (search_keys + all ABC) → **10.1 MB gzipped**, 66,953 tunes, fully offline in one file
- default (search-only index, fetch ABC on pick) → **3.7 MB gzipped**
```
python3 build-corpus.py path/to/tunepal.db out/ --bundle
```

**Transcriber (wasm/) — one compile step.** The DSP core (FFT → PitchDetector →
FuzzyHistogram → Transcriber → pitchspeller) is portable C++; only `tunepal.cpp`
(JNI) is Android-specific and is excluded. `wasm/bindings.cpp` exposes it; `wasm/build.sh`
compiles it to `transcriber.wasm` with Emscripten. Contract: feed 264600 mono floats
(12s @ 22050 Hz) → get the query string back.

## Wiring it together (browser)

```js
import { record12s } from "./capture.js";
import { findClosest } from "./search.js";

const corpus = await fetch("index.json.gz").then(r => r.json()); // decompressed by the browser
const wasm = await TunepalWasm();

async function identify() {
  const samples = await record12s(p => showProgress(p));   // Float32Array @ 22050
  const n = wasm._tp_num_samples();
  const ptr = wasm._malloc(n * 4);
  wasm.HEAPF32.set(samples.subarray(0, n), ptr >> 2);
  const query = wasm.UTF8ToString(wasm._tp_transcribe(ptr));
  wasm._free(ptr);

  const matches = findClosest(query, corpus, 10);           // [{tune, distance, confidence}]
  // matches[0].tune.notation  ->  feed to Bothán's parseABC -> tab
}
```

Title search needs no transcriber at all: `findByTitle(text, corpus)`.

## Open items (honest)
- **Emscripten compile** is the one step that needs your machine (`emsdk` + `wasm/build.sh`).
- **Resampler**: `capture.js` uses linear resampling; the native path may use something
  fancier. If match rates look low, that's the first thing to upgrade.
- Bryan's own Tunepal 2.0 brief lists replacing the transcription algorithm with a
  state-of-the-art one (pYin) as a stretch goal — worth knowing the current one is the
  2010-era MATT engine.

## ⚠️ Security note about the Android repo
The `Tunepal-master` repo contains **release keystores** (`*.keystore`) — those are app
signing keys. Do not commit them to a public repo; if this repo ever goes public, rotate them.
