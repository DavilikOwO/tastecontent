import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createQloo, MockQloo } from "./lib/qloo.mjs";
import { createLLM } from "./lib/llm.mjs";
import { buildPlan } from "./lib/pipeline.mjs";

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

const app = express();
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/status", (_req, res) => {
  res.json({ qloo: qloo.mode, llm: llm.mode, note: qlooNote });
});

app.post("/api/plan", async (req, res) => {
  const { audience = "", references = [], location = "", language = "en" } = req.body ?? {};
  if (typeof audience !== "string" || audience.trim().length < 10) {
    return res.status(400).json({
      ok: false,
      message: language === "es" ? "Describe tu audiencia con al menos una frase." : "Describe your audience in at least one sentence.",
    });
  }
  if (audience.length > 1200 || !Array.isArray(references) || references.length > 5) {
    return res.status(400).json({ ok: false, message: "Input too long: max 1,200 characters and 5 references." });
  }
  const input = { audience, references, location, language };
  const key = JSON.stringify(input);
  if (cache.has(key)) return res.json({ ...cache.get(key), cached: true, mode: { qloo: qloo.mode, llm: llm.mode } });

  try {
    const result = await buildPlan(input, { qloo, llm });
    if (result.ok) {
      cache.set(key, result);
      if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    }
    res.json({ ...result, mode: { qloo: qloo.mode, llm: llm.mode } });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      ok: false,
      message: language === "es"
        ? `No se pudo generar el plan: ${error.message}`
        : `The plan could not be generated: ${error.message}`,
    });
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
