// Trade Machine: serves the static site (NHL, NBA) and the Scout's Take AI endpoint.
// AI runs on Cloudflare Workers AI (free plan: 10,000 neurons/day, no billing; resets 00:00 UTC).
const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const FALLBACK = "@cf/meta/llama-3.1-8b-instruct-fp8-fast";
const LEAGUES = ["NHL", "NBA"];
const PROMPT_RE = new RegExp(`^You are a sharp, fair (${LEAGUES.join("|")}) analyst grading a hypothetical trade`);

// Best-effort per-visitor limit. Counters live in each Worker instance's memory, so they are
// approximate across Cloudflare locations, but they stop one visitor from burning the daily AI quota.
const LIMITS = [
  { windowMs: 60_000, max: 6 },          // 6 reports a minute
  { windowMs: 60 * 60_000, max: 40 },    // 40 an hour
];
const hits = new Map();
function allow(ip) {
  const now = Date.now();
  const longest = LIMITS[LIMITS.length - 1].windowMs;
  const list = (hits.get(ip) || []).filter((t) => now - t < longest);
  for (const { windowMs, max } of LIMITS) {
    if (list.filter((t) => now - t < windowMs).length >= max) { hits.set(ip, list); return false; }
  }
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > longest) hits.delete(k);
  return true;
}

const SECURITY = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "SAMEORIGIN",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...SECURITY },
  });

function extractJSON(text) {
  if (!text) return null;
  if (typeof text === "object") return text;
  const s = String(text);
  try { return JSON.parse(s); } catch {}
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) { try { return JSON.parse(m[1]); } catch {} }
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch {} }
  return null;
}

const clip = (v, n) => String(v ?? "").slice(0, n);
function clean(d) {
  const side = (x) => ({ grade: clip(x && x.grade, 3), headline: clip(x && x.headline, 90), take: clip(x && x.take, 700) });
  return { a: side(d.a), b: side(d.b), verdict: clip(d.verdict, 300) };
}

async function scout(request, env) {
  if (request.method !== "POST") return json({ error: "Use POST" }, 405);
  // Same-origin only: browsers send Origin on POST, so other sites can't spend this site's AI quota.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Forbidden" }, 403);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
  const prompt = String((body && body.prompt) || "");
  // Only accept prompts built by the trade machine pages, so the endpoint can't be used as a general chatbot.
  const m = prompt.match(PROMPT_RE);
  if (prompt.length < 200 || prompt.length > 14000 || !m) return json({ error: "Not a trade report request" }, 400);
  const league = m[1];
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  if (!allow(ip)) return json({ error: "Too many reports, slow down", code: "rate_limited" }, 429);

  const messages = [
    { role: "system", content: `You grade hypothetical ${league} trades for fans. Reply with only one JSON object, no markdown, no extra text.` },
    { role: "user", content: prompt },
  ];
  const notes = [];
  for (const model of [MODEL, FALLBACK]) {
    try {
      const out = await env.AI.run(model, { messages, max_tokens: 900, temperature: 0.4 });
      // Workers AI models answer in a few shapes: {response}, OpenAI-style {choices}, or {result:{response}}.
      const text = out && (out.response ?? out.choices?.[0]?.message?.content ?? out.result?.response ?? out);
      const data = extractJSON(text);
      if (data && data.a && data.b) return json({ result: clean(data), model, ...(notes.length ? { fallback: notes.join(" | ") } : {}) });
      notes.push(`${model.split("/").pop()}: unusable output (${typeof text === "string" ? text.slice(0, 120) : JSON.stringify(text).slice(0, 120)})`);
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (/neuron|daily|quota|allocation/i.test(msg)) return json({ error: "Daily free AI limit reached", code: "rate_limited" }, 429);
      notes.push(`${model.split("/").pop()}: ${msg.slice(0, 160)}`);
    }
  }
  return json({ error: "The AI did not return a usable report", code: "invalid_json", notes }, 502);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/scout") return scout(request, env);
    if (url.pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
    const res = await env.ASSETS.fetch(request);
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(SECURITY)) out.headers.set(k, v);
    return out;
  },
};
