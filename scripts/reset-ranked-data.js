#!/usr/bin/env node

const { getAdmin, getFirestore } = require("../server/firebaseAdmin");

const DEFAULT_STATS = Object.freeze({
  elo: 1000,
  matchTotal: 0,
  wins: 0,
});

const PAGE_SIZE = 400;

function hasConfirmFlag() {
  return process.argv.includes("--yes") || process.argv.includes("-y");
}

function usageAndExit() {
  console.log("This operation is destructive.");
  console.log("It will:");
  console.log("- Reset users/*/stats to { elo: 1000, matchTotal: 0, wins: 0 }");
  console.log(
    "- Reset publicUsers/*/stats to { elo: 1000, matchTotal: 0, wins: 0 }",
  );
  console.log("- Delete all users/*/matchHistory/* docs");
  console.log("- Delete all matches/* docs");
  console.log("");
  console.log("Run with: node scripts/reset-ranked-data.js --yes");
  process.exit(1);
}

async function resetStatsCollection(db, admin, collectionName) {
  const docId = admin.firestore.FieldPath.documentId();
  const FieldValue = admin.firestore.FieldValue;

  let total = 0;
  let lastDoc = null;

  while (true) {
    let q = db.collection(collectionName).orderBy(docId).limit(PAGE_SIZE);
    if (lastDoc) q = q.startAfter(lastDoc);

    const snap = await q.get();
    if (snap.empty) break;

    const batch = db.batch();
    for (const doc of snap.docs) {
      batch.set(
        doc.ref,
        {
          stats: { ...DEFAULT_STATS },
          updatedAt: FieldValue.serverTimestamp(),
          lastMatchAt: FieldValue.delete(),
          leaderboardEligible: true,
        },
        { merge: true },
      );
      total++;
    }

    await batch.commit();
    lastDoc = snap.docs[snap.docs.length - 1];
  }

  return total;
}

async function deleteRootCollection(db, admin, collectionName) {
  const docId = admin.firestore.FieldPath.documentId();

  let total = 0;
  let lastDoc = null;

  while (true) {
    let q = db.collection(collectionName).orderBy(docId).limit(PAGE_SIZE);
    if (lastDoc) q = q.startAfter(lastDoc);

    const snap = await q.get();
    if (snap.empty) break;

    const batch = db.batch();
    for (const doc of snap.docs) {
      batch.delete(doc.ref);
      total++;
    }

    await batch.commit();
    lastDoc = snap.docs[snap.docs.length - 1];
  }

  return total;
}

async function deleteCollectionGroup(db, admin, groupName) {
  const docId = admin.firestore.FieldPath.documentId();

  let total = 0;
  let lastDoc = null;

  while (true) {
    let q = db.collectionGroup(groupName).orderBy(docId).limit(PAGE_SIZE);
    if (lastDoc) q = q.startAfter(lastDoc);

    const snap = await q.get();
    if (snap.empty) break;

    const batch = db.batch();
    for (const doc of snap.docs) {
      batch.delete(doc.ref);
      total++;
    }

    await batch.commit();
    lastDoc = snap.docs[snap.docs.length - 1];
  }

  return total;
}

async function main() {
  if (!hasConfirmFlag()) usageAndExit();

  const admin = getAdmin();
  const db = getFirestore();

  console.log("Resetting ranked data...");

  const usersUpdated = await resetStatsCollection(db, admin, "users");
  console.log(`Updated users stats: ${usersUpdated}`);

  const publicUsersUpdated = await resetStatsCollection(
    db,
    admin,
    "publicUsers",
  );
  console.log(`Updated publicUsers stats: ${publicUsersUpdated}`);

  const historyDeleted = await deleteCollectionGroup(db, admin, "matchHistory");
  console.log(`Deleted matchHistory docs: ${historyDeleted}`);

  const matchesDeleted = await deleteRootCollection(db, admin, "matches");
  console.log(`Deleted match docs: ${matchesDeleted}`);

  console.log("Done.");
}

main().catch((err) => {
  console.error("Reset failed:", err && err.message ? err.message : err);
  process.exit(1);
});
