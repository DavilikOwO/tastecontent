const $ = (sel) => document.querySelector(sel);
const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c) node.append(c);
  return node;
};
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const EXAMPLE = {
  audience: "Women 20–28 in Barcelona into indie music, A24 films, vintage fashion and film photography. They watch slow, aesthetic day-in-my-life videos.",
  references: "Phoebe Bridgers, Lady Bird, Polaroid",
  location: "Barcelona",
};

const TYPE_NAMES = {
  artist: "artist", movie: "film", tv_show: "TV show", brand: "brand", podcast: "podcast", book: "book",
  videogame: "video game", place: "place", person: "person", album: "album", author: "author", actor: "actor", director: "director",
};
const typeName = (type) => TYPE_NAMES[String(type ?? "").split(":").at(-1)] ?? null;
const EFFORT_TEXT = { low: "Low effort", medium: "Some prep", high: "Bigger shoot" };

// ---------- Status badge ----------
fetch("/api/status")
  .then((r) => r.json())
  .then((s) => {
    const mode = $("#mode");
    if (s.qloo === "live") {
      mode.textContent = s.llm === "live" ? "Live Qloo data" : "Live Qloo data, template writer";
      mode.className = "mode is-live";
    } else {
      mode.textContent = "Sample data";
      mode.className = "mode is-sample";
      mode.title = s.note || "No Qloo key configured: the taste map uses sample data.";
    }
  })
  .catch(() => ($("#mode").textContent = "Server not reachable"));

// ---------- Form ----------
$("#example").addEventListener("click", () => {
  $("#audience").value = EXAMPLE.audience;
  $("#references").value = EXAMPLE.references;
  $("#location").value = EXAMPLE.location;
  $("#audience").focus();
});

function showError(message) {
  const error = $("#form-error");
  error.textContent = message;
  error.hidden = false;
  error.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
}

let basePayload = null;

$("#form").addEventListener("submit", (event) => {
  event.preventDefault();
  $("#form-error").hidden = true;
  const audience = $("#audience").value.trim();
  const references = $("#references").value.split(",").map((s) => s.trim()).filter(Boolean);
  if (audience.length < 10) {
    showError("Describe your audience in at least one sentence, for example their age, interests and where they are.");
    $("#audience").focus();
    return;
  }
  if (references.length > 5) {
    showError("Keep it to 5 references. Pick the ones that best define your audience.");
    $("#references").focus();
    return;
  }
  basePayload = { audience, references, location: $("#location").value.trim(), language: $("#language").value };
  runPlan(basePayload);
});

// ---------- Progress ----------
const STAGES = ["interpret", "resolve", "map", "write"];

function resetProgress() {
  document.querySelectorAll(".stages li").forEach((li) => li.classList.remove("is-active", "is-done"));
  $("#call-log").replaceChildren();
  $("#progress").hidden = false;
}

function markStage(stage) {
  const index = STAGES.indexOf(stage);
  document.querySelectorAll(".stages li").forEach((li) => {
    const i = STAGES.indexOf(li.dataset.stage);
    li.classList.toggle("is-done", i < index);
    li.classList.toggle("is-active", i === index);
  });
}

function logCall(call) {
  const ok = call.status === "ok";
  const tool = call.tool.replace(/^qloo_/, "");
  const count = call.tool === "your choice" ? "" : `${call.resultCount} ${call.resultCount === 1 ? "result" : "results"}`;
  $("#call-log").append(
    el(
      "li",
      { class: ok ? "is-ok" : "is-other" },
      el("span", { class: "call-tool", text: tool }),
      el("span", { class: "call-purpose", text: call.purpose }),
      el("span", { class: "call-result", text: ok ? count : call.status }),
    ),
  );
}

// ---------- Running a plan (streamed) ----------
let running = false;

async function runPlan(payload) {
  if (running) return;
  running = true;
  const button = $("#submit");
  button.disabled = true;
  button.textContent = "Building your plan…";
  $("#results").hidden = true;
  $("#confirm").hidden = true;
  resetProgress();
  markStage("interpret");
  $("#progress").scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });

  let result = null;
  try {
    const res = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok || !res.headers.get("content-type")?.includes("ndjson")) {
      result = await res.json().catch(() => ({ ok: false, message: "The server sent an unexpected answer." }));
    } else {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (value) buffer += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          const event = JSON.parse(line);
          if (event.type === "stage") markStage(event.stage);
          else if (event.type === "call") logCall(event.call);
          else if (event.type === "done") result = event.result;
        }
        if (done) break;
      }
    }
  } catch {
    result = { ok: false, message: "The server did not respond. Check it is still running in PowerShell and try again." };
  } finally {
    running = false;
    button.disabled = false;
    button.textContent = "Build my plan";
    $("#progress").hidden = true;
  }

  if (!result) result = { ok: false, message: "The plan was interrupted before it finished. Try again." };
  if (result.needsConfirmation) return askToConfirm(result);
  if (!result.ok) return showError(result.message || "The plan could not be built. Try more specific references.");
  render(result);
}

