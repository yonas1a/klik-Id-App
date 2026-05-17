import { SignJWT, importPKCS8 } from 'jose';

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // Read the secret variables (without VITE_ prefix, ensuring they aren't bundled on client)
    const privateKeyStr = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const tokenUri = process.env.GOOGLE_TOKEN_URI || "https://oauth2.googleapis.com/token";

    if (!privateKeyStr || !clientEmail) {
      return res.status(500).json({ error: "Missing Google Service Account credentials on server environment." });
    }

    const privateKey = await importPKCS8(privateKeyStr, 'RS256');

    const jwt = await new SignJWT({
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly",
      aud: tokenUri,
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);

    const response = await fetch(tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(500).json({ error: data.error_description || 'Failed to get access token from Google OAuth' });
    }

    return res.status(200).json({
      access_token: data.access_token,
      expires_in: data.expires_in
    });
  } catch (error) {
    console.error("Token generation error:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
}
