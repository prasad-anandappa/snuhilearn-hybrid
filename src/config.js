// Configuration seam for SnuhiLearn Hybrid.
//
// Everything environment-specific lives here. The Firebase web config is NOT
// a secret (it identifies the project), but it only exists once Prasad has
// created the Firebase project in the console — a step only he can do with
// his Google sign-in. Until then `cloudEnabled` is false, the cloud tier is
// skipped by the router, and the UI says so plainly. Nothing in this app
// pretends a cloud call happened when it did not.

export const MODEL_IDS = {
  nano: 'gemini-nano (Chrome Prompt API, on-device)',
  flash: 'gemini-2.5-flash',
  pro: 'gemini-2.5-pro',
};

// Rough public list-price estimates (USD per 1M tokens, blended in/out) used
// ONLY for the in-app cost meter. Estimates, clearly labelled as such in UI.
export const PRICE_PER_MTOK = { flash: 0.6, pro: 3.5, nano: 0, fallback: 0 };

const DEFAULTS = {
  firebase: null, // { apiKey, authDomain, projectId, appId, ... }
  confidenceThreshold: 0.6,
  longTextChars: 600, // translate/summarize: above this, prefer cloud
  deepKeywords: ['prove', 'derive', 'step by step', 'step-by-step', 'worked example',
    'calculate', 'solve for', 'essay', 'mock test', 'explain in detail', 'compare and contrast'],
};

export function loadConfig(overrides = {}, root = globalThis) {
  const injected = (root && root.__HYBRID_CONFIG__) || {};
  const cfg = {
    ...DEFAULTS,
    ...injected,
    ...overrides,
    firebase: overrides.firebase ?? injected.firebase ?? DEFAULTS.firebase,
  };
  cfg.cloudEnabled = Boolean(cfg.firebase && cfg.firebase.apiKey && cfg.firebase.projectId);
  return Object.freeze(cfg);
}

export function estimateTokens(text = '') {
  return Math.max(1, Math.ceil(String(text).length / 4));
}

export function estimateCostUsd(tier, promptText, answerText) {
  const rate = PRICE_PER_MTOK[tier] ?? 0;
  if (!rate) return 0;
  const tokens = estimateTokens(promptText) + estimateTokens(answerText);
  return (tokens / 1_000_000) * rate;
}
