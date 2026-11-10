// Cost & latency meters (highlights #5 and #6).
//
// Every completed answer is recorded once. On-device and fallback answers
// count an ESTIMATED cloud cost saved: what the same request would have cost
// on the cheapest cloud tier (Flash list-price estimate, config.js). Cloud
// answers record estimated spend. All figures are estimates by construction
// and the UI labels them "est."

import { PRICE_PER_MTOK, estimateTokens } from './config.js';

export class Meter {
  constructor() { this.reset(); }

  reset() {
    this.byTier = {}; // tier -> { count, totalLatencyMs, estCostUsd }
    this.cloudCallsAvoided = 0;
    this.estSavedUsd = 0;
    this.estSpentUsd = 0;
  }

  record({ tier, latencyMs = 0, promptText = '', answerText = '' }) {
    const t = (this.byTier[tier] ||= { count: 0, totalLatencyMs: 0, estCostUsd: 0 });
    t.count += 1;
    t.totalLatencyMs += latencyMs;
    const tokens = estimateTokens(promptText) + estimateTokens(answerText);
    if (tier === 'flash' || tier === 'pro') {
      const cost = (tokens / 1_000_000) * PRICE_PER_MTOK[tier];
      t.estCostUsd += cost;
      this.estSpentUsd += cost;
    } else {
      // What this answer would have cost on Flash — the honest counterfactual.
      const saved = (tokens / 1_000_000) * PRICE_PER_MTOK.flash;
      t.estCostUsd += 0;
      this.cloudCallsAvoided += 1;
      this.estSavedUsd += saved;
    }
    return this.snapshot();
  }

  avgLatency(tier) {
    const t = this.byTier[tier];
    return t && t.count ? Math.round(t.totalLatencyMs / t.count) : null;
  }

  snapshot() {
    return {
      byTier: JSON.parse(JSON.stringify(this.byTier)),
      cloudCallsAvoided: this.cloudCallsAvoided,
      estSavedUsd: Number(this.estSavedUsd.toFixed(6)),
      estSpentUsd: Number(this.estSpentUsd.toFixed(6)),
      avgLatencyMs: {
        onDevice: this.avgLatency('nano'),
        cloud: (() => {
          const f = this.byTier.flash, p = this.byTier.pro;
          const n = (f?.count || 0) + (p?.count || 0);
          if (!n) return null;
          return Math.round(((f?.totalLatencyMs || 0) + (p?.totalLatencyMs || 0)) / n);
        })(),
      },
    };
  }
}
