// Copy this file to `firebase-config.js` (same folder) after creating the
// Firebase project — a Prasad-only console step:
//   1. console.firebase.google.com -> Add project (any name, e.g. snuhilearn-hybrid)
//   2. Build -> AI Logic -> Get started (enables the Gemini API via Firebase)
//   3. Project settings -> Your apps -> Web app -> register "SnuhiLearn Hybrid"
//   4. Paste the firebaseConfig values below.
// The web apiKey identifies the project; it is not a server secret. Real
// protection comes from Firebase App Check + Firestore rules, noted in the
// README. Until this file exists, the cloud tier stays visibly unconfigured
// and the app runs on-device / on the built-in lesson bank — by design.
window.__HYBRID_CONFIG__ = {
  firebase: {
    apiKey: 'PASTE_API_KEY',
    authDomain: 'PASTE_PROJECT.firebaseapp.com',
    projectId: 'PASTE_PROJECT_ID',
    appId: 'PASTE_APP_ID',
  },
};
