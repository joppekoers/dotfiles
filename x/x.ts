#!/usr/bin/env bun
// x — Celebratix helper CLI
// Each subcommand lives in its own file: commands/<name>.ts
// exporting a `description` string and a default `run(args) => Promise<number>`.

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const COMMANDS_DIR = join(import.meta.dir, "commands");

async function usage(): Promise<number> {
	console.error("Usage: x <command>");
	console.error("");
	console.error("Commands:");
	for (const file of readdirSync(COMMANDS_DIR).sort()) {
		if (!file.endsWith(".ts")) continue;
		const name = file.slice(0, -".ts".length);
		const mod = await import(join(COMMANDS_DIR, file));
		console.error(`  ${name.padEnd(8)} ${mod.description ?? ""}`);
	}
	return 1;
}

const [cmd, ...args] = process.argv.slice(2);

if (cmd) {
	const commandFile = join(COMMANDS_DIR, `${cmd}.ts`);
	if (existsSync(commandFile)) {
		const mod = await import(commandFile);
		process.exit(await mod.default(args));
	}
	console.error(`Unknown command: ${cmd}`);
	console.error("");
}
process.exit(await usage());
