import crypto from 'node:crypto';
import http from 'node:http';
import { ResultAsync } from 'neverthrow';
import open from 'open';
import {
  CALLBACK_PATH,
  CANDIDATE_PORTS,
  getClientId,
  LINEAR_AUTHORIZE_URL,
  LINEAR_TOKEN_URL,
} from '../../lib/config.js';
import { AuthError, type CliError, NetworkError, toError } from '../../lib/errors.js';
import { writeSession } from './session.js';

export function generateCodeVerifier(): string {
  // 96 random bytes → 128 base64url chars (within the required 43–128 char range)
  return crypto.randomBytes(96).toString('base64url');
}

export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function tryBindPort(port: number): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(port, () => resolve(server));
    server.on('error', reject);
  });
}

export async function bindFirstAvailablePort(
  ports: readonly number[]
): Promise<[http.Server, number]> {
  for (const port of ports) {
    const result = await ResultAsync.fromPromise(tryBindPort(port), toError);
    if (result.isOk()) return [result.value, port];
    // try next candidate
  }
  throw new AuthError(`Could not bind to any candidate port: ${ports.join(', ')}`);
}

// PKCE flow: no client secret required — the code_verifier proves the initiator
interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

async function exchangeCodeRaw(
  code: string,
  redirectUri: string,
  clientId: string,
  codeVerifier: string
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: codeVerifier,
  });
  const response = await fetch(LINEAR_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed: ${text}`);
  }
  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

export function startOAuthFlow(): ResultAsync<void, CliError> {
  const clientId = getClientId();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = crypto.randomBytes(16).toString('hex');

  // Timeout handle lives outside the inner Promise so both paths can clear it
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  const flowPromise: Promise<void> = bindFirstAvailablePort(CANDIDATE_PORTS).then(
    ([server, port]) => {
      const redirectUri = `http://localhost:${port}${CALLBACK_PATH}`;

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'read,write',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        prompt: 'consent',
      });
      const authorizeUrl = `${LINEAR_AUTHORIZE_URL}?${params.toString()}`;

      const codePromise = new Promise<string>((resolve, reject) => {
        const settle = (fn: () => void): void => {
          clearTimeout(timeoutHandle);
          fn();
        };

        server.on('request', (req, res) => {
          if (!req.url?.startsWith(CALLBACK_PATH)) {
            res.writeHead(404);
            res.end();
            return;
          }
          const url = new URL(req.url, `http://localhost:${port}`);
          const callbackCode = url.searchParams.get('code');
          const callbackState = url.searchParams.get('state');

          if (callbackState !== state) {
            res.writeHead(400);
            res.end('State mismatch.');
            server.close();
            settle(() => reject(new Error('OAuth state mismatch')));
            return;
          }
          if (!callbackCode) {
            res.writeHead(400);
            res.end('No authorization code.');
            server.close();
            settle(() => reject(new Error('No authorization code')));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body><h1>Authorized! You can close this tab.</h1></body></html>');
          server.close();
          settle(() => resolve(callbackCode));
        });

        server.on('error', (e) => settle(() => reject(e)));

        open(authorizeUrl).catch(() => {
          console.log(`Open this URL in your browser:\n${authorizeUrl}`);
        });

        timeoutHandle = setTimeout(
          () => {
            server.close();
            reject(new Error('OAuth timeout: no callback received within 5 minutes'));
          },
          5 * 60 * 1000
        );
      });

      return codePromise.then(async (code) => {
        const tokens = await exchangeCodeRaw(code, redirectUri, clientId, codeVerifier);
        const writeResult = writeSession({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: Date.now() + tokens.expiresIn * 1000,
        });
        if (writeResult.isErr()) {
          throw writeResult.error;
        }
      });
    }
  );

  return ResultAsync.fromPromise(
    flowPromise,
    (e) => new AuthError(e instanceof Error ? e.message : String(e))
  );
}

export function refreshAccessToken(
  refreshToken: string
): ResultAsync<{ accessToken: string; refreshToken: string; expiresAt: number }, CliError> {
  const clientId = getClientId();

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  });

  return ResultAsync.fromPromise(
    fetch(LINEAR_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }).then(async (response) => {
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Token refresh failed: ${text}`);
      }
      const data = (await response.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
      };
      const expiresAt = Date.now() + data.expires_in * 1000;
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? refreshToken,
        expiresAt,
      };
    }),
    (e) => new NetworkError(e instanceof Error ? e.message : String(e))
  );
}
