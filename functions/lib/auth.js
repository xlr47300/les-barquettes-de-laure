
/**
 * Les Barquettes de Laure
 * Authentification de l'espace de gestion
 *
 * Cloudflare Access :
 * - Plusieurs administrateurs autorisés
 * - Vérification de la signature JWT
 * - Vérification AUD, issuer et expiration
 * - Refus si la configuration est incomplète
 */

const response = (message, status) => new Response(message, {
  status,
  headers: {
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=utf-8'
  }
});

function decodeBase64Url(text) {
  const padded = text
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(text.length / 4) * 4, '=');

  const binary = atob(padded);
  return Uint8Array.from(binary, ch => ch.charCodeAt(0));
}

function jsonPart(text) {
  return JSON.parse(
    new TextDecoder().decode(decodeBase64Url(text))
  );
}

export async function checkAdmin(request, env) {

  const team = String(env.ACCESS_TEAM_DOMAIN || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');

  const audience = String(env.ACCESS_AUD || '').trim();

  // Plusieurs administrateurs, séparés par des virgules
  const allowedEmails = String(env.ADMIN_EMAILS || '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);

  // Vérification de la configuration
  if (
    !team ||
    !audience ||
    !allowedEmails.length ||
    !/^[a-z0-9.-]+\.cloudflareaccess\.com$/.test(team)
  ) {
    throw Object.assign(
      new Error('Accès privé non configuré'),
      { status: 503 }
    );
  }

  // Récupération du jeton Cloudflare Access
  const token = request.headers.get('Cf-Access-Jwt-Assertion') ||
    (request.headers.get('Cookie') || '')
      .match(/(?:^|;\s*)CF_Authorization=([^;]+)/)?.[1];

  if (!token) {
    throw Object.assign(
      new Error('Connexion Cloudflare Access requise'),
      { status: 401 }
    );
  }

  const chunks = token.split('.');

  if (chunks.length !== 3) {
    throw Object.assign(
      new Error('Jeton invalide'),
      { status: 403 }
    );
  }

  const header = jsonPart(chunks[0]);
  const claims = jsonPart(chunks[1]);

  if (header.alg !== 'RS256' || !header.kid) {
    throw Object.assign(
      new Error('Signature invalide'),
      { status: 403 }
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const issuer = `https://${team}`;
  const email = String(claims.email || '').trim().toLowerCase();

  // Contrôle des droits et de la validité du jeton
  if (
    claims.iss !== issuer ||
    ![claims.aud].flat().includes(audience) ||
    !Number.isFinite(claims.exp) ||
    claims.exp <= now ||
    (claims.nbf && claims.nbf > now + 30) ||
    !allowedEmails.includes(email)
  ) {
    throw Object.assign(
      new Error('Accès non autorisé'),
      { status: 403 }
    );
  }

  // Récupération des clés publiques Cloudflare
  const keysResponse = await fetch(
    `${issuer}/cdn-cgi/access/certs`,
    {
      cf: {
        cacheTtl: 300,
        cacheEverything: true
      }
    }
  );

  if (!keysResponse.ok) {
    throw Object.assign(
      new Error('Validation Access indisponible'),
      { status: 503 }
    );
  }

  const certs = await keysResponse.json();

  const jwk = (certs.keys || []).find(
    key => key.kid === header.kid && key.kty === 'RSA'
  );

  if (!jwk) {
    throw Object.assign(
      new Error('Clé Access absente'),
      { status: 403 }
    );
  }

  // Vérification cryptographique de la signature
  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256'
    },
    false,
    ['verify']
  );

  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    decodeBase64Url(chunks[2]),
    new TextEncoder().encode(`${chunks[0]}.${chunks[1]}`)
  );

  if (!valid) {
    throw Object.assign(
      new Error('Signature non vérifiée'),
      { status: 403 }
    );
  }

  return { email };
}

export function authError(error) {
  return response(
    error.status ? error.message : 'Service temporairement indisponible',
    error.status || 503
  );
}