// ---------- Ambiguous references ----------
let pendingInterpretation = null;

function candidateLabel(c) {
  const bits = [typeName(c.type), c.year].filter(Boolean).join(", ");
  return bits ? `${c.name} (${bits})` : c.name;
}

function askToConfirm(result) {
  pendingInterpretation = result.interpretation;
  const fields = $("#confirm-fields");
  fields.replaceChildren(
    ...result.ambiguous.map((item, i) => {
      const name = `choice-${i}`;
      const options = item.candidates.map((c, j) => {
        const isGuess = item.suggested ? c.qlooId === item.suggested : false;
        return el(
          "label",
          { class: "option" },
          el("input", {
            type: "radio", name, value: c.qlooId, checked: item.suggested ? isGuess : j === 0,
            "data-input": item.input, "data-name": c.name, "data-type": c.type ?? "",
          }),
          el("span", { class: "option-text" },
            el("span", { class: "option-name" },
              candidateLabel(c),
              isGuess ? el("span", { class: "option-guess", text: "Fits your description" }) : null,
            ),
            c.description ? el("span", { class: "option-desc", text: c.description }) : null,
          ),
        );
      });
      options.push(
        el(
          "label",
          { class: "option option-skip" },
          el("input", { type: "radio", name, value: "", "data-input": item.input }),
          el("span", { class: "option-text" }, el("span", { class: "option-name", text: "None of these: leave it out" })),
        ),
      );
      return el("fieldset", { class: "choice" }, el("legend", { text: `“${item.input}” could be…` }), ...options);
    }),
  );
  $("#confirm").hidden = false;
  $("#confirm").scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
  fields.querySelector("input")?.focus();
}

$("#confirm-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const confirmed = {};
  const skip = [];
  for (const input of $("#confirm-fields").querySelectorAll("input[type=radio]:checked")) {
    if (input.value) confirmed[input.dataset.input] = { id: input.value, name: input.dataset.name, type: input.dataset.type || null };
    else skip.push(input.dataset.input);
  }
  runPlan({ ...basePayload, interpretation: pendingInterpretation, confirmed, skip });
});

$("#confirm-cancel").addEventListener("click", () => {
  $("#confirm").hidden = true;
  $("#references").focus();
});

// ---------- Rendering ----------
let evidenceById = new Map();
let lastResult = null;

function light(ids, on) {
  for (const id of ids) {
    document.querySelectorAll(`[data-evidence="${id}"]`).forEach((n) => n.classList.toggle("is-lit", on));
  }
}

function chips(ids) {
  return el(
    "div",
    { class: "chips", "aria-label": "Based on" },
    ids.map((id) => {
      const e = evidenceById.get(id);
      if (!e) return null;
      return el("button", {
        type: "button",
        class: "chip",
        text: e.name,
        title: `${e.label}${typeof e.affinity === "number" ? `, affinity ${e.affinity}` : ""}`,
        onmouseenter: () => light([id], true),
        onmouseleave: () => light([id], false),
        onfocus: () => light([id], true),
        onblur: () => light([id], false),
        onclick: () => {
          const target = document.querySelector(`.taste-map [data-evidence="${id}"], .concepts [data-evidence="${id}"]`);
          target?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
          light([id], true);
          setTimeout(() => light([id], false), 1600);
        },
      });
    }),
  );
}

