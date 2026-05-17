import { SignJWT, importPKCS8 } from 'jose';

let cachedToken: string | null = null;
let tokenExpiry: number = 0;

// These VITE_ vars are used for Sheets operations only (client-side)
const CLIENT_EMAIL = import.meta.env.VITE_GOOGLE_CLIENT_EMAIL as string;
const PRIVATE_KEY_RAW = import.meta.env.VITE_GOOGLE_PRIVATE_KEY as string;
const TOKEN_URI = 'https://oauth2.googleapis.com/token';

export async function getGoogleAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  if (!CLIENT_EMAIL || !PRIVATE_KEY_RAW) {
    throw new Error('Missing VITE_GOOGLE_CLIENT_EMAIL or VITE_GOOGLE_PRIVATE_KEY env vars');
  }

  const privateKey = await importPKCS8(PRIVATE_KEY_RAW.replace(/\\n/g, '\n'), 'RS256');

  const jwt = await new SignJWT({
    iss: CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly',
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
  if (!response.ok) throw new Error(data.error_description || 'Failed to get access token');

  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken!;
}

export async function appendSheetData(url: string, rowValues: any[]) {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) throw new Error('Invalid Google Sheets URL format. Could not extract ID.');
  const spreadsheetId = match[1];

  const token = await getGoogleAccessToken();
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A:Z:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [rowValues] }),
    }
  );

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `Failed to append data (${res.status})`);
  }
  return data;
}

export async function fetchSheetData(url: string) {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) throw new Error('Invalid Google Sheets URL format. Could not extract ID.');
  const spreadsheetId = match[1];

  const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv`;
  const res = await fetch(csvUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch data (${res.status}). Ensure the sheet is public.`);
  }

  const text = await res.text();

  // Parse CSV
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentVal = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          currentVal += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentVal += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentVal);
        currentVal = '';
      } else if (char === '\n' || char === '\r') {
        if (char === '\r' && text[i + 1] === '\n') i++;
        currentRow.push(currentVal);
        rows.push(currentRow);
        currentRow = [];
        currentVal = '';
      } else {
        currentVal += char;
      }
    }
  }
  if (currentRow.length > 0 || currentVal !== '') {
    currentRow.push(currentVal);
    rows.push(currentRow);
  }

  return rows;
}

// ── Image loading via server-side proxy ────────────────────────────────────────

const imageCache = new Map<string, string>();

function extractDriveFileId(imageUrl: string): string | null {
  try {
    const parsedUrl = new URL(imageUrl);
    if (!parsedUrl.hostname.includes('drive.google.com')) return null;
    if (imageUrl.includes('open?id=') || imageUrl.includes('uc?id=')) {
      return parsedUrl.searchParams.get('id');
    }
    if (imageUrl.includes('/file/d/')) {
      const match = imageUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      return match ? match[1] : null;
    }
  } catch {
    // not a valid URL — maybe it's a bare file ID
  }
  // Treat plain strings that look like Drive IDs as file IDs directly
  if (/^[a-zA-Z0-9_-]{25,}$/.test(imageUrl)) return imageUrl;
  return null;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function fetchDriveImageAsBase64(imageUrl: string): Promise<string> {
  if (!imageUrl) throw new Error('No image URL provided');
  if (imageCache.has(imageUrl)) return imageCache.get(imageUrl)!;

  const driveFileId = extractDriveFileId(imageUrl);
  if (!driveFileId) throw new Error(`Could not extract Drive file ID from: ${imageUrl}`);

  // Route image fetching through the secure server-side proxy
  // Works in production (Vercel) and local dev with `vercel dev`
  const res = await fetch(`/api/drive-image?id=${driveFileId}`);

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[fetchDriveImage] API proxy error ${res.status}:`, errText);
    throw new Error(`Failed to load image (${res.status})`);
  }

  const base64 = await blobToBase64(await res.blob());
  imageCache.set(imageUrl, base64);
  return base64;
}
