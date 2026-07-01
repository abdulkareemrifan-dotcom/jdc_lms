// JDC-LMS — Vercel Serverless Function for OneSignal push delivery
// Uses external_user_ids (the user's LMS ID set via OneSignal.login())
// so no player ID storage is needed — OneSignal maps them to devices.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { title, body, page, externalIds } = req.body || {};

  if (!title || !externalIds || !externalIds.length) {
    return res.status(400).json({ error: 'Missing title or externalIds' });
  }

  const appId = process.env.ONESIGNAL_APP_ID;
  const apiKey = process.env.ONESIGNAL_REST_API_KEY;

  if (!appId || !apiKey) {
    return res.status(500).json({ error: 'OneSignal env vars not configured' });
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
        // Target by external user ID (set via OneSignal.login(userId) in the app)
        // Works even when the app is fully closed — no player ID storage needed
        include_external_user_ids: externalIds,
        channel_for_external_user_ids: 'push',
        headings: { en: title },
        contents: { en: body || '' },
        url: 'https://jdc-lms-eight.vercel.app/',
        ttl: 259200, // keep for 3 days if device is offline
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
