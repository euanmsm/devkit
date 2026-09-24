#!/usr/bin/env node
// ============================================================================
// crib
// ============================================================================
//
// The `crib` command.

import { run } from '../src/cli.mjs';

process.exitCode = await run(process.argv.slice(2));
