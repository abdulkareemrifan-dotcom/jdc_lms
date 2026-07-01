// Minimal test — if this crashes, Vercel isn't recognising the api/ folder
module.exports = function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  var body = req.body || {};
  var title = body.title || 'JDC-LMS';
  var message = body.body || '';
  var appId = process.env.ONESIGNAL_APP_ID || '';
  var apiKey = process.env.ONESIGNAL_REST_API_KEY || '';

  if (!appId || !apiKey) {
    res.status(500).json({ error: 'Missing env vars', appId: !!appId, apiKey: !!apiKey });
    return;
  }

  var https = require('https');
  var isNewKey = apiKey.indexOf('os_v2_') === 0;
  var payload = JSON.stringify({
    app_id: appId,
    included_segments: ['Total Subscriptions'],
    headings: { en: title },
    contents: { en: message },
    ttl: 259200
  });

  var options = {
    hostname: 'onesignal.com',
    path: '/api/v1/notifications',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': (isNewKey ? 'Key ' : 'Basic ') + apiKey,
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  var request = https.request(options, function(r) {
    var data = '';
    r.on('data', function(c) { data += c; });
    r.on('end', function() {
      try {
        var d = JSON.parse(data);
        if (d.errors) res.status(400).json({ error: d.errors, raw: data });
        else res.status(200).json({ sent: d.recipients || 0, id: d.id });
      } catch(e) {
        res.status(500).json({ error: 'Parse failed', raw: data.slice(0, 300) });
      }
    });
  });

  request.on('error', function(e) {
    res.status(500).json({ error: e.message });
  });

  request.write(payload);
  request.end();
};
