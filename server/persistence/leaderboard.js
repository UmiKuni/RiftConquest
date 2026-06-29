const { getFirestore } = require("../firebaseAdmin");
const { normalizeStats } = require("../ranking/elo");
const { decodeCursor, encodeCursor } = require("./cursors");
const { asNonEmptyString, asNumber } = require("./value");

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
      // Found a valid entry beyond the requested page - more results exist.
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
  getLeaderboardPage,
};
