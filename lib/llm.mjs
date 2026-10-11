// Language-model layer: interprets the audience description and writes the plan.
// Live mode calls the Claude API with forced tool use, so answers always come back as
// structured JSON. Template mode (MockLLM) runs without any key and is clearly labelled.
import Anthropic from "@anthropic-ai/sdk";

export const SEED_TYPES = ["artist", "tv_show", "movie", "brand", "podcast", "book", "videogame", "place"];
const EFFORTS = ["low", "medium", "high"];

// ---------- Structured-output tools ----------

const SIGNALS_TOOL = {
  name: "submit_signals",
  description: "Submit the Qloo signals extracted from the creator's audience description.",
  input_schema: {
    type: "object",
    properties: {
      demographic: {
        type: "string",
        description: "Audience demographic in natural language, e.g. 'women 18-24', 'men 25-34', 'millennials'. Empty string if not stated.",
      },
      seeds: {
        type: "array",
        maxItems: 5,
        description: "Specific named entities the audience likes. Include every reference the creator listed.",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Canonical name, e.g. 'Phoebe Bridgers', 'Lady Bird'." },
            type: { type: "string", enum: SEED_TYPES },
          },
          required: ["name", "type"],
        },
      },
      concepts: {
        type: "array",
        maxItems: 4,
        items: { type: "string" },
        description: "Short genres, moods or styles in English, e.g. 'indie folk', 'cozy', 'vintage fashion'.",
      },
      location: { type: "string", description: "City or country if stated, else empty string." },
    },
    required: ["demographic", "seeds", "concepts", "location"],
  },
};

const PLAN_TOOL = {
  name: "submit_plan",
  description: "Submit the short-form video plan grounded in the numbered Qloo evidence.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "Two sentences: who this audience is, seen through their taste." },
      pillars: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string", description: "One or two sentences on what the creator posts under this theme." },
            evidence: { type: "array", items: { type: "string" }, description: "Evidence ids such as E3." },
          },
          required: ["title", "description", "evidence"],
        },
      },
      videos: {
        type: "array",
        minItems: 6,
        maxItems: 8,
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            hook: { type: "string", description: "On-screen text or first spoken line, max 12 words." },
            format: { type: "string", description: "Native short-form format, e.g. POV, GRWM, ranking, stitch reply." },
            pillar: { type: "string", description: "Exact title of one pillar." },
            effort: { type: "string", enum: EFFORTS },
            beats: { type: "array", minItems: 3, maxItems: 3, items: { type: "string" }, description: "What happens on screen, in order." },
            caption: { type: "string", description: "One line plus up to 3 hashtags." },
            why: { type: "string", description: "One sentence: which taste signals connect and why that is relatable." },
            evidence: { type: "array", items: { type: "string" } },
          },
          required: ["title", "hook", "format", "pillar", "effort", "beats", "caption", "why", "evidence"],
        },
      },
      brands: {
        type: "array",
        maxItems: 5,
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Exactly as written in the brand evidence." },
            angle: { type: "string", description: "One sentence: the collaboration idea and why it fits." },
            evidence: { type: "array", items: { type: "string" } },
          },
          required: ["name", "angle", "evidence"],
        },
      },
      limits: { type: "string", description: "One sentence on what this plan does not establish." },
    },
    required: ["summary", "pillars", "videos", "brands", "limits"],
  },
};

const INTERPRET_SYSTEM = `You turn a content creator's description of their audience into signals for the Qloo taste API, and submit them with the submit_signals tool.
- Seeds are specific named entities (an artist, show, film, brand, podcast, book, game or place) that the description mentions or clearly implies. Always include every reference the creator listed, with the type that fits the context.
- Concepts are short genres, moods or styles, written in English even if the description is in another language.
- Audiences are groups. Never invent personal data and never infer sensitive traits (health, religion, politics, sexuality, finances).`;

