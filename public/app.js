const $ = (sel) => document.querySelector(sel);
const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("data-")) node.setAttribute(k, v);
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c) node.append(c);
  return node;
};

const EXAMPLE = {
  audience: "Women 20–28 in Barcelona into indie music, A24 films, vintage fashion and film photography. They watch slow, aesthetic day-in-my-life videos.",
  references: "Phoebe Bridgers, Lady Bird, Polaroid",
  location: "Barcelona",
};

// ---------- Status badge ----------
fetch("/api/status")
  .then((r) => r.json())
  .then((s) => {
    const mode = $("#mode");
    if (s.qloo === "live") {
      mode.textContent = s.llm === "live" ? "Live Qloo data" : "Live Qloo data · template writer";
      mode.className = "mode is-live";
    } else {
      mode.textContent = "Sample data";
      mode.className = "mode is-sample";
      if (s.note) mode.title = s.note;
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

let progressTimer = null;
function startProgress() {
  const steps = [...document.querySelectorAll("#progress li")];
  steps.forEach((s) => s.classList.remove("is-active", "is-done"));
  $("#progress").hidden = false;
  let i = 0;
  steps[0].classList.add("is-active");
  progressTimer = setInterval(() => {
    if (i >= steps.length - 1) return;
    steps[i].classList.replace("is-active", "is-done");
    i += 1;
    steps[i].classList.add("is-active");
  }, 2200);
}
function stopProgress() {
  clearInterval(progressTimer);
  $("#progress").hidden = true;
}

$("#form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const error = $("#form-error");
  error.hidden = true;
  const audience = $("#audience").value.trim();
  const references = $("#references").value.split(",").map((s) => s.trim()).filter(Boolean);
  if (audience.length < 10) {
    error.textContent = "Describe your audience in at least one sentence, for example their age, interests and where they are.";
    error.hidden = false;
    $("#audience").focus();
    return;
  }
  if (references.length > 5) {
    error.textContent = "Keep it to 5 references. Pick the ones that best define your audience.";
    error.hidden = false;
    return;
  }

  const button = $("#submit");
  button.disabled = true;
  button.textContent = "Building your plan…";
  $("#results").hidden = true;
  startProgress();
  try {
    const res = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audience, references, location: $("#location").value.trim(), language: $("#language").value }),
    });
    const data = await res.json();
    if (!data.ok) {
      error.textContent = data.message || "The plan could not be built. Try again with more specific references.";
      error.hidden = false;
      return;
    }
    render(data);
  } catch {
    error.textContent = "The server did not respond. Check it is running and try again.";
    error.hidden = false;
  } finally {
    stopProgress();
    button.disabled = false;
    button.textContent = "Build my plan";
  }
});

// ---------- Rendering ----------
let evidenceById = new Map();

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
          const target = document.querySelector(`[data-evidence="${id}"]`);
          target?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
          light([id], true);
          setTimeout(() => light([id], false), 1600);
        },
      });
    }),
  );
}

function render(data) {
  evidenceById = new Map(data.evidence.map((e) => [e.id, e]));
  const { plan } = data;

  $("#summary").textContent = plan.summary;
  const warnings = $("#warnings");
  warnings.replaceChildren();
  const allWarnings = [...data.warnings];
  if (data.mode?.qloo === "mock") allWarnings.unshift("This plan uses sample data, not real Qloo results. Add your Qloo key to get real affinities.");
  if (allWarnings.length) {
    warnings.append(el("ul", {}, allWarnings.map((w) => el("li", { text: w }))));
    warnings.hidden = false;
  } else warnings.hidden = true;

  // Taste map
  const map = $("#taste-map");
  map.replaceChildren(
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
        el("h3", { text: v.title }),
        el("p", { class: "hook", text: v.hook }),
        el("p", { class: "meta", text: [v.format, v.pillar ? `Pillar: ${v.pillar}` : null].filter(Boolean).join(". ") }),
        el("p", { class: "why", text: v.why }),
        chips(v.evidence),
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
  const seeds = data.resolved.seeds.map((s) => s.name + (s.ambiguous ? " (check)" : "")).join(", ") || "none";
  const tags = data.resolved.tags.map((t) => t.name).join(", ") || "none";
  $("#interpretation").textContent =
    `Signals used: references ${seeds}; concepts ${tags}; audience ${it.demographic || "not specified"}; place ${it.location || "not specified"}.`;
  $("#trace-count").textContent = `(${data.trace.length} Qloo calls)`;
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
  $("#summary").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
}
