// Built-in study helper — the honest last tier of the cascade.
//
// This is NOT an AI model and the UI never calls it one. It is deterministic
// retrieval + extractive text processing over the seeded SnuhiLearn lesson
// bank that ships with the app. Its job: the product stays genuinely useful
// on machines with no Gemini Nano and no Firebase config (most first-run
// machines), while the routing timeline states plainly that a local helper —
// not Gemini — produced the answer.

const STOP = new Set('the a an and or of to in is are was were be been for on with as by at from that this it its can could should would do does did how what why when where which who whom whose into than then so such no not only also more most other some any each per via'.split(' '));

export function tokenize(text = '') {
  return String(text).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w));
}

export function scoreMatch(queryTokens, text) {
  if (!queryTokens.length) return 0;
  const hay = new Set(tokenize(text));
  let hit = 0;
  for (const t of queryTokens) if (hay.has(t)) hit += 1;
  return hit / queryTokens.length;
}

export function searchLessons(query, lessons, limit = 3) {
  const q = tokenize(query);
  // A single stray generic word ("topic", "control") must not fake a match:
  // multi-token queries need at least two distinct token hits somewhere in
  // the lesson before it can rank at all.
  const minHits = q.length >= 2 ? 2 : 1;
  return lessons
    .map((lesson) => {
      const union = new Set(tokenize(`${lesson.title} ${lesson.subject} ${lesson.intro} ${(lesson.keyFacts || []).join(' ')}`));
      const matched = q.filter((t) => union.has(t)).length;
      return {
        lesson, matched,
        score: Math.max(
          scoreMatch(q, `${lesson.title} ${lesson.subject}`) * 1.4,
          scoreMatch(q, lesson.intro),
          scoreMatch(q, (lesson.keyFacts || []).join(' ')),
        ),
      };
    })
    .filter((r) => r.score > 0.12 && r.matched >= minHits)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function answerFromBank(question, lessons) {
  const hits = searchLessons(question, lessons, 1);
  if (!hits.length) {
    return {
      text: 'I could not find that in the offline lesson bank yet. Try rephrasing with the topic name (for example the lesson title), or connect Firebase / use a Nano-capable Chrome to ask the AI tiers.',
      lesson: null, confidence: 0.15,
    };
  }
  const { lesson } = hits[0];
  const facts = (lesson.keyFacts || []).slice(0, 4).map((f) => `• ${f}`).join('\n');
  const text = `From the offline lesson bank — ${lesson.subject}: ${lesson.title}\n\n${lesson.intro}\n\nKey facts:\n${facts}`;
  return { text, lesson, confidence: Math.min(0.55, 0.3 + hits[0].score / 2) };
}

export function splitSentences(text = '') {
  return String(text).replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+/g)?.map((s) => s.trim()).filter(Boolean)
    || (String(text).trim() ? [String(text).trim()] : []);
}

// Extractive summary: score sentences by term frequency, keep the top N in
// original order. Real algorithm, no model involved.
export function summarizeText(text, maxSentences = 3) {
  const sentences = splitSentences(text);
  if (sentences.length <= maxSentences) return sentences.join(' ');
  const freq = new Map();
  for (const t of tokenize(text)) freq.set(t, (freq.get(t) || 0) + 1);
  const scored = sentences.map((s, i) => ({
    i, s, score: tokenize(s).reduce((acc, t) => acc + (freq.get(t) || 0), 0) / Math.max(1, tokenize(s).length),
  }));
  return scored.sort((a, b) => b.score - a.score).slice(0, maxSentences)
    .sort((a, b) => a.i - b.i).map((r) => r.s).join(' ');
}

// Flashcards without a model: cloze cards from definitional sentences
// ("X is Y") plus key-fact cards when a matching lesson exists.
export function flashcardsFromText(text, lessons = [], limit = 8) {
  const cards = [];
  for (const s of splitSentences(text)) {
    const m = s.match(/^(.{3,60}?)\s+(is|are|means|refers to)\s+(.{8,})$/i);
    if (m) cards.push({ front: `What ${m[2]} ${m[1].trim()}?`, back: s });
    if (cards.length >= limit) break;
  }
  if (cards.length < 3) {
    const hits = searchLessons(text, lessons, 1);
    if (hits.length) {
      for (const f of hits[0].lesson.keyFacts || []) {
        cards.push({ front: `Key fact — ${hits[0].lesson.title}: complete the idea`, back: f });
        if (cards.length >= limit) break;
      }
    }
  }
  return cards;
}
