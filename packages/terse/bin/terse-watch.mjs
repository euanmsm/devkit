#!/usr/bin/env node
import { main } from '../src/watch.mjs';

// A missing config, an unreadable file or a malformed payload reports nothing.
try {
  main();
} catch (error) {
  process.stderr.write(`terse-watch: nothing reported — ${error.message}\n`);
}
process.exit(0);
