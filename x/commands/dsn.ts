// x dsn — copy a read-only connection string for a Celebratix database to the clipboard
//
//   x dsn p          production api_db
//   x dsn s ctm      staging ctm_db
//
// The tunnel and gcloud token are the same as `x d`; the token in the string expires after about 1h.

import { accessToken, DBS, ENVS, IAM_USER, openTunnel } from "../lib/db.ts";

export const description = "Copy a read-only pg connection string: x dsn p|s|d [api|crm|ctm|cep|api_ro]";

export default async function run(args: string[]) {
	const [env, dbName = "api"] = args;
	const db = DBS[dbName as keyof typeof DBS];
	const target = ENVS[env as keyof typeof ENVS];
	if (!db || !target) {
		console.error("Usage: x dsn p|s|d [api|crm|ctm|cep|api_ro]");
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

	const url = new URL(`postgresql://localhost:${port}/${db.name}`);
	url.username = IAM_USER;
	url.password = await accessToken();
	// The IAM user is read-write; make every session read-only by default instead
	// Percent-encoded by hand: libpq does not decode the "+" URLSearchParams would use for the space
	url.search = `?options=${encodeURIComponent("-c default_transaction_read_only=on")}`;

	const copy = Bun.spawnSync(["pbcopy"], { stdin: new TextEncoder().encode(url.href) });
	if (copy.exitCode !== 0) {
		console.error("pbcopy failed");
		return 1;
	}
	console.log(`Copied read-only connection string for ${dbName} ${target.name} (token valid for about 1h)`);
	return 0;
}
