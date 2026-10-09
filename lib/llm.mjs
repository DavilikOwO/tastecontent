// Language-model layer: interprets the audience description and writes the plan.
// Live mode uses the Claude API; mock mode uses simple templates so the app runs without keys.
import Anthropic from "@anthropic-ai/sdk";

const ENTITY_TYPES = ["artist", "tv_show", "movie", "brand", "podcast", "book", "videogame"];

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("The model did not return JSON.");
  return JSON.parse(text.slice(start, end + 1));
}

const INTERPRET_SYSTEM = `You turn a content creator's description of their audience into signals for the Qloo taste API.
Return ONLY a JSON object with this shape:
{
  "demographic": string | null,      // natural language, e.g. "women 18-24", "millennials"; null if not stated
  "seeds": [{ "name": string, "type": one of ${JSON.stringify(ENTITY_TYPES)} }],  // max 5 named entities
  "concepts": [string],               // max 4 short genres, moods or styles, e.g. "indie folk", "cozy"
  "location": string | null           // city or country if stated
}
Rules:
- Seeds must be specific named entities (an artist, show, film, brand...) that the description mentions or clearly implies. Always include every reference the user listed explicitly.
- Never invent personal data. Audiences are groups, not individuals.
- Do not add commentary outside the JSON.`;

function planSystem(language) {
  const lang = language === "es" ? "Spanish (Spain)" : "English";
  return `You are a content strategist for short-form vertical video (TikTok, Reels, Shorts).
You receive an audience description and EVIDENCE: a numbered list of entities and concepts that Qloo's taste data associates with that audience, with relative affinity scores.
Write the plan in ${lang}. Return ONLY a JSON object:
{
  "summary": string,                       // 2 sentences: who this audience is, through their taste
  "pillars": [{ "title": string, "description": string, "evidence": [evidence ids] }],      // 3 pillars
  "videos": [{ "title": string, "hook": string, "format": string, "pillar": pillar title,
               "why": string, "evidence": [evidence ids] }],                                 // 8 videos
  "brands": [{ "name": string, "angle": string, "evidence": [evidence ids] }],               // up to 5
  "limits": string                         // one sentence on what this plan does not establish
}
Rules:
- Every pillar, video and brand MUST cite at least one evidence id (like "E4") from the list. Cite only ids that exist.
- Brands must come from the brand evidence only.
- "hook" is the first 2 seconds: the on-screen text or first spoken line.
- "why" explains in one sentence how the cited taste signals connect to the idea. Qloo shows group-level affinity, not causation: never claim a video "will go viral" or that a person "loves" something.
- Suggest styles, references and moods. Do not tell the creator to use copyrighted songs or clips.
- Be concrete and specific to this audience; avoid generic advice.`;
}

function formatEvidence(evidence) {
  return evidence
    .map((e) => {
      const score = typeof e.affinity === "number" ? ` affinity ${e.affinity}` : "";
      return `${e.id} [${e.category}] ${e.name}${score}`;
    })
    .join("\n");
}

class LiveLLM {
  mode = "live";
  constructor() {
    this.client = new Anthropic();
    this.model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
  }

  async #ask(system, user, maxTokens) {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    });
    const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    return extractJson(text);
  }

  async interpretAudience({ audience, references }) {
    const user = `Audience description:\n${audience}\n\nReferences the creator listed: ${
      references.length ? references.join("; ") : "(none)"
    }`;
    return this.#ask(INTERPRET_SYSTEM, user, 800);
  }

  async writePlan({ audience, interpretation, evidence, language }) {
    const user = `Audience description:\n${audience}\n\nInterpreted signals:\n${JSON.stringify(
      interpretation,
    )}\n\nEVIDENCE:\n${formatEvidence(evidence)}`;
    return this.#ask(planSystem(language), user, 4000);
  }
}

// ---------- Mock mode: deterministic templates, clearly labelled in the UI ----------

const KNOWN_PLACES = ["Barcelona", "Madrid", "Valencia", "Sevilla", "Bilbao", "Spain", "España", "Catalonia", "Catalunya", "Mexico", "London", "New York"];
const CONCEPT_HINTS = ["indie", "film", "vintage", "fashion", "romance", "photography", "slow living", "cozy", "food", "cooking", "fitness", "gaming", "pop", "latin", "aesthetic", "y2k", "wellness", "comedy", "documentary", "k-pop", "beauty", "música", "cine", "moda", "comida", "deporte"];

class MockLLM {
  mode = "mock";

  async interpretAudience({ audience, references }) {
    const text = audience.toLowerCase();
    const age = audience.match(/(\d{2})\s*[-–a]\s*(\d{2})/);
    const gender = /\b(women|girls|mujeres|chicas)\b/i.test(audience)
      ? "women"
      : /\b(men|boys|hombres|chicos)\b/i.test(audience)
        ? "men"
        : null;
    const demographic = [gender, age ? `${age[1]}-${age[2]}` : null].filter(Boolean).join(" ") || null;
    const location = KNOWN_PLACES.find((p) => text.includes(p.toLowerCase())) ?? null;
    return {
      demographic,
      seeds: references.slice(0, 5).map((name) => ({ name, type: null })),
      concepts: CONCEPT_HINTS.filter((c) => text.includes(c)).slice(0, 4),
      location,
    };
  }

