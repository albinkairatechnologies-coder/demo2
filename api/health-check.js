// api/health-check.js  — Kaira Technologies
// Serverless backend (Vercel). Holds your ANTHROPIC_API_KEY as a SECRET.
// The browser calls THIS endpoint; this endpoint calls Anthropic. Your key is never exposed.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// Use a cost-effective current model. Override with env var MODEL if you like.
// claude-sonnet-4-6  -> good quality + web search (recommended)
// claude-haiku-4-5-20251001 -> cheaper/faster
const MODEL = process.env.MODEL || "claude-sonnet-4-6";

// Restrict who can call this. Set ALLOWED_ORIGIN to your site, e.g. "https://kairatech.in".
// Leave as "*" only while testing.
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

// --- very basic in-memory rate limit (per warm instance) -------------------
// NOTE: serverless instances reset often, so this is a light speed-bump, NOT
// real protection. For production add Upstash Redis / Vercel KV based limiting.
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now(), windowMs = 10 * 60 * 1000, max = 6;
  const arr = (hits.get(ip) || []).filter(t => now - t < windowMs);
  arr.push(now); hits.set(ip, arr);
  return arr.length > max;
}

function clean(s, max = 120) {
  return String(s || "").replace(/[\r\n]+/g, " ").trim().slice(0, max);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });

  if (!process.env.ANTHROPIC_API_KEY)
    return res.status(500).json({ error: "Server missing ANTHROPIC_API_KEY." });

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0] || "anon";
  if (rateLimited(ip))
    return res.status(429).json({ error: "Too many checks. Please try again in a few minutes." });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  const name = clean(body.name), cat = clean(body.cat), town = clean(body.town);
  if (!name || !cat || !town)
    return res.status(400).json({ error: "Business name, type and town are required." });

  const web = clean(body.web) || "none given";
  const social = clean(body.social) || "none given";
  const phone = clean(body.phone) || "none given";

  const prompt = `You are the digital analyst for KAIRA TECHNOLOGIES, a digital marketing agency in Kovilpatti, Tamil Nadu, India. A local business owner has requested a free 5-minute Digital Health Check.

Use web search to look up: the business name + town on Google/Maps, the search "${cat} ${town}" to see who actually ranks at the top, and their website/social profiles if provided. Base your assessment on what you can really find; if you cannot find something, treat it as missing/weak (do not invent details).

BUSINESS:
- Name: ${name}
- Type: ${cat}
- Town: ${town}
- Website: ${web}
- Social: ${social}
- Phone: ${phone}

Assess these 5 areas. For each, give a per-area "score" 0-100 and a "status": "green" (strong), "amber" (needs work) or "red" (missing/urgent):
1. Google Business Profile  2. Search Ranking (do they appear for "${cat} ${town}"?)  3. Reviews & Reputation  4. Website  5. Social Media & Ads

For each area write THREE short, plain lines:
- "finding": what you actually saw (1 short sentence)
- "impact": why it matters to them, in customer/sales terms (1 sentence)
- "action": the specific fix (1 sentence)

Write for a non-technical small business owner. Simple, warm, encouraging, ZERO jargon, no English marketing buzzwords. Frame every gap as a fixable opportunity, never an insult. Be specific to THIS business and town where you can.

Reply with ONLY valid JSON, no markdown, no extra words:
{"overallScore":<0-100 integer>,"grade":"<Needs Urgent Work|Getting There|Strong>","headline":"<one warm sentence on where they stand>","summary":"<2-3 plain sentences: what is holding them back and the opportunity>","competitorNote":"<one sentence on who/how many competitors rank above them for \\"${cat} ${town}\\"; if unknown, a gentle general line>","categories":[{"name":"Google Business Profile","status":"red|amber|green","score":<0-100>,"finding":"...","impact":"...","action":"..."},{"name":"Search Ranking","status":"...","score":<0-100>,"finding":"...","impact":"...","action":"..."},{"name":"Reviews & Reputation","status":"...","score":<0-100>,"finding":"...","impact":"...","action":"..."},{"name":"Website","status":"...","score":<0-100>,"finding":"...","impact":"...","action":"..."},{"name":"Social Media & Ads","status":"...","score":<0-100>,"finding":"...","impact":"...","action":"..."}],"priorityActions":[{"rank":1,"action":"<sentence>","effort":"Quick|Medium|Big","payoff":"High|Medium|Low"},{"rank":2,"action":"...","effort":"...","payoff":"..."},{"rank":3,"action":"...","effort":"...","payoff":"..."}],"quickWin":"<the single most important fix, one sentence>","opportunity":"<one encouraging sentence on the upside; you may note that focused work typically reaches the top 3 on Google in about 3 months>"}`;

  try {
    const r = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        tools: [{
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 3, // caps cost per check
          user_location: { type: "approximate", city: "Chennai", region: "Tamil Nadu", country: "IN", timezone: "Asia/Kolkata" }
        }],
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await r.json();
    if (data.error) return res.status(502).json({ error: data.error.message || "Anthropic API error." });

    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
    const js = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const report = JSON.parse(js);
    report._biz = { name, town };
    return res.status(200).json(report);
  } catch (e) {
    return res.status(500).json({ error: "Could not complete the check. " + (e.message || "") });
  }
}
