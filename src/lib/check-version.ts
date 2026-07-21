import { ResultAsync } from 'neverthrow';
import pc from 'picocolors';
import { version as pkgVersion } from '../../package.json';
import { toError } from './errors.js';

const PKG_NAME = '@harikidev/linear-cli';
const REGISTRY_URL = `https://registry.npmjs.org/${PKG_NAME}/latest`;
// best-effort notice — bound worst-case delay, don't make an instant command feel slow
const FETCH_TIMEOUT_MS = 1_500;

/**
 * Compare two semver strings. Returns true when `latest` is strictly newer
 * than `installed` (major.minor.patch comparison, with pre-release awareness:
 * release > pre-release when core segments are equal).
 */
export function isNewerVersion(installed: string, latest: string): boolean {
  const core = (v: string) => v.replace(/[-+].*$/, '');
  const hasPre = (v: string) => /-/.test(v.replace(/\+.*$/, ''));

  const a = core(installed).split('.').map(Number);
  const b = core(latest).split('.').map(Number);

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (right > left) return true;
    if (right < left) return false;
  }

  // major.minor.patch equal — per semver a release > pre-release
  return hasPre(installed) && !hasPre(latest);
}

interface RegistryResponse {
  version?: string;
}

/**
 * Fetch the latest published version from the npm registry.
 * Ok(undefined) — not an error — on non-ok response or missing version field.
 * Err only for genuine fetch/parse failures (network error, abort/timeout, invalid JSON).
 */
export function fetchLatestVersion(signal: AbortSignal): ResultAsync<string | undefined, Error> {
  return ResultAsync.fromPromise(
    fetch(REGISTRY_URL, { signal }).then(async (res) => {
      if (!res.ok) return undefined;
      const data = (await res.json()) as RegistryResponse;
      return data.version;
    }),
    toError
  );
}

/**
 * Fetch the latest published version from npm and print a one-line notice
 * if a newer version is available. Silently swallows all errors (network
 * failure, timeout, parse error). Respects `--plain` mode — no output when
 * `opts.plain` is true.
 */
export async function notifyUpdate(opts: { plain?: boolean } = {}): Promise<void> {
  if (opts.plain) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  const result = await fetchLatestVersion(controller.signal);
  clearTimeout(timer);

  result.match(
    (latest) => {
      if (latest && isNewerVersion(pkgVersion, latest)) {
        console.log(pc.yellow(`Update available: ${pkgVersion} → ${latest}`));
      }
    },
    () => {
      // Swallow: network failure, timeout, parse error — no notice, no error
    }
  );
}