function render(data) {
  lastResult = data;
  evidenceById = new Map(data.evidence.map((e) => [e.id, e]));
  const { plan } = data;

  $("#summary").textContent = plan.summary;
  $("#copy-status").textContent = "";
  const warnings = $("#warnings");
  const allWarnings = [...data.warnings];
  if (data.mode?.qloo === "mock") allWarnings.unshift("This taste map uses sample data, not real Qloo results. Add your Qloo key to get real affinities.");
  if (data.writer === "mock" && data.mode?.llm === "mock") allWarnings.push("The ideas were written from templates. Add a Claude key to get AI-written ideas.");
  warnings.replaceChildren(...(allWarnings.length ? [el("ul", {}, allWarnings.map((w) => el("li", { text: w })))] : []));
  warnings.hidden = !allWarnings.length;

  // Taste map
  $("#taste-map").replaceChildren(
    ...data.tasteMap.map((cat) => {
      const ev = data.evidence.filter((e) => e.category === cat.type);
      const max = Math.max(...ev.map((e) => e.affinity ?? 0), 0.0001);
      return el(
        "div",
        { class: "taste-col" },
        el("h3", { text: cat.label }),
        ev.length
          ? el(
              "ul",
              {},
              ev.map((e, i) => {
                const pct = typeof e.affinity === "number" ? (e.affinity / max) * 100 : 100 - i * 12;
                return el(
                  "li",
                  { class: "entity", "data-evidence": e.id },
                  el("div", { class: "entity-name" }, el("span", { text: e.name }), el("span", { class: "entity-id", text: e.id })),
                  el("div", { class: "bar", "aria-hidden": "true" }, el("span", { style: `width:${Math.max(8, pct).toFixed(0)}%` })),
                );
              }),
            )
          : el("p", { class: "empty-col", text: "No strong matches." }),
      );
    }),
  );

  const concepts = data.evidence.filter((e) => e.category === "concept");
  $("#concepts").replaceChildren(
    ...(concepts.length
      ? [el("h3", { text: "Shared concepts" }), ...concepts.map((c) => el("span", { class: "concept", "data-evidence": c.id, text: c.name }))]
      : []),
  );

  $("#pillars").replaceChildren(
    ...plan.pillars.map((p) => el("article", { class: "pillar" }, el("h3", { text: p.title }), el("p", { text: p.description }), chips(p.evidence))),
  );

  $("#videos").replaceChildren(
    ...plan.videos.map((v) =>
      el(
        "li",
        { class: "video" },
        el(
          "div",
          { class: "video-body" },
          el(
            "div",
            { class: "video-head" },
            el("h3", { text: v.title }),
            v.effort ? el("span", { class: `effort effort-${v.effort}`, text: EFFORT_TEXT[v.effort] }) : null,
          ),
          el("p", { class: "hook", text: v.hook }),
          el("p", { class: "meta", text: [v.format, v.pillar ? `Pillar: ${v.pillar}` : null].filter(Boolean).join(". ") }),
          v.beats?.length ? el("ol", { class: "beats", "aria-label": "Shot by shot" }, v.beats.map((b) => el("li", { text: b }))) : null,
          v.caption ? el("p", { class: "caption" }, el("span", { class: "caption-label", text: "Caption " }), v.caption) : null,
          el("p", { class: "why", text: v.why }),
          chips(v.evidence),
        ),
      ),
    ),
  );

  $("#brands").replaceChildren(
    ...(plan.brands.length
      ? plan.brands.map((b) => el("li", {}, el("h3", { text: b.name }), el("p", { text: b.angle }), chips(b.evidence)))
      : [el("li", {}, el("p", { text: "No brand showed a strong enough affinity with this audience." }))]),
  );

  $("#limits").textContent = plan.limits;

  // Trace
  const it = data.interpretation;
  const seeds = data.resolved.seeds.map((s) => s.name + (s.ambiguous ? " (top match)" : "")).join(", ") || "none";
  const tags = data.resolved.tags.map((t) => t.name).join(", ") || "none";
  $("#interpretation").textContent =
    `Signals sent to Qloo: references ${seeds}; concepts ${tags}; audience ${it.demographic || "not specified"}; place ${it.location || "not specified"}.`;
  const qlooCalls = data.trace.filter((t) => t.tool.startsWith("qloo_")).length;
  $("#trace-count").textContent = `(${qlooCalls} Qloo calls)`;
  $("#trace-rows").replaceChildren(
    ...data.trace.map((t) =>
      el(
        "tr",
        {},
        el("td", { class: "num", text: String(t.n) }),
        el("td", { text: t.tool }),
        el("td", { text: t.purpose }),
        el("td", { class: t.status === "ok" ? "status-ok" : "status-other", text: t.status }),
        el("td", { class: "num", text: String(t.resultCount) }),
        el("td", { class: "num", text: `${Math.round(t.ms)} ms` }),
      ),
    ),
  );

  $("#results").hidden = false;
  $("#summary").scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
}

// ---------- Copy plan ----------
function planToMarkdown(data) {
  const { plan } = data;
  const names = (ids) => ids.map((id) => evidenceById.get(id)?.name).filter(Boolean).join(", ");
  const lines = ["# Content plan", "", plan.summary, "", "## Content pillars", ""];
  for (const p of plan.pillars) lines.push(`### ${p.title}`, p.description, `Based on: ${names(p.evidence)}`, "");
  lines.push("## Video ideas", "");
  plan.videos.forEach((v, i) => {
    lines.push(`### ${i + 1}. ${v.title}`);
    lines.push(`Hook: "${v.hook}"`);
    const meta = [v.format, v.pillar ? `Pillar: ${v.pillar}` : null, v.effort ? EFFORT_TEXT[v.effort] : null].filter(Boolean);
    if (meta.length) lines.push(meta.join(". "));
    v.beats?.forEach((b, j) => lines.push(`${j + 1}. ${b}`));
    if (v.caption) lines.push(`Caption: ${v.caption}`);
    lines.push(v.why, `Based on: ${names(v.evidence)}`, "");
  });
  if (plan.brands.length) {
    lines.push("## Brands to pitch", "");
    for (const b of plan.brands) lines.push(`- **${b.name}**: ${b.angle}`);
    lines.push("");
  }
  lines.push("## What this does not tell you", "", plan.limits, "", "_Taste data from Qloo. Affinities describe groups, not individuals._");
  return lines.join("\n");
}

$("#copy-plan").addEventListener("click", async () => {
  if (!lastResult) return;
  const status = $("#copy-status");
  try {
    await navigator.clipboard.writeText(planToMarkdown(lastResult));
    status.textContent = "Copied. Paste it into Notes, Notion or a doc.";
  } catch {
    status.textContent = "Your browser blocked copying. Select the text on the page instead.";
  }
});
