import pc from 'picocolors';
import { version as pkgVersion } from '../../package.json';

const PKG_NAME = '@harikidev/linear-cli';
const REGISTRY_URL = `https://registry.npmjs.org/${PKG_NAME}/latest`;
const FETCH_TIMEOUT_MS = 5_000;

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

  try {
    const res = await fetch(REGISTRY_URL, { signal: controller.signal });

    if (!res.ok) return;

    const data = (await res.json()) as { version?: string };
    const latest = data.version;
    if (!latest) return;

    if (isNewerVersion(pkgVersion, latest)) {
      console.log(pc.yellow(`Update available: ${pkgVersion} → ${latest}`));
    }
  } catch {
    // Swallow: network failure, timeout, parse error — no notice, no error
  } finally {
    clearTimeout(timer);
  }
}
