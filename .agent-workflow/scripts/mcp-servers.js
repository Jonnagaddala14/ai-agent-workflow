#!/usr/bin/env node
// Lists the MCP servers a repo configures, one line each, so the agent knows which tools it could connect
// without reading the config files itself. Prints names, kind (stdio/http) and a short hint only; env values,
// headers, URLs and command arguments stay out of the agent's context, because they often hold secrets.
// Usage: node .agent-workflow/scripts/mcp-servers.js [repo-root]
const fs = require("fs");
const path = require("path");

const root = path.resolve(process.argv[2] || ".");
// Repo-level config files, by tool. User-level files (~/.claude.json, VS Code user settings) aren't the repo's.
const FILES = [
  [".vscode/mcp.json", "VS Code"],
  [".github/copilot/mcp.json", "Copilot"],
  [".mcp.json", "Claude Code"],
  [".cursor/mcp.json", "Cursor"],
  [".windsurf/mcp.json", "Windsurf"],
  [".gemini/settings.json", "Gemini CLI"],
  [".vscode/settings.json", "VS Code settings"],
];

// Strips // and /* */ comments and trailing commas, enough for the JSONC VS Code writes
function parseJsonc(text) {
  const noComments = text.replace(/^\uFEFF/, "").replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str || "");
  return JSON.parse(noComments.replace(/,(\s*[}\]])/g, "$1"));
}

const kindOf = (s) => {
  if (!s || typeof s !== "object") return "unknown";
  if (s.type) return String(s.type);
  if (s.url || s.serverUrl) return "http";
  if (s.command) return "stdio";
  return "unknown";
};
// A hint that helps the agent guess what the server is for, without exposing arguments or tokens
const hintOf = (s) => {
  if (!s || typeof s !== "object") return "";
  if (s.command) return `command ${path.basename(String(s.command))}`;
  const url = s.url || s.serverUrl;
  if (url) {
    try {
      return `host ${new URL(String(url)).host}`;
    } catch {
      return "url set";
    }
  }
  return "";
};

const found = [];
const unreadable = [];
for (const [rel, tool] of FILES) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) continue;
  let cfg;
  try {
    cfg = parseJsonc(fs.readFileSync(p, "utf8"));
  } catch {
    unreadable.push(rel);
    continue;
  }
  // VS Code: { servers }, also { mcp: { servers } } in settings.json; Claude/Cursor/Copilot: { mcpServers }
  const servers = cfg.servers || cfg.mcpServers || cfg.mcp?.servers;
  if (!servers || typeof servers !== "object") continue;
  for (const [name, s] of Object.entries(servers)) {
    found.push(`- ${name} (${kindOf(s)}${hintOf(s) ? `, ${hintOf(s)}` : ""}) — ${rel} [${tool}]`);
  }
}

if (!found.length && !unreadable.length) {
  console.log("MCP servers configured in this repo: none. Sources: none, unless the user connects one.");
} else {
  console.log(`MCP servers configured in this repo (${found.length}):`);
  console.log(found.join("\n") || "- none readable");
  console.log("\nFor each one, check whether its tools are available to you now. If not, tell the user how to connect it; don't read its config.");
}
if (unreadable.length) console.log(`\nCould not parse: ${unreadable.join(", ")}`);
