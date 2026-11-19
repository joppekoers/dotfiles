// x orders — show tracked orders and gmail-sync health

export const description = "Show tracked online orders and parcel deliveries from gmail-sync";

const URL = "https://joppekoers.nl/proxy/gmail-sync/dashboard/terminal";

export default async function run() {
	const token = process.env.DASHBOARD_TOKEN;
	if (!token) {
		console.error("DASHBOARD_TOKEN is not set (see ~/git/dotfiles/.env)");
		return 1;
	}

	const width = process.stdout.columns ?? 120;
	const response = await fetch(`${URL}?width=${width}`, {
		headers: { Authorization: `Bearer ${token}` },
	});
	if (!response.ok) {
		console.error(`gmail-sync dashboard returned ${response.status} ${response.statusText}`);
		return 1;
	}

	process.stdout.write(await response.text());
	return 0;
}
