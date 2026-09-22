#!/usr/bin/env node
import { main } from '../src/gate.mjs';

// A missing config, an unreadable transcript or a malformed payload allows the edit.
try {
  main();
} catch (error) {
  process.stderr.write(
    `preflight: edit allowed unchecked — ${error.message}\n`,
  );
  process.exit(0);
}
