// JDC-LMS — Vercel Serverless Function for OneSignal push delivery

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const appId = process.env.ONESIGNAL_APP_ID;
  const apiKey = process.env.ONESIGNAL_REST_API_KEY;
  if (!appId || !apiKey) {
    console.error('Missing OneSignal env vars');
    return res.status(500).json({ error: 'Server not configured' });
  }

  const body = req.body || {};
  const title = body.title || 'JDC-LMS';
  const message = body.body || '';
  const targetRole = body.targetRole;
  const externalIds = body.externalIds;

  let audience;
  if (externalIds && externalIds.length) {
    audience = { include_external_user_ids: externalIds, channel_for_external_user_ids: 'push' };
  } else if (targetRole === 'Student' || targetRole === 'Teacher') {
    audience = { filters: [{ field: 'tag', key: 'role', relation: '=', value: targetRole }] };
  } else {
    audience = { included_segments: ['Total Subscriptions'] };
  }

  try {
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + apiKey,
      },
      body: JSON.stringify({
        app_id: appId,
        ...audience,
        headings: { en: title },
        contents: { en: message },
        url: 'https://jdc-lms-eight.vercel.app/',
        ttl: 259200,
      }),
    });

    const data = await response.json();
    console.log('OneSignal response:', JSON.stringify(data));
    if (data.errors) return res.status(500).json({ error: data.errors });
    return res.status(200).json({ sent: data.recipients || 0, id: data.id });
  } catch (err) {
    console.error('Push error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
