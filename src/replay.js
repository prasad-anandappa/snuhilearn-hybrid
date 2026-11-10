// Routing replay (highlight #15): re-run a stored session's questions
// through a fresh cascade under forced connectivity and show how the routing
// decisions change — the fastest way for a judge to *see* hybrid behaviour
// instead of reading about it.

export async function replaySession(entries, makeCascade) {
  const out = [];
  for (const e of entries) {
    const onlineRun = await (await makeCascade({ offline: false }))
      .run({ task: e.task, prompt: e.question, offline: false });
    const offlineRun = await (await makeCascade({ offline: true }))
      .run({ task: e.task, prompt: e.question, offline: true });
    out.push({
      question: e.question,
      task: e.task,
      recordedTier: e.tier,
      onlineTier: onlineRun.decision.tier,
      offlineTier: offlineRun.decision.tier,
      changedWithConnectivity: onlineRun.decision.tier !== offlineRun.decision.tier,
    });
  }
  return out;
}
