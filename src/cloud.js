// Cloud tier: Gemini via the Firebase AI Logic SDK (firebase/ai).
//
// The SDK is loaded dynamically from the Firebase CDN *only* when a Firebase
// web config is present (see config.js). Creating that Firebase project is a
// Prasad-only console step; until it exists, `cloudStatus` reports
// 'unconfigured', `cloudPrompt` throws a typed CONFIG error, and the router
// skips the tier — the app never fabricates a cloud response.
//
// An `importer` can be injected for tests so the wire shape is verified
// without network or a real project.

import { MODEL_IDS } from './config.js';

const CDN = 'https://www.gstatic.com/firebasejs/11.6.0';
let cache = null; // { app, ai, getGenerativeModel }

export function cloudStatus(config) {
  return config && config.cloudEnabled ? 'ready' : 'unconfigured';
}

async function defaultImporter() {
  const [appMod, aiMod] = await Promise.all([
    import(/* @vite-ignore */ `${CDN}/firebase-app.js`),
    import(/* @vite-ignore */ `${CDN}/firebase-ai.js`),
  ]);
  return { appMod, aiMod };
}

export function _resetCloudCache() { cache = null; }

export async function cloudPrompt(
  { prompt, system = '', tier = 'flash', imageDataUrl = null },
  { config, importer = defaultImporter, now = () => performance.now() } = {},
) {
  if (cloudStatus(config) !== 'ready') {
    const err = new Error('Firebase AI Logic is not configured (no Firebase project config yet)');
    err.code = 'CLOUD_UNCONFIGURED';
    throw err;
  }
  const t0 = now();
  if (!cache) {
    const { appMod, aiMod } = await importer();
    const apps = appMod.getApps ? appMod.getApps() : [];
    const app = apps.length ? apps[0] : appMod.initializeApp(config.firebase);
    const backend = aiMod.GoogleAIBackend ? new aiMod.GoogleAIBackend() : undefined;
    const ai = aiMod.getAI(app, backend ? { backend } : undefined);
    cache = { app, ai, getGenerativeModel: aiMod.getGenerativeModel };
  }
  const modelName = tier === 'pro' ? MODEL_IDS.pro : MODEL_IDS.flash;
  const model = cache.getGenerativeModel(cache.ai, {
    model: modelName,
    ...(system ? { systemInstruction: system } : {}),
  });
  const parts = imageDataUrl
    ? [{ text: prompt }, { inlineData: { data: imageDataUrl.split(',')[1] || '', mimeType: (imageDataUrl.match(/^data:([^;]+)/) || [])[1] || 'image/png' } }]
    : prompt;
  const result = await model.generateContent(parts);
  const text = typeof result?.response?.text === 'function'
    ? result.response.text()
    : String(result?.response?.text ?? '');
  return { text: text.trim(), latencyMs: Math.max(0, Math.round(now() - t0)), model: modelName };
}
