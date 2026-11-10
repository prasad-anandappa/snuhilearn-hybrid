# Architecture — SnuhiLearn Hybrid

## The one-sentence version
A study companion whose every answer is produced by a **confidence cascade** across
three honest tiers — Gemini Nano on-device, Gemini Flash/Pro in the cloud via
Firebase AI Logic, and a deterministic local lesson-bank helper — with the routing
decision rendered to the user every single time.

## Tiers

| Tier | Engine | Wired via | Cost | Works offline |
|---|---|---|---|---|
| `nano` | Gemini Nano | Chrome Prompt API (`LanguageModel` global, legacy `window.ai` fallback) — `src/nano.js` | $0 | ✅ |
| `flash` / `pro` | Gemini 2.5 Flash / Pro | Firebase AI Logic SDK (`firebase/ai`, `GoogleAIBackend`) — `src/cloud.js` | est. list price | ❌ |
| `fallback` | Built-in study helper | Retrieval + extractive processing over the seeded lesson bank — `src/fallback.js` | $0 | ✅ |

The fallback tier is **not an AI model** and is never labelled as one. It exists so
the product is genuinely useful on machines with no Nano and no Firebase project —
which is most first-run machines, including many judges'.

## The cascade (`src/router.js`)

1. **Classify** the request: task type (light/deep by policy), multi-step markers,
   input length. 
2. **Plan**: light → `nano → flash → pro`; deep → `flash → pro`.
3. **Attempt** each tier in order, recording skips (Nano absent, cloud unconfigured,
   offline) with reasons. After each answer, a **confidence self-check**
   (length, hedging, refusal markers) decides accept vs escalate.
4. **Last resort**: the local helper answers; deep tasks attempted while offline are
   additionally **queued** and re-run against the cloud on reconnect
   (`flushOfflineQueue`).
5. **Record**: a full decision object (tier, model, reasons, attempts, latency,
   estimated cost, confidence) is persisted to the local vault and rendered in the
   routing timeline.

## Why this split (the rationale judges ask for)

- **On-device first for light tasks** — latency (single-digit ms vs network round
  trips), privacy (a child's question never leaves the device), zero marginal cost,
  and it works with no connectivity at all.
- **Cloud for depth** — worked solutions, mock tests, photo problems and long
  passages need reasoning a small on-device model should not fake. Escalation is
  earned by the confidence check, not assumed.
- **Visibility as a feature** — hybrid inference is usually a hidden optimisation.
  Here the routing timeline, cost meter ("cloud calls avoided", est. $ saved) and
  latency meter make it the product surface, which is also how a user learns to
  trust it.

## Privacy model (`src/store.js`)

History, progress and cached lesson packs live in a **local vault** (browser
storage). Cloud sync is a seam with two locks: the user must opt in, *and* a
Firestore adapter must be wired by a configured build. There is no silent sync path.

## Graceful absence, everywhere

Every external capability is feature-detected: Prompt API (both published shapes),
Firebase config presence, Web Speech in/out, network state. Absence is always a
recorded routing reason, never a crash and never a fabricated answer. The cloud
adapter throws a typed `CLOUD_UNCONFIGURED` error until a real Firebase project
config exists; the Nano adapter throws `NANO_UNSUPPORTED`. Tests inject fakes at
exactly these seams (`tests/`), so the routing logic is verified without network,
a browser, or a Firebase project.
