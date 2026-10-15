import type { OAuthProvider, ProviderIdentity, ProviderTokenSet } from '@guildos/provider-auth';

const issuer = 'https://auth.openai.com';
const authorizeEndpoint = `${issuer}/api/accounts/authorize`;
const tokenEndpoint = `${issuer}/api/accounts/oauth/token`;
const resource = 'https://api.openai.com/v1';
const identityScopes = ['openid', 'profile', 'email'];

export const openaiProvider: OAuthProvider = {
  id: 'openai',
  displayName: 'OpenAI',
  configured: () => Boolean(process.env.OPENAI_CLIENT_ID),
  begin({ redirectUri, state, nonce, codeChallenge }) {
    const clientId = process.env.OPENAI_CLIENT_ID;
    if (!clientId) throw new Error('OpenAI Sign in with ChatGPT has not been configured.');
    const scopes = [...identityScopes];
    if (process.env.OPENAI_CHATGPT_PLAN_USAGE === 'enabled') scopes.push('offline_access', 'resource.invoke', 'chatgpt.tokens.use.direct');
    const url = new URL(authorizeEndpoint);
    const params: Record<string, string> = {
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: scopes.join(' '),
      state,
      nonce,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
    };
    if (process.env.OPENAI_CHATGPT_PLAN_USAGE === 'enabled') params.resource = resource;
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return url;
  },
  async exchange({ code, redirectUri, codeVerifier, nonce }): Promise<ProviderTokenSet> {
    const clientId = process.env.OPENAI_CLIENT_ID;
    if (!clientId) throw new Error('OpenAI Sign in with ChatGPT has not been configured.');
    const body = new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, code, code_verifier: codeVerifier, redirect_uri: redirectUri });
    if (process.env.OPENAI_CHATGPT_PLAN_USAGE === 'enabled') body.set('resource', resource);
    const response = await fetch(tokenEndpoint, tokenRequest(body));
    if (!response.ok) throw new Error('OpenAI authorization could not be completed. Start a new sign-in.');
    const token = await response.json() as Record<string, unknown>;
    if (typeof token.access_token !== 'string' || typeof token.id_token !== 'string' || !Number.isFinite(token.expires_in)) throw new Error('OpenAI returned an invalid token response.');
    const identity = await validateIdToken(token.id_token, clientId, nonce);
    const scopes = typeof token.scope === 'string' ? token.scope.split(/\s+/).filter(Boolean) : [];
    return { accessToken: token.access_token, refreshToken: typeof token.refresh_token === 'string' ? token.refresh_token : null, idToken: token.id_token, tokenType: typeof token.token_type === 'string' ? token.token_type : 'Bearer', expiresIn: Number(token.expires_in), scopes, identity };
  },
  async refresh({ refreshToken, expectedSubject }): Promise<ProviderTokenSet> {
    const clientId = process.env.OPENAI_CLIENT_ID;
    if (!clientId) throw new Error('OpenAI Sign in with ChatGPT has not been configured.');
    const body = new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, refresh_token: refreshToken });
    if (process.env.OPENAI_CHATGPT_PLAN_USAGE === 'enabled') body.set('resource', resource);
    const response = await fetch(tokenEndpoint, tokenRequest(body));
    if (!response.ok) throw new Error('OpenAI connection expired. Reconnect the account.');
    const token = await response.json() as Record<string, unknown>;
    if (typeof token.access_token !== 'string' || typeof token.id_token !== 'string' || !Number.isFinite(token.expires_in)) throw new Error('OpenAI returned an invalid refresh response.');
    const identity = await validateIdToken(token.id_token, clientId);
    if (identity.subject !== expectedSubject) throw new Error('OpenAI refreshed a different account. Reconnect before continuing.');
    const scopes = typeof token.scope === 'string' ? token.scope.split(/\s+/).filter(Boolean) : [];
    return { accessToken: token.access_token, refreshToken: typeof token.refresh_token === 'string' ? token.refresh_token : refreshToken, idToken: token.id_token, tokenType: typeof token.token_type === 'string' ? token.token_type : 'Bearer', expiresIn: Number(token.expires_in), scopes, identity };
  },
};

async function validateIdToken(token: string, clientId: string, expectedNonce?: string): Promise<ProviderIdentity> {
  const [encodedHeader, encodedClaims, encodedSignature, ...extra] = token.split('.');
  if (!encodedHeader || !encodedClaims || !encodedSignature || extra.length) throw new Error('OpenAI returned an invalid identity token.');
  const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;
  const header = decode(encodedHeader);
  const claims = decode(encodedClaims);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('OpenAI returned an unsupported identity token.');
  const jwksResponse = await fetch(`${issuer}/.well-known/jwks.json`, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
  if (!jwksResponse.ok) throw new Error('OpenAI identity validation is temporarily unavailable.');
  const jwks = await jwksResponse.json() as { keys?: JsonWebKeyWithKid[] };
  const jwk = jwks.keys?.find(item => item.kid === header.kid && item.kty === 'RSA');
  if (!jwk) throw new Error('OpenAI returned an unrecognized signing key.');
  const publicKey = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const signed = new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`);
  const signature = new Uint8Array(Buffer.from(encodedSignature, 'base64url'));
  if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, signature, signed)) throw new Error('OpenAI identity token signature did not validate.');
  const now = Math.floor(Date.now() / 1000);
  const audience = claims.aud;
  const audienceValid = audience === clientId || Array.isArray(audience) && audience.includes(clientId) && claims.azp === clientId;
  if (claims.iss !== issuer || !audienceValid || typeof claims.sub !== 'string' || typeof claims.exp !== 'number' || claims.exp <= now || typeof claims.iat === 'number' && claims.iat > now + 60 || expectedNonce && claims.nonce !== expectedNonce) throw new Error('OpenAI identity token claims did not validate.');
  if (claims.email_verified !== true || typeof claims.email !== 'string') throw new Error('OpenAI did not verify the connected account email.');
  return { subject: claims.sub, email: claims.email, name: typeof claims.name === 'string' ? claims.name : null, picture: typeof claims.picture === 'string' ? claims.picture : null };
}

function tokenRequest(body: URLSearchParams): RequestInit {
  const secret = process.env.OPENAI_CLIENT_SECRET;
  const method = process.env.OPENAI_TOKEN_AUTH_METHOD || 'none';
  const headers = new Headers({ 'Content-Type': 'application/x-www-form-urlencoded' });
  if (method === 'client_secret_basic') {
    if (!secret) throw new Error('OpenAI client secret is not configured.');
    const credentials = Buffer.from(`${process.env.OPENAI_CLIENT_ID}:${secret}`).toString('base64');
    headers.set('Authorization', `Basic ${credentials}`);
  } else if (method === 'client_secret_post') {
    if (!secret) throw new Error('OpenAI client secret is not configured.');
    body.set('client_secret', secret);
  } else if (method !== 'none') {
    throw new Error('Unsupported OpenAI token endpoint authentication method.');
  }
  return { method: 'POST', headers, body, cache: 'no-store', signal: AbortSignal.timeout(15000) };
}

type JsonWebKeyWithKid = JsonWebKey & { kid?: string };
