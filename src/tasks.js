// Study tasks — thin, testable wrappers over the cascade. Each returns the
// cascade result plus a structured payload where the task has one
// (flashcards, mock tests), parsed from model text when a model answered and
// produced natively when the local helper answered.

export function parseFlashcards(text = '') {
  const cards = [];
  const lines = String(text).split('\n');
  let cur = null;
  for (const line of lines) {
    const q = line.match(/^Q[:.]\s*(.+)/i);
    const a = line.match(/^A[:.]\s*(.+)/i);
    if (q) { cur = { front: q[1].trim(), back: '' }; cards.push(cur); }
    else if (a && cur) cur.back = a[1].trim();
  }
  return cards.filter((c) => c.front && c.back);
}

export function parseMockTest(text = '') {
  const items = [];
  const blocks = String(text).split(/\n(?=Q\d+[.:])/i);
  for (const b of blocks) {
    const q = b.match(/^Q\d+[.:]\s*([\s\S]*?)(?:\nAnswer[:.]\s*([\s\S]*))?$/i);
    if (q && q[1].trim()) items.push({ question: q[1].trim(), answer: (q[2] || '').trim() });
  }
  return items;
}

export function createTasks(cascade) {
  return {
    async ask(question, ctx = {}) {
      return cascade.run({ task: 'qa', prompt: question, ...ctx });
    },
    async flashcards(text, ctx = {}) {
      const r = await cascade.run({ task: 'flashcards', prompt: 'Make flashcards', input: text, ...ctx });
      return { ...r, cards: parseFlashcards(r.answer) };
    },
    async summarize(text, ctx = {}) {
      return cascade.run({ task: 'summary', prompt: 'Summarize', input: text, ...ctx });
    },
    async translate(text, targetLang = 'Hindi', ctx = {}) {
      // Policy: short text stays on-device (privacy + speed); long passages
      // prefer the cloud's better long-form translation. classifyTask's
      // long-input rule handles the escalation; here we just name the task.
      return cascade.run({ task: 'translate', prompt: `Translate to ${targetLang}`, input: text, targetLang, ...ctx });
    },
    async workedSolution(problem, ctx = {}) {
      return cascade.run({ task: 'worked', prompt: problem, ...ctx });
    },
    async photoProblem(description, { imageDataUrl = null, ...ctx } = {}) {
      // Vision path: when a photo is attached AND the cloud is configured,
      // the image rides along to the cloud model (cloud.js). Without either,
      // the typed description is solved as a deep text task. Either way the
      // routing timeline tells the truth about which happened.
      return cascade.run({ task: 'photo', prompt: description, imageDataUrl, ...ctx });
    },
    async mockTest(topic, { count = 5, ...ctx } = {}) {
      const r = await cascade.run({ task: 'mocktest', prompt: topic, count, ...ctx });
      let items = parseMockTest(r.answer);
      if (!items.length && cascade.lessons) {
        // Local assembly from the seeded practice bank — real questions.
        const hits = (await import('./fallback.js')).searchLessons(topic, cascade.lessons, 1);
        if (hits.length) {
          items = hits[0].lesson.practice.slice(0, count)
            .map((p) => ({ question: p.question, answer: p.solution }));
        }
      }
      return { ...r, items };
    },
  };
}
