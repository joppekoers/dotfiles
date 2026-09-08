// x d — connect to a Celebratix database
//
//   x d p            production api_db
//   x d s ctm        staging ctm_db
//   x d l cep        local cep-local
//
// Ports mirror infra/tooling/platform-cli/internal/dbtunnel: the bastion port
// (5432 api, 5433 crm, 5434 ctm, 5435 api read replica, 5436 engagement) plus the
// environment offset (dev 10000, staging 20000, production 30000).

import { homedir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";

export const description = "Connect to a Celebratix database: x d p|s|d|l [api|crm|ctm|cep|api_ro]";

const INFRA_DIR = join(homedir(), "git/celebratix/infra");

const ENVS = {
	p: { name: "production", offset: 30000 },
	s: { name: "staging", offset: 20000 },
	d: { name: "dev", offset: 10000 },
} as const;

const DBS = {
	api: { port: 5432, name: "api_db", local: "api-local" },
	crm: { port: 5433, name: "crm_db", local: "crm-local" },
	ctm: { port: 5434, name: "ctm_db", local: "ctm-local" },
	api_ro: { port: 5435, name: "api_db", local: "api-local" }, // production only
	cep: { port: 5436, name: "engagement_db", local: "cep-local" },
} as const;

async function portOpen(port: number): Promise<boolean> {
	try {
		const socket = await Bun.connect({ hostname: "localhost", port, socket: { data() {} } });
		socket.end();
		return true;
	} catch {
		return false;
	}
}

function pgcli(password: string, prompt: string, port: number, user: string, database: string) {
	// prettier-ignore
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
			// PGTZ sets the session time zone without pgcli's use_local_timezone startup message
			env: { ...process.env, PGPASSWORD: password, PGTZ: "Europe/Amsterdam" },
		},
	);
	return proc.exitCode ?? 1;
}

export default async function run(args: string[]) {
	const [env, dbName = "api"] = args;
	const db = DBS[dbName as keyof typeof DBS];
	if (!env || !db) {
		console.error("Usage: x d p|s|d|l [api|crm|ctm|cep|api_ro]");
		return 1;
	}

	if (env === "l") {
		return pgcli("postgres", `${dbName} local> `, 5432, "doadmin", db.local);
	}

	const target = ENVS[env as keyof typeof ENVS];
	if (!target) {
		console.error(`Invalid environment: ${env}`);
		return 1;
	}
	if (dbName === "api_ro" && env !== "p") {
		console.error("The read replica only exists in production");
		return 1;
	}

	const port = target.offset + db.port;
	// A tunnel from a previous run is kept alive (unref below), reuse it when it is still up
	if (!(await portOpen(port))) {
		// Kill leftovers on this environment's port range, platform-cli refuses to start otherwise
		const ports = Object.values(DBS).flatMap((d) => ["-i", `tcp:${target.offset + d.port}`]);
		await $`lsof ${ports} -t | xargs kill -9`.nothrow().quiet();

		console.log(`Opening tunnel to ${target.name}...`);
		const tunnel = Bun.spawn(["./platform-cli", "db", "tunnel", target.name], {
			cwd: INFRA_DIR,
			stdout: "ignore",
			stderr: "inherit",
		});
		tunnel.unref(); // keep the tunnel alive after x exits

		while (!(await portOpen(port))) {
			if (tunnel.exitCode !== null) {
				console.error(`Tunnel exited with code ${tunnel.exitCode}`);
				return 1;
			}
			await Bun.sleep(200);
		}
	}

	const token = (await $`gcloud auth print-access-token`.text()).trim();
	return pgcli(token, `${dbName} ${target.name}> `, port, "joppe@celebratix.io", db.name);
}
