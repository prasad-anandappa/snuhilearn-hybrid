// Privacy vault (highlight #4) + offline queue (highlight #2) + progress
// (highlight #12) + prefetch cache (highlight #13).
//
// Design rule: everything is LOCAL by default. History, profile and progress
// live in this vault (localStorage in the browser, an injected shim in
// tests). Cloud sync is a seam: it does nothing unless (a) the user has
// explicitly opted in AND (b) a Firestore adapter has been wired by a
// configured build. There is no silent sync path anywhere in the app.

const PREFIX = 'slh:';

function defaultStorage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch { /* storage can throw in sandboxed frames */ }
  const mem = new Map();
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
}

export class Vault {
  constructor(storage = defaultStorage()) { this.storage = storage; }

  _read(key, fallback) {
    try {
      const raw = this.storage.getItem(PREFIX + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  }

  _write(key, value) {
    try { this.storage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* quota — vault is best-effort */ }
  }

  // --- history (routing timeline persistence + replay source) ---
  addHistory(entry) {
    const h = this.history();
    h.push(entry);
    this._write('history', h.slice(-200));
    return h;
  }
  history() { return this._read('history', []); }

  // --- offline catch-up queue ---
  enqueue(item) {
    const q = this.queue();
    q.push({ ...item, queuedAt: Date.now() });
    this._write('queue', q);
    return q.length;
  }
  queue() { return this._read('queue', []); }
  clearQueue() { this._write('queue', []); }

  // --- progress for the parent/teacher dashboard ---
  recordProgress(lessonId, patch) {
    const p = this._read('progress', {});
    p[lessonId] = { ...(p[lessonId] || {}), ...patch, updatedAt: Date.now() };
    this._write('progress', p);
    return p;
  }
  progress() { return this._read('progress', {}); }

  // --- prefetch packs ---
  putPrefetch(lessonId, pack) { this._write(`prefetch:${lessonId}`, { ...pack, cachedAt: Date.now() }); }
  getPrefetch(lessonId) { return this._read(`prefetch:${lessonId}`, null); }

  // --- consent-gated sync seam ---
  setSyncOptIn(on) { this._write('syncOptIn', Boolean(on)); }
  syncOptIn() { return this._read('syncOptIn', false); }

  async syncNow(adapter = null) {
    if (!this.syncOptIn()) return { synced: 0, reason: 'opt-in required — sync is off by default' };
    if (!adapter) return { synced: 0, reason: 'no Firestore adapter wired (Firebase not configured)' };
    const payload = { history: this.history(), progress: this.progress() };
    const n = await adapter.push(payload);
    return { synced: n, reason: 'ok' };
  }
}
