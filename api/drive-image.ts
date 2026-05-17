import type { VercelRequest, VercelResponse } from '@vercel/node';
import { SignJWT, importPKCS8 } from 'jose';

let cachedToken: string | null = null;
let tokenExpiry: number = 0;

async function getGoogleAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  // Use server-side only env vars (no VITE_ prefix — never sent to browser)
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.GOOGLE_PRIVATE_KEY;

  if (!clientEmail || !privateKeyRaw) {
    throw new Error(
      'Missing GOOGLE_CLIENT_EMAIL or GOOGLE_PRIVATE_KEY environment variables. ' +
      'Add them in Vercel → Project Settings → Environment Variables.'
    );
  }

  // Vercel stores multiline values with literal \n — convert to real newlines
  const privateKeyStr = privateKeyRaw.replace(/\\n/g, '\n');
  const TOKEN_URI = 'https://oauth2.googleapis.com/token';

  const privateKey = await importPKCS8(privateKeyStr, 'RS256');

  const jwt = await new SignJWT({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: TOKEN_URI,
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey);

  const response = await fetch(TOKEN_URI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error_description || 'Failed to get access token');
  }

  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken!;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Allow CORS from your own origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid Drive file id query param' });
  }

  try {
    const token = await getGoogleAccessToken();

    const driveRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${id}?alt=media`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!driveRes.ok) {
      const text = await driveRes.text();
      console.error(`[drive-image] Drive API error ${driveRes.status}:`, text);
      return res.status(driveRes.status).json({ error: `Drive API error: ${driveRes.status}` });
    }

    const contentType = driveRes.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await driveRes.arrayBuffer());

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(buffer);
  } catch (err: any) {
    console.error('[drive-image] Error:', err.message);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
