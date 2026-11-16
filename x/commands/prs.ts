// x prs — list all open PRs in the Celebratix org

import { homedir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";

export const description = "List my open PRs in the Celebratix org with status and link";

const CACHE_FILE = join(homedir(), ".cache/x/prs.json");

const QUERY = `
query ($endCursor: String) {
	search(query: "org:Celebratix is:pr is:open author:joppekoers", type: ISSUE, first: 100, after: $endCursor) {
		pageInfo { hasNextPage endCursor }
		nodes {
			... on PullRequest {
				repository { name }
				number
				title
				url
				isDraft
				reviewDecision
					latestOpinionatedReviews(first: 20) { nodes { state } }
				commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
			}
		}
	}
}`;

type PrNode = {
	repository: { name: string };
	number: number;
	title: string;
	url: string;
	isDraft: boolean;
	reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
	latestOpinionatedReviews?: { nodes: { state: string }[] };
	commits: { nodes: { commit: { statusCheckRollup: { state: string } | null } }[] };
};

function ciStatus(pr: PrNode) {
	const state = pr.commits.nodes[0]?.commit.statusCheckRollup?.state;
	switch (state) {
		case "SUCCESS":
			return "✓";
		case "FAILURE":
		case "ERROR":
			return "✗";
		case "PENDING":
		case "EXPECTED":
			return "?";
		default:
			return "-";
	}
}

// reviewDecision is null when GitHub does not compute one for the PR (e.g. no required
// reviews in the branch rules), even if a reviewer approved; derive it from the reviews then
function reviewDecision(pr: PrNode) {
	if (pr.reviewDecision) return pr.reviewDecision;
	const states = pr.latestOpinionatedReviews?.nodes.map((review) => review.state) ?? [];
	if (states.includes("CHANGES_REQUESTED")) return "CHANGES_REQUESTED";
	if (states.includes("APPROVED")) return "APPROVED";
	return null;
}

function reviewStatus(pr: PrNode) {
	if (pr.isDraft) return "draft";
	switch (reviewDecision(pr)) {
		case "APPROVED":
			return "approved";
		case "CHANGES_REQUESTED":
			return "changes requested";
		case "REVIEW_REQUIRED":
			return "required";
		default:
			return "no";
	}
}

function title(pr: PrNode) {
	return pr.title
		.replace(/\(?CB-\d+\)?/i, "")
		.replace(/feat:/, "")
		.replace(/feature:/, "")
		.replace(/fix:/, "")
		.trim();
}

async function fetchPrs() {
	const pages = (await $`gh api graphql --paginate --slurp -f query=${QUERY}`.json()) as {
		data: { search: { nodes: PrNode[] } };
	}[];
	return pages.flatMap((page) => page.data.search.nodes);
}

function repoName(pr: PrNode) {
	return pr.repository.name.replace(/^celebratix-/, "");
}

type Cell = { text: string; url?: string; pipedText?: string };

const isTTY = process.stdout.isTTY;

// When piping (grep, tail, ...) escape-coded links are useless; cells that want a
// different plain-text form there (e.g. the full URL) set pipedText
function cellText(cell: Cell) {
	return !isTTY && cell.pipedText ? cell.pipedText : cell.text;
}

function renderCell(cell: Cell, width: number) {
	const text = cellText(cell);
	const padding = " ".repeat(width - text.length);
	if (cell.url && isTTY) {
		// OSC 8 hyperlink; pad outside the escape sequence so alignment uses visible length
		return `\x1b]8;;${cell.url}\x07${text}\x1b]8;;\x07${padding}`;
	}
	return text + padding;
}

function render(prs: PrNode[]) {
	const sorted = [...prs].sort((a, b) => repoName(a).localeCompare(repoName(b)) || b.number - a.number);
	const rows: Cell[][] = sorted.map((pr) => [
		{ text: repoName(pr) },
		{ text: ciStatus(pr), url: `${pr.url}/checks` },
		{ text: reviewStatus(pr) },
		{ text: `#${pr.number}`, url: pr.url, pipedText: pr.url },
		{ text: title(pr) },
	]);
	rows.unshift([{ text: "REPO" }, { text: "CI" }, { text: "REVIEW" }, { text: "LINK" }, { text: "TITLE" }]);

	const separator = "  ";
	const widths = rows[0]!.map((_, col) => Math.max(...rows.map((row) => cellText(row[col]!).length)));

	// Truncate the last column (title) to the space left so rows never wrap in the terminal
	if (isTTY && process.stdout.columns) {
		const last = widths.length - 1;
		const fixedWidth = widths.slice(0, last).reduce((sum, width) => sum + width + separator.length, 0);
		const maxTitle = Math.max(process.stdout.columns - fixedWidth, 1);
		for (const row of rows) {
			const cell = row[last]!;
			if (cell.text.length > maxTitle) cell.text = `${cell.text.slice(0, maxTitle - 1)}…`;
		}
		widths[last] = Math.min(widths[last]!, maxTitle);
	}

	for (const row of rows) {
		console.log(
			row
				.map((cell, col) => renderCell(cell, widths[col]!))
				.join(separator)
				.trimEnd(),
		);
	}
}

export default async function run() {
	let cached: PrNode[] | null = null;
	try {
		cached = await Bun.file(CACHE_FILE).json();
	} catch {
		// no cache yet, or unreadable — fetch fresh below
	}

	if (cached) render(cached);

	const prs = await fetchPrs();
	await Bun.write(CACHE_FILE, JSON.stringify(prs));

	if (!cached || JSON.stringify(cached) !== JSON.stringify(prs)) {
		if (cached) process.stdout.write("\x1b[2J\x1b[H"); // clear stale output
		render(prs);
	}
	return 0;
}
