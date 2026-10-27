#!/usr/bin/env node
// Lists the MCP servers a repo configures, one line each, so the agent knows which tools it could connect
// without reading the config files itself. Prints names, kind (stdio/http) and a short hint only; env values,
// headers, URLs and command arguments (except the package a runner such as npx starts) stay out of the agent's
// context, because they often hold secrets.
// Usage: node .agent-workflow/scripts/mcp-servers.js [repo-root]
const fs = require("fs");
const path = require("path");

process.on("uncaughtException", (e) => {
  console.error(`mcp-servers: ${e.message}`);
  process.exit(1);
});
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
// Package runners: the package they start names the server. Only flags known to take no value may come before it;
// any other flag could be `--token <secret>`, and then no hint is printed at all.
const RUNNERS = /^(npx|pnpx|bunx|uvx|pipx|dlx|pnpm|yarn)$/i;
const PACKAGE = /^(@[\w.-]+\/)?[\w.-]+(@[\w.^~<>=*-]+)?$/;
const NO_VALUE_FLAGS = /^(-y|--yes|-q|--quiet|-s|--silent|--no-install|--prefer-offline|--prefer-online|--no|--isolated|--refresh|--offline)$/;
const packageOf = (args) => {
  if (!Array.isArray(args)) return "";
  const a = args.map(String);
  for (let i = 0; i < a.length; i++) {
    const w = a[i];
    if (w === "-p" || w === "--package" || w === "--from") return PACKAGE.test(a[i + 1] || "") ? a[i + 1] : "";
    if (NO_VALUE_FLAGS.test(w) || /^(run|dlx|exec)$/.test(w)) continue;
    if (w.startsWith("-")) return "";
    return PACKAGE.test(w) ? w : "";
  }
  return "";
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
  console.log("MCP servers configured in this repo: none. Use any tracker or design tools you already have connected; otherwise Sources: none.");
} else {
  console.log(`MCP servers configured in this repo (${found.length}):`);
  console.log(found.join("\n") || "- none readable");
  console.log("\nFor each one, check whether its tools are available to you now. If not, tell the user how to connect it; don't read its config.");
}
if (unreadable.length) console.log(`\nCould not parse: ${unreadable.join(", ")}`);
