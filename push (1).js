// /api/push.js
// Actually delivers a push notification through OneSignal's REST API.
// This REPLACES the previous placeholder version, which only ever returned
// {status:'ok'} without contacting OneSignal at all — that's why background
// pushes (app closed / phone locked) were never arriving reliably; only the
// separate foreground/in-tab notification path was ever working.
//
// Requires these two Environment Variables in Vercel
// (Project → Settings → Environment Variables), then redeploy:
//   ONESIGNAL_APP_ID           = fd7b6da3-dc80-473d-9c4c-99433c028205  (same ID already used client-side — not secret)
//   ONESIGNAL_REST_API_KEY     = your OneSignal REST API Key (SECRET — from OneSignal dashboard → Settings → Keys & IDs)

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  }

  const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
  const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;

  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'OneSignal is not configured on the server yet. Add ONESIGNAL_APP_ID and ONESIGNAL_REST_API_KEY in Vercel → Settings → Environment Variables, then redeploy.' }),
      { status: 500, headers }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers });
  }

  const { title, body: message, targetAll, targetRole, externalIds, page } = body || {};

  if (!title || !message) {
    return new Response(JSON.stringify({ error: 'title and body are required' }), { status: 400, headers });
  }

  const payload = {
    app_id: ONESIGNAL_APP_ID,
    headings: { en: String(title) },
    contents: { en: String(message) },
  };
  if (page) payload.data = { page: String(page) };

  // Targeting — matches exactly what the app's pushNotification() function sends
  if (Array.isArray(externalIds) && externalIds.length) {
    // Specific users — these IDs were linked to devices via OneSignal.login(userId) client-side
    payload.include_external_user_ids = externalIds.map(String);
    payload.channel_for_external_user_ids = 'push';
  } else if (targetRole) {
    // Role-based — relies on the 'role' tag already being set via OneSignal.User.addTag('role', ...)
    payload.filters = [{ field: 'tag', key: 'role', relation: '=', value: String(targetRole) }];
  } else {
    // targetAll (or nothing specified) — everyone currently subscribed
    payload.included_segments = ['Subscribed Users'];
  }

  try {
    const res = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok || data.errors) {
      return new Response(JSON.stringify({ error: data.errors || data, sent: 0 }), { status: 502, headers });
    }

    return new Response(
      JSON.stringify({ status: 'ok', sent: data.recipients ?? 0, id: data.id || null }),
      { status: 200, headers }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message, sent: 0 }), { status: 500, headers });
  }
}
