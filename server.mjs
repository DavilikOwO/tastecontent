import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createQloo, MockQloo } from "./lib/qloo.mjs";
import { createLLM } from "./lib/llm.mjs";
import { buildPlan } from "./lib/pipeline.mjs";
import { createLimiter } from "./lib/limits.mjs";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env file: rely on the real environment.
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

// Qloo: try the live harness; fall back to sample data if it is not ready.
let qloo = createQloo();
let qlooNote = null;
if (qloo.mode === "live") {
  try {
    const ready = await qloo.readiness();
    if (!ready) {
      qlooNote = "Qloo key not configured: using sample data. Run `qloo setup --qloo` or set QLOO_API_KEY.";
      await qloo.close();
      qloo = new MockQloo();
    }
  } catch (error) {
    qlooNote = `Could not start qloo mcp (${error.message}). Using sample data.`;
    qloo = new MockQloo();
  }
}
const llm = createLLM();
if (qlooNote) console.warn(qlooNote);
console.log(`Qloo: ${qloo.mode} · Model: ${llm.mode}`);

// Small in-memory cache so repeated demos do not spend the shared Qloo quota.
const cache = new Map();
const CACHE_MAX = 50;
const limiter = createLimiter();

const app = express();
// Behind a hosting proxy (Render, Railway...) the visitor's IP comes in X-Forwarded-For.
app.set("trust proxy", 1);
app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/status", (_req, res) => {
  res.json({ qloo: qloo.mode, llm: llm.mode, note: qlooNote, limits: limiter.stats() });
});

const isShortString = (v, max) => typeof v === "string" && v.length <= max;

/** Returns [input, errorMessage]. */
function readInput(body) {
  const language = body?.language === "es" ? "es" : "en";
  const es = language === "es";
  const { audience = "", references = [], location = "", confirmed = {}, skip = [], interpretation = null } = body ?? {};

  if (typeof audience !== "string" || audience.trim().length < 10) {
    return [null, es ? "Describe tu audiencia con al menos una frase." : "Describe your audience in at least one sentence."];
  }
  if (audience.length > 1200) {
    return [null, es ? "La descripción es demasiado larga: máximo 1.200 caracteres." : "The description is too long: 1,200 characters at most."];
  }
  if (!Array.isArray(references) || references.length > 5 || !references.every((r) => isShortString(r, 100))) {
    return [null, es ? "Usa como máximo 5 referencias." : "Use 5 references at most."];
  }
  if (!isShortString(location, 80)) return [null, "Location is too long."];
  if (!Array.isArray(skip) || skip.length > 5 || !skip.every((s) => isShortString(s, 100))) {
    return [null, "Invalid skip list."];
  }
  if (typeof confirmed !== "object" || confirmed === null || Array.isArray(confirmed)) return [null, "Invalid choices."];
  const entries = Object.entries(confirmed);
  const validChoice = ([k, v]) =>
    isShortString(k, 100) && v && isShortString(v.id, 200) && v.id && isShortString(v.name, 120) && (v.type == null || isShortString(v.type, 80));
  if (entries.length > 5 || !entries.every(validChoice)) return [null, "Invalid choices."];
  if (interpretation !== null && (typeof interpretation !== "object" || JSON.stringify(interpretation).length > 4000)) {
    return [null, "Invalid interpretation."];
  }

  const cleanConfirmed = Object.fromEntries(entries.map(([k, v]) => [k, { id: v.id, name: v.name, type: v.type ?? null }]));
  return [{ audience, references, location, language, confirmed: cleanConfirmed, skip, interpretation }, null];
}

app.post("/api/plan", async (req, res) => {
  const [input, error] = readInput(req.body);
  if (error) return res.status(400).json({ ok: false, message: error });

  const es = input.language === "es";
  const mode = { qloo: qloo.mode, llm: llm.mode };
  const ndjson = () => {
    // Stream progress as newline-delimited JSON so the page can show each step live.
    res.status(200).set({
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
  };
  const send = (event) => {
    if (!res.writableEnded && !res.destroyed) res.write(`${JSON.stringify(event)}\n`);
  };

  // Plans already built are free: they do not count towards the limits.
  const key = JSON.stringify(input);
  if (cache.has(key)) {
    ndjson();
    send({ type: "done", result: { ...cache.get(key), cached: true, mode } });
    return res.end();
  }

  const ticket = limiter.take(req.ip ?? "unknown");
  if (!ticket.ok) {
    const wait = ticket.retryInMinutes;
    const message =
      ticket.reason === "daily"
        ? es
          ? "La demo ha llegado a su límite de planes de hoy. Vuelve mañana."
          : "The demo has reached today's plan limit. Please come back tomorrow."
        : es
          ? `Has creado varios planes seguidos. Puedes crear otro en ${wait} min.`
          : `You've built several plans in a row. You can build another in ${wait} min.`;
    return res.status(429).json({ ok: false, message });
  }

  ndjson();
  let counted = false;
  try {
    const result = await buildPlan(input, { qloo, llm, onEvent: send });
    if (result.ok) {
      counted = true;
      cache.set(key, result);
      if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    }
    send({ type: "done", result: { ...result, mode } });
  } catch (err) {
    console.error(err);
    send({
      type: "done",
      result: { ok: false, message: es ? `No se pudo generar el plan: ${err.message}` : `The plan could not be built: ${err.message}` },
    });
  } finally {
    // Only finished plans count; asking which reference you meant, or failing, does not.
    if (!counted) ticket.release();
    res.end();
  }
});

const server = app.listen(PORT, () => console.log(`TasteToContent running at http://localhost:${PORT}`));

const shutdown = async () => {
  server.close();
  await qloo.close?.();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
