#!/usr/bin/env node
// ============================================================================
// cheat
// ============================================================================
//
// The `cheat` command.

import { run } from '../src/cli.mjs';

process.exitCode = await run(process.argv.slice(2));
