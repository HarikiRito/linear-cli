import { createProgram } from './program.js';

createProgram()
  .parseAsync(process.argv)
  .catch((err: unknown) => {
    // exitOverride() converts Commander exits to thrown exceptions, not process.exit
    if (err instanceof Error && 'code' in err) {
      const code = (err as { code: string }).code;
      if (
        code === 'commander.helpDisplayed' ||
        code === 'commander.help' ||
        code === 'commander.version'
      ) {
        return; // exit 0
      }
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    process.exitCode = 1;
  });
