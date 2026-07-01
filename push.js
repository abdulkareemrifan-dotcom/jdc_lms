// JDC-LMS — Vercel Serverless Function for OneSignal push delivery
// Uses Node's built-in https module (no fetch required, works on all Node versions)

const https = require('https');

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const appId = process.env.ONESIGNAL_APP_ID;
  const apiKey = process.env.ONESIGNAL_REST_API_KEY;
  if (!appId || !apiKey) { res.status(500).json({ error: 'Missing env vars' }); return; }

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

  const isNewKey = apiKey.indexOf('os_v2_') === 0;
  const payload = JSON.stringify(Object.assign({
    app_id: appId,
    headings: { en: title },
    contents: { en: message },
    url: 'https://jdc-lms-eight.vercel.app/',
    ttl: 259200
  }, audience));

  const options = {
    hostname: 'onesignal.com',
    path: '/api/v1/notifications',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': (isNewKey ? 'Key ' : 'Basic ') + apiKey,
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  const request = https.request(options, function(r) {
    let data = '';
    r.on('data', function(chunk) { data += chunk; });
    r.on('end', function() {
      try {
        const parsed = JSON.parse(data);
        console.log('OneSignal response:', JSON.stringify(parsed));
        if (parsed.errors) res.status(400).json({ error: parsed.errors });
        else res.status(200).json({ sent: parsed.recipients || 0, id: parsed.id });
      } catch(e) {
        console.error('Parse error:', data);
        res.status(500).json({ error: data.slice(0, 200) });
      }
    });
  });

  request.on('error', function(e) {
    console.error('Request error:', e.message);
    res.status(500).json({ error: e.message });
  });

  request.write(payload);
  request.end();
};
