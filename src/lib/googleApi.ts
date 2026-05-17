import { SignJWT, importPKCS8 } from 'jose';

let cachedToken: string | null = null;
let tokenExpiry: number = 0;

export async function getGoogleAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) {
    console.log('[googleApi] Using cached access token');
    return cachedToken;
  }

  // ── Strategy 1: Secure Vercel serverless endpoint ─────────────────────────
  // In production on Vercel, the private key lives ONLY on the server.
  // /api/google-token signs the JWT and returns a short-lived access token.
  console.log('[googleApi] Attempting to get token from /api/google-token ...');
  try {
    const response = await fetch('/api/google-token');
    const responseText = await response.text();

    console.log('[googleApi] /api/google-token HTTP status:', response.status);
    console.log('[googleApi] /api/google-token raw response:', responseText);

    if (response.ok) {
      let data: { access_token?: string; expires_in?: number; error?: string };
      try {
        data = JSON.parse(responseText);
      } catch {
        console.error('[googleApi] /api/google-token returned non-JSON:', responseText);
        throw new Error(`/api/google-token returned non-JSON: ${responseText.slice(0, 200)}`);
      }

      if (data.access_token) {
        console.log('[googleApi] ✅ Got token from /api/google-token, expires_in:', data.expires_in);
        cachedToken = data.access_token;
        tokenExpiry = Date.now() + ((data.expires_in ?? 3600) - 60) * 1000;
        return cachedToken;
      } else {
        console.error('[googleApi] /api/google-token responded OK but no access_token found:', data);
        throw new Error(`/api/google-token: OK but no access_token — ${JSON.stringify(data)}`);
      }
    } else {
      // Parse the error body for a useful message
      let errBody: { error?: string } = {};
      try { errBody = JSON.parse(responseText); } catch { /* raw text below */ }
      const msg = errBody.error || responseText.slice(0, 300);
      console.error(`[googleApi] /api/google-token returned ${response.status}: ${msg}`);
      throw new Error(`/api/google-token (${response.status}): ${msg}`);
    }
  } catch (apiErr) {
    const errMsg = (apiErr as Error).message;
    // If the fetch itself failed (e.g. route not found during local dev), fall back.
    // If it returned a real error body, re-throw so the UI can see the problem.
    const isNetworkError = errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError') || errMsg.includes('Load failed');
    if (!isNetworkError) {
      // This is a real server error (env var missing, bad key, etc.) — surface it.
      throw apiErr;
    }
    console.warn('[googleApi] /api/google-token not reachable (likely local dev), falling back to VITE_ vars.');
  }

  // ── Strategy 2: Client-side fallback (local `npm run dev` only) ───────────
  // VITE_ vars are available locally but are NOT set on Vercel (by design).
  console.log('[googleApi] Falling back to client-side JWT generation with VITE_ variables...');

  const privateKeyStr = import.meta.env.VITE_GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const clientEmail   = import.meta.env.VITE_GOOGLE_CLIENT_EMAIL;
  const tokenUri      = import.meta.env.VITE_GOOGLE_TOKEN_URI || 'https://oauth2.googleapis.com/token';

  console.log('[googleApi] VITE_GOOGLE_CLIENT_EMAIL present:', !!clientEmail);
  console.log('[googleApi] VITE_GOOGLE_PRIVATE_KEY present:', !!privateKeyStr);

  if (!privateKeyStr || !clientEmail) {
    throw new Error(
      '[googleApi] Missing Google credentials. On Vercel: ensure GOOGLE_PRIVATE_KEY and GOOGLE_CLIENT_EMAIL are set in the dashboard (no VITE_ prefix). Locally: add them with VITE_ prefix to your .env file.'
    );
  }

  const privateKey = await importPKCS8(privateKeyStr, 'RS256');
  console.log('[googleApi] Private key imported OK (local fallback)');

  const jwt = await new SignJWT({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly',
    aud: tokenUri,
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey);

  console.log('[googleApi] JWT signed OK (local fallback)');

  const oauthRes  = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  const oauthData = await oauthRes.json();
  console.log('[googleApi] Google OAuth status (local fallback):', oauthRes.status);

  if (!oauthRes.ok) {
    console.error('[googleApi] Google OAuth error (local fallback):', oauthData);
    throw new Error(oauthData.error_description || 'Failed to get access token');
  }

  console.log('[googleApi] ✅ Got token via local fallback');
  cachedToken  = oauthData.access_token;
  tokenExpiry  = Date.now() + (oauthData.expires_in - 60) * 1000;
  return cachedToken!;
}

// ─────────────────────────────────────────────────────────────────────────────

export async function appendSheetData(url: string, rowValues: any[]) {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) throw new Error('Invalid Google Sheets URL format. Could not extract ID.');
  const spreadsheetId = match[1];

  console.log('[googleApi] appendSheetData → spreadsheetId:', spreadsheetId);
  const token = await getGoogleAccessToken();

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A:Z:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [rowValues] }),
    }
  );

  const data = await res.json();
  if (!res.ok) {
    console.error('[googleApi] appendSheetData failed:', data);
    throw new Error(data?.error?.message || `Failed to append data (${res.status})`);
  }
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────