function planSystem(language) {
  const lang = language === "es" ? "Spanish from Spain" : "English";
  return `You are a short-form video strategist (TikTok, Reels, Shorts) who builds plans from taste data. Submit the plan with the submit_plan tool.

You receive an audience description and EVIDENCE: numbered items (E1, E2...) that Qloo's taste data associates with that audience. Each has a category and a relative affinity score: higher means a stronger association within that category, and scores from different categories are not comparable.

Write everything the creator will read in ${lang}. Keep entity names as they are.

What makes a great plan:
- The best ideas connect two or more evidence items from DIFFERENT categories, for example a film and a brand, or an artist and a place. This crossover is the point of the tool: at least half of the videos should cite items from two categories.
- Pillars are three distinct, repeatable themes the creator can post about every week, each grounded in evidence.
- Videos use native short-form formats: POV, GRWM, day in my life, list or ranking, before and after, stitch or duet reply, green-screen commentary, tutorial, storytime, "things that just make sense". Vary the formats.
- Mix effort levels: at least three "low" ideas a creator can film in ten minutes with a phone.
- The hook is what appears in the first two seconds: specific, at most 12 words, no empty clickbait.
- Beats are three short lines describing what happens on screen, in order.
- The caption is one line plus up to three hashtags.
- "why" says in one sentence which taste signals connect and why that makes the idea relatable to this audience.

Hard rules:
- Every pillar, video and brand cites at least one evidence id that exists in the list. Never cite an id that is not listed.
- Brands come only from the brand evidence, with the name written exactly as listed.
- Qloo shows group-level affinity, not causation. Never claim a video will go viral and never describe what an individual person likes.
- Suggest moods, styles and references. Do not tell the creator to use copyrighted songs, clips or logos.
- Do not infer sensitive traits (health, religion, politics, sexuality, finances) about the audience.
- Be concrete to this audience. Avoid advice that would fit any creator.`;
}

function formatEvidence(evidence) {
  return evidence
    .map((e) => {
      const parts = [`${e.id} [${e.label}] ${e.name}`];
      if (typeof e.affinity === "number") parts.push(`affinity ${e.affinity}`);
      if (e.tags?.length) parts.push(`tags: ${e.tags.join(", ")}`);
      return parts.join(" | ");
    })
    .join("\n");
}

export class LiveLLM {
  mode = "live";
  constructor(client = new Anthropic()) {
    this.client = client;
    this.model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
  }

  async #callTool(system, user, tool, maxTokens) {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      system,
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
      messages: [{ role: "user", content: user }],
    });
    if (res.stop_reason === "max_tokens") throw new Error("the model's answer was cut off");
    const block = res.content?.find((b) => b.type === "tool_use" && b.name === tool.name);
    if (!block?.input || typeof block.input !== "object") throw new Error("the model did not return a structured answer");
    return block.input;
  }

  async interpretAudience({ audience, references }) {
    const user = `Audience description:\n${audience}\n\nReferences the creator listed: ${
      references.length ? references.join("; ") : "(none)"
    }`;
    return this.#callTool(INTERPRET_SYSTEM, user, SIGNALS_TOOL, 1000);
  }

  async writePlan({ audience, interpretation, evidence, language }) {
    const user = `Audience description:\n${audience}\n\nSignals sent to Qloo:\n${JSON.stringify(
      interpretation,
    )}\n\nEVIDENCE:\n${formatEvidence(evidence)}`;
    return this.#callTool(planSystem(language), user, PLAN_TOOL, 6000);
  }
}

// ---------- Template mode: deterministic, clearly labelled in the UI ----------

const KNOWN_PLACES = ["Barcelona", "Madrid", "Valencia", "Sevilla", "Bilbao", "Spain", "España", "Catalonia", "Catalunya", "Mexico", "London", "New York"];
const CONCEPT_HINTS = ["indie", "film", "vintage", "fashion", "romance", "photography", "slow living", "cozy", "food", "cooking", "fitness", "gaming", "pop", "latin", "aesthetic", "y2k", "wellness", "comedy", "documentary", "k-pop", "beauty"];

