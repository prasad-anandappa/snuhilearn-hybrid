import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cascade, classifyTask, estimateConfidence, flushOfflineQueue } from '../src/router.js';
import { loadConfig } from '../src/config.js';
import { Meter } from '../src/stats.js';
import { Vault } from '../src/store.js';
import { SEED_LESSONS } from '../src/seed-data.js';

const memStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
};
const noConfig = () => loadConfig({}, {});
const cloudConfig = () => loadConfig({ firebase: { apiKey: 'k', projectId: 'p' } }, {});

function fakeNano(text, avail = 'readily') {
  const fn = async () => ({ text, latencyMs: 12 });
  fn.availability = async () => avail;
  return fn;
}
function fakeCloud(text) {
  return async ({ tier }) => ({ text, latencyMs: 300, model: tier === 'pro' ? 'gemini-2.5-pro' : 'gemini-2.5-flash' });
}
const GOOD = 'Encapsulation means bundling data with the methods that operate on it, and hiding internal state behind a controlled interface.';
const HEDGY = 'Maybe it is that.';

test('classifyTask: policy table + deep markers + long input', () => {
  const cfg = noConfig();
  assert.equal(classifyTask({ task: 'qa', prompt: 'what is a loop?' }, cfg).complexity, 'light');
  assert.equal(classifyTask({ task: 'worked', prompt: 'x' }, cfg).complexity, 'deep');
  assert.equal(classifyTask({ task: 'qa', prompt: 'prove step by step that...' }, cfg).complexity, 'deep');
  assert.equal(classifyTask({ task: 'translate', input: 'x'.repeat(2000) }, cfg).complexity, 'deep');
});

test('estimateConfidence penalises thin, hedged, refusing answers', () => {
  assert.ok(estimateConfidence(GOOD) >= 0.8);
  assert.ok(estimateConfidence(HEDGY) < 0.5);
  assert.ok(estimateConfidence("I don't know the answer to this question at all.") < 0.4);
});

test('light task answered on-device when Nano is confident', async () => {
  const meter = new Meter();
  const c = new Cascade({ config: noConfig(), meter, lessons: SEED_LESSONS, nano: fakeNano(GOOD), online: () => true });
  const r = await c.run({ task: 'qa', prompt: 'What is encapsulation?' });
  assert.equal(r.decision.tier, 'nano');
  assert.equal(r.decision.model.includes('gemini-nano'), true);
  assert.equal(r.decision.estCostUsd, 0);
  assert.equal(meter.snapshot().cloudCallsAvoided, 1);
});

test('low-confidence Nano answer escalates to Flash', async () => {
  const c = new Cascade({
    config: cloudConfig(), lessons: SEED_LESSONS,
    nano: fakeNano(HEDGY), cloud: fakeCloud(GOOD), online: () => true,
  });
  const r = await c.run({ task: 'qa', prompt: 'What is encapsulation?' });
  assert.equal(r.decision.tier, 'flash');
  const esc = r.decision.attempts.find((a) => a.tier === 'nano' && a.outcome === 'escalated');
  assert.ok(esc, 'escalation recorded in the timeline');
});

test('deep task skips Nano and goes to the cloud', async () => {
  let nanoCalled = false;
  const nano = async () => { nanoCalled = true; return { text: GOOD, latencyMs: 1 }; };
  nano.availability = async () => 'readily';
  const c = new Cascade({ config: cloudConfig(), lessons: SEED_LESSONS, nano, cloud: fakeCloud(GOOD), online: () => true });
  const r = await c.run({ task: 'worked', prompt: 'Solve step by step: BankAccount invariant' });
  assert.equal(r.decision.tier, 'flash');
  assert.equal(nanoCalled, false);
});

test('no AI tier at all -> honest local helper answers from the bank', async () => {
  const c = new Cascade({ config: noConfig(), lessons: SEED_LESSONS, nano: fakeNano(GOOD, 'no'), online: () => true });
  const r = await c.run({ task: 'qa', prompt: 'What is a class in Python?' });
  assert.equal(r.decision.tier, 'fallback');
  assert.match(r.decision.model, /not an AI model/);
  assert.match(r.answer, /Python|class/i);
});

test('deep task while offline: helper answers AND the request is queued for cloud catch-up', async () => {
  const vault = new Vault(memStorage());
  const c = new Cascade({ config: cloudConfig(), vault, lessons: SEED_LESSONS, nano: fakeNano(GOOD, 'no'), cloud: fakeCloud(GOOD), online: () => false });
  const r = await c.run({ task: 'worked', prompt: 'BankAccount class with deposit withdraw balance never negative' });
  assert.equal(r.decision.tier, 'fallback');
  assert.equal(r.decision.queuedForCloud, true);
  assert.equal(vault.queue().length, 1);
});

test('flushOfflineQueue re-runs queued items when back online', async () => {
  const vault = new Vault(memStorage());
  vault.enqueue({ task: 'qa', prompt: 'What is a loop?' });
  const c = new Cascade({ config: noConfig(), vault, lessons: SEED_LESSONS, nano: fakeNano(GOOD), online: () => true });
  const out = await flushOfflineQueue(c, vault);
  assert.equal(out.flushed, 1);
  assert.equal(out.results[0].tier, 'nano');
  assert.equal(vault.queue().length, 0);
});

test('translate falls back to the offline glossary when no AI tier exists', async () => {
  const c = new Cascade({ config: noConfig(), lessons: SEED_LESSONS, nano: fakeNano(GOOD, 'no'), online: () => true });
  const r = await c.run({ task: 'translate', prompt: 'Translate to Hindi', input: 'A database stores data.', targetLang: 'Hindi' });
  assert.equal(r.decision.tier, 'fallback');
  assert.match(r.answer, /डेटाबेस/);
  assert.match(r.answer, /partial/i);
});

test('history is written to the vault for the timeline + replay', async () => {
  const vault = new Vault(memStorage());
  const c = new Cascade({ config: noConfig(), vault, lessons: SEED_LESSONS, nano: fakeNano(GOOD), online: () => true });
  await c.run({ task: 'qa', prompt: 'What is a variable?' });
  assert.equal(vault.history().length, 1);
  assert.equal(vault.history()[0].tier, 'nano');
});
