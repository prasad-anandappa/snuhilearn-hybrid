// Voice study mode (highlight #11): speech in (Web Speech recognition),
// spoken summaries out (speech synthesis). Both are progressive enhancement —
// feature-detected, and the study flow works identically without them.

export function voiceSupport(root = globalThis) {
  return {
    speak: Boolean(root && root.speechSynthesis && typeof root.SpeechSynthesisUtterance !== 'undefined'),
    listen: Boolean(root && (root.SpeechRecognition || root.webkitSpeechRecognition)),
  };
}

// Keep spoken summaries short: first 2 sentences, hard cap.
export function speakableSummary(text = '') {
  const sentences = String(text).match(/[^.!?]+[.!?]+/g) || [String(text)];
  return sentences.slice(0, 2).map((s) => s.trim()).join(' ').trim().slice(0, 320);
}

export function speak(text, root = globalThis) {
  if (!voiceSupport(root).speak) return { spoken: false, reason: 'speech synthesis unavailable' };
  const u = new root.SpeechSynthesisUtterance(speakableSummary(text));
  u.rate = 1.0;
  root.speechSynthesis.speak(u);
  return { spoken: true, reason: 'ok' };
}
