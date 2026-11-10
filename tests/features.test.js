import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Meter } from '../src/stats.js';
import { Vault } from '../src/store.js';
import { glossText, GLOSSARY } from '../src/glossary.js';
import { shouldPrefetch, buildPrefetchPack, prefetchLesson } from '../src/prefetch.js';
import { replaySession } from '../src/replay.js';
import { Cascade } from '../src/router.js';
import { loadConfig } from '../src/config.js';
import { voiceSupport, speakableSummary } from '../src/voice.js';
import { SEED_LESSONS } from '../src/seed-data.js';

const memStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
};

test('meter: on-device answers accumulate estimated savings, cloud accumulates spend', () => {
  const meter = new Meter();
  meter.record({ tier: 'nano', latencyMs: 100, promptText: 'q'.repeat(400), answerText: 'a'.repeat(400) });
  meter.record({ tier: 'flash', latencyMs: 900, promptText: 'q'.repeat(400), answerText: 'a'.repeat(400) });
  const s = meter.snapshot();
  assert.equal(s.cloudCallsAvoided, 1);
  assert.ok(s.estSavedUsd > 0);
  assert.ok(s.estSpentUsd > 0);
  assert.equal(s.avgLatencyMs.onDevice, 100);
  assert.equal(s.avgLatencyMs.cloud, 900);
});

test('vault sync is opt-in AND adapter-gated — no silent sync', async () => {
  const v = new Vault(memStorage());
  assert.deepEqual(await v.syncNow({ push: async () => 3 }), { synced: 0, reason: 'opt-in required — sync is off by default' });
  v.setSyncOptIn(true);
  const noAdapter = await v.syncNow(null);
  assert.equal(noAdapter.synced, 0);
  assert.match(noAdapter.reason, /not configured/);
  const ok = await v.syncNow({ push: async (payload) => Object.keys(payload).length });
  assert.equal(ok.synced, 2);
});

test('glossary glosses known terms and is honest about unknown languages', () => {
  const g = glossText('The database uses an index.', 'Kannada');
  assert.ok(g.glossed >= 2);
  assert.match(g.text, /ಡೇಟಾಬೇಸ್/);
  assert.match(glossText('hello', 'French').note, /No offline glossary/);
  assert.ok(Object.keys(GLOSSARY).length >= 15);
});

test('prefetch: gated by connectivity + cache state; pack built and cached once', async () => {
  assert.equal(shouldPrefetch({ online: false }).go, false);
  assert.equal(shouldPrefetch({ online: true, alreadyCached: true }).go, false);
  const v = new Vault(memStorage());
  const lesson = SEED_LESSONS.find((l) => l.practice.length > 0);
  const first = await prefetchLesson(lesson, v, { online: true });
  assert.equal(first.cached, true);
  assert.ok(first.pack.summary.length > 10);
  assert.ok(Array.isArray(first.pack.cards));
  const second = await prefetchLesson(lesson, v, { online: true });
  assert.equal(second.cached, false);
  assert.match(second.reason, /already cached/);
  const pack = await buildPrefetchPack(lesson);
  assert.equal(pack.lessonId, lesson.id);
});

test('replay shows routing changing with connectivity', async () => {
  const make = async ({ offline }) => {
    const nano = async () => ({ text: 'A loop repeats a block of code until a condition changes, letting programs avoid copying the same lines.', latencyMs: 5 });
    nano.availability = async () => 'readily';
    const cloud = async ({ tier }) => ({ text: 'Step 1: state the invariant. Step 2: enforce it in withdraw. The balance can never go negative.', latencyMs: 250, model: 'gemini-2.5-flash' });
    const config = loadConfig({ firebase: { apiKey: 'k', projectId: 'p' } }, {});
    return new Cascade({ config, lessons: SEED_LESSONS, nano, cloud, online: () => !offline });
  };
  const out = await replaySession([{ question: 'Solve step by step: BankAccount balance invariant', task: 'worked', tier: 'flash' }], make);
  assert.equal(out.length, 1);
  assert.equal(out[0].offlineTier, 'fallback'); // deep task offline -> helper
  assert.equal(out[0].changedWithConnectivity, true);
});

test('voice: support detection + speakable summaries are capped', () => {
  assert.deepEqual(voiceSupport({}), { speak: false, listen: false });
  assert.equal(voiceSupport({ speechSynthesis: {}, SpeechSynthesisUtterance: class {}, SpeechRecognition: class {} }).listen, true);
  const s = speakableSummary('One. Two. Three. Four.');
  assert.match(s, /One\. Two\./);
  assert.ok(!s.includes('Three'));
  assert.ok(speakableSummary('x'.repeat(500)).length <= 320);
});
