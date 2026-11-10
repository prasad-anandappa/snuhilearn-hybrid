import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectNano, nanoAvailability, nanoPrompt } from '../src/nano.js';

test('detects the modern LanguageModel global', () => {
  assert.deepEqual(detectNano({ LanguageModel: {} }), { supported: true, api: 'LanguageModel' });
});

test('detects the legacy window.ai shape', () => {
  assert.deepEqual(detectNano({ ai: { languageModel: {} } }), { supported: true, api: 'window.ai' });
});

test('no API -> unsupported, availability no', async () => {
  assert.equal(detectNano({}).supported, false);
  assert.equal(await nanoAvailability({}), 'no');
});

test('availability maps vendor strings', async () => {
  assert.equal(await nanoAvailability({ LanguageModel: { availability: async () => 'available' } }), 'readily');
  assert.equal(await nanoAvailability({ LanguageModel: { availability: async () => 'downloadable' } }), 'after-download');
  assert.equal(await nanoAvailability({ ai: { languageModel: { capabilities: async () => ({ available: 'readily' }) } } }), 'readily');
  assert.equal(await nanoAvailability({ LanguageModel: { availability: async () => { throw new Error('x'); } } }), 'no');
});

test('nanoPrompt passes the system prompt as an initial prompt and trims output', async () => {
  let seenOpts;
  const root = {
    LanguageModel: {
      availability: async () => 'available',
      create: async (opts) => {
        seenOpts = opts;
        return { prompt: async (p) => `  answer to: ${p}  `, destroy() {} };
      },
    },
  };
  const r = await nanoPrompt({ prompt: 'hi', system: 'Be a tutor' }, { root, now: (() => { let t = 100; return () => (t += 7); })() });
  assert.equal(r.text, 'answer to: hi');
  assert.equal(r.latencyMs, 7);
  assert.deepEqual(seenOpts.initialPrompts, [{ role: 'system', content: 'Be a tutor' }]);
});

test('nanoPrompt throws a typed error when unsupported', async () => {
  await assert.rejects(() => nanoPrompt({ prompt: 'x' }, { root: {} }), (e) => e.code === 'NANO_UNSUPPORTED');
});
