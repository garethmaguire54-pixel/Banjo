// Vercel serverless function: image (sheet music) -> ABC notation.
// The API key stays here on the server, never in the browser.
// Set ANTHROPIC_API_KEY in your Vercel project's Environment Variables.

const MODEL = process.env.OMR_MODEL || "claude-sonnet-4-6"; // vision-capable; swap if you like

const OMR_PROMPT = `You are an optical music recognition engine for Irish traditional music. Transcribe the single melody line in this image into ABC notation.
Output ONLY valid ABC — no prose, no markdown code fences.
Include headers X:, T: (use "Transcribed tune" if no title is shown), M:, L:1/8, and K: with the correct key signature.
Match the time signature and key signature exactly as drawn.
Use ' for higher octaves and , for lower, matching the staff positions precisely.
Mark repeats with |: and :| wherever the score shows repeat barlines.
This is likely a jig, reel, hornpipe or polka — respect pickup/anacrusis notes.
If a few notes are ambiguous, give your best single reading rather than skipping bars.`;

module.exports = async (req, res) => {
  // Health check: visit /api/transcribe in a browser to confirm it's deployed + key is set.
  if (req.method === "GET") {
    res.status(200).json({ ok: true, keyPresent: !!process.env.ANTHROPIC_API_KEY, model: MODEL });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  try {
    const KEY = process.env.ANTHROPIC_API_KEY;
    if (!KEY) throw new Error("ANTHROPIC_API_KEY is not set in Vercel env vars.");

    // Vercel parses JSON bodies automatically; guard in case it arrives as a string.
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { image, mediaType } = body;
    if (!image) throw new Error("No image received.");

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 3000,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: image } },
          { type: "text", text: OMR_PROMPT }
        ]}]
      })
    });
    const data = await r.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    const abc = (data.content || [])
      .filter(b => b.type === "text").map(b => b.text).join("")
      .replace(/```[a-zA-Z]*|```/g, "").trim();
    res.status(200).json({ abc });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
