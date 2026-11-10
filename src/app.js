// SnuhiLearn Hybrid — UI wiring. All intelligence lives in the modules;
// this file only renders state and forwards events.
import { loadConfig } from './config.js';
import { nanoAvailability } from './nano.js';
import { cloudStatus } from './cloud.js';
import { Cascade, flushOfflineQueue } from './router.js';
import { createTasks } from './tasks.js';
import { Meter } from './stats.js';
import { Vault } from './store.js';
import { prefetchLesson } from './prefetch.js';
import { replaySession } from './replay.js';
import { voiceSupport, speak } from './voice.js';
import { SEED_LESSONS } from './seed-data.js';

const $ = (id) => document.getElementById(id);
const config = loadConfig();
const meter = new Meter();
const vault = new Vault();
const simOff = () => $('simulate-offline').checked;
const online = () => navigator.onLine !== false && !simOff();

function makeCascade() {
  return new Cascade({ config, meter, vault, lessons: SEED_LESSONS, online });
}
let tasks = createTasks(makeCascade());

let currentTask = 'qa';
let photoDataUrl = null;

// ---------- status chips ---------------------------------------------------
async function renderStatus() {
  const nano = await nanoAvailability();
  const nanoChip = $('chip-nano');
  nanoChip.textContent = `On-device (Gemini Nano): ${nano === 'readily' ? 'available' : nano === 'after-download' ? 'downloadable' : 'not in this browser'}`;
  nanoChip.className = 'chip ' + (nano === 'readily' ? 'ok' : 'warn');
  const cloudChip = $('chip-cloud');
  const cs = cloudStatus(config);
  cloudChip.textContent = `Cloud (Firebase AI Logic): ${cs === 'ready' ? 'connected' : 'not connected yet'}`;
  cloudChip.className = 'chip ' + (cs === 'ready' ? 'ok' : 'warn');
  $('demo-banner').classList.toggle('hidden', !(nano === 'no' && cs !== 'ready'));
  renderNet();
  return nano;
}
function renderNet() {
  const on = online();
  const chip = $('chip-net');
  chip.textContent = `Network: ${on ? 'online' : 'offline (airplane mode)'}`;
  chip.className = 'chip ' + (on ? 'ok' : 'warn');
  $('queue-count').textContent = vault.queue().length;
}
window.addEventListener('online', renderNet);
window.addEventListener('offline', renderNet);
$('simulate-offline').addEventListener('change', renderNet);

// ---------- lessons --------------------------------------------------------
function renderLessons() {
  const sel = $('lesson-select');
  const bySubject = new Map();
  for (const l of SEED_LESSONS) {
    if (!bySubject.has(l.subject)) bySubject.set(l.subject, []);
    bySubject.get(l.subject).push(l);
  }
  for (const [subject, list] of bySubject) {
    const group = document.createElement('optgroup');
    group.label = subject;
    for (const l of list) {
      const o = document.createElement('option');
      o.value = l.id; o.textContent = l.title;
      group.appendChild(o);
    }
    sel.appendChild(group);
  }
}
const currentLesson = () => SEED_LESSONS.find((l) => l.id === $('lesson-select').value) || SEED_LESSONS[0];

// ---------- tasks ----------------------------------------------------------
$('task-tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-task]');
  if (!b) return;
  currentTask = b.dataset.task;
  document.querySelectorAll('#task-tabs button').forEach((x) => x.classList.toggle('active', x === b));
  $('lang-row').classList.toggle('hidden', currentTask !== 'translate');
  $('photo-row').classList.toggle('hidden', currentTask !== 'photo');
  const lesson = currentLesson();
  const hints = {
    qa: 'Ask a question, e.g. "What is a class in Python?"',
    flashcards: 'Paste a paragraph — flashcards are forged from it.',
    summary: 'Paste text to summarize.',
    translate: 'Paste study text to translate (short = on-device, long = cloud).',
    worked: 'Describe the problem, e.g. "Model a BankAccount class whose balance cannot go negative."',
    photo: 'Describe what the photo shows (and attach it if the cloud vision tier is connected).',
    mocktest: 'Name a topic, e.g. "classes and objects in python".',
  };
  $('input').placeholder = hints[currentTask];
  if (currentTask === 'flashcards' && lesson) $('input').value = `${lesson.intro}\n${(lesson.keyFacts || []).join(' ')}`;
});

