#!/usr/bin/env node
import { main } from "../src/check.mjs";

try {
	main();
} catch (error) {
	console.error(`The comment check could not run.\n\n${error.stderr || error.message}`);
	process.exit(1);
}
