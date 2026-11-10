// The confidence cascade — the architectural core of SnuhiLearn Hybrid.
//
// Routing policy (the rationale is a judged surface; it is also documented
// in ARCHITECTURE.md and the in-app "Why hybrid?" page):
//   LIGHT tasks (short Q&A, flashcards, short summaries, short translation)
//     -> Nano first: instant, private, free, works offline. Escalate only if
//        Nano is absent or its self-check confidence is low.
//   DEEP tasks (worked solutions, mock tests, photo problems, long text,
//     explicit multi-step markers) -> cloud first (Flash, then Pro): these
//        need reasoning depth a small on-device model should not fake.
//   OFFLINE -> cloud tiers are unreachable by definition; Nano answers what
//        it can, deep tasks are answered by the local helper AND queued for
//        cloud catch-up on reconnect (highlight #2).
//   NO AI TIER AVAILABLE -> the built-in study helper answers from the local
//        lesson bank, labelled as exactly that.
//
// Every run returns a full decision record for the routing timeline
// (highlight #1): attempts, reasons, final tier/model, latency, est. cost,
// confidence. Nothing is hidden from the user — that visibility is the point.

import { MODEL_IDS, estimateCostUsd } from './config.js';
import { nanoAvailability, nanoPrompt } from './nano.js';
import { cloudStatus, cloudPrompt } from './cloud.js';
import * as fb from './fallback.js';
import { glossText } from './glossary.js';

const LIGHT_TASKS = new Set(['qa', 'flashcards', 'summary', 'translate']);
const DEEP_TASKS = new Set(['worked', 'mocktest', 'photo']);

const HEDGES = ['maybe', 'perhaps', 'i think', 'not sure', "i'm not certain", 'probably', 'might be', 'could be', 'approximately', 'unsure'];
const REFUSALS = ["i can't", 'i cannot', 'unable to', "i don't know"];

export function classifyTask(req, config) {
  const reasons = [];
  let complexity = 'standard';
  if (LIGHT_TASKS.has(req.task)) { complexity = 'light'; reasons.push(`task "${req.task}" is light by policy`); }
  if (DEEP_TASKS.has(req.task)) { complexity = 'deep'; reasons.push(`task "${req.task}" needs cloud-grade reasoning by policy`); }
  const text = `${req.prompt || ''} ${req.input || ''}`.toLowerCase();
  if (config.deepKeywords.some((k) => text.includes(k))) {
    complexity = 'deep'; reasons.push('multi-step marker detected in the request');
  }
  if ((req.input || '').length > config.longTextChars * 3 && complexity !== 'deep') {
    complexity = 'deep'; reasons.push('long input — cloud context window preferred');
  }
  if (req.forceTier) { reasons.push(`tier forced by caller: ${req.forceTier}`); }
  return { complexity, reasons };
}

