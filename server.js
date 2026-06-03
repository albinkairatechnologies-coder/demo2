require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 8000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Health check endpoint
app.post('/api/health-check', async (req, res) => {
  const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
  const MODEL = "claude-sonnet-4-6";

  function clean(s, max = 120) {
    return String(s || "").replace(/[\r\n]+/g, " ").trim().slice(0, max);
  }

  const body = req.body || {};
  const name = clean(body.name), cat = clean(body.cat), town = clean(body.town);
  
  if (!name || !cat || !town) {
    return res.status(400).json({ error: "Business name, type and town are required." });
  }

  const web = clean(body.web) || "none given";
  const social = clean(body.social) || "none given";
  const phone = clean(body.phone) || "none given";

  const prompt = `You are the digital analyst for KAIRA TECHNOLOGIES, a digital marketing agency in Kovilpatti, Tamil Nadu, India. A local business owner has requested a free 5-minute Digital Health Check.

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

Write for a non-technical small business owner. Simple, warm, encouraging, ZERO jargon, no English marketing buzzwords. Frame every gap as a fixable opportunity, never an insult.

Reply with ONLY valid JSON, no markdown, no extra words:
{"overallScore":<0-100 integer>,"grade":"<Needs Urgent Work|Getting There|Strong>","headline":"<one warm sentence on where they stand>","summary":"<2-3 plain sentences: what is holding them back and the opportunity>","competitorNote":"<one sentence on who/how many competitors rank above them for \"${cat} ${town}\"; if unknown, a gentle general line>","categories":[{"name":"Google Business Profile","status":"red|amber|green","score":<0-100>,"finding":"...","impact":"...","action":"..."},{"name":"Search Ranking","status":"...","score":<0-100>,"finding":"...","impact":"...","action":"..."},{"name":"Reviews & Reputation","status":"...","score":<0-100>,"finding":"...","impact":"...","action":"..."},{"name":"Website","status":"...","score":<0-100>,"finding":"...","impact":"...","action":"..."},{"name":"Social Media & Ads","status":"...","score":<0-100>,"finding":"...","impact":"...","action":"..."}],"priorityActions":[{"rank":1,"action":"<sentence>","effort":"Quick|Medium|Big","payoff":"High|Medium|Low"},{"rank":2,"action":"...","effort":"...","payoff":"..."},{"rank":3,"action":"...","effort":"...","payoff":"..."}],"quickWin":"<the single most important fix, one sentence>","opportunity":"<one encouraging sentence on the upside>"}`;

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
    console.error(e);
    return res.status(500).json({ error: "Could not complete the check. " + (e.message || "") });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
