# JDC-LMS — Background Push Notification Setup

This adds real background push (notifications that arrive even when the app
is fully closed) on top of the in-app system that already existed. Five
trigger types are wired up: new assignment, weekly assessment reminder,
admin announcement, certificate approved, and new message received. Every
user can turn each category on/off independently from the bell icon →
**Notification Settings**.

## What changed

- **`index.html`** — fixed a duplicate `pushNotification()` function that was
  silently breaking the unread badge and the on/off toggle; unified three
  different notification data shapes into one; added the missing
  "certificate approved" and "new message received" triggers; replaced the
  fragile blob-based service worker with a registration of a real file;
  added an `assignmentReminder` notification category.
- **`firebase-messaging-sw.js`** *(new)* — the real service worker that
  receives push while the app is closed/backgrounded.
- **`functions/index.js`** *(new)* — two Cloud Functions: one delivers a
  push the instant a notification is created (respecting each user's
  on/off toggle), the other runs weekly to remind students about
  assignments they haven't submitted yet.

## Why a backend is required

Browsers won't let client-side JS push notifications to *other* people's
devices — that has to come from a server holding your Firebase service
account credentials. The Cloud Functions in this project are that server;
your browser code only ever writes a "please notify these people" document
to Firestore, and the function does the actual delivery.

## One-time setup

### 1. Upgrade to the Blaze plan

Firebase Console → your project (`student-portal-2b672`) → ⚙️ **Usage and
billing** → **Modify plan** → Blaze (pay-as-you-go). Cloud Functions can't
make outbound network calls (which the FCM Admin SDK needs) on the free
Spark plan. A small LMS like this will very likely stay within the free
monthly quota even on Blaze — you're only billed for usage beyond it.

### 2. Generate a Web Push certificate (VAPID key)

Firebase Console → **Project settings** (⚙️ next to "Project Overview") →
**Cloud Messaging** tab → **Web configuration** → **Web Push certificates**
→ **Generate key pair**. Copy the long key string it gives you.

In `index.html`, find:

```js
var FCM_VAPID_KEY = 'REPLACE_WITH_YOUR_VAPID_KEY';
```

and paste your real key in place of the placeholder.

### 3. Install the Firebase CLI and deploy the functions

```bash
npm install -g firebase-tools
firebase login
cd jdc-lms          # the folder containing firebase.json
firebase deploy --only functions
```

This deploys `deliverNotificationPush` (instant delivery) and
`weeklyAssessmentReminder` (scheduled). `.firebaserc` already points at
your `student-portal-2b672` project, so you shouldn't need `firebase use`.

If you'd rather adjust the reminder schedule first, edit the `schedule` /
`timeZone` values near the bottom of `functions/index.js` before deploying
— it currently runs every Monday at 08:00 Asia/Riyadh and reminds students
about assignments closing within the next 7 days that they haven't
submitted.

### 4. Deploy the static files

Upload `index.html` **and** `firebase-messaging-sw.js` together, at the
same level (the service worker must be reachable at
`https://yourdomain.com/firebase-messaging-sw.js` — not in a subfolder, or
its scope won't cover the rest of the app). Your existing `vercel.json` /
`_headers` don't redirect or rewrite paths, so this should just work once
both files are in the deployment.

### 5. Test it

1. Open the app, log in, accept the "Enable push notifications" prompt (or
   go to the bell icon → Notification Settings → Enable Now).
2. Fully close the app / lock the phone.
3. From another account (e.g. log in as Admin on a different device or
   browser profile), send a test announcement, or approve a certificate,
   or send a message to the user who granted permission.
4. A system notification should appear within a few seconds, even though
   the app is closed.

## How the on/off toggle works

Each user's preferences live in `notifPrefs` on their user document (e.g.
`{ assignments: true, messages: false, ... }`). Both the in-app foreground
path and the Cloud Function check this before showing/sending anything, so
turning a category off genuinely silences it everywhere, not just on
screen.

## A few honest caveats

- **iOS**: Apple only supports web push for PWAs added to the home screen,
  on iOS 16.4+. It's less consistent than Android — test on real devices
  before relying on it.
- **Multiple devices**: each browser/device a user grants permission on
  gets its own token (up to 5 are kept per user); they'll get push on all
  of them.
- **Cost**: Cloud Functions + FCM are effectively free at this scale, but
  Blaze is still a pay-as-you-go plan — keep an eye on the Firebase console
  usage tab if user count grows a lot.
