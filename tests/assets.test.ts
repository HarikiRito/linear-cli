import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe('linear assets upload wiring', () => {
  it('parses the path and auth flags and hands them to uploadAsset', async () => {
    const uploadAsset = vi.fn().mockResolvedValue(undefined);
    vi.doMock('../src/features/assets/upload.js', () => ({ uploadAsset }));

    const { Command } = await import('commander');
    const { registerAssets } = await import('../src/features/assets/command.js');
    const program = new Command();
    program.exitOverride();
    registerAssets(program);

    await program.parseAsync([
      'node',
      'linear',
      'assets',
      'upload',
      'photo.png',
      '--token',
      'tok-1',
    ]);

    expect(uploadAsset).toHaveBeenCalledWith({
      apiKey: undefined,
      token: 'tok-1',
      path: 'photo.png',
    });
  });

  it('advertises upload in the assets command description', async () => {
    vi.doMock('../src/features/assets/upload.js', () => ({ uploadAsset: vi.fn() }));

    const { Command } = await import('commander');
    const { registerAssets } = await import('../src/features/assets/command.js');
    const program = new Command();
    registerAssets(program);

    const assets = program.commands.find((c) => c.name() === 'assets');
    expect(assets?.description()).toBe('Asset subcommands: download, upload');
    expect(assets?.commands.map((c) => c.name())).toContain('upload');
  });
});
