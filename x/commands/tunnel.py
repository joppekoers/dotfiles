# mitmproxy addon loaded by `x tunnel`: logs every proxied request to the terminal,
# with request/response bodies pretty-printed and syntax highlighted when they are JSON.
import json

from mitmproxy import http

BOLD = "\x1b[1m"
DIM = "\x1b[2m"
RESET = "\x1b[0m"

# Same palette as jq's default JQ_COLORS (jq 1.8)
NULL = "\x1b[0;90m"
BOOL = "\x1b[0;39m"
NUM = "\x1b[0;39m"
STR = "\x1b[0;32m"
PUNCT = "\x1b[1;39m"  # braces, brackets, colons, commas
KEY = "\x1b[1;34m"


def p(text: str) -> str:
    return f"{PUNCT}{text}{RESET}"


def colorize(value: object, depth: int = 0) -> str:
    pad = "  " * depth
    inner = "  " * (depth + 1)
    if isinstance(value, dict):
        if not value:
            return p("{}")
        items = [f"{inner}{KEY}{json.dumps(k, ensure_ascii=False)}{RESET}{p(':')} {colorize(v, depth + 1)}" for k, v in value.items()]
        return p("{") + "\n" + f"{p(',')}\n".join(items) + f"\n{pad}{p('}')}"
    if isinstance(value, list):
        if not value:
            return p("[]")
        items = [f"{inner}{colorize(v, depth + 1)}" for v in value]
        return p("[") + "\n" + f"{p(',')}\n".join(items) + f"\n{pad}{p(']')}"
    if isinstance(value, str):
        return f"{STR}{json.dumps(value, ensure_ascii=False)}{RESET}"
    if value is None:
        return f"{NULL}null{RESET}"
    if isinstance(value, bool):
        return f"{BOOL}{json.dumps(value)}{RESET}"
    return f"{NUM}{json.dumps(value)}{RESET}"


def pretty_json(message: http.Message) -> str | None:
    if "json" not in message.headers.get("content-type", ""):
        return None
    try:
        return colorize(json.loads(message.get_text() or ""))
    except (ValueError, TypeError):
        return None


def response(flow: http.HTTPFlow) -> None:
    req, res = flow.request, flow.response
    assert res is not None
    lines = [f"\n{BOLD}{req.method} {req.path}{RESET} {DIM}->{RESET} {res.status_code}"]
    if body := pretty_json(req):
        lines.append(f"{DIM}>> request{RESET}\n{body}")
    if body := pretty_json(res):
        lines.append(f"{DIM}<< response{RESET}\n{body}")
    print("\n".join(lines), flush=True)
