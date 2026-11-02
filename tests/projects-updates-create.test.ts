import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { err, ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

const updateMock = {
  id: 'upd-uuid',
  health: 'onTrack',
  url: 'https://linear.app/proj/updates/upd-uuid',
};

function setup(opts: { projects?: unknown[]; payload?: unknown } = {}) {
  const createFn = vi.fn().mockResolvedValue(
    opts.payload ?? {
      success: true,
      get projectUpdate() {
        return Promise.resolve(updateMock);
      },
    }
  );
  const client = {
    createProjectUpdate: createFn,
    projects: vi
      .fn()
      .mockResolvedValue({ nodes: opts.projects ?? [{ id: 'proj-uuid', name: 'App' }] }),
  };
  const exitErrorFn = vi.fn();
  vi.doMock('../src/lib/client/index.js', () => ({
    getClient: vi.fn().mockReturnValue(ok(client)),
    getClientWithAuthRetry: vi.fn().mockReturnValue(ok(client)),
    getRequestFn: vi.fn(),
  }));
  vi.doMock('../src/lib/output/table.js', () => ({
    prettyTable: vi.fn((_h: string[], rows: string[][]) => rows.map((r) => r.join(' ')).join('\n')),
    printTable: vi.fn((s: string) => console.log(s)),
  }));
  vi.doMock('../src/lib/runner.js', () => ({ exitError: exitErrorFn }));
  return { createFn, exitErrorFn };
}

function mockUpload(fn: ReturnType<typeof vi.fn>) {
  vi.doMock('../src/lib/upload.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../src/lib/upload.js')>();
    return { ...actual, uploadFile: fn };
  });
}

function uploaded(filename: string, assetUrl = `https://assets/${filename}`) {
  return ok({ assetUrl, uploadUrl: 'https://put', filename });
}

async function run(...args: string[]) {
  const { registerProjects } = await import('../src/features/projects/command.js');
  const { Command } = await import('commander');
  const program = new Command();
  program.exitOverride();
  registerProjects(program);
  await program.parseAsync(['node', 'linear', 'projects', 'updates', 'create', ...args]);
}

function tmpFile(content: string) {
  const p = join(mkdtempSync(join(tmpdir(), 'pu-')), 'body.md');
  writeFileSync(p, content);
  return p;
}

const BODY = 'Version X\n\n* [E-1 T](<u>)';

