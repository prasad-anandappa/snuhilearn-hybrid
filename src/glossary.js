// Multilingual bridge — offline floor (highlight #10).
// A small built-in study glossary. When no AI tier is available, known terms
// are glossed in-line; the result is honestly partial and says so. With Nano
// or cloud available, full translation happens in the cascade instead.

export const GLOSSARY = {
  algorithm: { hi: 'एल्गोरिदम', kn: 'ಅಲ್ಗಾರಿದಮ್', es: 'algoritmo' },
  database: { hi: 'डेटाबेस', kn: 'ಡೇಟಾಬೇಸ್', es: 'base de datos' },
  encryption: { hi: 'एन्क्रिप्शन', kn: 'ಎನ್‌ಕ್ರಿಪ್ಶನ್', es: 'cifrado' },
  function: { hi: 'फ़ंक्शन', kn: 'ಫಂಕ್ಷನ್', es: 'función' },
  variable: { hi: 'वेरिएबल', kn: 'ವೇರಿಯೇಬಲ್', es: 'variable' },
  network: { hi: 'नेटवर्क', kn: 'ನೆಟ್‌ವರ್ಕ್', es: 'red' },
  server: { hi: 'सर्वर', kn: 'ಸರ್ವರ್', es: 'servidor' },
  protocol: { hi: 'प्रोटोकॉल', kn: 'ಪ್ರೋಟೋಕಾಲ್', es: 'protocolo' },
  memory: { hi: 'मेमोरी', kn: 'ಮೆಮೊರಿ', es: 'memoria' },
  process: { hi: 'प्रोसेस', kn: 'ಪ್ರಕ್ರಿಯೆ', es: 'proceso' },
  thread: { hi: 'थ्रेड', kn: 'ಥ್ರೆಡ್', es: 'hilo' },
  class: { hi: 'क्लास', kn: 'ಕ್ಲಾಸ್', es: 'clase' },
  object: { hi: 'ऑब्जेक्ट', kn: 'ಆಬ್ಜೆಕ್ಟ್', es: 'objeto' },
  inheritance: { hi: 'इनहेरिटेंस', kn: 'ಇನ್ಹೆರಿಟೆನ್ಸ್', es: 'herencia' },
  query: { hi: 'क्वेरी', kn: 'ಕ್ವೆರಿ', es: 'consulta' },
  index: { hi: 'इंडेक्स', kn: 'ಇಂಡೆಕ್ಸ್', es: 'índice' },
  compiler: { hi: 'कंपाइलर', kn: 'ಕಂಪೈಲರ್', es: 'compilador' },
  grammar: { hi: 'व्याकरण', kn: 'ವ್ಯಾಕರಣ', es: 'gramática' },
  key: { hi: 'कुंजी', kn: 'ಕೀ', es: 'clave' },
  security: { hi: 'सुरक्षा', kn: 'ಭದ್ರತೆ', es: 'seguridad' },
};

export const LANG_CODES = { Hindi: 'hi', Kannada: 'kn', Spanish: 'es' };

export function glossText(text, targetLang) {
  const code = LANG_CODES[targetLang];
  if (!code) return { text, glossed: 0, note: `No offline glossary for ${targetLang}` };
  let glossed = 0;
  const out = String(text).replace(/\b([A-Za-z]{3,})\b/g, (word) => {
    const entry = GLOSSARY[word.toLowerCase()];
    if (entry && entry[code]) { glossed += 1; return `${word} (${entry[code]})`; }
    return word;
  });
  return { text: out, glossed, note: 'Offline glossary — partial. Full translation needs Gemini Nano or the cloud tier.' };
}
