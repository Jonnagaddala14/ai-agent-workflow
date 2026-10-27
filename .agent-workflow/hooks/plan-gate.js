#!/usr/bin/env node
// PreToolUse hook: while any plan in .agent-workflow/plans/ is still "Status: DRAFT", block edits to files
// outside .agent-workflow/. Covers the edit tools and the obvious shell writes (redirects, rm/mv/cp, sed -i,
// tree-changing git commands, PowerShell file cmdlets). Exit 2 = block, and stderr is shown to the agent.
// Works with Claude Code (tool_input) and the Copilot harness (tool_input via the PreToolUse alias, or toolArgs),
// which also reads the JSON deny decision printed to stdout.
const fs = require("fs");
const path = require("path");

// Tolerates markdown around the field: "**Status:** DRAFT", "- Status: `DRAFT`", "## Status: DRAFT"
const DRAFT = /^\W*Status\W*DRAFT\b/im;
// Review, comments, reply and post files sit next to the plans but aren't plans
const NOT_PLAN = /\.(review|comments|post|reply-[\w-]+)\.md$/;
const WRITERS = new Set(["rm", "mv", "cp", "touch", "mkdir", "rmdir", "truncate", "ln", "tee", "dd",
  "set-content", "add-content", "out-file", "new-item", "remove-item", "move-item", "copy-item", "rename-item",
  "clear-content", "ni", "ri", "del", "erase", "move", "copy", "ren", "rd", "md", "sc", "ac"]);
const GIT_WRITERS = new Set(["apply", "am", "checkout", "switch", "restore", "reset", "stash", "clean", "mv", "rm",
  "merge", "rebase", "cherry-pick", "revert", "pull"]);
// Tool names that can change files, across Claude Code (Edit, Bash), Copilot CLI (edit, create, bash) and VS Code
// (replace_string_in_file, create_file, run_in_terminal). Read tools (Read, view, grep, read_file, …) pass straight through,
// because not every harness applies the hook's matcher.
const WRITER_TOOL = /edit|write|create|replace|insert|patch|delete|remove|rename|move|terminal|shell|bash|powershell|notebook/i;

// Splits a shell command into commands of words, honouring quotes. Redirect targets are marked as { to }.
function parse(cmd) {
  const cmds = [[]];
  let word = null;
  let redirect = false;
  const end = () => {
    if (word === null) return;
    cmds[cmds.length - 1].push(redirect ? { to: word } : word);
    word = null;
    redirect = false;
  };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (c === "'" || c === '"') {
      const close = cmd.indexOf(c, i + 1);
      const j = close < 0 ? cmd.length : close;
      word = (word ?? "") + cmd.slice(i + 1, j);
      i = j;
    } else if (c !== "\n" && /\s/.test(c)) end();
    else if (c === ";" || c === "|" || c === "&" || c === "\n") {
      if (c === "&" && redirect && word === null) continue; // the "&" of ">&"
      end();
      if (cmds[cmds.length - 1].length) cmds.push([]);
    } else if (c === ">") {
      if (/^\d$|^&$/.test(word ?? "")) word = null; // "2>", "&>": the fd isn't an argument
      end();
      if (cmd[i + 1] === ">" || cmd[i + 1] === "|") i++;
      redirect = true;
    } else word = (word ?? "") + c;
  }
  end();
  return cmds.filter((c) => c.length);
}

