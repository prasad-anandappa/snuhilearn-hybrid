// On-device tier: Gemini Nano through the Chrome Prompt API.
//
// Supports both published shapes of the API:
//   - the modern global:  LanguageModel.availability() / .create() / session.prompt()
//   - the legacy origin-trial shape: window.ai.languageModel.capabilities() / .create()
// Feature-detection is total: on any browser without the API (most judges'
// machines, Firefox, Safari, headless CI) every function degrades cleanly and
// the router simply skips this tier with a recorded reason.

export function detectNano(root = globalThis) {
  if (root && typeof root.LanguageModel !== 'undefined') return { supported: true, api: 'LanguageModel' };
  if (root && root.ai && root.ai.languageModel) return { supported: true, api: 'window.ai' };
  return { supported: false, api: null };
}

export async function nanoAvailability(root = globalThis) {
  const d = detectNano(root);
  if (!d.supported) return 'no';
  try {
    if (d.api === 'LanguageModel') {
      const a = await root.LanguageModel.availability();
      if (a === 'available' || a === 'readily') return 'readily';
      if (a === 'downloadable' || a === 'downloading' || a === 'after-download') return 'after-download';
      return 'no';
    }
    const caps = await root.ai.languageModel.capabilities();
    if (caps && caps.available === 'readily') return 'readily';
    if (caps && caps.available === 'after-download') return 'after-download';
    return 'no';
  } catch {
    return 'no';
  }
}

async function createSession(root, api, system) {
  if (api === 'LanguageModel') {
    const opts = system
      ? { initialPrompts: [{ role: 'system', content: system }] }
      : undefined;
    return root.LanguageModel.create(opts);
  }
  return root.ai.languageModel.create(system ? { systemPrompt: system } : undefined);
}

// Returns { text, latencyMs }. Throws a typed error the router records.
export async function nanoPrompt({ prompt, system = '' }, { root = globalThis, now = () => performance.now() } = {}) {
  const d = detectNano(root);
  if (!d.supported) {
    const err = new Error('Gemini Nano Prompt API not available in this browser');
    err.code = 'NANO_UNSUPPORTED';
    throw err;
  }
  const t0 = now();
  const session = await createSession(root, d.api, system);
  try {
    const text = await session.prompt(prompt);
    return { text: String(text ?? '').trim(), latencyMs: Math.max(0, Math.round(now() - t0)) };
  } finally {
    if (session && typeof session.destroy === 'function') session.destroy();
  }
}
