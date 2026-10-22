// NHL Trade Machine: serves the page and the Scout's Take AI endpoint.
// AI runs on Cloudflare Workers AI (free plan: 10,000 neurons/day, no billing).
const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const FALLBACK = "@cf/meta/llama-3.1-8b-instruct-fp8-fast";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

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

async function scout(request, env) {
  if (request.method !== "POST") return json({ error: "Use POST" }, 405);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
  const prompt = String(body && body.prompt || "");
  // Only accept prompts built by the trade machine page, so the endpoint can't be used as a general chatbot.
  if (prompt.length < 200 || prompt.length > 14000 || !prompt.startsWith("You are a sharp, fair NHL analyst grading a hypothetical trade")) {
    return json({ error: "Not a trade report request" }, 400);
  }
  const messages = [
    { role: "system", content: "You grade hypothetical NHL trades for fans. Reply with only one JSON object, no markdown, no extra text." },
    { role: "user", content: prompt },
  ];
  for (const model of [MODEL, FALLBACK]) {
    try {
      const out = await env.AI.run(model, { messages, max_tokens: 700, temperature: 0.6 });
      const data = extractJSON(out && (out.response ?? out));
      if (data && data.a && data.b) return json({ result: data, model });
    } catch (e) {
      const msg = String(e && e.message || e);
      if (/limit|quota|neuron|429|capacity/i.test(msg)) return json({ error: "Daily free AI limit reached", code: "rate_limited" }, 429);
    }
  }
  return json({ error: "The AI did not return a usable report", code: "invalid_json" }, 502);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/scout") return scout(request, env);
    return env.ASSETS.fetch(request);
  },
};
