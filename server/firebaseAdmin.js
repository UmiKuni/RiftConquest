const fs = require("fs");
const path = require("path");

let admin = null;
let initAttempted = false;
let initError = null;

function resolveMaybeRelative(p) {
  if (!p) return null;
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

function tryFindLocalServiceAccountPath() {
  const localDir = path.join(process.cwd(), ".local");
  if (!fs.existsSync(localDir)) return null;

  const files = fs.readdirSync(localDir);
  const match = files.find(
    (f) =>
      f.toLowerCase().includes("firebase-adminsdk") &&
      f.toLowerCase().endsWith(".json"),
  );
  if (!match) return null;
  return path.join(localDir, match);
}

function initFirebaseAdmin() {
  if (initAttempted) return { admin, error: initError };
  initAttempted = true;

  try {
    // Lazy require so the server still boots if firebase-admin isn't installed yet.
    // (But verifyIdToken will fail until it is installed.)
    // eslint-disable-next-line global-require
    admin = require("firebase-admin");

    if (admin.apps && admin.apps.length) return { admin, error: null };

    const explicitPath =
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS;

    const serviceAccountPath =
      resolveMaybeRelative(explicitPath) || tryFindLocalServiceAccountPath();

    if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
      const raw = fs.readFileSync(serviceAccountPath, "utf8");
      const serviceAccount = JSON.parse(raw);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      return { admin, error: null };
    }

    // Final fallback: allow application default credentials if configured elsewhere.
    // This will typically work in GCP environments.
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
    return { admin, error: null };
  } catch (err) {
    initError = err;
    console.warn("[firebase-admin] init failed:", err && err.message);
    return { admin: null, error: err };
  }
}

function getAdmin() {
  const { admin: a, error } = initFirebaseAdmin();
  if (!a) throw error || new Error("Firebase Admin SDK is not initialized.");
  return a;
}

function getFirestore() {
  const a = getAdmin();
  return a.firestore();
}

async function verifyIdToken(idToken) {
  const { admin: a, error } = initFirebaseAdmin();
  if (!a) throw error || new Error("Firebase Admin SDK is not initialized.");
  if (!idToken || typeof idToken !== "string") {
    throw new Error("Missing idToken");
  }
  return a.auth().verifyIdToken(idToken);
}

module.exports = {
  initFirebaseAdmin,
  getAdmin,
  getFirestore,
  verifyIdToken,
};
