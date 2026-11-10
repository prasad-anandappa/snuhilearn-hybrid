import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cloudStatus, cloudPrompt, _resetCloudCache } from '../src/cloud.js';
import { loadConfig } from '../src/config.js';

const readyCfg = () => loadConfig({ firebase: { apiKey: 'k', projectId: 'p', appId: 'a' } }, {});

function fakeImporter(capture) {
  return async () => ({
    appMod: {
      getApps: () => [],
      initializeApp: (cfg) => { capture.config = cfg; return { name: '[DEFAULT]' }; },
    },
    aiMod: {
      GoogleAIBackend: class {},
      getAI: (app, opts) => { capture.aiOpts = opts; return { app }; },
      getGenerativeModel: (ai, opts) => {
        capture.modelOpts = opts;
        return {
          generateContent: async (parts) => {
            capture.parts = parts;
            return { response: { text: () => '  cloud answer.  ' } };
          },
        };
      },
    },
  });
}

test('status reflects the config seam', () => {
  assert.equal(cloudStatus(loadConfig({}, {})), 'unconfigured');
  assert.equal(cloudStatus(readyCfg()), 'ready');
});

test('unconfigured cloud throws a typed error — never a fabricated answer', async () => {
  await assert.rejects(
    () => cloudPrompt({ prompt: 'x' }, { config: loadConfig({}, {}) }),
    (e) => e.code === 'CLOUD_UNCONFIGURED',
  );
});

test('configured cloud wires Firebase AI Logic with the right model + system instruction', async () => {
  _resetCloudCache();
  const capture = {};
  const r = await cloudPrompt(
    { prompt: 'Explain recursion', system: 'Be a tutor', tier: 'pro' },
    { config: readyCfg(), importer: fakeImporter(capture), now: (() => { let t = 0; return () => (t += 42); })() },
  );
  assert.equal(r.text, 'cloud answer.');
  assert.equal(r.model, 'gemini-2.5-pro');
  assert.equal(r.latencyMs, 42);
  assert.equal(capture.modelOpts.model, 'gemini-2.5-pro');
  assert.equal(capture.modelOpts.systemInstruction, 'Be a tutor');
  assert.equal(capture.parts, 'Explain recursion');
  assert.ok(capture.aiOpts.backend, 'GoogleAIBackend passed to getAI');
});

test('image input becomes an inlineData part for the vision path', async () => {
  _resetCloudCache();
  const capture = {};
  await cloudPrompt(
    { prompt: 'solve', tier: 'flash', imageDataUrl: 'data:image/png;base64,QUJD' },
    { config: readyCfg(), importer: fakeImporter(capture) },
  );
  assert.equal(capture.parts[0].text, 'solve');
  assert.deepEqual(capture.parts[1], { inlineData: { data: 'QUJD', mimeType: 'image/png' } });
});
