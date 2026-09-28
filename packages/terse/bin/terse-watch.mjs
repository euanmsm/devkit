#!/usr/bin/env node
// A missing config, an unreadable file or a malformed payload reports nothing.
try {
  const { main } = await import('../src/watch.mjs');
  main();
} catch (error) {
  process.stderr.write(`terse-watch: nothing reported — ${error.message}\n`);
}
process.exit(0);
