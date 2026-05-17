import { SignJWT, importPKCS8 } from 'jose';

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  console.log('[google-token] Handler invoked');

  // ── 1. Validate environment variables ──────────────────────────────────────
  const rawKey   = process.env.GOOGLE_PRIVATE_KEY;
  const email    = process.env.GOOGLE_CLIENT_EMAIL;
  const tokenUri = process.env.GOOGLE_TOKEN_URI || 'https://oauth2.googleapis.com/token';

  console.log('[google-token] GOOGLE_CLIENT_EMAIL present:', !!email);
  console.log('[google-token] GOOGLE_PRIVATE_KEY present:', !!rawKey);
  console.log('[google-token] GOOGLE_TOKEN_URI:', tokenUri);

  if (!rawKey || !email) {
    const missing = [!email && 'GOOGLE_CLIENT_EMAIL', !rawKey && 'GOOGLE_PRIVATE_KEY']
      .filter(Boolean)
      .join(', ');
    console.error('[google-token] Missing env vars:', missing);
    return res.status(500).json({
      error: `Missing server-side environment variables: ${missing}. Ensure they are added in the Vercel dashboard WITHOUT the VITE_ prefix.`,
    });
  }

  // ── 2. Parse the private key (handle escaped newlines from Vercel env UI) ──
  // Vercel stores multi-line secrets as literal \n characters when entered via the UI.
  // Replace them with real newlines so the PEM parser works correctly.
  const privateKeyStr = rawKey.replace(/\\n/g, '\n');
  console.log('[google-token] Private key first 40 chars after parse:', privateKeyStr.slice(0, 40));

  try {
    // ── 3. Import the PEM key ───────────────────────────────────────────────
    let privateKey;
    try {
      privateKey = await importPKCS8(privateKeyStr, 'RS256');
      console.log('[google-token] Private key imported successfully');
    } catch (keyErr) {
      console.error('[google-token] Failed to import private key:', keyErr.message);
      return res.status(500).json({
        error: `Failed to parse GOOGLE_PRIVATE_KEY: ${keyErr.message}. Make sure the key is a valid PKCS8 PEM and that newlines are stored as \\n in Vercel.`,
      });
    }

    // ── 4. Sign the JWT ─────────────────────────────────────────────────────
    const jwt = await new SignJWT({
      iss: email,
      scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly',
      aud: tokenUri,
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);

    console.log('[google-token] JWT signed successfully');

    // ── 5. Exchange JWT for Google access token ─────────────────────────────
    const googleRes = await fetch(tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    const googleData = await googleRes.json();
    console.log('[google-token] Google OAuth response status:', googleRes.status);

    if (!googleRes.ok) {
      console.error('[google-token] Google OAuth error:', JSON.stringify(googleData));
      return res.status(500).json({
        error: `Google OAuth failed (${googleRes.status}): ${googleData.error_description || googleData.error || 'Unknown error'}`,
        detail: googleData,
      });
    }

    console.log('[google-token] Access token obtained, expires_in:', googleData.expires_in);
    return res.status(200).json({
      access_token: googleData.access_token,
      expires_in:   googleData.expires_in,
    });

  } catch (error) {
    console.error('[google-token] Unexpected error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
