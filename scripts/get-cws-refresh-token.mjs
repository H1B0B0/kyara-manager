#!/usr/bin/env node
import http from 'node:http';
import { exec } from 'node:child_process';

const clientId = process.argv[2] || process.env.CHROME_CLIENT_ID;
const clientSecret = process.argv[3] || process.env.CHROME_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.log(`
══════════════════════════════════════════════════════════════════
🔑 Kyara Manager — Générateur de Refresh Token Chrome Web Store
══════════════════════════════════════════════════════════════════

Usage :
  node scripts/get-cws-refresh-token.mjs <CLIENT_ID> <CLIENT_SECRET>

1. Va sur Google Cloud Console (https://console.cloud.google.com/)
2. Active l'API "Chrome Web Store API"
3. Crée un "Identifiant OAuth 2.0" de type "Application Web"
   avec comme URI de redirection autorisée :
   http://localhost:3333/oauth2callback
4. Relance cette commande avec ton Client ID et Client Secret !
`);
  process.exit(1);
}

const PORT = 3333;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;
const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';

const authUrl =
  `https://accounts.google.com/o/oauth2/auth?` +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent'
  }).toString();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== '/oauth2callback') {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  const code = url.searchParams.get('code');
  if (!code) {
    res.writeHead(400);
    res.end('Code d\'autorisation manquant');
    return;
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI
      }).toString()
    });

    const data = await tokenRes.json();
    if (!tokenRes.ok || !data.refresh_token) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h1>❌ Erreur</h1><pre>${JSON.stringify(data, null, 2)}</pre>`);
      console.error('Erreur échange token:', data);
      process.exit(1);
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <body style="font-family:system-ui; background:#0e0d12; color:#edeae4; padding:40px; text-align:center;">
        <h1 style="color:#3fbf7f;">✅ Token récupéré avec succès !</h1>
        <p>Tu peux fermer cet onglet et retourner dans ton terminal.</p>
      </body>
    `);

    console.log(`
══════════════════════════════════════════════════════════════════
🎉 REFRESH TOKEN OBTENU AVEC SUCCÈS !
══════════════════════════════════════════════════════════════════

Voici ton CHROME_REFRESH_TOKEN :

${data.refresh_token}

Ajoute-le dans les GitHub Secrets de ton repo :
Settings > Secrets and variables > Actions > New repository secret
Nom : CHROME_REFRESH_TOKEN
Valeur : (colle le token ci-dessus)
══════════════════════════════════════════════════════════════════
`);
    setTimeout(() => {
      server.close();
      process.exit(0);
    }, 1000);
  } catch (err) {
    res.writeHead(500);
    res.end(`Erreur: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`
Ouverture de la page de consentement Google dans ton navigateur...
Si la page ne s'ouvre pas automatiquement, clique sur ce lien :
${authUrl}
`);
  const openCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${openCmd} "${authUrl}"`);
});
