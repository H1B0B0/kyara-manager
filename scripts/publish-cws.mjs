#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const zipPath = process.argv[2] || 'dist/kyara-manager-cws.zip';
const extensionId = process.env.CHROME_EXTENSION_ID;
const clientId = process.env.CHROME_CLIENT_ID;
const clientSecret = process.env.CHROME_CLIENT_SECRET;
const refreshToken = process.env.CHROME_REFRESH_TOKEN;

if (!extensionId || !clientId || !clientSecret || !refreshToken) {
  console.error('❌ Variables CWS manquantes (CHROME_EXTENSION_ID, CHROME_CLIENT_ID, CHROME_CLIENT_SECRET, CHROME_REFRESH_TOKEN).');
  process.exit(1);
}

const resolvedZip = path.resolve(zipPath);
if (!fs.existsSync(resolvedZip)) {
  console.error(`❌ Fichier introuvable : ${resolvedZip}`);
  process.exit(1);
}

async function getAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    }).toString()
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok || !data.access_token) {
    console.error(`❌ Échec OAuth Google (HTTP ${res.status}) :`, JSON.stringify(data, null, 2));
    process.exit(1);
  }
  return data.access_token;
}

async function uploadPackage(token) {
  const zipBuffer = fs.readFileSync(resolvedZip);
  const url = `https://www.googleapis.com/upload/chromewebstore/v1.1/items/${encodeURIComponent(extensionId)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-goog-api-version': '2',
      'Content-Type': 'application/zip'
    },
    body: zipBuffer
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  console.log(`📦 Réponse Upload CWS (HTTP ${res.status}) :`, JSON.stringify(data, null, 2));
  if (!res.ok || data.uploadState === 'FAILURE') {
    const itemErrors = Array.isArray(data?.itemError) ? data.itemError : [];
    const isPendingReview = itemErrors.some((e) =>
      /in review|pending review|en cours d'examen|PKG_INVALID_UPDATE/i.test(`${e?.error_code || ''} ${e?.error_detail || ''}`)
    );
    if (isPendingReview) {
      console.warn('⚠️ Une version précédente (v2.3.2) est déjà en cours d’examen sur le Chrome Web Store. Annule l’examen en cours dans le dashboard CWS pour soumettre ce nouveau build.');
    }
    process.exit(1);
  }
  return data;
}

async function publishPackage(token) {
  const url = `https://www.googleapis.com/chromewebstore/v1.1/items/${encodeURIComponent(extensionId)}/publish`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-goog-api-version': '2',
      'Content-Length': '0'
    }
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  console.log(`🚀 Réponse Publish CWS (HTTP ${res.status}) :`, JSON.stringify(data, null, 2));
  if (!res.ok) {
    console.error('❌ Échec de la publication sur le Chrome Web Store. Le brouillon est bien uploadé sur le dashboard CWS.');
    process.exit(1);
  }
  return data;
}

(async () => {
  console.log('🔑 Authentification OAuth Chrome Web Store…');
  const token = await getAccessToken();
  console.log(`📤 Upload de ${path.basename(resolvedZip)} vers le Chrome Web Store…`);
  await uploadPackage(token);
  console.log('🚀 Soumission pour publication (publish)…');
  await publishPackage(token);
  console.log('✅ Extension uploadée et soumise avec succès sur le Chrome Web Store !');
})().catch((err) => {
  console.error('❌ Erreur inattendue CWS :', err);
  process.exit(1);
});
