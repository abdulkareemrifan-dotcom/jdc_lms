# In-App Camera Broadcast — Setup Guide

This adds a "My Device Camera" option to Live Broadcast sessions: instead of pasting a
YouTube/Facebook link, the broadcaster's own camera + microphone streams live, in-app, to
every viewer with access — no external platform required.

It's powered by **Agora** (video infrastructure provider). Free tier: **10,000 minutes/month**,
plenty for a school/community LMS. No credit card required to start.

## Staying 100% free — read this first

- **Do not add a credit card to your Agora account.** The free tier (10,000 minutes/month)
  does not require one. Without a card on file, Agora has no way to charge you — period.
- If you ever exceed 10,000 minutes in a month, camera broadcasting simply **stops working**
  (viewers get a connection error) until the next month resets it. It does not auto-upgrade
  or auto-bill. Nothing breaks the rest of your app — only this one feature pauses.
- Vercel: this adds one small serverless function call per viewer per session. On the free
  Hobby plan you're already on, this is far below the free monthly limit.
- Firebase: usage is the same pattern as everything else already in your app (Firestore reads/
  writes) — no new cost category, just slightly more activity on your existing free Spark plan.

If you ever want a hard safety net beyond "no card on file," Agora's console has a
**Usage & Billing** page where you can monitor minutes used — check it occasionally if you
expect a lot of viewers, just so you're not surprised by the feature pausing mid-month.

## 1. Create your Agora project (5 minutes)

1. Go to https://console.agora.io and sign up (free)
2. Click **Project Management → Create**
3. Name it anything (e.g. "JDC LMS")
4. Choose **Secured mode: APP ID + Token (Recommended)** — this is important, it's what
   makes the App Certificate step below available
5. Open the project, copy your **App ID**
6. Click to reveal/copy the **Primary Certificate**

Keep both handy for the next step.

## 2. Add the two secrets to Vercel

1. Go to your Vercel project → **Settings → Environment Variables**
2. Add:
   - `AGORA_APP_ID` = *(the App ID from step 1)*
   - `AGORA_APP_CERTIFICATE` = *(the Primary Certificate from step 1)*
3. Apply to **Production** (and Preview/Development if you use them)
4. Save — you'll redeploy in step 4 below

These stay server-side only. The App ID is safe to expose to the browser (the token endpoint
sends it back automatically); the Certificate never leaves Vercel.

## 3. Add the token function + dependency

1. Upload `agora-token.js` into your repo's **`api/`** folder (so it becomes `api/agora-token.js`)
2. Add the `agora-access-token` package as a dependency:
   - If your repo has a root **`package.json`**, add this line inside `"dependencies"`:
     ```json
     "agora-access-token": "^2.0.4"
     ```
   - If you don't have a root `package.json` yet, create one with:
     ```json
     {
       "name": "jdc-lms",
       "version": "1.0.0",
       "dependencies": {
         "agora-access-token": "^2.0.4"
       }
     }
     ```

## 4. Deploy

Commit and push (or upload via the GitHub website as usual). Vercel will pick up the new
environment variables and the new function automatically and redeploy.

## 5. Test it

1. In the app, go to **Live Broadcast → New Session**
2. Set Platform to **"My Device Camera (Live, in-app)"**
3. Save, then tap **Go Live** — your browser will ask for camera/microphone permission
4. Open the Viewer Page (ideally on a second device or another browser) and confirm the
   video appears

## Notes & limits

- Works in any modern browser — desktop or mobile — since it just needs camera/mic access,
  unlike the "Record to My Device" screen-recording feature which is desktop-only.
- The broadcaster must **keep their tab/app open** while live — closing it ends the stream.
  The app will warn before letting them accidentally navigate away.
- Free tier covers 10,000 audience-minutes/month combined across all sessions. A 1-hour
  session with 20 viewers uses about 1,200 minutes. Keep an eye on usage in the Agora console
  if you expect heavy use — the paid tier is pay-as-you-go beyond that.
- If a viewer's video doesn't appear, ask them to refresh the Live Broadcast page.
