// x prs — list all open PRs in the Celebratix org

import { $ } from "bun";
import { homedir } from "node:os";
import { join } from "node:path";

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
  commits: { nodes: { commit: { statusCheckRollup: { state: string } | null } }[] };
};

function ciStatus(pr: PrNode): string {
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

function reviewStatus(pr: PrNode): string {
  if (pr.isDraft) return "draft";
  switch (pr.reviewDecision) {
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
  const title = pr.title
    .replace(/\(?CB-\d+\)?/i, "")
    .replace(/feat\:/, "")
    .replace(/feature\:/, "")
    .replace(/fix\:/, "")
    .trim();
  return title.length > TITLE_WIDTH ? `${title.slice(0, TITLE_WIDTH - 1)}…` : title;
}

async function fetchPrs(): Promise<PrNode[]> {
  const pages = (await $`gh api graphql --paginate --slurp -f query=${QUERY}`.json()) as {
    data: { search: { nodes: PrNode[] } };
  }[];
  return pages.flatMap((page) => page.data.search.nodes);
}

function repoName(pr: PrNode): string {
  return pr.repository.name.replace(/^celebratix-/, "");
}

const TITLE_WIDTH = 60;

type Cell = { text: string; url?: string; pipedText?: string };

const isTTY = process.stdout.isTTY;

// When piping (grep, tail, ...) escape-coded links are useless; cells that want a
// different plain-text form there (e.g. the full URL) set pipedText
function cellText(cell: Cell): string {
  return !isTTY && cell.pipedText ? cell.pipedText : cell.text;
}

function renderCell(cell: Cell, width: number): string {
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

  const widths = rows[0]!.map((_, col) => Math.max(...rows.map((row) => cellText(row[col]!).length)));
  for (const row of rows) {
    console.log(
      row
        .map((cell, col) => renderCell(cell, widths[col]!))
        .join("  ")
        .trimEnd(),
    );
  }
}

export default async function run(): Promise<number> {
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