export class MockLLM {
  mode = "mock";

  async interpretAudience({ audience, references }) {
    const text = audience.toLowerCase();
    const age = audience.match(/(\d{2})\s*[-–a]\s*(\d{2})/);
    const gender = /\b(women|girls|mujeres|chicas)\b/i.test(audience)
      ? "women"
      : /\b(men|boys|hombres|chicos)\b/i.test(audience)
        ? "men"
        : "";
    const demographic = [gender, age ? `${age[1]}-${age[2]}` : ""].filter(Boolean).join(" ");
    const location = KNOWN_PLACES.find((p) => text.includes(p.toLowerCase())) ?? "";
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
    const brand = pick("brand") ?? artist;
    const concept = pick("concept") ?? pick("artist", 1) ?? artist;
    const concept2 = pick("concept", 1) ?? concept;

    const pillars = [
      {
        title: es ? `El universo de ${artist.name}` : `The world of ${artist.name}`,
        description: es
          ? "Contenido que comparte el tono y la estética de los artistas afines a tu audiencia."
          : "Content that shares the tone and look of the artists your audience gravitates to.",
        evidence: [artist.id, ...(pick("artist", 1) ? [pick("artist", 1).id] : [])],
      },
      {
        title: es ? "Pantalla compartida" : "Shared screen",
        description: es
          ? "Referencias a series y películas que este público tiene en común."
          : "References to the shows and films this audience has in common.",
        evidence: [show.id, movie.id],
      },
      {
        title: es ? `Estética ${concept.name}` : `${concept.name} aesthetic`,
        description: es
          ? "Formatos visuales construidos sobre los conceptos que mejor describen sus gustos."
          : "Visual formats built on the concepts that best describe their taste.",
        evidence: [concept.id, concept2.id],
      },
    ];

    const v = (title, hook, format, pillar, effort, beats, caption, why, ev) => ({
      title, hook, format, pillar: pillar.title, effort, beats, caption, why, evidence: ev,
    });
    const videos = es
      ? [
          v(`Mi semana si fuera un disco de ${artist.name}`, "POV: tu vida tiene banda sonora", "POV", pillars[0], "low",
            ["Plano de la mañana con texto en pantalla", "Tres momentos del día con el mismo filtro", "Cierre con la pregunta: ¿cuál sería tu disco?"],
            "Mi semana en clave indie #pov #diadiario", `${artist.name} aparece entre las afinidades más altas de esta audiencia.`, [artist.id]),
          v(`Recrear una escena de ${show.name} con lo que hay en casa`, "Esto me costó 0 €", "Antes y después", pillars[1], "medium",
            ["Muestra la escena original descrita en texto", "Monta la recreación con objetos de casa", "Comparación lado a lado"],
            `Recreación casera #${show.name.replace(/\W/g, "")}`, `${show.name} conecta con los gustos del grupo.`, [show.id]),
          v(`${brand.name} en un día de ${movie.name}`, `Si ${movie.name} fuera un objeto`, "Día en mi vida", pillars[1], "low",
            [`Abre con un objeto de ${brand.name}`, "Tres escenas con la estética de la película", "Pregunta a los seguidores qué objeto elegirían"],
            "Un día de película #estetica", "Cruza una película y una marca afines a esta audiencia.", [movie.id, brand.id]),
          v(`Un día en clave ${concept.name}`, `Hoy todo es ${concept.name}`, "Día en mi vida", pillars[2], "low",
            ["Despertar con la luz natural", "Tres detalles del día con esa estética", "Cierre con una frase en pantalla"],
            `Día ${concept.name} #diaenmivida`, "Concepto destacado en el mapa de gustos.", [concept.id]),
          v(`Ranking honesto de referencias ${concept2.name}`, "La número 1 te va a sorprender", "Ranking", pillars[2], "medium",
            ["Presenta cinco referencias en pantalla", "Ordénalas de peor a mejor con un motivo", "Invita a ordenar las suyas en comentarios"],
            `Mi ranking ${concept2.name} #ranking`, "Concepto con afinidad alta.", [concept2.id]),
          v("Lo que escucho mientras trabajo (el ambiente, no las canciones)", "Mi cerebro funciona con este ambiente", "Comentario con pantalla verde", pillars[0], "low",
            ["Escritorio en plano cenital", "Texto describiendo el ambiente sonoro", "Pregunta: ¿qué te pones tú?"],
            "Ambiente de trabajo #productividad", "Estética musical afín al grupo.", [artist.id]),
        ]
      : [
          v(`My week as a ${artist.name} record`, "POV: your life has a soundtrack", "POV", pillars[0], "low",
            ["Morning shot with on-screen text", "Three moments of the day with the same filter", "Close asking: what record would yours be?"],
            "My week in indie mode #pov #dayinmylife", `${artist.name} is among this audience's strongest affinities.`, [artist.id]),
          v(`Recreating a ${show.name} scene with what's at home`, "This cost me nothing", "Before and after", pillars[1], "medium",
            ["Describe the original scene in text", "Build the recreation with things at home", "Side-by-side comparison"],
            `Home recreation #${show.name.replace(/\W/g, "")}`, `${show.name} connects with the group's taste.`, [show.id]),
          v(`${brand.name} in a ${movie.name} kind of day`, `If ${movie.name} were an object`, "Day in my life", pillars[1], "low",
            [`Open on a ${brand.name} item`, "Three scenes with the film's look", "Ask followers which object they would pick"],
            "A cinematic day #aesthetic", "Crosses a film and a brand this audience leans towards.", [movie.id, brand.id]),
          v(`A day in ${concept.name} mode`, `Today everything is ${concept.name}`, "Day in my life", pillars[2], "low",
            ["Wake up to natural light", "Three details of the day in that style", "Close on a line of on-screen text"],
            `${concept.name} day #dayinmylife`, "A leading concept in the taste map.", [concept.id]),
          v(`Honest ranking of ${concept2.name} references`, "Number 1 will surprise you", "Ranking", pillars[2], "medium",
            ["Show five references on screen", "Rank them worst to best with one reason each", "Invite viewers to rank theirs"],
            `My ${concept2.name} ranking #ranking`, "A high-affinity concept.", [concept2.id]),
          v("What I listen to while I work (the vibe, not the tracks)", "My brain runs on this mood", "Green-screen commentary", pillars[0], "low",
            ["Overhead shot of the desk", "Text describing the sound of the room", "Ask: what do you put on?"],
            "Work mood #productivity", "A musical aesthetic close to the group.", [artist.id]),
        ];

    const brands = by("brand").slice(0, 4).map((b) => ({
      name: b.name,
      angle: es
        ? "Encaje natural con los gustos del grupo; buen candidato para una colaboración."
        : "A natural fit with the group's taste; a good candidate for a collaboration.",
      evidence: [b.id],
    }));

    return {
      summary: es
        ? "Plan escrito con plantillas a partir del mapa de gustos. Conecta una clave de Claude para obtener ideas escritas por la IA."
        : "Plan written from templates using the taste map. Connect a Claude key to get AI-written ideas.",
      pillars,
      videos,
      brands,
      limits: es
        ? "Las afinidades describen gustos de grupo; no predicen el rendimiento de un vídeo ni las preferencias de una persona."
        : "Affinities describe group taste; they do not predict a video's performance or any individual's preferences.",
    };
  }
}

export function createLLM() {
  const forceMock = process.env.LLM_MOCK === "1" || !process.env.ANTHROPIC_API_KEY;
  return forceMock ? new MockLLM() : new LiveLLM();
}
