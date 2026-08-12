import { execFileSync, execSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Both scheduler backends shell out via node:child_process — mock it entirely.
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
  execFileSync: vi.fn(),
}));

import { CronBackend, KEEPALIVE_CRON_MARKER } from '../scheduler/cron.js';
import { getScheduler } from '../scheduler/index.js';
import { TaskSchedulerBackend } from '../scheduler/taskscheduler.js';

describe('CronBackend', () => {
  const mockExecSync = vi.mocked(execSync);
  let crontab: string | null; // null → `crontab -l` fails (no crontab)
  const written: string[] = [];

  beforeEach(() => {
    crontab = null;
    written.length = 0;
    mockExecSync.mockImplementation(((command: string, options?: { input?: string }) => {
      if (command === 'crontab -l') {
        if (crontab === null) throw new Error('no crontab for user');
        return crontab;
      }
      if (command === 'crontab -') {
        written.push(options?.input ?? '');
        return '';
      }
      throw new Error(`unexpected command: ${command}`);
    }) as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('install appends the marker + schedule line when no crontab exists', () => {
    const result = new CronBackend().install('/usr/bin/node', '/usr/local/bin/linear');

    expect(result.isOk()).toBe(true);
    expect(written).toHaveLength(1);
    const content = written[0];
    expect(content).toContain(KEEPALIVE_CRON_MARKER);
    expect(content).toContain(
      '*/15 * * * * "/usr/bin/node" "/usr/local/bin/linear" keepalive run --quiet >>'
    );
    expect(content).toContain('keepalive.log" 2>&1');
  });

  it('install is a no-op when the marker is already present', () => {
    crontab = `# existing\n${KEEPALIVE_CRON_MARKER}\n*/15 * * * * /node /cli keepalive run --quiet >> /log 2>&1\n`;

    const result = new CronBackend().install('/node', '/cli');

    expect(result.isOk()).toBe(true);
    expect(written).toHaveLength(0);
  });

  it('uninstall strips the marker + schedule line, keeping other crontab content', () => {
    crontab = [
      '# existing job',
      '0 0 * * * /usr/bin/backup',
      '',
      KEEPALIVE_CRON_MARKER,
      '*/15 * * * * /node /cli keepalive run --quiet >> /log 2>&1',
      '',
    ].join('\n');

    const result = new CronBackend().uninstall();

    expect(result.isOk()).toBe(true);
    expect(written).toHaveLength(1);
    const content = written[0];
    expect(content).not.toContain(KEEPALIVE_CRON_MARKER);
    expect(content).not.toContain('keepalive run --quiet');
    expect(content).toContain('# existing job');
    expect(content).toContain('/usr/bin/backup');
  });

  it('uninstall is a no-op when not installed', () => {
    const result = new CronBackend().uninstall();

    expect(result.isOk()).toBe(true);
    expect(written).toHaveLength(0);
  });

  it('isInstalled: false without crontab, true with marker, false without marker', () => {
    expect(new CronBackend().isInstalled()._unsafeUnwrap()).toBe(false);

    crontab = `# something else\n0 0 * * * /usr/bin/other\n`;
    expect(new CronBackend().isInstalled()._unsafeUnwrap()).toBe(false);

    crontab = `${KEEPALIVE_CRON_MARKER}\n*/15 * * * * /node /cli keepalive run --quiet >> /log 2>&1\n`;
    expect(new CronBackend().isInstalled()._unsafeUnwrap()).toBe(true);
  });

  it('status reports the schedule line when installed, not installed otherwise', () => {
    expect(new CronBackend().status()._unsafeUnwrap()).toEqual({
      installed: false,
      detail: 'not installed',
    });

    crontab = `${KEEPALIVE_CRON_MARKER}\n*/15 * * * * /node /cli keepalive run --quiet >> /log 2>&1\n`;
    const s = new CronBackend().status()._unsafeUnwrap();
    expect(s.installed).toBe(true);
    expect(s.detail).toContain('keepalive run --quiet');
  });
});

describe('TaskSchedulerBackend (win32)', () => {
  const mockExecFileSync = vi.mocked(execFileSync);

  beforeEach(() => {
    mockExecFileSync.mockImplementation(((exe: string, args: string[]) => {
      if (exe !== 'schtasks.exe') throw new Error(`unexpected exe: ${exe}`);
      if (args.includes('/query')) throw new Error('ERROR: The system cannot find the file');
      if (args.includes('/create')) return 'SUCCESS: The scheduled task has been created';
      if (args.includes('/delete')) return 'SUCCESS: The scheduled task was deleted';
      return '';
    }) as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('install creates the task with quoted paths and redirect', () => {
    const result = new TaskSchedulerBackend().install('/node', '/cli/index.cjs');

    expect(result.isOk()).toBe(true);
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'schtasks.exe',
      expect.arrayContaining([
        '/create',
        '/tn',
        'linear-cli-keepalive',
        '/sc',
        'minute',
        '/mo',
        '15',
      ]),
      expect.objectContaining({ encoding: 'utf-8' })
    );
    const args = mockExecFileSync.mock.calls[0][1] as string[];
    const taskArg = args[args.indexOf('/tr') + 1];
    expect(taskArg).toContain('"/cli/index.cjs" keepalive run --quiet >>');
    expect(taskArg).toContain('keepalive.log');
  });

  it('uninstall deletes the task', () => {
    const result = new TaskSchedulerBackend().uninstall();

    expect(result.isOk()).toBe(true);
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'schtasks.exe',
      expect.arrayContaining(['/delete', '/tn', 'linear-cli-keepalive', '/f']),
      expect.any(Object)
    );
  });

  it('isInstalled queries the task', () => {
    expect(new TaskSchedulerBackend().isInstalled()._unsafeUnwrap()).toBe(false);

    mockExecFileSync.mockImplementation(((_exe: string, args: string[]) => {
      if (args.includes('/query')) return 'INFO: task exists';
      return '';
    }) as never);
    expect(new TaskSchedulerBackend().isInstalled()._unsafeUnwrap()).toBe(true);
  });

  it('status reports not installed when the query fails', () => {
    expect(new TaskSchedulerBackend().status()._unsafeUnwrap()).toEqual({
      installed: false,
      detail: 'not installed',
    });
  });
});

describe('getScheduler dispatch', () => {
  const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');

  afterEach(() => {
    if (platformDescriptor) {
      Object.defineProperty(process, 'platform', platformDescriptor);
    }
  });

  it('returns CronBackend on non-Windows platforms', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    expect(getScheduler()).toBeInstanceOf(CronBackend);
  });

  it('returns TaskSchedulerBackend on Windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    expect(getScheduler()).toBeInstanceOf(TaskSchedulerBackend);
  });
});
