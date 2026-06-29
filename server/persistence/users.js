const { getAdmin, getFirestore } = require("../firebaseAdmin");
const { DEFAULT_STATS, normalizeStats } = require("../ranking/elo");
const { sanitizeDisplayName } = require("../utils/sanitize");
const { asNonEmptyString } = require("./value");

function makeDefaultDisplayName({ uid, email, name, isAnonymous }) {
  const cleanName = asNonEmptyString(name);
  if (cleanName) return cleanName;

  const short =
    typeof uid === "string" ? uid.slice(0, 5).toUpperCase() : "?????";
  return isAnonymous ? `Guest-${short}` : `Player-${short}`;
}

async function setUserDisplayName(uid, displayName) {
  if (!uid || typeof uid !== "string") throw new Error("Missing uid.");
  const sanitized = sanitizeDisplayName(displayName);
  if (!sanitized) throw new Error("Invalid display name.");

  const db = getFirestore();
  const admin = getAdmin();
  const now = admin.firestore.FieldValue.serverTimestamp();

  const userRef = db.collection("users").doc(uid);
  const publicRef = db.collection("publicUsers").doc(uid);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);

    if (!snap.exists) {
      tx.set(
        userRef,
        {
          createdAt: now,
          displayName: sanitized,
          stats: { ...DEFAULT_STATS },
        },
        { merge: true },
      );
    }

    const existing = snap.exists ? snap.data() : null;
    const stats = normalizeStats(existing && existing.stats);

    tx.set(
      userRef,
      {
        updatedAt: now,
        displayName: sanitized,
      },
      { merge: true },
    );

    tx.set(
      publicRef,
      {
        updatedAt: now,
        displayName: sanitized,
        leaderboardEligible: true,
        stats,
      },
      { merge: true },
    );
  });

  return sanitized;
}

async function upsertUserFromDecoded(decoded) {
  if (!decoded || typeof decoded.uid !== "string" || !decoded.uid) return;

  const uid = decoded.uid;
  const provider =
    (decoded.firebase && decoded.firebase.sign_in_provider) || null;
  const isAnonymous = provider === "anonymous";

  const email = decoded.email || null;
  const name = decoded.name || null;

  const db = getFirestore();
  const admin = getAdmin();
  const now = admin.firestore.FieldValue.serverTimestamp();

  const userRef = db.collection("users").doc(uid);
  const publicRef = db.collection("publicUsers").doc(uid);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);

    const existing = snap.exists ? snap.data() : null;
    const stats = normalizeStats(existing && existing.stats);

    const existingDisplayName = asNonEmptyString(
      existing && existing.displayName,
    );
    const defaultName = makeDefaultDisplayName({
      uid,
      email,
      name,
      isAnonymous,
    });

    const displayName = existingDisplayName || defaultName;

    if (!snap.exists) {
      tx.set(
        userRef,
        {
          createdAt: now,
          displayName,
          stats: { ...DEFAULT_STATS },
        },
        { merge: true },
      );
    }

    const userUpdate = {
      updatedAt: now,
      lastSeenAt: now,
      provider,
      isAnonymous,
      email,
      name,
    };

    // Only fill in a displayName if it was missing.
    if (!existingDisplayName && displayName)
      userUpdate.displayName = displayName;

    tx.set(userRef, userUpdate, { merge: true });

    tx.set(
      publicRef,
      {
        updatedAt: now,
        lastSeenAt: now,
        displayName,
        leaderboardEligible: true,
        stats,
      },
      { merge: true },
    );
  });
}

async function getMe(uid) {
  if (!uid || typeof uid !== "string") return null;
  const db = getFirestore();
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  return {
    uid,
    displayName:
      asNonEmptyString(data.displayName) || `Player-${uid.slice(0, 5)}`,
    provider: asNonEmptyString(data.provider) || null,
    isAnonymous: !!data.isAnonymous,
    email: asNonEmptyString(data.email) || null,
    stats: normalizeStats(data.stats),
  };
}

module.exports = {
  makeDefaultDisplayName,
  setUserDisplayName,
  upsertUserFromDecoded,
  getMe,
};
