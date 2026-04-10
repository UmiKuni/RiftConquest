const { getAdmin, getFirestore } = require("../firebaseAdmin");
const { sanitizeDisplayName } = require("../utils/sanitize");

const DEFAULT_ELO = 1000;
const K_FACTOR_NEW_PLAYER = 60;
const K_FACTOR_MID_PLAYER = 40;
const K_FACTOR_VETERAN = 20;
const DEFAULT_STATS = Object.freeze({
  elo: DEFAULT_ELO,
  matchTotal: 0,
  wins: 0,
});

function asNonEmptyString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeStats(stats) {
  const elo = asNumber(stats && stats.elo, DEFAULT_ELO);
  const matchTotal = Math.max(
    0,
    Math.floor(asNumber(stats && stats.matchTotal, 0)),
  );
  const wins = Math.max(0, Math.floor(asNumber(stats && stats.wins, 0)));
  return { elo, matchTotal, wins };
}

function makeDefaultDisplayName({ uid, email, name, isAnonymous }) {
  const cleanName = asNonEmptyString(name);
  if (cleanName) return cleanName;

  const short =
    typeof uid === "string" ? uid.slice(0, 5).toUpperCase() : "?????";
  return isAnonymous ? `Guest-${short}` : `Player-${short}`;
}

function expectedScore(rA, rB) {
  return 1 / (1 + Math.pow(10, (rB - rA) / 400));
}

function kFactor(matchTotal) {
  // Three-tier progression by experience:
  // new: <30 matches, mid: 30-100 matches, veteran: >100 matches.
  if (matchTotal < 30) return K_FACTOR_NEW_PLAYER;
  if (matchTotal <= 100) return K_FACTOR_MID_PLAYER;
  return K_FACTOR_VETERAN;
}

function clampRating(r) {
  return Math.max(0, Math.round(r));
}

function encodeCursor(cursorObj) {
  const json = JSON.stringify(cursorObj);
  return Buffer.from(json, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeCursor(cursorStr) {
  if (!cursorStr || typeof cursorStr !== "string") return null;

  const normalized = cursorStr.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLen);

  try {
    const json = Buffer.from(padded, "base64").toString("utf8");
    const obj = JSON.parse(json);
    if (!obj || typeof obj !== "object") return null;

    const uid = asNonEmptyString(obj.uid);
    if (!uid) return null;

    // Support legacy cursors that included { uid, elo }.
    return { uid };
  } catch {
    return null;
  }
}

function decodeMatchHistoryCursor(cursorStr) {
  if (!cursorStr || typeof cursorStr !== "string") return null;

  const normalized = cursorStr.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLen);

  try {
    const json = Buffer.from(padded, "base64").toString("utf8");
    const obj = JSON.parse(json);
    if (!obj || typeof obj !== "object") return null;

    const matchId = asNonEmptyString(obj.matchId);
    if (!matchId) return null;

    return { matchId };
  } catch {
    return null;
  }
}