describe('projects updates create', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    vi.doUnmock('../src/lib/upload.js');
    vi.doUnmock('../src/lib/stdin.js');
    vi.unstubAllEnvs();
    process.exitCode = undefined;
  });

  it('posts body unchanged with default health and prints id/url', async () => {
    const { createFn } = setup();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await run('--project', 'App', '--body', BODY);
    expect(createFn).toHaveBeenCalledTimes(1);
    expect(createFn).toHaveBeenCalledWith({
      projectId: 'proj-uuid',
      body: BODY,
      health: 'onTrack',
    });
    const out = log.mock.calls.flat().join('\n');
    expect(out).toContain('upd-uuid');
    expect(out).toContain(updateMock.url);
  });

  it.each(['onTrack', 'atRisk', 'offTrack'])('forwards health %s', async (health) => {
    const { createFn } = setup();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await run('--project', 'App', '--body', 'b', '--health', health);
    expect(createFn).toHaveBeenCalledWith(expect.objectContaining({ health }));
  });

  it('rejects invalid health listing allowed values', async () => {
    const { createFn, exitErrorFn } = setup();
    await run('--project', 'App', '--body', 'b', '--health', 'bad');
    expect(createFn).not.toHaveBeenCalled();
    const msg = exitErrorFn.mock.calls[0][0].message;
    expect(msg).toContain('onTrack');
    expect(msg).toContain('atRisk');
    expect(msg).toContain('offTrack');
  });

  it('--body - reads stdin', async () => {
    const { createFn } = setup();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.doMock('../src/lib/stdin.js', () => ({
      readStdin: vi.fn().mockResolvedValue('from stdin'),
    }));
    await run('--project', 'App', '--body', '-');
    expect(createFn).toHaveBeenCalledWith(expect.objectContaining({ body: 'from stdin' }));
  });

  it('--body-file posts content exactly', async () => {
    const { createFn } = setup();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await run('--project', 'App', '--body-file', tmpFile('line1\n\nline2\n'));
    expect(createFn).toHaveBeenCalledWith(expect.objectContaining({ body: 'line1\n\nline2\n' }));
  });

  it('errors on unreadable --body-file', async () => {
    const { createFn, exitErrorFn } = setup();
    await run('--project', 'App', '--body-file', '/nonexistent/body.md');
    expect(createFn).not.toHaveBeenCalled();
    expect(exitErrorFn.mock.calls[0][0].message).toContain('/nonexistent/body.md');
  });

  it.each([
    ['both', ['--body', 'x', '--body-file', '/tmp/x']],
    ['neither', []],
    ['empty', ['--body', '']],
    ['whitespace', ['--body', '  \n ']],
  ])('errors on body: %s', async (_n, args) => {
    const { createFn, exitErrorFn } = setup();
    await run('--project', 'App', ...args);
    expect(createFn).not.toHaveBeenCalled();
    expect(exitErrorFn).toHaveBeenCalledTimes(1);
  });

  it('errors on whitespace-only --body-file', async () => {
    const { createFn, exitErrorFn } = setup();
    await run('--project', 'App', '--body-file', tmpFile(' \n'));
    expect(createFn).not.toHaveBeenCalled();
    expect(exitErrorFn).toHaveBeenCalledTimes(1);
  });

  it('missing --project is a commander error', async () => {
    const { createFn } = setup();
    await expect(run('--body', 'b')).rejects.toThrow();
    expect(createFn).not.toHaveBeenCalled();
  });

  it('unresolvable project errors without posting', async () => {
    const { createFn, exitErrorFn } = setup({ projects: [] });
    await run('--project', 'Nope', '--body', 'b');
    expect(createFn).not.toHaveBeenCalled();
    expect(exitErrorFn).toHaveBeenCalledTimes(1);
  });

  it('appends one plain link for a single attachment', async () => {
    const { createFn } = setup();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const upload = vi.fn().mockResolvedValue(uploaded('a.apk', 'https://assets/a-url'));
    mockUpload(upload);
    await run('--project', 'App', '--body', BODY, '--attach', '/tmp/a.apk');
    expect(upload).toHaveBeenCalledWith(expect.anything(), '/tmp/a.apk');
    expect(createFn).toHaveBeenCalledWith(
      expect.objectContaining({ body: `${BODY}\n\n  [a.apk](https://assets/a-url)` })
    );
  });

  it('appends multiple attachments in flag order', async () => {
    const { createFn } = setup();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const upload = vi
      .fn()
      .mockResolvedValueOnce(uploaded('a.apk'))
      .mockResolvedValueOnce(uploaded('b.ipa'));
    mockUpload(upload);
    await run('--project', 'App', '--body', 'b', '--attach', '/x/a.apk', '--attach', '/x/b.ipa');
    expect(upload.mock.calls.map((c) => c[1])).toEqual(['/x/a.apk', '/x/b.ipa']);
    expect(createFn).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'b\n\n  [a.apk](https://assets/a.apk)\n  [b.ipa](https://assets/b.ipa)',
      })
    );
  });

  it('second upload failure names the file and posts nothing', async () => {
    const { createFn, exitErrorFn } = setup();
    const upload = vi
      .fn()
      .mockResolvedValueOnce(uploaded('a.apk'))
      .mockResolvedValueOnce(err(new Error('boom')));
    mockUpload(upload);
    await run('--project', 'App', '--body', 'b', '--attach', '/x/a.apk', '--attach', '/x/b.ipa');
    expect(createFn).not.toHaveBeenCalled();
    expect(exitErrorFn.mock.calls[0][0].message).toContain('b.ipa');
  });

  it('rejecting upload names the file and posts nothing', async () => {
    const { createFn, exitErrorFn } = setup();
    mockUpload(vi.fn().mockRejectedValue(new Error('fetch failed')));
    await run('--project', 'App', '--body', 'b', '--attach', '/x/a.apk');
    expect(createFn).not.toHaveBeenCalled();
    expect(exitErrorFn.mock.calls[0][0].message).toContain('/x/a.apk');
    expect(exitErrorFn.mock.calls[0][0].message).toContain('fetch failed');
  });

  it('nonexistent attach path errors naming the path and posts nothing', async () => {
    const { createFn, exitErrorFn } = setup();
    await run('--project', 'App', '--body', 'b', '--attach', '/nonexistent/z.apk');
    expect(createFn).not.toHaveBeenCalled();
    expect(exitErrorFn.mock.calls[0][0].message).toContain('/nonexistent/z.apk');
  });

  it('image attachment is still a plain link', async () => {
    const { createFn } = setup();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mockUpload(vi.fn().mockResolvedValue(uploaded('x.png', 'https://assets/x-url')));
    await run('--project', 'App', '--body', 'b', '--attach', '/x/x.png');
    expect(createFn).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'b\n\n  [x.png](https://assets/x-url)' })
    );
  });

  it('errors when payload has no projectUpdate', async () => {
    const { exitErrorFn } = setup({ payload: { success: true, projectUpdate: undefined } });
    await run('--project', 'App', '--body', 'b');
    expect(exitErrorFn).toHaveBeenCalledTimes(1);
  });

  it('--plain output', async () => {
    setup();
    vi.stubEnv('LINEAR_OUTPUT', 'plain');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await run('--project', 'App', '--body', 'b');
    const out = log.mock.calls.flat().join('\n');
    expect(out).toContain('ProjectUpdate: upd-uuid');
    expect(out).toContain('health: onTrack');
    expect(out).toContain(`url: ${updateMock.url}`);
  });
});
