import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, estimateTokens, estimateCostUsd, PRICE_PER_MTOK } from '../src/config.js';

test('defaults: cloud disabled without a Firebase config', () => {
  const cfg = loadConfig({}, {});
  assert.equal(cfg.cloudEnabled, false);
  assert.equal(cfg.confidenceThreshold, 0.6);
});

test('cloud enables only with apiKey AND projectId', () => {
  assert.equal(loadConfig({ firebase: { apiKey: 'k' } }, {}).cloudEnabled, false);
  assert.equal(loadConfig({ firebase: { projectId: 'p' } }, {}).cloudEnabled, false);
  assert.equal(loadConfig({ firebase: { apiKey: 'k', projectId: 'p' } }, {}).cloudEnabled, true);
});

test('injected window config is honoured', () => {
  const cfg = loadConfig({}, { __HYBRID_CONFIG__: { firebase: { apiKey: 'k', projectId: 'p' } } });
  assert.equal(cfg.cloudEnabled, true);
});

test('cost estimates: nano/fallback free, cloud priced by tokens', () => {
  assert.equal(estimateCostUsd('nano', 'x'.repeat(4000), 'y'.repeat(4000)), 0);
  const c = estimateCostUsd('flash', 'x'.repeat(4000), 'y'.repeat(4000));
  assert.ok(c > 0 && c < 0.01, `flash cost sane: ${c}`);
  assert.ok(PRICE_PER_MTOK.pro > PRICE_PER_MTOK.flash);
  assert.equal(estimateTokens('abcd'), 1);
});
