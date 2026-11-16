// Shared between `x d` and `x dsn`: the Celebratix database table and the IAP tunnel to reach it.
//
// Ports mirror infra/tooling/platform-cli/internal/dbtunnel: the bastion port
// (5432 api, 5433 crm, 5434 ctm, 5435 api read replica, 5436 engagement) plus the
// environment offset (dev 10000, staging 20000, production 30000).

import { homedir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";

const INFRA_DIR = join(homedir(), "git/celebratix/infra");

export const IAM_USER = "joppe@celebratix.io";

export const ENVS = {
	p: { name: "production", offset: 30000 },
	s: { name: "staging", offset: 20000 },
	d: { name: "dev", offset: 10000 },
} as const;

export const DBS = {
	api: { port: 5432, name: "api_db", local: "api-local" },
	crm: { port: 5433, name: "crm_db", local: "crm-local" },
	ctm: { port: 5434, name: "ctm_db", local: "ctm-local" },
	api_ro: { port: 5435, name: "api_db", local: "api-local" }, // production only
	cep: { port: 5436, name: "engagement_db", local: "cep-local" },
} as const;

export type Env = (typeof ENVS)[keyof typeof ENVS];
export type Db = (typeof DBS)[keyof typeof DBS];

// platform-cli refuses to open a tunnel when `gcloud auth print-identity-token` fails,
// so run the login it would otherwise tell us to run instead of bailing out.
async function ensureAuth(): Promise<boolean> {
	const authed = async () => (await $`gcloud auth print-identity-token`.nothrow().quiet()).exitCode === 0;
	if (await authed()) return true;

	console.log("Not authenticated with gcloud, logging in...");
	const login = Bun.spawnSync(["gcloud", "auth", "login", "--update-adc"], {
		stdin: "inherit",
		stdout: "inherit",
		stderr: "inherit",
	});
	return login.exitCode === 0 && (await authed());
}

// 127.0.0.1 rather than localhost: platform-cli decides a port is taken by dialling
// 127.0.0.1, so probing the same address keeps both sides in agreement.
async function portOpen(port: number): Promise<boolean> {
	const connect = Bun.connect({ hostname: "127.0.0.1", port, socket: { data() {} } });
	// A connect that hangs is as good as a closed port here; don't wait forever for it.
	let timer: ReturnType<typeof setTimeout>;
	const timeout = new Promise<null>((resolve) => {
		timer = setTimeout(() => resolve(null), 500);
	});
	try {
		const socket = await Promise.race([connect, timeout]);
		if (!socket) {
			// Still dangling: hand it a no-op catch so a later failure isn't unhandled.
			void connect.then((s) => s.end()).catch(() => {});
			return false;
		}
		socket.end();
		return true;
	} catch {
		return false;
	} finally {
		clearTimeout(timer!);
	}
}

// Resolves to the local port of `db` in `env`, with a tunnel up and gcloud authenticated,
// or an error message to print.
export async function openTunnel(env: Env, db: Db): Promise<number | Error> {
	if (!(await ensureAuth())) return new Error("gcloud login failed");

	const port = env.offset + db.port;
	// A tunnel from a previous run is kept alive (unref below), reuse it when it is still up
	if (await portOpen(port)) return port;

	// Kill leftovers on this environment's port range, platform-cli refuses to start otherwise
	const ports = Object.values(DBS).flatMap((d) => ["-i", `tcp:${env.offset + d.port}`]);
	await $`lsof ${ports} -t | xargs kill -9`.nothrow().quiet();

	console.log(`Opening tunnel to ${env.name}...`);
	const tunnel = Bun.spawn(["./platform-cli", "db", "tunnel", env.name], {
		cwd: INFRA_DIR,
		stdout: "ignore",
		stderr: "inherit",
	});
	tunnel.unref(); // keep the tunnel alive after x exits

	while (!(await portOpen(port))) {
		if (tunnel.exitCode !== null) return new Error(`Tunnel exited with code ${tunnel.exitCode}`);
		await Bun.sleep(200);
	}
	return port;
}

export async function accessToken(): Promise<string> {
	return (await $`gcloud auth print-access-token`.text()).trim();
}