// The first project file (outside .agent-workflow/) a shell command would change, or null
function shellTarget(command, cwd, inProject, depth = 0) {
  if (depth > 3) return null;
  const bad = (w, base) => {
    if (typeof w !== "string" || !w || w.startsWith("-") || /[$`]/.test(w) || /^&?\d*$/.test(w)) return null;
    if (/^(\/dev\/null|nul|\$null)$/i.test(w)) return null;
    const p = process.platform === "win32" ? w.replace(/^\/([a-z])(\/|$)/i, "$1:/") : w; // Git Bash /c/... paths
    return inProject(path.resolve(base, p)) ? w : null;
  };
  for (const words of parse(command)) {
    const args = words.filter((w) => typeof w === "string");
    for (const w of words) if (w.to && bad(w.to, cwd)) return w.to;
    let i = 0;
    while (i < args.length && /^\w+=/.test(args[i])) i++; // VAR=value prefixes
    const name = path.basename(args[i] || "").toLowerCase().replace(/\.exe$/, "");
    const rest = args.slice(i + 1);
    if (name === "cmd" && /^\/(c|k)$/i.test(rest[0] || "")) {
      const nested = rest.slice(1).join(" ");
      if (nested) {
        const hit = shellTarget(nested, cwd, inProject, depth + 1);
        if (hit) return hit;
      }
      continue;
    }
    if ((name === "powershell" || name === "pwsh") && rest.length) {
      const k = rest.findIndex((w) => /^-(c|command)$/i.test(w));
      if (k >= 0 && rest[k + 1]) {
        const nested = rest.slice(k + 1).join(" ");
        const hit = shellTarget(nested, cwd, inProject, depth + 1);
        if (hit) return hit;
      }
    }
    if (name === "cd" || name === "set-location" || name === "pushd") {
      if (rest[0]) cwd = path.resolve(cwd, rest[0]);
    } else if (WRITERS.has(name)) {
      const hit = rest.map((w) => bad(w, cwd)).find(Boolean);
      if (hit) return hit;
    } else if ((name === "sed" || name === "perl") && rest.some((w) => /^-\w*i/.test(w) || w === "--in-place")) {
      // Files are the non-flag words, minus the script: the word after -e/-f, else the first one
      const files = rest.filter((w, k) => !w.startsWith("-") && !/^-\w*[ef]$/.test(rest[k - 1] || ""));
      if (!rest.some((w) => /^-\w*[ef]$/.test(w))) files.shift();
      const hit = files.map((w) => bad(w, cwd)).find(Boolean);
      if (hit) return hit;
    } else if (name === "git") {
      let j = 0;
      while (j < rest.length && rest[j].startsWith("-")) j += /^-[Cc]$/.test(rest[j]) ? 2 : 1;
      const readOnly = rest[j] === "stash" && /^(list|show)$/.test(rest[j + 1] || "");
      if (GIT_WRITERS.has(rest[j]) && !readOnly) return `git ${rest[j]}`;
    }
  }
  return null;
}

function main(data) {
  const tool = data.tool_name ?? data.toolName;
  if (typeof tool === "string" && tool && !WRITER_TOOL.test(tool)) return 0;
  // The installed hook lives at <repo>/.agent-workflow/hooks/, so its own location names the repo when the
  // harness gives no project dir (the Copilot harness may run hooks from another cwd)
  const root = process.env.CLAUDE_PROJECT_DIR || path.resolve(__dirname, "..", "..");
  const kitDir = path.join(root, ".agent-workflow");
  const plansDir = path.join(kitDir, "plans");
  if (!fs.existsSync(plansDir)) return 0;
  // Only the header (before the first "## ") holds the status, so a quoted "Status: DRAFT" further down doesn't count
  const drafts = fs
    .readdirSync(plansDir)
    .filter((f) => f.endsWith(".md") && !NOT_PLAN.test(f))
    .filter((f) => DRAFT.test(fs.readFileSync(path.join(plansDir, f), "utf8").split(/^## /m)[0]));
  if (!drafts.length) return 0;

  const inside = (dir, p) => {
    const rel = path.relative(dir, p);
    return !rel.startsWith("..") && !path.isAbsolute(rel);
  };
  // Only files in this project are gated, and the workflow's own folder (plans, standards) is always editable
  const inProject = (abs) => inside(root, abs) && !inside(kitDir, abs);
  let input = data.tool_input ?? data.toolArgs ?? {};
  if (typeof input === "string") {
    try {
      input = JSON.parse(input);
    } catch {
      input = {};
    }
  }
  if (!input || typeof input !== "object") input = {};
  const gated = (f) => (typeof f === "string" && inProject(path.resolve(root, f)) ? f : null);
  let target = null;
  if (typeof input.command === "string") target = shellTarget(input.command, typeof data.cwd === "string" ? data.cwd : root, inProject);
  else if (Array.isArray(input.replacements)) {
    target = input.replacements.map((r) => gated(r && r.filePath)).find(Boolean); // VS Code multi_replace_string_in_file
  } else if (typeof input.input === "string" && /^\*\*\* Begin Patch/m.test(input.input)) {
    // VS Code apply_patch: the files are named inside the patch text
    for (const m of input.input.matchAll(/^\*\*\* (?:Update|Add|Delete) File: (.+)$/gm)) if ((target = gated(m[1].trim()))) break;
  } else {
    // file_path/notebook_path: Claude Code; filePath: VS Code tools; path: Copilot CLI tools
    target = gated(input.file_path || input.notebook_path || input.filePath || input.path);
  }
  if (!target) return 0;

  const reason =
    `Blocked (${target}): .agent-workflow/plans/${drafts.join(", .agent-workflow/plans/")} is still DRAFT. ` +
    "Finish the plan and get user approval (Status: APPROVED) before changing code. " +
    "If that plan is abandoned, ask the user whether to delete it or set it to 'Status: ABANDONED'. " +
    "If this command doesn't change project files, tell the user the hook misread it.";
  console.error(reason);
  console.log(JSON.stringify({ permissionDecision: "deny", permissionDecisionReason: reason }));
  return 2;
}

if (require.main === module) {
  let input = "";
  process.stdin.on("data", (c) => (input += c));
  process.stdin.on("end", () => {
    let data;
    try {
      data = JSON.parse(input);
    } catch {
      process.exit(0); // never block on malformed input
    }
    process.exit(data && typeof data === "object" ? guarded(data) : 0);
  });
}
// A bug in the hook must never deny every call (the harness reports a crash as "hook errored"), so it fails open.
function guarded(data) {
  try {
    return main(data);
  } catch (e) {
    console.error(`plan-gate: ${e.message} (not blocking)`);
    return 0;
  }
}
module.exports = { parse, shellTarget }; // for the tests
