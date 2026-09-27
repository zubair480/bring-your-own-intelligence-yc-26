"""Minimal GBrain MCP client (streamable HTTP, JSON-RPC). Stdlib only.

Reads GBRAIN_MCP_URL and GBRAIN_TOKEN from the environment, falling back to
the repo-root .env file. Never log the token.

    from gbrain_client import GBrainClient
    gb = GBrainClient()
    gb.search("running pump color")
    gb.put_page("hmi/style-guide", "# Style guide\n...")
"""
from __future__ import annotations

import itertools
import json
import os
import urllib.error
import urllib.request
from pathlib import Path

PROTOCOL_VERSION = "2025-06-18"
_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"


def load_env(path: Path = _ENV_PATH) -> dict[str, str]:
    """Parse KEY=VALUE lines from .env (no overrides of real env vars)."""
    vals: dict[str, str] = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            vals[k.strip()] = v.strip().strip('"').strip("'")
    return vals


class GBrainError(RuntimeError):
    pass


class GBrainClient:
    def __init__(self, url: str | None = None, token: str | None = None, timeout: float = 60.0):
        env = load_env()
        self.url = url or os.environ.get("GBRAIN_MCP_URL") or env.get("GBRAIN_MCP_URL") or "https://gbrain.io/mcp"
        self.token = token or os.environ.get("GBRAIN_TOKEN") or env.get("GBRAIN_TOKEN")
        if not self.token:
            raise GBrainError("GBRAIN_TOKEN not set (env or .env)")
        self.timeout = timeout
        self.session_id: str | None = None
        self.server_info: dict | None = None
        self._ids = itertools.count(1)
        self._initialized = False

    # ---- transport -------------------------------------------------------
    def _post(self, payload: dict) -> dict | None:
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/json, text/event-stream",
            "Content-Type": "application/json",
            "MCP-Protocol-Version": PROTOCOL_VERSION,
        }
        if self.session_id:
            headers["Mcp-Session-Id"] = self.session_id
        req = urllib.request.Request(
            self.url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST"
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                sid = resp.headers.get("Mcp-Session-Id")
                if sid:
                    self.session_id = sid
                ctype = resp.headers.get("Content-Type", "")
                body = resp.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            raise GBrainError(f"HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:500]}") from None
        if not body.strip():
            return None  # 202 Accepted for notifications
        return self._parse(body, ctype, payload.get("id"))

    @staticmethod
    def _parse(body: str, ctype: str, want_id) -> dict:
        """Handle plain JSON or an SSE stream of `data:` events."""
        if "text/event-stream" in ctype or body.lstrip().startswith(("event:", "data:", ":")):
            msgs, buf = [], []
            for line in body.splitlines() + [""]:
                if line.startswith("data:"):
                    buf.append(line[5:].lstrip())
                elif line == "" and buf:
                    msgs.append(json.loads("\n".join(buf)))
                    buf = []
            for m in msgs:
                if m.get("id") == want_id and ("result" in m or "error" in m):
                    return m
            if not msgs:
                raise GBrainError("empty SSE response")
            return msgs[-1]
        return json.loads(body)

    def _rpc(self, method: str, params: dict | None = None) -> dict:
        msg = {"jsonrpc": "2.0", "id": next(self._ids), "method": method, "params": params or {}}
        resp = self._post(msg)
        if resp is None:
            raise GBrainError(f"no response to {method}")
        if "error" in resp:
            raise GBrainError(f"{method} failed: {resp['error']}")
        return resp["result"]

    # ---- MCP lifecycle ---------------------------------------------------
    def initialize(self) -> dict:
        if self._initialized:
            return self.server_info or {}
        result = self._rpc(
            "initialize",
            {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": {"name": "byoi-backend", "version": "0.1.0"},
            },
        )
        self.server_info = result
        self._post({"jsonrpc": "2.0", "method": "notifications/initialized"})
        self._initialized = True
        return result

    def list_tools(self) -> list[dict]:
        self.initialize()
        tools, cursor = [], None
        while True:
            res = self._rpc("tools/list", {"cursor": cursor} if cursor else {})
            tools += res.get("tools", [])
            cursor = res.get("nextCursor")
            if not cursor:
                return tools

    def call_tool(self, name: str, args: dict | None = None) -> dict:
        """Call any GBrain tool. Returns the raw MCP result
        ({content: [...], structuredContent?, isError?}). Raises on isError."""
        self.initialize()
        res = self._rpc("tools/call", {"name": name, "arguments": args or {}})
        if res.get("isError"):
            raise GBrainError(f"{name}: {self.text(res)[:500]}")
        return res

    @staticmethod
    def text(result: dict) -> str:
        """Concatenate text blocks from a tool result."""
        return "\n".join(c.get("text", "") for c in result.get("content", []) if c.get("type") == "text")

    @classmethod
    def data(cls, result: dict):
        """structuredContent if present, else the text parsed as JSON, else raw text."""
        if result.get("structuredContent") is not None:
            return result["structuredContent"]
        t = cls.text(result)
        try:
            return json.loads(t)
        except ValueError:
            return t

    # ---- read wrappers ---------------------------------------------------
    def search(self, query: str, limit: int = 5):
        """Cheap hybrid (vector + keyword) search, no LLM expansion."""
        return self.data(self.call_tool("search", {"query": query, "limit": limit}))

    def query(self, question: str, limit: int = 5):
        """Hybrid search with multi-query expansion; better for concept questions."""
        return self.data(self.call_tool("query", {"query": question, "limit": limit}))

    def get_page(self, slug: str, include_content: bool = False):
        return self.data(self.call_tool("get_page", {"slug": slug, "include_content": include_content}))

    def recall(self, **args):
        """Agent-memory read (facts saved via remember). See docs/gbrain-tools.json for args."""
        return self.data(self.call_tool("recall", args))

    # ---- write wrappers --------------------------------------------------
    def put_page(self, slug: str, markdown: str, title: str | None = None, page_type: str = "note"):
        """Write or REPLACE a whole page. Adds frontmatter if the markdown has none."""
        if not markdown.lstrip().startswith("---"):
            fm = f"---\ntitle: {json.dumps(title or slug)}\ntype: {page_type}\n---\n\n"
            markdown = fm + markdown
        return self.data(self.call_tool("put_page", {"slug": slug, "content": markdown}))

    def remember(self, fact: str, provenance: str = "byoi app", entity: str | None = None, kind: str = "fact"):
        """Save one durable fact to agent memory."""
        args = {"fact": fact, "provenance": provenance, "kind": kind}
        if entity:
            args["entity"] = entity
        return self.data(self.call_tool("remember", args))

    def capture(self, content: str, slug: str | None = None):
        """Quick note; auto-slugs under inbox/ when slug is omitted."""
        args = {"content": content}
        if slug:
            args["slug"] = slug
        return self.data(self.call_tool("capture", args))


if __name__ == "__main__":
    import sys

    gb = GBrainClient()
    q = " ".join(sys.argv[1:]) or "how should a running pump look"
    print(json.dumps(gb.search(q), indent=2, ensure_ascii=False)[:4000])