function toMillis(value) {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toDate === "function") {
    const d = value.toDate();
    return d instanceof Date ? d.getTime() : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
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

async function recordMatch({
  roomCode,
  playerUids,
  winnerIndex,
  scores,
  surrendered,
  startedAtMs,
  endedAtMs,
}) {
  if (!Array.isArray(playerUids) || playerUids.length !== 2) {
    throw new Error("recordMatch: playerUids must be [uid0, uid1]");
  }
  const uid0 = asNonEmptyString(playerUids[0]);
  const uid1 = asNonEmptyString(playerUids[1]);
  if (!uid0 || !uid1) throw new Error("recordMatch: missing player uid");

  const wIdx = winnerIndex === 1 ? 1 : 0;
  const lIdx = 1 - wIdx;

  const db = getFirestore();
  const admin = getAdmin();
  const now = admin.firestore.FieldValue.serverTimestamp();

  const usersCol = db.collection("users");
  const publicCol = db.collection("publicUsers");
  const matchesCol = db.collection("matches");

  const matchRef = matchesCol.doc();

  const userRefs = [usersCol.doc(uid0), usersCol.doc(uid1)];
  const pubRefs = [publicCol.doc(uid0), publicCol.doc(uid1)];
  const histRefs = [
    userRefs[0].collection("matchHistory").doc(matchRef.id),
    userRefs[1].collection("matchHistory").doc(matchRef.id),
  ];

  const startedAt = new Date(asNumber(startedAtMs, Date.now()));
  const endedAt = new Date(asNumber(endedAtMs, Date.now()));

  const endReason = surrendered ? "surrender" : "vp12";

  const result = await db.runTransaction(async (tx) => {
    const [u0Snap, u1Snap] = await Promise.all([
      tx.get(userRefs[0]),
      tx.get(userRefs[1]),
    ]);

    const u0 = u0Snap.exists ? u0Snap.data() : {};
    const u1 = u1Snap.exists ? u1Snap.data() : {};

    const stats0 = normalizeStats(u0.stats);
    const stats1 = normalizeStats(u1.stats);

    const provider0 = asNonEmptyString(u0.provider) || null;
    const provider1 = asNonEmptyString(u1.provider) || null;

    const isAnon0 = u0Snap.exists
      ? !!u0.isAnonymous || provider0 === "anonymous"
      : true;
    const isAnon1 = u1Snap.exists
      ? !!u1.isAnonymous || provider1 === "anonymous"
      : true;

    const name0 =
      asNonEmptyString(u0.displayName) ||
      makeDefaultDisplayName({
        uid: uid0,
        email: u0.email,
        name: u0.name,
        isAnonymous: isAnon0,
      });

    const name1 =
      asNonEmptyString(u1.displayName) ||
      makeDefaultDisplayName({
        uid: uid1,
        email: u1.email,
        name: u1.name,
        isAnonymous: isAnon1,
      });

    const r0 = stats0.elo;
    const r1 = stats1.elo;

    const score0 = wIdx === 0 ? 1 : 0;
    const score1 = 1 - score0;

    const exp0 = expectedScore(r0, r1);
    const exp1 = 1 - exp0;

    const k0 = kFactor(stats0.matchTotal);
    const k1 = kFactor(stats1.matchTotal);

    const delta0 = Math.round(k0 * (score0 - exp0));
    const delta1 = Math.round(k1 * (score1 - exp1));

    const newR0 = clampRating(r0 + delta0);
    const newR1 = clampRating(r1 + delta1);

    const nextStats0 = {
      elo: newR0,
      matchTotal: stats0.matchTotal + 1,
      wins: stats0.wins + (wIdx === 0 ? 1 : 0),
    };

    const nextStats1 = {
      elo: newR1,
      matchTotal: stats1.matchTotal + 1,
      wins: stats1.wins + (wIdx === 1 ? 1 : 0),
    };

    // Ensure docs exist (first-ever match on this UID).
    if (!u0Snap.exists) {
      tx.set(
        userRefs[0],
        {
          createdAt: now,
          displayName: name0,
          stats: { ...DEFAULT_STATS },
          provider: provider0,
          isAnonymous: isAnon0,
        },
        { merge: true },
      );
    }
    if (!u1Snap.exists) {
      tx.set(
        userRefs[1],
        {
          createdAt: now,
          displayName: name1,
          stats: { ...DEFAULT_STATS },
          provider: provider1,
          isAnonymous: isAnon1,
        },
        { merge: true },
      );
    }

    tx.set(
      userRefs[0],
      { updatedAt: now, lastMatchAt: endedAt, stats: nextStats0 },
      { merge: true },
    );
    tx.set(
      userRefs[1],
      { updatedAt: now, lastMatchAt: endedAt, stats: nextStats1 },
      { merge: true },
    );

    tx.set(
      pubRefs[0],
      {
        updatedAt: now,
        lastMatchAt: endedAt,
        displayName: name0,
        leaderboardEligible: true,
        stats: nextStats0,
      },
      { merge: true },
    );

    tx.set(
      pubRefs[1],
      {
        updatedAt: now,
        lastMatchAt: endedAt,
        displayName: name1,
        leaderboardEligible: true,
        stats: nextStats1,
      },
      { merge: true },
    );

    const scoreArr =
      Array.isArray(scores) && scores.length === 2 ? scores : null;

    const matchPlayers = [
      {
        uid: uid0,
        displayName: name0,
        provider: provider0,
        isAnonymous: isAnon0,
        eloBefore: r0,
        eloAfter: newR0,
        delta: newR0 - r0,
        result: wIdx === 0 ? "win" : "loss",
      },
      {
        uid: uid1,
        displayName: name1,
        provider: provider1,
        isAnonymous: isAnon1,
        eloBefore: r1,
        eloAfter: newR1,
        delta: newR1 - r1,
        result: wIdx === 1 ? "win" : "loss",
      },
    ];

    tx.set(matchRef, {
      createdAt: now,
      updatedAt: now,
      roomCode: asNonEmptyString(roomCode),
      startedAt,
      endedAt,
      endReason,
      surrendered: !!surrendered,
      winnerIndex: wIdx,
      winnerUid: matchPlayers[wIdx].uid,
      loserUid: matchPlayers[lIdx].uid,
      scores: scoreArr,
      players: matchPlayers,
    });

    // Minimal per-user history.
    tx.set(histRefs[0], {
      createdAt: now,
      matchId: matchRef.id,
      endedAt,
      opponentUid: uid1,
      opponentName: name1,
      result: wIdx === 0 ? "win" : "loss",
      eloBefore: r0,
      eloAfter: newR0,
      delta: newR0 - r0,
      scores: scoreArr,
      endReason,
      surrendered: !!surrendered,
      roomCode: asNonEmptyString(roomCode),
    });

    tx.set(histRefs[1], {
      createdAt: now,
      matchId: matchRef.id,
      endedAt,
      opponentUid: uid0,
      opponentName: name0,
      result: wIdx === 1 ? "win" : "loss",
      eloBefore: r1,
      eloAfter: newR1,
      delta: newR1 - r1,
      scores: scoreArr,
      endReason,
      surrendered: !!surrendered,
      roomCode: asNonEmptyString(roomCode),
    });

    return {
      matchId: matchRef.id,
      players: [
        {
          displayName: name0,
          eloBefore: r0,
          eloAfter: newR0,
          matchTotal: nextStats0.matchTotal,
          wins: nextStats0.wins,
        },
        {
          displayName: name1,
          eloBefore: r1,
          eloAfter: newR1,
          matchTotal: nextStats1.matchTotal,
          wins: nextStats1.wins,
        },
      ],
    };
  });

  return result;
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

async function getMatchHistory(uid, { limit = 10, cursor = null } = {}) {
  if (!uid || typeof uid !== "string") return { items: [], nextCursor: null };

  const size = Math.max(1, Math.min(50, Math.floor(asNumber(limit, 10))));
  const decodedCursor = decodeMatchHistoryCursor(cursor);

  const db = getFirestore();
  const col = db.collection("users").doc(uid).collection("matchHistory");

  let startAfterSnap = null;
  if (decodedCursor && decodedCursor.matchId) {
    const snap = await col.doc(decodedCursor.matchId).get();
    if (snap.exists) startAfterSnap = snap;
  }

  let q = col.orderBy("endedAt", "desc");
  if (startAfterSnap) q = q.startAfter(startAfterSnap);

  // Fetch 1 extra doc so we can tell if there's another page.
  const snap = await q.limit(size + 1).get();
  const docs = snap.docs || [];

  const pageDocs = docs.slice(0, size);
  const hasMore = docs.length > size;
  const nextCursor =
    hasMore && pageDocs.length
      ? encodeCursor({ matchId: pageDocs[pageDocs.length - 1].id })
      : null;

  const items = pageDocs.map((doc) => {
    const data = doc.data() || {};
    const endedAtMs = toMillis(data.endedAt);

    const scores =
      Array.isArray(data.scores) && data.scores.length === 2
        ? [asNumber(data.scores[0], 0), asNumber(data.scores[1], 0)]
        : null;

    return {
      matchId: asNonEmptyString(data.matchId) || doc.id,
      endedAtMs,
      opponentUid: asNonEmptyString(data.opponentUid) || null,
      opponentName: asNonEmptyString(data.opponentName) || null,
      result: asNonEmptyString(data.result) || null,
      eloBefore: asNumber(data.eloBefore, null),
      eloAfter: asNumber(data.eloAfter, null),
      delta: asNumber(data.delta, null),
      scores,
      endReason: asNonEmptyString(data.endReason) || null,
      surrendered: !!data.surrendered,
      roomCode: asNonEmptyString(data.roomCode) || null,
    };
  });

  return { items, nextCursor };
}

async function getLeaderboardPage({ pageSize = 10, cursor = null } = {}) {
  const size = Math.max(1, Math.min(50, Math.floor(asNumber(pageSize, 10))));
  const decodedCursor = decodeCursor(cursor);

  const db = getFirestore();

  let startAfterSnap = null;
  if (decodedCursor && decodedCursor.uid) {
    const snap = await db
      .collection("publicUsers")
      .doc(decodedCursor.uid)
      .get();
    if (snap.exists) startAfterSnap = snap;
  }

  // orderBy("stats.elo", "desc") works without a composite index.
  // Once the composite index in firestore.indexes.json is deployed via
  // `firebase deploy --only firestore:indexes`, you can add:
  //   .where("leaderboardEligible", "==", true)
  // before .orderBy(...) to pre-filter on the Firestore side.
  const FETCH_LIMIT = size + 50;

  let q = db
    .collection("publicUsers")
    .orderBy("stats.elo", "desc")
    .limit(FETCH_LIMIT);

  if (startAfterSnap) q = q.startAfter(startAfterSnap);

  const snap = await q.get();
  const docs = snap.docs || [];

  const out = [];
  let lastIncludedDoc = null;
  let hasMore = false;

  for (const doc of docs) {
    const data = doc.data() || {};
    const stats = normalizeStats(data.stats);
    const isAnonymous =
      data.isAnonymous === true || data.provider === "anonymous";

    if (isAnonymous || stats.matchTotal < 1) continue;

    if (out.length < size) {
      const displayName =
        asNonEmptyString(data.displayName) || `Player-${doc.id.slice(0, 5)}`;
      const winRate = stats.matchTotal > 0 ? stats.wins / stats.matchTotal : 0;
      out.push({
        displayName,
        elo: stats.elo,
        matchTotal: stats.matchTotal,
        wins: stats.wins,
        winRate,
      });
      lastIncludedDoc = doc;
    } else {
      // Found a valid entry beyond the requested page — more results exist.
      hasMore = true;
      break;
    }
  }

  const nextCursor =
    hasMore && lastIncludedDoc
      ? encodeCursor({ uid: lastIncludedDoc.id })
      : null;

  return { items: out, nextCursor };
}

module.exports = {
  upsertUserFromDecoded,
  setUserDisplayName,
  recordMatch,
  getMe,
  getMatchHistory,
  getLeaderboardPage,
  decodeCursor,
};
