// Smart prefetch (highlight #13): while online, pre-generate tomorrow's
// study pack for a lesson (flashcards + a tight summary of its intro and key
// facts) and cache it in the vault, so the lesson works fully offline later.

import { summarizeText, flashcardsFromText } from './fallback.js';

export function shouldPrefetch({ online = true, charging = false, alreadyCached = false } = {}) {
  if (!online) return { go: false, reason: 'offline — prefetch waits for connectivity' };
  if (alreadyCached) return { go: false, reason: 'pack already cached' };
  return { go: true, reason: charging ? 'online + charging — ideal prefetch window' : 'online — prefetching' };
}

export async function buildPrefetchPack(lesson, { tasks = null } = {}) {
  // Prefer the cascade (Nano can do this on-device at $0); fall back to the
  // deterministic helpers so a pack exists even with no AI tier configured.
  const sourceText = [lesson.intro, ...(lesson.keyFacts || [])].join(' ');
  let summary, cards, via = 'local-helper';
  if (tasks) {
    const s = await tasks.summarize(lesson.intro);
    const f = await tasks.flashcards(sourceText);
    summary = s.answer; cards = f.cards; via = s.decision.tier;
  } else {
    summary = summarizeText(lesson.intro, 3);
    cards = flashcardsFromText(sourceText, [lesson]);
  }
  return {
    lessonId: lesson.id, title: lesson.title, subject: lesson.subject,
    summary, cards,
    practice: lesson.practice || [], workedExamples: lesson.workedExamples || [],
    via,
  };
}

export async function prefetchLesson(lesson, vault, opts = {}) {
  const existing = vault.getPrefetch(lesson.id);
  const verdict = shouldPrefetch({ ...opts, alreadyCached: Boolean(existing) });
  if (!verdict.go) return { cached: false, reason: verdict.reason };
  const pack = await buildPrefetchPack(lesson, opts);
  vault.putPrefetch(lesson.id, pack);
  return { cached: true, reason: verdict.reason, pack };
}
