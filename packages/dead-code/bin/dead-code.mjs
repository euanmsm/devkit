#!/usr/bin/env node
// ============================================================================
// dead-code
// ============================================================================
//
// The `dead-code` command.

import { run } from '../src/cli.mjs';

process.exitCode = await run(process.argv.slice(2));
