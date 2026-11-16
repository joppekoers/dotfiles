// x d — connect to a Celebratix database
//
//   x d p            production api_db
//   x d s ctm        staging ctm_db
//   x d l cep        local cep-local

import { accessToken, DBS, ENVS, IAM_USER, openTunnel } from "../lib/db.ts";

export const description = "Connect to a Celebratix database: x d p|s|d|l [api|crm|ctm|cep|api_ro]";

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

	const port = await openTunnel(target, db);
	if (port instanceof Error) {
		console.error(port.message);
		return 1;
	}

	return pgcli(await accessToken(), `${dbName} ${target.name}> `, port, IAM_USER, db.name);
}
