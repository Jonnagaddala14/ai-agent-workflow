#!/usr/bin/env node
// Lists the MCP servers a repo configures, one line each, so the agent knows which tools it could connect
// without reading the config files itself. Prints names, kind (stdio/http) and a short hint only; env values,
// headers, URLs and command arguments (except the package a runner such as npx starts) stay out of the agent's
// context, because they often hold secrets.
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
// Package runners: the package they start names the server (the first non-flag argument, or the value of -p/--package)
const RUNNERS = /^(npx|pnpx|bunx|uvx|pipx|dlx|pnpm|yarn)$/i;
const PACKAGE = /^(@[\w.-]+\/)?[\w.-]+(@[\w.^~<>=*-]+)?$/;
const packageOf = (args) => {
  if (!Array.isArray(args)) return "";
  const a = args.map(String);
  const k = a.findIndex((w) => w === "-p" || w === "--package");
  const pkg = k >= 0 ? a[k + 1] : a.find((w) => !w.startsWith("-") && !/^(run|dlx|exec)$/.test(w));
  return pkg && PACKAGE.test(pkg) ? pkg : "";
};
// A hint that helps the agent guess what the server is for, without exposing other arguments or tokens
const hintOf = (s) => {
  if (!s || typeof s !== "object") return "";
  if (s.command) {
    const cmd = path.basename(String(s.command));
    const pkg = RUNNERS.test(cmd.replace(/\.(cmd|exe)$/i, "")) ? packageOf(s.args) : "";
    return `command ${cmd}${pkg ? ` ${pkg}` : ""}`;
  }
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
