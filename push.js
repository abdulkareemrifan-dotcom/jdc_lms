// JDC-LMS — Vercel Serverless Function for OneSignal push delivery

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { title, body, page, externalIds, targetAll, targetRole } = req.body || {};

  if (!title) return res.status(400).json({ error: 'Missing title' });

  const appId = process.env.ONESIGNAL_APP_ID;
  const apiKey = process.env.ONESIGNAL_REST_API_KEY;
  if (!appId || !apiKey) return res.status(500).json({ error: 'OneSignal env vars not configured' });

  // Build the audience targeting
  let audience = {};

  if (targetAll) {
    // Send to all subscribers
    audience = { included_segments: ['Total Subscriptions'] };
  } else if (targetRole === 'Student' || targetRole === 'Teacher') {
    // Send to subscribers tagged with this role
    audience = {
      filters: [{ field: 'tag', key: 'role', relation: '=', value: targetRole }]
    };
  } else if (externalIds && externalIds.length) {
    // Send to specific users by their LMS user ID
    audience = { include_aliases: { external_id: externalIds }, target_channel: 'push' };
  } else {
    // Fallback: send to all
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
        contents: { en: body || '' },
        url: 'https://jdc-lms-eight.vercel.app/',
        ttl: 259200,
      }),
    });

    const data = await response.json();
    if (data.errors) {
      console.error('OneSignal errors:', data.errors);
      return res.status(500).json({ error: data.errors });
    }
    return res.status(200).json({ sent: data.recipients || 0, id: data.id });
  } catch (err) {
    console.error('Push delivery error:', err);
    return res.status(500).json({ error: err.message });
  }
}
