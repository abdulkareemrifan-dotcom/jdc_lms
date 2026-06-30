// ══════════════════════════════════════════════════════════════════
// JDC-LMS — Cloud Functions for push notifications
// ══════════════════════════════════════════════════════════════════
// Two functions:
//
// 1. deliverNotificationPush — fires automatically whenever a document is
//    created in the `notifications` collection (i.e. every time
//    pushNotification() runs client-side in index.html, for ANY of the
//    five trigger types: new assignment, weekly reminder, admin
//    announcement, certificate approved, new message). Resolves the
//    notification's target into real users, respects each user's
//    per-category on/off toggle (notifPrefs), and delivers an FCM push to
//    their registered device(s).
//
// 2. weeklyAssessmentReminder — runs on a schedule, finds assignments that
//    are still open and close soon, finds students in the right class
//    group who haven't submitted yet, and writes a notification document
//    for them (which deliverNotificationPush then picks up and pushes).
//
// Deploy with: firebase deploy --only functions
// (Requires the Blaze pay-as-you-go plan — Cloud Functions cannot make the
// outbound network calls the FCM Admin SDK needs on the free Spark plan.)

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

function generateId(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Mirrors the targeting shapes index.html writes ('all' | 'students' |
// 'teachers' | a role name | an array of user IDs | a single user ID).
async function resolveTargetUsers(targetUsers) {
  const usersSnap = await db.collection('users').get();
  const allUsers = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  if (targetUsers === 'all') return allUsers;
  if (targetUsers === 'students') return allUsers.filter((u) => u.role === 'Student');
  if (targetUsers === 'teachers') return allUsers.filter((u) => u.role === 'Teacher');
  if (Array.isArray(targetUsers)) return allUsers.filter((u) => targetUsers.includes(u.id));
  if (typeof targetUsers === 'string') {
    return allUsers.filter((u) => u.role === targetUsers || u.id === targetUsers);
  }
  return [];
}

exports.deliverNotificationPush = onDocumentCreated('notifications/{notifId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const notif = snap.data();
  if (!notif || !notif.title) return;

  const category = notif.category || 'announcements';
  const senderId = notif.sentBy || '';

  const targetField = notif.targetUsers !== undefined ? notif.targetUsers : notif.target;
  const users = await resolveTargetUsers(targetField);

  const tokens = [];
  const tokenOwner = {};

  users.forEach((u) => {
    if (u.id === senderId) return; // don't push back to whoever sent it
    const prefs = u.notifPrefs || {};
    if (prefs[category] === false) return; // user turned this category off
    (u.fcmTokens || []).forEach((tok) => {
      tokens.push(tok);
      tokenOwner[tok] = u.id;
    });
  });

  if (!tokens.length) return;

  const message = {
    notification: {
      title: notif.title,
      body: notif.body || notif.message || ''
    },
    data: {
      category: category,
      page: notif.page || 'dashboard',
      notifId: event.params.notifId
    },
    tokens: tokens
  };

  const response = await admin.messaging().sendEachForMulticast(message);

  // Prune tokens FCM reports as dead so the array doesn't grow forever.
  const deadByUser = {};
  response.responses.forEach((r, i) => {
    if (r.success) return;
    const code = r.error && r.error.code;
    if (
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/invalid-registration-token'
    ) {
      const tok = tokens[i];
      const uid = tokenOwner[tok];
      if (uid) {
        deadByUser[uid] = deadByUser[uid] || [];
        deadByUser[uid].push(tok);
      }
    }
  });

  await Promise.all(
    Object.keys(deadByUser).map(async (uid) => {
      const ref = db.collection('users').doc(uid);
      const userSnap = await ref.get();
      if (!userSnap.exists) return;
      const remaining = (userSnap.data().fcmTokens || []).filter(
        (tok) => !deadByUser[uid].includes(tok)
      );
      await ref.update({ fcmTokens: remaining });
    })
  );
});

// Adjust the schedule/timezone/window below to suit your needs.
exports.weeklyAssessmentReminder = onSchedule(
  { schedule: 'every monday 08:00', timeZone: 'Asia/Riyadh' },
  async () => {
    const now = new Date();
    const REMINDER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // remind for assignments closing within 7 days

    const [assignmentsSnap, submissionsSnap, usersSnap] = await Promise.all([
      db.collection('assignments').get(),
      db.collection('submissions').get(),
      db.collection('users').get()
    ]);

    const submissions = submissionsSnap.docs.map((d) => d.data());
    const students = usersSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((u) => u.role === 'Student');

    const writes = [];

    assignmentsSnap.docs.forEach((doc) => {
      const a = doc.data();
      if (a.status !== 'Active') return;
      const close = a.closeDate ? new Date(a.closeDate) : null;
      if (!close || isNaN(close.getTime())) return;
      const msUntilClose = close.getTime() - now.getTime();
      if (msUntilClose < 0 || msUntilClose > REMINDER_WINDOW_MS) return;

      const submittedIds = submissions
        .filter((s) => s.assignmentId === doc.id)
        .map((s) => s.studentId);

      const pendingStudentIds = students
        .filter((s) => a.classGroup === 'All' || s.classGroup === a.classGroup)
        .filter((s) => !submittedIds.includes(s.id))
        .map((s) => s.id);

      if (!pendingStudentIds.length) return;

      const dueText = close.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
      const body = '"' + a.title + '" is due ' + dueText + ' and you haven\u2019t submitted it yet.';
      const id = generateId('NF');

      writes.push(
        db.collection('notifications').doc(id).set({
          id: id,
          title: '\u23F0 Weekly Assessment Reminder',
          body: body,
          message: body,
          category: 'assignmentReminder',
          page: 'assignments',
          date: new Date().toISOString(),
          read: false,
          readBy: [],
          sentBy: '',
          targetUsers: pendingStudentIds
        })
      );
    });

    await Promise.all(writes);
  }
);
