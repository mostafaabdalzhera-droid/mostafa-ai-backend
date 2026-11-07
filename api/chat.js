import { createHash } from "node:crypto";

const systemPrompt = "أنت MOSTAFA AI، مساعد مفيد للدراسة والبرمجة والكتابة والإبداع. أجب بالعربية افتراضياً، واتبع لغة المستخدم عندما يطلب ذلك. كن واضحاً ودقيقاً، ولا تختلق معلومات. وضّح حدود معرفتك.";

async function enforceRateLimit(req) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("Rate limiting is not configured");
  // Vercel supplies this trusted header; do not trust a client-supplied forwarded-for value.
  const ip = String(req.headers["x-vercel-forwarded-for"] || req.socket?.remoteAddress || "unknown");
  const hash = createHash("sha256").update(ip).digest("hex");
  const key = "mostafa:chat:" + hash + ":" + Math.floor(Date.now() / 60000);
  const response = await fetch(url.replace(/\/$/, "") + "/pipeline", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify([["INCR", key], ["EXPIRE", key, "120"]]),
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw new Error("Rate limit service unavailable");
  const result = await response.json();
  if (!Array.isArray(result) || result.some(item => item.error) || typeof result[0]?.result !== "number")
    throw new Error("Invalid rate limit result");
  return result[0].result <= 15;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const origins = (process.env.ALLOWED_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean);
  const origin = req.headers.origin;
  res.setHeader("Vary", "Origin");
  if (!origin || !origins.includes(origin)) {
    return res.status(403).json({ error: "هذا الموقع غير مسموح له بالاتصال." });
  }
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "طريقة الطلب غير مدعومة." });
  }
  if (!(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
    return res.status(415).json({ error: "يلزم إرسال بيانات JSON." });
  }
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: "خدمة المحادثة غير مُعدّة بعد." });
  try {
    if (!await enforceRateLimit(req)) {
      res.setHeader("Retry-After", "60");
      return res.status(429).json({ error: "طلبات كثيرة. حاول بعد دقيقة." });
    }
  } catch {
    return res.status(503).json({ error: "الخدمة غير متاحة مؤقتاً. حاول لاحقاً." });
  }
  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (Buffer.byteLength(JSON.stringify(body ?? {}), "utf8") > 32000) {
      return res.status(413).json({ error: "الرسالة طويلة جداً." });
    }
  } catch {
    return res.status(400).json({ error: "الطلب غير صالح." });
  }
  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 20 ||
      messages.some(m => !m || !["user", "assistant"].includes(m.role) ||
        typeof m.content !== "string" || !m.content.trim() || m.content.length > 4000) ||
      messages[messages.length - 1]?.role !== "user") {
    return res.status(400).json({ error: "أرسل محادثة صحيحة تنتهي برسالة المستخدم." });
  }
  if (messages.reduce((n, m) => n + m.content.length, 0) > 16000) {
    return res.status(413).json({ error: "المحادثة طويلة. ابدأ محادثة جديدة." });
  }
  try {
    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.OPENAI_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        instructions: systemPrompt,
        input: messages.map(m => ({ role: m.role, content: m.content.trim() })),
        max_output_tokens: 1200,
        store: false
      }),
      signal: AbortSignal.timeout(45000)
    });
    if (!upstream.ok) {
      console.error("OpenAI request failed", upstream.status, upstream.headers.get("x-request-id"));
      return res.status(upstream.status === 429 ? 429 : 502).json({
        error: upstream.status === 429 ? "الخدمة مشغولة الآن. حاول لاحقاً." : "تعذّر الحصول على رد. حاول لاحقاً."
      });
    }
    const data = await upstream.json();
    const reply = (data.output || []).filter(item => item.type === "message")
      .flatMap(item => item.content || []).filter(item => item.type === "output_text")
      .map(item => item.text || "").join("\n").trim();
    if (!reply) return res.status(502).json({ error: "لم يصل رد نصّي. حاول مرة أخرى." });
    return res.status(200).json({ reply });
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    return res.status(timedOut ? 504 : 502).json({
      error: timedOut ? "استغرق الرد وقتاً طويلاً. حاول مرة أخرى." : "حدث خطأ في الاتصال. حاول لاحقاً."
    });
  }
}
