// x tunnel — expose a local port on dev.joppekoers.nl with mitmweb in between
//
//   internet -> cloudflared -> mitmweb (reverse proxy, :8080) -> localhost:<port>
//                                 \-> web UI on :8081 showing every request

import { $ } from "bun";
import { join } from "node:path";

export const description = "Cloudflare tunnel to dev.joppekoers.nl through mitmweb (default port 5023)";

const TUNNEL = "dev.joppekoers.nl";
const PROXY_PORT = 8080;
const WEB_PORT = 8081;
// Fixed password so the UI URL is stable instead of a random token per run
const WEB_PASSWORD = "x";
// mitmproxy addon that logs requests and JSON bodies to the terminal
const LOG_ADDON = join(import.meta.dir, "tunnel.py");

async function waitForPort(port: number): Promise<void> {
	while (true) {
		try {
			// Plain TCP connect, an HTTP probe would show up in the request log
			const socket = await Bun.connect({ hostname: "localhost", port, socket: { data() {} } });
			socket.end();
			return;
		} catch {
			await Bun.sleep(200);
		}
	}
}

export default async function run(args: string[]): Promise<number> {
	const port = Number(args[0] ?? 5023);
	if (!Number.isInteger(port) || port <= 0) {
		console.error("Usage: x tunnel [port]");
		return 1;
	}

	// Clean up leftovers from a previous run
	await $`lsof -i tcp:${PROXY_PORT} -i tcp:${WEB_PORT} -t | xargs kill -9`.nothrow().quiet();
	await $`pkill -f "cloudflared tunnel run.*${TUNNEL}"`.nothrow().quiet();

	console.log(`${TUNNEL} -> mitmweb :${PROXY_PORT} -> localhost:${port}`);
	const webUrl = `http://localhost:${WEB_PORT}/?token=${WEB_PASSWORD}`;
	// OSC 8 hyperlink so the terminal makes it clickable
	console.log(process.stdout.isTTY ? `Inspect requests at \x1b]8;;${webUrl}\x07${webUrl}\x1b]8;;\x07` : `Inspect requests at ${webUrl}`);

	// prettier-ignore
	const mitm = Bun.spawn(
		[
			"mitmweb",
			"--mode", `reverse:http://localhost:${port}`,
			"--listen-port", String(PROXY_PORT),
			"--web-port", String(WEB_PORT),
			"--no-web-open-browser",
			"--set", `web_password=${WEB_PASSWORD}`,
			"-s", LOG_ADDON,
			// Forward the Host header cloudflared sends (dev.joppekoers.nl) instead of
			// rewriting it to localhost:<port>, so the app sees the same request as without mitm
			"--set", "keep_host_header=true",
		],
		{ stdout: "inherit", stderr: "inherit" },
	);

	await waitForPort(PROXY_PORT);

	const tunnel = Bun.spawn(["cloudflared", "tunnel", "--loglevel", "error", "run", "--url", `http://localhost:${PROXY_PORT}`, TUNNEL], {
		stdout: "inherit",
		stderr: "inherit",
	});

	const stop = () => {
		tunnel.kill();
		mitm.kill();
	};
	process.on("SIGINT", stop);
	process.on("SIGTERM", stop);

	// If either side dies, take the other down with it
	const code = await Promise.race([mitm.exited, tunnel.exited]);
	stop();
	await Promise.all([mitm.exited, tunnel.exited]);
	return code;
}
