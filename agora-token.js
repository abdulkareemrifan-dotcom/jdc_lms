// /api/agora-token.js
// Generates short-lived Agora RTC tokens for the Live Broadcast "My Device Camera" feature.
// The App Certificate never leaves this server — only the App ID + a signed, expiring token
// are sent back to the browser, which is the secure way to do this.
//
// Requires these two Environment Variables to be set in your Vercel project
// (Project → Settings → Environment Variables), then redeploy:
//   AGORA_APP_ID           = your Agora project's App ID
//   AGORA_APP_CERTIFICATE  = your Agora project's Primary Certificate
//
// Also requires the "agora-access-token" package — see setup notes.

const { RtcTokenBuilder, RtcRole } = require('agora-access-token');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const appId = process.env.AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;

  if (!appId || !appCertificate) {
    res.status(500).json({ error: 'Agora is not configured on the server yet. Add AGORA_APP_ID and AGORA_APP_CERTIFICATE in Vercel → Settings → Environment Variables, then redeploy.' });
    return;
  }

  const channel = (req.query.channel || '').toString().trim();
  const roleParam = (req.query.role || 'audience').toString();
  const uid = parseInt(req.query.uid, 10) || 0;

  if (!channel) {
    res.status(400).json({ error: 'Missing "channel" parameter.' });
    return;
  }

  const role = roleParam === 'host' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
  const expireSeconds = 4 * 60 * 60; // token valid for 4 hours
  const currentTs = Math.floor(Date.now() / 1000);
  const privilegeExpireTs = currentTs + expireSeconds;

  try {
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId, appCertificate, channel, uid, role, privilegeExpireTs
    );
    res.status(200).json({ appId, token, channel, uid, expireAt: privilegeExpireTs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate token: ' + err.message });
  }
};
