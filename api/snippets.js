// Shared snippet store. Anyone can read; only requests from allowed IP ranges
// (the NHS network) can add, edit or delete.
const crypto = require("crypto");
const defaultSnippets = require("../snippets.json");

const HASH_KEY = "snippets";
const SEEDED_KEY = "snippets:seeded";
const ALLOWED_RANGES = (process.env.ALLOWED_IP_RANGES || "62.6.52.0/24")
  .split(",")
  .map((r) => r.trim())
  .filter(Boolean);

const LIMITS = { title: 100, category: 50, text: 1000 };

// Upstash Redis via its REST API. The Vercel integration sets the KV_* names.
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(...command) {
  const res = await fetch(REDIS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `Redis error ${res.status}`);
  return data.result;
}

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  return (req.headers["x-real-ip"] || (forwarded ? forwarded.split(",")[0] : "") || "").trim();
}

function ipv4ToInt(ip) {
  const parts = ip.replace(/^::ffff:/, "").split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p) || Number(p) > 255) return null;
    n = n * 256 + Number(p);
  }
  return n;
}

function inRange(ip, range) {
  const [base, bitsStr = "32"] = range.split("/");
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(base);
  const bits = Number(bitsStr);
  if (ipInt === null || baseInt === null || !(bits >= 0 && bits <= 32)) return false;
  const size = 2 ** (32 - bits);
  return Math.floor(ipInt / size) === Math.floor(baseInt / size);
}

function canEdit(req) {
  const ip = clientIp(req);
  return ALLOWED_RANGES.some((range) => inRange(ip, range));
}

async function ensureSeeded() {
  // First run only: copy the starter snippets from snippets.json into the store.
  const firstRun = await redis("SET", SEEDED_KEY, "1", "NX");
  if (firstRun !== "OK" || !defaultSnippets.length) return;
  const args = defaultSnippets.flatMap((s) => [s.id, JSON.stringify(clean(s))]);
  await redis("HSET", HASH_KEY, ...args);
}

async function listSnippets() {
  const flat = (await redis("HGETALL", HASH_KEY)) || [];
  const snippets = [];
  for (let i = 0; i < flat.length; i += 2) {
    try {
      snippets.push({ ...JSON.parse(flat[i + 1]), id: flat[i] });
    } catch {
      // Skip corrupt entries rather than failing the whole list.
    }
  }
  return snippets;
}

function clean(input) {
  const out = {};
  for (const [field, max] of Object.entries(LIMITS)) {
    const value = typeof input[field] === "string" ? input[field].trim() : "";
    out[field] = value.slice(0, max);
  }
  return out;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(503).json({ error: "Snippet storage is not configured" });
  }

  try {
    await ensureSeeded();

    if (req.method === "GET") {
      return res.status(200).json({ snippets: await listSnippets(), canEdit: canEdit(req) });
    }

    if (!["POST", "PUT", "DELETE"].includes(req.method)) {
      res.setHeader("Allow", "GET, POST, PUT, DELETE");
      return res.status(405).json({ error: "Method not allowed" });
    }

    if (!canEdit(req)) {
      return res.status(403).json({ error: "Snippets can only be changed from the NHS network" });
    }

    const body = req.body || {};

    if (req.method === "DELETE") {
      if (typeof body.id !== "string") return res.status(400).json({ error: "Missing id" });
      await redis("HDEL", HASH_KEY, body.id);
      return res.status(200).json({ ok: true });
    }

    const snippet = clean(body);
    if (!snippet.title || !snippet.text) {
      return res.status(400).json({ error: "Title and message text are required" });
    }

    if (req.method === "PUT") {
      if (typeof body.id !== "string") return res.status(400).json({ error: "Missing id" });
      const exists = await redis("HEXISTS", HASH_KEY, body.id);
      if (!exists) return res.status(404).json({ error: "Snippet not found" });
      await redis("HSET", HASH_KEY, body.id, JSON.stringify(snippet));
      return res.status(200).json({ snippet: { ...snippet, id: body.id } });
    }

    const id = crypto.randomUUID();
    await redis("HSET", HASH_KEY, id, JSON.stringify(snippet));
    return res.status(201).json({ snippet: { ...snippet, id } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Something went wrong saving snippets" });
  }
};