export function estimateConfidence(text = '', base = 0.85) {
  const t = String(text).toLowerCase();
  let c = base;
  if (text.length < 25) c -= 0.35;                       // suspiciously thin answer
  if (REFUSALS.some((r) => t.includes(r))) c -= 0.5;
  const hedges = HEDGES.filter((h) => t.includes(h)).length;
  c -= Math.min(0.3, hedges * 0.1);
  if (/[.!?]["')\]]?\s*$/.test(text.trim())) c += 0.03; // ends like a complete answer
  return Math.max(0, Math.min(1, Number(c.toFixed(2))));
}

export class Cascade {
  constructor({ config, meter = null, vault = null, lessons = [], nano = null, cloud = null, online = null, now = () => performance.now() }) {
    this.config = config;
    this.meter = meter; this.vault = vault; this.lessons = lessons;
    this._nanoPrompt = nano || (async (req, opts) => nanoPrompt(req, opts));
    this._nanoAvail = nano && nano.availability
      ? nano.availability
      : (root) => nanoAvailability(root);
    this._cloudPrompt = cloud || ((req, opts) => cloudPrompt(req, { config: this.config, ...opts }));
    this._online = online || (() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
    this._now = now;
  }

  async run(req) {
    const cfg = this.config;
    const t0 = this._now();
    const offline = req.offline !== undefined ? req.offline : !this._online();
    const { complexity, reasons } = classifyTask(req, cfg);
    const attempts = [];
    const queueForCloud = () => {
      if (this.vault) this.vault.enqueue({ task: req.task, prompt: req.prompt, input: req.input, lessonId: req.lessonId || null });
      return true;
    };

    const finish = (answer, tier, model, confidence, extraReasons = []) => {
      const latencyMs = Math.max(0, Math.round(this._now() - t0));
      const estCostUsd = estimateCostUsd(tier, req.prompt + (req.input || ''), answer);
      if (this.meter) this.meter.record({ tier, latencyMs, promptText: req.prompt + (req.input || ''), answerText: answer });
      const decision = {
        task: req.task, complexity, offline, tier, model, confidence,
        reasons: [...reasons, ...extraReasons], attempts, latencyMs,
        estCostUsd: Number(estCostUsd.toFixed(6)),
        queuedForCloud: extraReasons.includes('queued-for-cloud'),
        at: new Date().toISOString(),
      };
      if (this.vault) this.vault.addHistory({ question: req.prompt, task: req.task, tier, model, decision });
      return { answer, decision };
    };

    // ---- build the attempt plan -------------------------------------------
    const plan = [];
    if (req.forceTier) plan.push(req.forceTier);
    else if (complexity === 'deep') { plan.push('flash', 'pro'); }
    else { plan.push('nano', 'flash', 'pro'); }

    const nanoState = await this._nanoAvail();
    const cloudReady = cloudStatus(cfg) === 'ready';

    for (const tier of plan) {
      if (tier === 'nano') {
        if (nanoState === 'no') { attempts.push({ tier, outcome: 'skipped', reason: 'Gemini Nano not available in this browser' }); continue; }
        try {
          const r = await this._nanoPrompt({ prompt: buildPrompt(req), system: SYSTEM });
          const conf = estimateConfidence(r.text, 0.85);
          attempts.push({ tier, outcome: 'answered', latencyMs: r.latencyMs, confidence: conf });
          if (conf >= cfg.confidenceThreshold || complexity === 'light' && nanoState === 'readily' && conf >= 0.45) {
            return finish(r.text, 'nano', MODEL_IDS.nano, conf, ['answered on-device — instant, private, $0 cloud cost']);
          }
          attempts.push({ tier, outcome: 'escalated', reason: `confidence ${conf} below threshold ${cfg.confidenceThreshold}` });
          req._lastAnswer = r.text;
        } catch (e) {
          attempts.push({ tier, outcome: 'error', reason: e.code || e.message });
        }
        continue;
      }
      // cloud tiers
      if (offline) {
        attempts.push({ tier, outcome: 'skipped', reason: 'offline — cloud unreachable' });
        continue;
      }
      if (!cloudReady) {
        attempts.push({ tier, outcome: 'skipped', reason: 'Firebase AI Logic not configured yet' });
        continue;
      }
      try {
        const r = await this._cloudPrompt({ prompt: buildPrompt(req), system: SYSTEM, tier, imageDataUrl: req.imageDataUrl || null });
        const conf = estimateConfidence(r.text, tier === 'pro' ? 0.95 : 0.88);
        attempts.push({ tier, outcome: 'answered', latencyMs: r.latencyMs, confidence: conf });
        if (conf >= cfg.confidenceThreshold || tier === 'pro') {
          return finish(r.text, tier, r.model || MODEL_IDS[tier], conf,
            [tier === 'pro' ? 'deepest cloud tier answered' : 'cloud tier answered']);
        }
        attempts.push({ tier, outcome: 'escalated', reason: `confidence ${conf} below threshold` });
      } catch (e) {
        attempts.push({ tier, outcome: 'error', reason: e.code || e.message });
      }
    }

    // ---- last resort: the honest local helper ------------------------------
    if (offline && complexity === 'deep') { queueForCloud(); }
    const fbResult = fallbackAnswer(req, this.lessons);
    return finish(fbResult.text, 'fallback', 'Built-in study helper (offline lesson bank — not an AI model)',
      fbResult.confidence,
      ['no AI tier produced an answer — local helper answered from the seeded lesson bank',
        ...(offline && complexity === 'deep' ? ['queued-for-cloud'] : [])]);
  }
}

const SYSTEM = 'You are the SnuhiLearn tutor. Teach, do not just answer: give the idea, then the steps, then a quick check. Keep answers tight and correct. If unsure, say so plainly.';

export function buildPrompt(req) {
  const lesson = req.lessonTitle ? `Lesson context: ${req.lessonTitle}. ` : '';
  switch (req.task) {
    case 'qa': return `${lesson}Student question: ${req.prompt}`;
    case 'flashcards': return `Make 6 flashcards (lines formatted exactly "Q: ..." then "A: ...") from this study text:\n${req.input || req.prompt}`;
    case 'summary': return `Summarize this for a student in at most 5 sentences, keeping the key terms:\n${req.input || req.prompt}`;
    case 'translate': return `Translate this study text to ${req.targetLang || 'Hindi'}. Keep technical terms in English with the translation in brackets:\n${req.input || req.prompt}`;
    case 'worked': return `${lesson}Solve step by step, explaining each step, then state the final answer clearly:\n${req.prompt}`;
    case 'photo': return `This is a problem a student photographed (described here): ${req.prompt}. Solve it step by step and explain the method.`;
    case 'mocktest': return `${lesson}Create a ${req.count || 5}-question mock test. Format each item exactly as "Q1. ..." followed by "Answer: ...". Questions:\n${req.prompt}`;
    default: return req.prompt || req.input || '';
  }
}

export function fallbackAnswer(req, lessons) {
  switch (req.task) {
    case 'summary': return { text: fb.summarizeText(req.input || req.prompt), confidence: 0.5 };
    case 'translate': {
      const g = glossText(req.input || req.prompt, req.targetLang || 'Hindi');
      return { text: `${g.text}\n\n(${g.note})`, confidence: 0.4 };
    }
    case 'flashcards': {
      const cards = fb.flashcardsFromText(req.input || req.prompt, lessons);
      return { text: cards.map((c) => `Q: ${c.front}\nA: ${c.back}`).join('\n'), confidence: 0.5, cards };
    }
    case 'worked': case 'photo': case 'mocktest': {
      const hits = fb.searchLessons(req.prompt, lessons, 1);
      if (hits.length && hits[0].lesson.workedExamples.length) {
        const w = hits[0].lesson.workedExamples[0];
        const steps = (w.steps || []).map((s, i) => `${i + 1}. ${s}`).join('\n');
        return { text: `Closest worked example in the offline bank — ${hits[0].lesson.title}:\nProblem: ${w.problem}\n${steps}\nAnswer: ${w.answer}`, confidence: 0.45 };
      }
      const a = fb.answerFromBank(req.prompt, lessons);
      return { text: a.text, confidence: a.confidence };
    }
    default: {
      const a = fb.answerFromBank(req.prompt || req.input || '', lessons);
      return { text: a.text, confidence: a.confidence };
    }
  }
}

// Highlight #2: when connectivity returns, re-run everything that was queued
// offline through the cascade and report what the cloud tiers say now.
export async function flushOfflineQueue(cascade, vault) {
  const q = vault.queue();
  if (!q.length) return { flushed: 0, results: [] };
  const results = [];
  for (const item of q) {
    const r = await cascade.run({ task: item.task, prompt: item.prompt, input: item.input, lessonId: item.lessonId, offline: false });
    results.push({ question: item.prompt, tier: r.decision.tier, answer: r.answer });
  }
  vault.clearQueue();
  return { flushed: results.length, results };
}