$('photo-input').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (!f) { photoDataUrl = null; return; }
  const reader = new FileReader();
  reader.onload = () => { photoDataUrl = reader.result; };
  reader.readAsDataURL(f);
});

function tierClass(tier) { return tier === 'nano' ? 'nano' : tier === 'fallback' ? 'fallback' : 'cloud'; }

function renderDecision(d) {
  const attempts = d.attempts.map((a) => `${a.tier}: ${a.outcome}${a.reason ? ` (${a.reason})` : ''}`).join(' · ');
  $('decision').innerHTML =
    `<div>Confidence ${(d.confidence * 100).toFixed(0)}% · latency ${d.latencyMs} ms · est. cloud cost $${d.estCostUsd.toFixed(4)}` +
    `${d.queuedForCloud ? ' · <strong>queued for cloud catch-up</strong>' : ''}</div>` +
    `<ul>${d.reasons.map((r) => `<li>${r}</li>`).join('')}</ul>` +
    (attempts ? `<div class="muted">Attempts — ${attempts}</div>` : '');
}

function renderCards(cards = [], items = []) {
  const wrap = $('cards');
  wrap.innerHTML = '';
  for (const c of cards) {
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `<b>Q: ${c.front}</b><span>A: ${c.back}</span>`;
    wrap.appendChild(div);
  }
  items.forEach((it, i) => {
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `<b>Q${i + 1}. ${it.question}</b><span>Answer: ${it.answer || '—'}</span>`;
    wrap.appendChild(div);
  });
}

$('btn-run').addEventListener('click', async () => {
  const text = $('input').value.trim();
  if (!text) return;
  const lesson = currentLesson();
  const ctx = { lessonTitle: lesson ? `${lesson.subject} — ${lesson.title}` : '', lessonId: lesson?.id };
  tasks = createTasks(makeCascade());
  $('btn-run').disabled = true;
  let r;
  try {
    if (currentTask === 'qa') r = await tasks.ask(text, ctx);
    else if (currentTask === 'flashcards') r = await tasks.flashcards(text, ctx);
    else if (currentTask === 'summary') r = await tasks.summarize(text, ctx);
    else if (currentTask === 'translate') r = await tasks.translate(text, $('lang-select').value, ctx);
    else if (currentTask === 'worked') r = await tasks.workedSolution(text, ctx);
    else if (currentTask === 'photo') r = await tasks.photoProblem(text, { imageDataUrl: photoDataUrl, ...ctx });
    else if (currentTask === 'mocktest') r = await tasks.mockTest(text, ctx);
  } finally { $('btn-run').disabled = false; }
  $('answer-wrap').classList.remove('hidden');
  $('answer').textContent = r.answer;
  const chip = $('answer-tier');
  chip.textContent = `${r.decision.tier} · ${r.decision.model}`;
  chip.className = 'tier ' + tierClass(r.decision.tier);
  renderCards(r.cards || [], r.items || []);
  renderDecision(r.decision);
  if (lesson) {
    const prev = vault.progress()[lesson.id] || {};
    vault.recordProgress(lesson.id, { title: lesson.title, runs: (prev.runs || 0) + 1, lastTask: currentTask, lastTier: r.decision.tier });
  }
  renderTimeline(); renderMeters(); renderDashboard(); renderNet();
});

// ---------- prefetch -------------------------------------------------------
$('btn-prefetch').addEventListener('click', async () => {
  const lesson = currentLesson();
  const existing = vault.getPrefetch(lesson.id);
  if (existing) {
    $('prefetch-status').textContent = `Cached ${new Date(existing.cachedAt).toLocaleString()} (via ${existing.via}) — works offline.`;
    $('answer-wrap').classList.remove('hidden');
    $('answer').textContent = existing.summary;
    $('answer-tier').textContent = 'prefetched pack';
    $('answer-tier').className = 'tier nano';
    renderCards(existing.cards || []);
    $('decision').innerHTML = '';
    return;
  }
  $('prefetch-status').textContent = 'Building pack…';
  const out = await prefetchLesson(lesson, vault, { online: online(), tasks });
  $('prefetch-status').textContent = out.cached ? `Cached ✓ (${out.reason}) — click again to view.` : out.reason;
});