export async function fetchSheetData(url: string) {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) throw new Error('Invalid Google Sheets URL format. Could not extract ID.');
  const spreadsheetId = match[1];

  const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv`;
  console.log('[googleApi] fetchSheetData → csvUrl:', csvUrl);

  const res = await fetch(csvUrl);
  if (!res.ok) throw new Error(`Failed to fetch data (${res.status}). Ensure the sheet is public.`);

  const text = await res.text();

  // Simple CSV parser
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentVal = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { currentVal += '"'; i++; }
        else inQuotes = false;
      } else {
        currentVal += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentVal); currentVal = '';
      } else if (char === '\n' || char === '\r') {
        if (char === '\r' && text[i + 1] === '\n') i++;
        currentRow.push(currentVal);
        rows.push(currentRow);
        currentRow = []; currentVal = '';
      } else {
        currentVal += char;
      }
    }
  }
  if (currentRow.length > 0 || currentVal !== '') {
    currentRow.push(currentVal);
    rows.push(currentRow);
  }

  console.log('[googleApi] fetchSheetData → rows parsed:', rows.length);
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────

const imageCache = new Map<string, string>();

export async function fetchDriveImageAsBase64(imageUrl: string): Promise<string> {
  if (!imageUrl) throw new Error('No image URL provided');
  if (imageCache.has(imageUrl)) {
    console.log('[googleApi] Image cache hit for:', imageUrl);
    return imageCache.get(imageUrl)!;
  }

  console.log('[googleApi] fetchDriveImageAsBase64 → input URL:', imageUrl);

  // ── Extract Drive file ID ─────────────────────────────────────────────────
  let driveFileId: string | null = null;
  try {
    const parsedUrl = new URL(imageUrl);
    if (parsedUrl.hostname.includes('drive.google.com')) {
      if (imageUrl.includes('open?id=') || imageUrl.includes('uc?id=')) {
        driveFileId = parsedUrl.searchParams.get('id');
      } else if (imageUrl.includes('/file/d/')) {
        const m = imageUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (m) driveFileId = m[1];
      }
    }
  } catch (e) {
    console.warn('[googleApi] Could not parse imageUrl as URL:', e);
  }

  console.log('[googleApi] Extracted Drive file ID:', driveFileId ?? '(none — not a Drive URL)');

  // ── Attempt 1: Authenticated Drive API fetch ──────────────────────────────
  if (driveFileId) {
    try {
      console.log('[googleApi] Attempt 1: Authenticated Drive API fetch for file ID:', driveFileId);
      const token = await getGoogleAccessToken();
      console.log('[googleApi] Access token obtained (first 20 chars):', token.slice(0, 20) + '...');

      const driveApiUrl = `https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`;
      const res = await fetch(driveApiUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      console.log('[googleApi] Drive API response status:', res.status, res.statusText);

      if (res.ok) {
        const blob = await res.blob();
        console.log('[googleApi] Drive API blob size:', blob.size, 'type:', blob.type);
        const base64 = await blobToBase64(blob);
        imageCache.set(imageUrl, base64);
        console.log('[googleApi] ✅ Image loaded via Authenticated Drive API');
        return base64;
      } else {
        const errText = await res.text();
        console.error(`[googleApi] Drive API returned ${res.status}: ${errText.slice(0, 300)}`);
      }
    } catch (err) {
      console.error('[googleApi] Attempt 1 (Drive API) threw:', (err as Error).message);
      // Re-throw if it's a token error — no point trying fallbacks
      if ((err as Error).message.includes('google-token') || (err as Error).message.includes('credentials')) {
        throw err;
      }
    }
  }

  // ── Attempt 2: Direct unauthenticated uc?export=view fetch ────────────────
  if (imageUrl.startsWith('http')) {
    let directUrl = imageUrl;
    if (imageUrl.includes('drive.google.com/open?id=')) {
      directUrl = imageUrl.replace('open?id=', 'uc?id=') + '&export=view';
    } else if (imageUrl.includes('drive.google.com/file/d/') && driveFileId) {
      directUrl = `https://drive.google.com/uc?id=${driveFileId}&export=view`;
    }

    console.log('[googleApi] Attempt 2: Direct unauthenticated fetch →', directUrl);
    try {
      const directRes = await fetch(directUrl);
      console.log('[googleApi] Attempt 2 status:', directRes.status, directRes.statusText);
      if (directRes.ok) {
        const blob = await directRes.blob();
        console.log('[googleApi] Attempt 2 blob size:', blob.size);
        if (blob.size > 1000) { // sanity check — Google sometimes returns a tiny HTML redirect
          const base64 = await blobToBase64(blob);
          imageCache.set(imageUrl, base64);
          console.log('[googleApi] ✅ Image loaded via direct unauthenticated fetch');
          return base64;
        } else {
          console.warn('[googleApi] Attempt 2 blob too small (likely HTML redirect), skipping. Size:', blob.size);
        }
      }
    } catch (err) {
      console.warn('[googleApi] Attempt 2 (direct fetch) threw:', (err as Error).message);
    }

    // ── Attempt 3: CORS proxy ───────────────────────────────────────────────
    const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(directUrl)}`;
    console.log('[googleApi] Attempt 3: CORS proxy fetch →', proxyUrl);
    try {
      const proxyRes = await fetch(proxyUrl);
      console.log('[googleApi] Attempt 3 status:', proxyRes.status, proxyRes.statusText);
      if (proxyRes.ok) {
        const blob = await proxyRes.blob();
        console.log('[googleApi] Attempt 3 blob size:', blob.size);
        if (blob.size > 1000) {
          const base64 = await blobToBase64(blob);
          imageCache.set(imageUrl, base64);
          console.log('[googleApi] ✅ Image loaded via CORS proxy');
          return base64;
        } else {
          console.warn('[googleApi] Attempt 3 blob too small (likely HTML), skipping. Size:', blob.size);
        }
      }
    } catch (err) {
      console.warn('[googleApi] Attempt 3 (proxy) threw:', (err as Error).message);
    }
  }

  console.error('[googleApi] ❌ All attempts to load image failed. URL was:', imageUrl);
  throw new Error(`Failed to load image from: ${imageUrl}`);
}

// ── Helper ────────────────────────────────────────────────────────────────────
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror  = reject;
    reader.readAsDataURL(blob);
  });
}
