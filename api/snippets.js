// Shared snippet store. Anyone can read; changes need a request from an allowed
// IP range (the NHS network) and, if EDIT_PIN is set, the practice PIN.
const crypto = require("crypto");
const starter = require("../snippets.json");

const HASH_KEY = "snippets";
const VERSION_KEY = "snippets:version";
const LEGACY_SEEDED_KEY = "snippets:seeded";
const ALLOWED_RANGES = (process.env.ALLOWED_IP_RANGES || "62.6.52.0/24")
  .split(",")
  .map((r) => r.trim())
  .filter(Boolean);
const EDIT_PIN = (process.env.EDIT_PIN || "").trim();
const MAX_PIN_FAILURES = 10;
const PIN_LOCKOUT_SECONDS = 15 * 60;

const LIMITS = { title: 100, category: 50, text: 1000 };

// snippets.json is either a plain list or { "version": n, "snippets": [...] }.
const STARTER_SNIPPETS = Array.isArray(starter) ? starter : starter.snippets || [];
const STARTER_VERSION = String((!Array.isArray(starter) && starter.version) || 1);

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

function onNetwork(ip) {
  return ALLOWED_RANGES.some((range) => inRange(ip, range));
}

function pinMatches(given) {
  const a = crypto.createHash("sha256").update(String(given || "")).digest();
  const b = crypto.createHash("sha256").update(EDIT_PIN).digest();
  return crypto.timingSafeEqual(a, b);
}

// Returns null if the PIN is fine, otherwise [status, message].
async function checkPin(req, ip) {
  if (!EDIT_PIN) return null;
  const failKey = `pinfail:${ip}`;
  const failures = Number(await redis("GET", failKey)) || 0;
  if (failures >= MAX_PIN_FAILURES) {
    return [429, "Too many wrong PIN attempts. Please try again in 15 minutes."];
  }
  if (pinMatches(req.headers["x-edit-pin"])) return null;
  await redis("INCR", failKey);
  await redis("EXPIRE", failKey, PIN_LOCKOUT_SECONDS);
  return [401, "Incorrect PIN"];
}

// Load snippets.json into the store on first run, and again whenever its version number changes.
async function syncStarter() {
  const stored = await redis("GET", VERSION_KEY);
  if (stored === STARTER_VERSION) return;

  if (stored === null && (await redis("EXISTS", LEGACY_SEEDED_KEY))) {
    // Store was filled by an earlier release: keep its contents and start tracking versions.
    await redis("SET", VERSION_KEY, STARTER_VERSION);
    await redis("DEL", LEGACY_SEEDED_KEY);
    return;
  }

  // Claim the update so concurrent requests don't all reset the store.
  const claimed = await redis("SET", `${VERSION_KEY}:lock`, "1", "NX", "EX", 30);
  if (claimed !== "OK") return;
  await redis("DEL", HASH_KEY);
  if (STARTER_SNIPPETS.length) {
    const args = STARTER_SNIPPETS.filter((s) => s && s.title && s.text).flatMap((s) => [
      s.id ? String(s.id) : crypto.randomUUID(),
      JSON.stringify(clean(s)),
    ]);
    if (args.length) await redis("HSET", HASH_KEY, ...args);
  }
  await redis("SET", VERSION_KEY, STARTER_VERSION);
  await redis("DEL", `${VERSION_KEY}:lock`);
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
  const ip = clientIp(req);

  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(503).json({ error: "Snippet storage is not configured", reason: "no-storage", ip });
  }

  try {
    await syncStarter();

    if (req.method === "GET") {
      return res.status(200).json({
        snippets: await listSnippets(),
        canEdit: onNetwork(ip),
        pinRequired: Boolean(EDIT_PIN),
        ip,
      });
    }

    if (!["POST", "PUT", "DELETE"].includes(req.method)) {
      res.setHeader("Allow", "GET, POST, PUT, DELETE");
      return res.status(405).json({ error: "Method not allowed" });
    }

    if (!onNetwork(ip)) {
      return res.status(403).json({ error: "Snippets can only be changed from the NHS network", ip });
    }

    const pinProblem = await checkPin(req, ip);
    if (pinProblem) return res.status(pinProblem[0]).json({ error: pinProblem[1] });

    const body = req.body || {};

    // Lets the page confirm a PIN before remembering it.
    if (req.method === "POST" && body.action === "verify-pin") {
      return res.status(200).json({ ok: true });
    }

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
    return res.status(500).json({ error: "Something went wrong with the snippet store", reason: "storage-error" });
  }
};
