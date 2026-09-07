// x d — connect to a Celebratix database

import { $ } from "bun";
import { homedir } from "node:os";
import { join } from "node:path";

export const description = "Connect to a Celebratix database (p|s|d|l)";

const INFRA_DIR = join(homedir(), "git/celebratix/infra");

const ENVS = {
	p: { name: "production", port: 35432 },
	s: { name: "staging", port: 25432 },
	d: { name: "dev", port: 15432 },
} as const;

function pgcli(password: string, prompt: string, port: number, user: string, database: string): number {
	const proc = Bun.spawnSync(
		[
			"pgcli",
			"--prompt", prompt,
			"--auto-vertical-output",
			"--less-chatty",
			"-h", "localhost",
			"-p", String(port),
			"-U", user,
			"-d", database,
		],
		{
			stdin: "inherit",
			stdout: "inherit",
			stderr: "inherit",
			env: { ...process.env, PGPASSWORD: password },
		},
	);
	return proc.exitCode ?? 1;
}

export default async function run(args: string[]): Promise<number> {
	const env = args[0];
	if (!env) {
		console.error("Usage: x d p|s|d|l");
		return 1;
	}

	if (env === "l") {
		return pgcli("postgres", "local> ", 5432, "doadmin", "api-local");
	}

	const target = ENVS[env as keyof typeof ENVS];
	if (!target) {
		console.error(`Invalid environment: ${env}`);
		return 1;
	}

	await $`lsof -i tcp:${target.port} -t | xargs kill -9`.nothrow().quiet();
	await $`pkill -f db-tunnel.sh`.nothrow().quiet();
	await $`pkill -f pgcli`.nothrow().quiet();

	console.log(`Connecting to ${target.name} database on port ${target.port}...`);
	const tunnel = Bun.spawn(["./platform-cli", "db", "tunnel", target.name], {
		cwd: INFRA_DIR,
		stdout: "inherit",
		stderr: "inherit",
	});
	tunnel.unref(); // keep the tunnel alive after x exits

	const token = (await $`gcloud auth print-access-token`.text()).trim();

	// The tunnel can take a few seconds to establish, retry until pgcli connects
	while (true) {
		const code = pgcli(token, `${target.name}> `, target.port, "joppe@celebratix.io", "api_db");
		if (code === 0) return 0;
		console.log("Waiting for database connection...");
		await Bun.sleep(500);
	}
}
