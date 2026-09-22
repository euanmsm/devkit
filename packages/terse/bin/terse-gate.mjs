#!/usr/bin/env node
import { main } from '../src/gate.mjs';

// An unreadable file, a missing scanner or a malformed payload allows the edit.
try {
  main();
} catch (error) {
  process.stderr.write(`terse: edit allowed unchecked — ${error.message}\n`);
  process.exit(0);
}
