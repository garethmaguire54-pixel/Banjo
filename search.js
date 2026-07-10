// Offline Tunepal search — a faithful JS port of OfflineSearch.java (edSubstringOld).
// Matches a transcribed pitch-letter string ("ABCADGEC…") against every tune's search_key
// using substring edit distance, and ranks by confidence = 1 - distance/needleLength.
// This is the exact algorithm the Android app uses, so results line up with Tunepal.

const MAX_Q = 200; // MAX_QUERY_LENGTH in the original

// Substring edit distance: how well `pattern` (the query) matches anywhere inside `text`
// (a tune's search_key). Row 0 is all zeros so the match can start at any offset.
// 'Z' in the pattern is a wildcard (matches anything), same as the original.
function edSubstring(pattern, text) {
  if (pattern.length > MAX_Q) pattern = pattern.slice(0, MAX_Q);
  if (text.length > MAX_Q) text = text.slice(0, MAX_Q);
  const pl = pattern.length, tl = text.length;
  if (pl === 0 || tl === 0) return 0;

  let prev = new Array(tl + 1).fill(0);
  for (let i = 1; i <= pl; i++) {
    const sc = pattern[i - 1];
    const curr = new Array(tl + 1);
    curr[0] = i;
    for (let j = 1; j <= tl; j++) {
      const diff = (text[j - 1] !== sc && sc !== 'Z') ? 1 : 0;
      const a = prev[j] + 1, b = curr[j - 1] + 1, c = prev[j - 1] + diff;
      curr[j] = a < b ? (a < c ? a : c) : (b < c ? b : c);
    }
    prev = curr;
  }
  let min = prev[1];
  for (let j = 2; j <= tl; j++) if (prev[j] < min) min = prev[j];
  return min;
}

// needle: the transcriber's output string.
// tunes: array of { tunepalid, title, altTitle, tuneType, keySig, searchKey, notation? }
function findClosest(needle, tunes, topN = 10) {
  if (!needle || !tunes || !tunes.length) return [];
  const nlen = needle.length;
  const scored = [];
  for (const t of tunes) {
    if (!t.searchKey) continue;
    const d = edSubstring(needle, t.searchKey);
    scored.push({ tune: t, distance: d, confidence: 1 - d / nlen });
  }
  scored.sort((a, b) => a.distance - b.distance);
  return scored.slice(0, topN);
}

// Title search — substring match on title/altTitle (no transcriber needed).
function findByTitle(needle, tunes, limit = 100) {
  const q = (needle || "").toLowerCase();
  const out = [];
  for (const t of tunes) {
    if ((t.title || "").toLowerCase().includes(q) ||
        (t.altTitle || "").toLowerCase().includes(q)) {
      out.push(t);
      if (out.length >= limit) break;
    }
  }
  return out;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { edSubstring, findClosest, findByTitle };
}
