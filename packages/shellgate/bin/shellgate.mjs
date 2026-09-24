#!/usr/bin/env node
// ============================================================================
// Shellgate
// ============================================================================
//
// Runs the shell gate as a Claude Code hook, allowing the command on any error.

import { main } from '../src/gate.mjs';

// A malformed payload or a directory outside any repository allows the command.
try {
  main();
} catch (error) {
  process.stderr.write(
    `shellgate: command allowed unchecked — ${error.message}\n`,
  );
  process.exit(0);
}
