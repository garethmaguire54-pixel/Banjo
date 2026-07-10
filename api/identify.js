// Vercel serverless function: transcribed note-letter string -> candidate tune matches.
//
// This ports the matching half of Bryan Duggan's Tunepal (github.com/bryanduggan/Tunepal):
// tunepal.db's `tunekeys.search_key` is an octave-agnostic, rhythm-quantised letter string
// per tune (e.g. "ABCADGECACC..."). The original Android app compares a device-transcribed
// query against every tune's search_key using an approximate substring edit distance
// (OfflineSearch.edSubstringOld) and returns the closest matches.
//
// We don't need the C++ audio engine here — that part now runs client-side in the browser
// (see the Listen feature in index.html, a JS port of transcriber.cpp/PitchDetector.cpp).
// This endpoint only does the corpus lookup, which is pure string matching.
//
// Corpus: api/data/tunepal-corpus.json, an array of [id, title, searchKey(<=200 chars), notation].
// Extracted from Tunepal's bundled tunepal.db (66,941 tunes, mostly from The Session /
// O'Neill's collections). Loaded once per warm instance and cached in module scope.

const fs = require("fs");
const path = require("path");

const NGRAM = 6;
const MAX_LEN = 200;
const CANDIDATE_POOL = 800;

let CORPUS = null;
let INDEX = null;

function loadCorpus() {
  if (CORPUS) return;
  const raw = fs.readFileSync(path.join(__dirname, "data", "tunepal-corpus.json"), "utf8");
  CORPUS = JSON.parse(raw);
}

// Inverted 6-gram index over each tune's search_key, built once per warm instance.
// (6-grams: the alphabet is only A-G/Z, so short n-grams aren't selective enough —
// tested at 4-grams every tune shares almost every gram. 6 gives good precision.)
function buildIndex() {
  if (INDEX) return;
  INDEX = new Map();
  for (let i = 0; i < CORPUS.length; i++) {
    const sk = CORPUS[i][2];
    const seen = new Set();
    for (let j = 0; j + NGRAM <= sk.length; j++) {
      const gram = sk.substr(j, NGRAM);
      if (seen.has(gram)) continue;
      seen.add(gram);
      let arr = INDEX.get(gram);
      if (!arr) { arr = []; INDEX.set(gram, arr); }
      arr.push(i);
    }
  }
}

function gatherCandidates(needle) {
  const seen = new Set();
  const counts = new Map();
  for (let j = 0; j + NGRAM <= needle.length; j++) {
    const gram = needle.substr(j, NGRAM);
    if (seen.has(gram)) continue;
    seen.add(gram);
    const arr = INDEX.get(gram);
    if (!arr) continue;
    for (const idx of arr) counts.set(idx, (counts.get(idx) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, CANDIDATE_POOL).map(e => e[0]);
}

// Direct port of OfflineSearch.edSubstringOld: approximate substring edit distance.
// Row 0 is zeroed (not 0..n) so the pattern can match anywhere inside the longer text,
// not just as a prefix — this is what makes it tolerant of a tune being sung/played
// from the middle, or the transcription missing the first few notes.
function edSubstring(pattern, text) {
  const pLen = pattern.length, tLen = text.length;
  if (pLen === 0 || tLen === 0) return 0;
  let prev = new Int32Array(tLen + 1);
  let cur = new Int32Array(tLen + 1);
  for (let i = 1; i <= pLen; i++) {
    cur[0] = i;
    const pc = pattern.charCodeAt(i - 1);
    for (let j = 1; j <= tLen; j++) {
      const diff = (text.charCodeAt(j - 1) !== pc) ? 1 : 0;
      const del = prev[j] + 1, ins = cur[j - 1] + 1, sub = prev[j - 1] + diff;
      cur[j] = del < ins ? (del < sub ? del : sub) : (ins < sub ? ins : sub);
    }
    const tmp = prev; prev = cur; cur = tmp;
  }
  let min = prev[0];
  for (let i = 1; i <= tLen; i++) if (prev[i] < min) min = prev[i];
  return min;
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    try {
      loadCorpus();
      res.status(200).json({ ok: true, tunes: CORPUS.length });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  try {
    loadCorpus();
    buildIndex();
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const raw = (body.transcription || "").toUpperCase().replace(/[^A-G]/g, "");
    if (raw.length < 6) {
      throw new Error("Not enough was picked up to identify a tune — try playing a bit longer, closer to the mic, one note at a time.");
    }
    const needle = raw.slice(0, MAX_LEN);
    let pool = gatherCandidates(needle);
    if (!pool.length) {
      // Extremely unusual query with no shared 6-grams anywhere in the corpus — fall
      // back to scanning a bounded slice rather than returning nothing.
      pool = CORPUS.map((_, i) => i).slice(0, CANDIDATE_POOL);
    }
    const scored = pool.map(idx => ({ idx, distance: edSubstring(needle, CORPUS[idx][2].slice(0, MAX_LEN)) }));
    scored.sort((a, b) => a.distance - b.distance);
    const top = scored.slice(0, 10).map(s => {
      const [id, title, , notation] = CORPUS[s.idx];
      const confidence = Math.max(0, 1 - s.distance / needle.length);
      return { id, title, notation, confidence: Math.round(confidence * 100) / 100 };
    });
    res.status(200).json({ matches: top });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