  async writePlan({ evidence, language }) {
    const es = language === "es";
    const by = (cat) => evidence.filter((e) => e.category === cat);
    const pick = (cat, i = 0) => by(cat)[i];
    const artist = pick("artist") ?? evidence[0];
    const show = pick("tv_show") ?? pick("movie") ?? evidence[1] ?? artist;
    const movie = pick("movie") ?? show;
    const concept = pick("concept") ?? pick("artist", 1) ?? artist;
    const concept2 = pick("concept", 1) ?? concept;

    const pillars = [
      {
        title: es ? `El universo de ${artist.name}` : `The world of ${artist.name}`,
        description: es
          ? `Contenido que comparte el tono y la estética de los artistas afines a tu audiencia.`
          : `Content that shares the tone and look of the artists your audience gravitates to.`,
        evidence: [artist.id, ...(pick("artist", 1) ? [pick("artist", 1).id] : [])],
      },
      {
        title: es ? `Pantalla compartida` : `Shared screen`,
        description: es
          ? `Referencias a series y películas que este público tiene en común.`
          : `References to the shows and films this audience has in common.`,
        evidence: [show.id, movie.id],
      },
      {
        title: es ? `Estética ${concept.name}` : `${concept.name} aesthetic`,
        description: es
          ? `Formatos visuales construidos sobre los conceptos que mejor describen sus gustos.`
          : `Visual formats built on the concepts that best describe their taste.`,
        evidence: [concept.id, concept2.id],
      },
    ];

    const v = (title, hook, format, pillar, why, ev) => ({ title, hook, format, pillar: pillar.title, why, evidence: ev });
    const videos = es
      ? [
          v(`Mi semana si fuera un disco de ${artist.name}`, `POV: tu vida tiene banda sonora`, "Vlog corto con texto en pantalla", pillars[0], `${artist.name} aparece entre las afinidades más altas de esta audiencia.`, [artist.id]),
          v(`Recrear una escena de ${show.name} con lo que hay en casa`, `Esto me costó 0 €`, "Recreación + comparación", pillars[1], `${show.name} conecta con los gustos del grupo.`, [show.id]),
          v(`3 cosas que sabes si te gusta ${movie.name}`, `Si entiendes la 3, somos amigos`, "Lista rápida", pillars[1], `Referencia compartida por esta audiencia.`, [movie.id]),
          v(`Un día en clave ${concept.name}`, `Hoy todo es ${concept.name}`, "Día en mi vida", pillars[2], `Concepto destacado en el mapa de gustos.`, [concept.id]),
          v(`Lo que escucho mientras trabajo (estilo, no canciones)`, `Mi cerebro funciona con este ambiente`, "Fondo ambiental + rótulos", pillars[0], `Estética musical afín al grupo.`, [artist.id]),
          v(`Ranking honesto de referencias ${concept2.name}`, `La número 1 te va a sorprender`, "Ranking", pillars[2], `Concepto con afinidad alta.`, [concept2.id]),
        ]
      : [
          v(`My week as a ${artist.name} record`, `POV: your life has a soundtrack`, "Short vlog with on-screen text", pillars[0], `${artist.name} is among this audience's strongest affinities.`, [artist.id]),
          v(`Recreating a ${show.name} scene with what's at home`, `This cost me nothing`, "Recreation + side by side", pillars[1], `${show.name} connects with the group's taste.`, [show.id]),
          v(`3 things you know if you like ${movie.name}`, `If you get number 3, we're friends`, "Quick list", pillars[1], `A reference this audience shares.`, [movie.id]),
          v(`A day in ${concept.name} mode`, `Today everything is ${concept.name}`, "Day in my life", pillars[2], `A leading concept in the taste map.`, [concept.id]),
          v(`What I listen to while I work (the vibe, not the tracks)`, `My brain runs on this mood`, "Ambient background + captions", pillars[0], `Musical aesthetic close to the group.`, [artist.id]),
          v(`Honest ranking of ${concept2.name} references`, `Number 1 will surprise you`, "Ranking", pillars[2], `High-affinity concept.`, [concept2.id]),
        ];

    const brands = by("brand").slice(0, 4).map((b) => ({
      name: b.name,
      angle: es ? `Encaje natural con los gustos del grupo; buen candidato para una colaboración.` : `A natural fit with the group's taste; a good candidate for a collaboration.`,
      evidence: [b.id],
    }));

    return {
      summary: es
        ? `Plan generado con plantillas de ejemplo a partir del mapa de gustos. Conecta una clave de modelo para obtener ideas escritas por la IA.`
        : `Plan generated from sample templates using the taste map. Connect a model key to get AI-written ideas.`,
      pillars,
      videos,
      brands,
      limits: es
        ? `Las afinidades describen gustos de grupo, no predicen el rendimiento de un vídeo ni las preferencias de una persona.`
        : `Affinities describe group taste; they do not predict a video's performance or any individual's preferences.`,
    };
  }
}

export function createLLM() {
  const forceMock = process.env.LLM_MOCK === "1" || !process.env.ANTHROPIC_API_KEY;
  return forceMock ? new MockLLM() : new LiveLLM();
}
