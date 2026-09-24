import { handleParseError } from './lib/runner.js';
import { createProgram } from './program.js';

// exitOverride() converts Commander exits to thrown exceptions, not process.exit
createProgram().parseAsync(process.argv).catch(handleParseError);
