import { SignJWT, importPKCS8 } from 'jose';

let cachedToken: string | null = null;
let tokenExpiry: number = 0;

export async function getGoogleAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }
  
  // 1. Try to fetch the token securely from the Vercel API route first
  try {
    const response = await fetch('/api/google-token');
    if (response.ok) {
      const data = await response.json();
      if (data.access_token) {
        cachedToken = data.access_token;
        tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
        return cachedToken;
      }
    }
  } catch (err) {
    console.warn("Secure API token route unavailable, falling back to local VITE_ variables:", err);
  }

  // 2. Fallback to client-side JWT generation (convenient for local npm run dev testing)
  const privateKeyStr = import.meta.env.VITE_GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const clientEmail = import.meta.env.VITE_GOOGLE_CLIENT_EMAIL;
  const tokenUri = import.meta.env.VITE_GOOGLE_TOKEN_URI || "https://oauth2.googleapis.com/token";

  if (!privateKeyStr || !clientEmail) {
    throw new Error("Missing Google Service Account credentials in environment variables.");
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
  if (!response.ok) throw new Error(data.error_description || 'Failed to get access token');
  
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

export async function appendSheetData(url: string, rowValues: any[]) {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) throw new Error("Invalid Google Sheets URL format. Could not extract ID.");
  const spreadsheetId = match[1];

  const token = await getGoogleAccessToken();
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A:Z:append?valueInputOption=USER_ENTERED`, {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      values: [rowValues]
    })
  });
  
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `Failed to append data (${res.status})`);
  }
  
  return data;
}

export async function fetchSheetData(url: string) {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) throw new Error("Invalid Google Sheets URL format. Could not extract ID.");
  const spreadsheetId = match[1];

  // Fetch as CSV from public Google Sheet
  const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv`;
  const res = await fetch(csvUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch data (${res.status}). Ensure the sheet is public.`);
  }
  
  const text = await res.text();
  
  // Parse CSV (simple parser for this fallback)
  const rows = [];
  let currentRow = [];
  let currentVal = '';
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i+1] === '"') {
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
        if (char === '\r' && text[i+1] === '\n') i++;
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

const imageCache = new Map<string, string>();

export async function fetchDriveImageAsBase64(imageUrl: string): Promise<string> {
  if (!imageUrl) throw new Error("No image URL provided");
  if (imageCache.has(imageUrl)) return imageCache.get(imageUrl)!;

  let driveFileId: string | null = null;
  try {
    const parsedUrl = new URL(imageUrl);
    if (parsedUrl.hostname.includes('drive.google.com')) {
      if (imageUrl.includes('open?id=')) {
        driveFileId = parsedUrl.searchParams.get('id');
      } else if (imageUrl.includes('uc?id=')) {
        driveFileId = parsedUrl.searchParams.get('id');
      } else if (imageUrl.includes('/file/d/')) {
        const match = imageUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (match) driveFileId = match[1];
      }
    }
  } catch (e) {
    // ignore
  }

  try {
    if (driveFileId) {
      const token = await getGoogleAccessToken();
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const blob = await res.blob();
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        imageCache.set(imageUrl, base64);
        return base64;
      }
    }
  } catch(err) {
    console.warn("Drive fetch failed, trying proxy instead", err);
  }

  // Fallback to direct fetch first, then proxy
  if (imageUrl.startsWith('http')) {
      let finalUrl = imageUrl;
      if (imageUrl.includes('drive.google.com/open?id=')) {
        finalUrl = imageUrl.replace('open?id=', 'uc?id=');
      } else if (imageUrl.includes('drive.google.com/file/d/')) {
         const match = imageUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
         if (match) finalUrl = `https://drive.google.com/uc?id=${match[1]}`;
      }
      
      try {
        const directRes = await fetch(finalUrl);
        if (directRes.ok) {
           const blob = await directRes.blob();
           const base64 = await new Promise<string>((resolve, reject) => {
             const reader = new FileReader();
             reader.onloadend = () => resolve(reader.result as string);
             reader.onerror = reject;
             reader.readAsDataURL(blob);
           });
           imageCache.set(imageUrl, base64);
           return base64;
        }
      } catch (err) {
        // Direct fetch failed (likely CORS), proceed to proxy
      }

      try {
        const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(finalUrl)}`;
        const fallbackRes = await fetch(proxyUrl);
        if (fallbackRes.ok) {
           const blob = await fallbackRes.blob();
           const base64 = await new Promise<string>((resolve, reject) => {
             const reader = new FileReader();
             reader.onloadend = () => resolve(reader.result as string);
             reader.onerror = reject;
             reader.readAsDataURL(blob);
           });
           imageCache.set(imageUrl, base64);
           return base64;
        }
      } catch (err) {
        console.warn("Proxy fetch failed", err);
      }
  }
  
  throw new Error("Failed to load image");
}