// ---------- timeline, meters, dashboard ------------------------------------
function renderTimeline() {
  const list = $('timeline');
  list.innerHTML = '';
  for (const h of [...vault.history()].reverse().slice(0, 30)) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="tier ${tierClass(h.tier)}">${h.tier}</span> <span class="q">${h.question ?? ''}</span>` +
      `<div class="muted">${h.model} · ${(h.decision?.reasons || []).slice(-1)[0] || ''}</div>`;
    list.appendChild(li);
  }
}
function renderMeters() {
  const s = meter.snapshot();
  $('meters').innerHTML =
    `<span>On-device answers<br><strong>${s.byTier.nano?.count || 0}</strong></span>` +
    `<span>Cloud calls avoided<br><strong>${s.cloudCallsAvoided}</strong></span>` +
    `<span>Est. cloud spend<br><strong>$${s.estSpentUsd.toFixed(4)}</strong></span>` +
    `<span>Est. saved by hybrid<br><strong>$${s.estSavedUsd.toFixed(4)}</strong></span>` +
    `<span>Avg latency on-device<br><strong>${s.avgLatencyMs.onDevice ?? '—'} ms</strong></span>` +
    `<span>Avg latency cloud<br><strong>${s.avgLatencyMs.cloud ?? '—'} ms</strong></span>`;
}
function renderDashboard() {
  const p = vault.progress();
  const ids = Object.keys(p);
  if (!ids.length) { $('dashboard').textContent = 'No study activity yet.'; return; }
  const totalRuns = ids.reduce((a, id) => a + (p[id].runs || 0), 0);
  $('dashboard').innerHTML = `${ids.length} lesson(s) studied · ${totalRuns} run(s)<br>` +
    ids.map((id) => `• ${p[id].title || id} — ${p[id].runs} run(s), last: ${p[id].lastTask} via ${p[id].lastTier}`).join('<br>');
}

// ---------- offline catch-up + replay --------------------------------------
$('btn-flush').addEventListener('click', async () => {
  const out = await flushOfflineQueue(makeCascade(), vault);
  $('prefetch-status').textContent = out.flushed ? `Catch-up complete: ${out.flushed} queued item(s) re-run.` : 'Queue is empty.';
  renderTimeline(); renderMeters(); renderNet();
});
$('btn-replay').addEventListener('click', async () => {
  const entries = vault.history().slice(-5);
  if (!entries.length) { $('replay-out').innerHTML = '<p class="muted">Run something first — replay needs history.</p>'; return; }
  $('replay-out').innerHTML = '<p class="muted">Replaying…</p>';
  const rows = await replaySession(entries, async () => makeCascade());
  $('replay-out').innerHTML = '<table><thead><tr><th>Question</th><th>Recorded</th><th>Online</th><th>Offline</th></tr></thead><tbody>' +
    rows.map((r) => `<tr><td>${r.question}</td><td>${r.recordedTier}</td><td>${r.onlineTier}</td><td>${r.offlineTier}</td></tr>`).join('') +
    '</tbody></table>';
});

// ---------- sync seam --------------------------------------------------------
$('sync-optin').checked = vault.syncOptIn();
$('sync-optin').addEventListener('change', (e) => vault.setSyncOptIn(e.target.checked));
$('btn-sync').addEventListener('click', async () => {
  const out = await vault.syncNow(null); // adapter wires in once Firebase is configured
  $('sync-status').textContent = `Synced ${out.synced} — ${out.reason}`;
});

// ---------- voice ------------------------------------------------------------
const vs = voiceSupport();
$('btn-listen').disabled = !vs.listen;
$('btn-speak').disabled = !vs.speak;
$('btn-listen').addEventListener('click', () => {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Rec) return;
  const rec = new Rec();
  rec.lang = 'en-US';
  rec.onresult = (e) => { $('input').value = e.results[0][0].transcript; };
  rec.start();
});
$('btn-speak').addEventListener('click', () => speak($('answer').textContent));

// ---------- boot -------------------------------------------------------------
renderLessons();
renderTimeline();
renderMeters();
renderDashboard();
renderStatus();
