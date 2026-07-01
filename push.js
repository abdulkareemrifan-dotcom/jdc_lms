// Vercel Edge Function — runs on V8, always has fetch, no Node.js version issues
export const config = { runtime: 'edge' };

export default async function handler(req) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });

  const appId = process.env.ONESIGNAL_APP_ID;
  const apiKey = process.env.ONESIGNAL_REST_API_KEY;
  if (!appId || !apiKey) return new Response(JSON.stringify({ error: 'Missing env vars' }), { status: 500, headers });

  let body = {};
  try { body = await req.json(); } catch(e) {}

  const title = body.title || 'JDC-LMS';
  const message = body.body || '';
  const isNewKey = apiKey.startsWith('os_v2_');

  let audience;
  if (body.externalIds && body.externalIds.length) {
    audience = { include_external_user_ids: body.externalIds, channel_for_external_user_ids: 'push' };
  } else if (body.targetRole === 'Student' || body.targetRole === 'Teacher') {
    audience = { filters: [{ field: 'tag', key: 'role', relation: '=', value: body.targetRole }] };
  } else {
    audience = { included_segments: ['Total Subscriptions'] };
  }

  try {
    const r = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': (isNewKey ? 'Key ' : 'Basic ') + apiKey
      },
      body: JSON.stringify(Object.assign({ app_id: appId, headings: { en: title }, contents: { en: message }, ttl: 259200 }, audience))
    });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch(e) { return new Response(JSON.stringify({ error: text.slice(0,200) }), { status: 500, headers }); }
    if (data.errors) return new Response(JSON.stringify({ error: data.errors }), { status: 400, headers });
    return new Response(JSON.stringify({ sent: data.recipients || 0, id: data.id }), { status: 200, headers });
  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}
