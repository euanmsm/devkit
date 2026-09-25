#!/usr/bin/env node
import { main as check } from '../src/check.mjs';
import { main as scan } from '../src/scan.mjs';

try {
  if (process.argv[2] === 'scan') scan(process.argv.slice(3));
  else check();
} catch (error) {
  console.error(
    `The comment check could not run.\n\n${error.stderr || error.message}`,
  );
  process.exit(1);
}
