# TasteToContent

Turn what your audience loves into what you post next.

Small creators know *who* watches them, but not what to make for them or which brands to pitch. TasteToContent takes a plain description of an audience, maps that audience's cultural taste with **Qloo**, and writes a short-form video plan in which **every idea cites the Qloo signal it comes from**.

## What it does

1. **Describe the audience** in plain words, plus up to 5 things they love (artists, shows, films, brands) and optionally where they are.
2. **Taste map**: music, TV, film, brands, podcasts (and places, when a location is given) that Qloo associates with that audience, ranked by relative affinity.
3. **Plan**: 3 content pillars, video ideas with a 2-second hook and format, and brands to pitch.
4. **Receipts**: each pillar, video and brand carries evidence chips. Hover or click one to see the Qloo entity it is based on. Ideas that cannot cite Qloo evidence are removed before they reach the user.
5. **How it was built**: a trace of every Qloo call (tool, purpose, status, result count, time).

## Qloo tools used and why

| Step | Qloo MCP tool | Why it fits |
| --- | --- | --- |
| Resolve references | `qloo_describe` | Turns "Phoebe Bridgers" into a Qloo entity ID; ambiguous matches are flagged |
| Resolve moods and styles | `qloo_find_tags` | Turns "vintage fashion" into a Qloo tag URN instead of guessing |
| Taste map | `qloo_recommend` (artist, tv_show, movie, brand, podcast, place) | One combined profile of entities + tags + demographic + location |
| Shared concepts | `qloo_entity_tags` | Concepts that jointly characterise the references, used for aesthetic pillars |

The language model only interprets the description and writes the plan. All taste claims come from Qloo results, and the backend validates every citation.

## Request to result (example)

Input: *"Women 20–28 in Barcelona into indie music, A24 films, vintage fashion and film photography"*, references *Phoebe Bridgers, Lady Bird, Polaroid*.

1. The model extracts: demographic `women 20-28`, concepts `indie`, `vintage`, `fashion`, location `Barcelona`.
2. `qloo_describe` resolves the three references to Qloo IDs; `qloo_find_tags` resolves each concept to a tag URN.
3. `qloo_recommend` runs once per category with `signals` (IDs), `signal_tags`, `demographic` and `signal_location`.
4. Results become numbered evidence (E1, E2…). The plan must cite those IDs; uncited ideas are dropped.

## Run it locally

Requirements: Node.js 22.19+, the Qloo harness, a Qloo hackathon key, and (optionally) an Anthropic API key.

```sh
npm install --global @qloo/qloo-harness
export QLOO_BASE_URL=https://hackathon.api.qloo.com
export QLOO_TRUSTED_BASE_URL=https://hackathon.api.qloo.com
qloo setup --qloo          # enter your key; it stays in the harness config
qloo setup --status        # expect "Qloo data: ready"

npm install
cp .env.example .env       # add ANTHROPIC_API_KEY (optional)
npm start                  # http://localhost:3000
```

Without a Qloo key the app runs on clearly labelled **sample data**. Without a model key it writes the plan from templates. Useful commands:

- `npm run probe` saves raw Qloo responses to `probe-output/` (no credentials) to check parsing.
- `npm run test:pipeline` runs the whole pipeline from the terminal.

## Deploy

Qloo's harness must run next to the backend, so use a container host (not serverless). The included `Dockerfile` installs the harness. Set `QLOO_API_KEY` and `ANTHROPIC_API_KEY` as secrets in the host's dashboard. The browser never talks to Qloo directly and no key is ever sent to the client.

## Responsible data handling

- No personal data is sent to Qloo: inputs are group-level descriptions and public cultural references.
- Results are presented as group-level affinities, never as predictions about a person or a video's performance.
- The plan suggests styles and references, not the use of copyrighted songs or clips.
- A small in-memory cache avoids repeating identical Qloo calls.

## Known limitations

- Qloo describes cultural taste, not TikTok trends: the plan says what this audience is likely to relate to, not what will go viral.
- Ambiguous references are auto-resolved to the top match and flagged; a future version will ask the user to confirm.
- Affinity scores from separate calls are not directly comparable, so bars are scaled within each category.

## Licence

MIT
