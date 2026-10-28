#!/usr/bin/env node
// PreToolUse hook: while any plan in .agent-workflow/plans/ is still "Status: DRAFT", block edits to files
// outside .agent-workflow/. Covers the edit tools and the obvious shell writes (redirects, rm/mv/cp, sed -i, find -delete,
// xargs and patch, tree-changing git commands, PowerShell file cmdlets, and the same inside sh -c, cmd /c, pwsh -Command,
// subshells, $(…) and backticks, and after then/do/sudo/env-style prefixes).
// Exit 2 = block, and stderr is shown to the agent.
// Works with Claude Code (tool_input) and the Copilot harness (tool_input via the PreToolUse alias, or toolArgs),
// which also reads the JSON deny decision printed to stdout. File names come from file_path/notebook_path (Claude Code),
// filePath/replacements/patch text (VS Code), or path (Copilot CLI, including str_replace_editor's {command, path}).
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
const SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh"]);
const SC_EXE = /^(query|queryex|qc|qdescription|start|stop|pause|continue|config|create|delete|description|failure|sdshow)$/i;
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
      // Inside double quotes, \" \\ \$ and \` stand for the character itself (sh); a Windows path's \ stays as is
      let j = i + 1;
      let s = "";
      while (j < cmd.length && cmd[j] !== c) {
        if (c === '"' && cmd[j] === "\\" && /["\\$`]/.test(cmd[j + 1] || "")) j++;
        s += cmd[j++];
      }
      word = (word ?? "") + s;
      i = j;
    } else if (c === "\\" && /[();|&]/.test(cmd[i + 1] || "")) {
      word = (word ?? "") + cmd[++i]; // \( \) \; are literal (find's grouping and -exec … \;); other \ stay, for Windows paths
    } else if (c !== "\n" && /\s/.test(c)) end();
    else if (c === ";" || c === "|" || c === "&" || c === "\n" || c === "(" || c === ")") {
      // ( and ) also end a command: subshells "(rm x)", and "$(rm x)" (its "$" is left as a word on its own)
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

// Shell keywords and command wrappers that run the command after them: "then rm x", "sudo rm x", "env A=1 rm x"
const PREFIXES = new Set(["then", "do", "else", "elif", "if", "while", "until", "!", "{", "sudo", "doas", "env", "time",
  "nohup", "command", "exec", "builtin", "nice", "stdbuf", "ionice", "chronic"]);
// Their options that take a value as the next word (sudo -u bob, sudo -g grp, nice -n 10)
const PREFIX_VALUE_FLAGS = /^-(u|g|C|U|p|h|r|t|D|R|n)$/;

// The first project file (outside .agent-workflow/) a shell command would change, or null
function shellTarget(command, cwd, inProject, depth = 0) {
  if (depth > 3) return null;
  const bad = (w, base) => {
    if (typeof w !== "string" || !w || w.startsWith("-") || /[$`]/.test(w) || /^&?\d*$/.test(w)) return null;
    if (/^(\/dev\/null|nul|\$null)$/i.test(w)) return null;
    const p = process.platform === "win32" ? w.replace(/^\/([a-z])(\/|$)/i, "$1:/") : w; // Git Bash /c/... paths
    return inProject(path.resolve(base, p)) ? w : null;
  };
  // Command substitutions run even inside double quotes ("$(rm x)", `rm x`), so check each one as a command of its own
  for (const [, a, b] of command.matchAll(/\$\(([^()]*)\)|`([^`]*)`/g)) {
    const hit = shellTarget(a ?? b, cwd, inProject, depth + 1);
    if (hit) return hit;
  }
  for (const words of parse(command)) {
    const args = words.filter((w) => typeof w === "string");
    for (const w of words) if (w.to && bad(w.to, cwd)) return w.to;
    let i = 0;
    // VAR=value prefixes, keywords and wrappers, and the wrappers' own options
    for (let wrapped = false; i < args.length; i++) {
      const w = args[i];
      if (/^\w+=/.test(w)) continue;
      if (PREFIXES.has(w.toLowerCase())) {
        wrapped = true;
        continue;
      }
      if (wrapped && w.startsWith("-")) {
        if (PREFIX_VALUE_FLAGS.test(w)) i++;
        continue;
      }
      break;
    }
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
    if (SHELLS.has(name)) {
      // bash -c "cmd", sh -ec "cmd": the word after the flag is the script; later words are its $0, $1, …
      const k = rest.findIndex((w) => /^-[a-z]*c[a-z]*$/i.test(w));
      if (k >= 0 && rest[k + 1]) {
        const hit = shellTarget(rest[k + 1], cwd, inProject, depth + 1);
        if (hit) return hit;
      }
      continue;
    }
    if (name === "xargs") {
      // The files come from stdin, so any writer run through xargs in the project counts
      let j = 0;
      // GNU -i takes its value attached (-i{}), so only -I and the others skip a word
      while (j < rest.length && rest[j].startsWith("-")) j += /^-[InPLdEsa]$/.test(rest[j]) ? 2 : 1;
      const inner = path.basename(rest[j] || "").toLowerCase().replace(/\.exe$/, "");
      const writes = WRITERS.has(inner) || ((inner === "sed" || inner === "perl") && rest.some((w) => /^-\w*i/.test(w) || /^--in-place(=|$)/.test(w)));
      if (writes && inProject(cwd)) return `xargs ${inner}`;
      continue;
    }
    if (name === "cd" || name === "set-location" || name === "pushd") {
      if (rest[0]) cwd = path.resolve(cwd, rest[0]);
    } else if (name === "sc" && SC_EXE.test(rest[0] || "")) {
      continue; // sc.exe (Windows services), not the Set-Content alias
    } else if (WRITERS.has(name)) {
      const hit = rest.map((w) => bad(w, cwd)).find(Boolean);
      if (hit) return hit;
    } else if (name === "find" && rest.some((w) => /^-(delete|exec|execdir|ok|okdir)$/.test(w))) {
      const execs = rest.map((w, k) => (/^-(exec|execdir|ok|okdir)$/.test(w) ? rest[k + 1] : null)).filter(Boolean);
      if (rest.includes("-delete") || execs.some((w) => WRITERS.has(path.basename(w).toLowerCase()))) {
        const k = rest.findIndex((w) => /^[-(!]/.test(w));
        const roots = rest.slice(0, k < 0 ? rest.length : k);
        const hit = (roots.length ? roots : ["."]).map((w) => bad(w, cwd)).find(Boolean);
        if (hit) return hit;
      }
    } else if (name === "patch" && !rest.includes("--dry-run") && inProject(cwd)) {
      return "patch";
    } else if ((name === "sed" || name === "perl") && rest.some((w) => /^-\w*i/.test(w) || /^--in-place(=|$)/.test(w))) {
      // Files are the non-flag words, minus the script: the word after -e/-f, else the first one
      const files = rest.filter((w, k) => !w.startsWith("-") && !/^-\w*[ef]$/.test(rest[k - 1] || ""));
      if (!rest.some((w) => /^-\w*[ef]$/.test(w))) files.shift();
      const hit = files.map((w) => bad(w, cwd)).find(Boolean);
      if (hit) return hit;
    } else if (name === "git") {
      let j = 0;
      let dir = cwd;
      while (j < rest.length && rest[j].startsWith("-")) {
        if (/^-C$/.test(rest[j]) && rest[j + 1]) dir = path.resolve(dir, rest[j + 1]);
        j += /^-[Cc]$/.test(rest[j]) ? 2 : 1;
      }
      const readOnly = rest[j] === "stash" && /^(list|show)$/.test(rest[j + 1] || "");
      // Another repo (git -C ../other, or after cd) isn't gated
      if (GIT_WRITERS.has(rest[j]) && !readOnly && inProject(dir)) return `git ${rest[j]}`;
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

  // Canonical form (links resolved, real casing, long names on Windows), through the nearest existing ancestor for a
  // file that doesn't exist yet, so a path reached through a link or an 8.3 short name still counts as the same file
  const canon = (p) => {
    try {
      return fs.realpathSync.native(p);
    } catch {
      const parent = path.dirname(p);
      return parent === p ? p : path.join(canon(parent), path.basename(p));
    }
  };
  const inside = (dir, p) => {
    // macOS file systems are case-insensitive by default (path.relative already ignores case on Windows)
    const fold = (s) => (process.platform === "darwin" ? s.toLowerCase() : s);
    const rel = path.relative(fold(dir), fold(canon(p)));
    return !rel.startsWith("..") && !path.isAbsolute(rel);
  };
  // Only files in this project are gated, and the workflow's own folder (plans, standards) is always editable
  const ROOT = canon(root);
  const KIT_DIR = canon(kitDir);
  const inProject = (abs) => inside(ROOT, abs) && !inside(KIT_DIR, abs);
  let input = data.tool_input ?? data.toolArgs ?? {};
  if (typeof input === "string") {
    try {
      input = JSON.parse(input);
    } catch {
      input = {};
    }
  }
  if (!input || typeof input !== "object") input = {};
  // str_replace_editor's {command: "view", path} only reads
  if (input.command === "view" && typeof input.path === "string") return 0;
  const gated = (f) => (typeof f === "string" && inProject(path.resolve(root, f)) ? f : null);
  let target = null;
  // A shell tool's command. Editor tools can carry a `command` too (str_replace_editor: {command: "str_replace", path}),
  // which parses as a harmless shell command, so the file checks below still run when nothing was found here.
  if (typeof input.command === "string") target = shellTarget(input.command, typeof data.cwd === "string" ? data.cwd : root, inProject);
  if (!target && Array.isArray(input.replacements)) {
    target = input.replacements.map((r) => gated(r && r.filePath)).find(Boolean); // VS Code multi_replace_string_in_file
  }
  if (!target && typeof input.input === "string" && /^\*\*\* Begin Patch/m.test(input.input)) {
    // VS Code apply_patch: the files are named inside the patch text
    for (const m of input.input.matchAll(/^\*\*\* (?:Update|Add|Delete) File: (.+)$/gm)) if ((target = gated(m[1].trim()))) break;
  }
  // file_path/notebook_path: Claude Code; filePath: VS Code tools; path: Copilot CLI tools
  if (!target) target = gated(input.file_path || input.notebook_path || input.filePath || input.path);
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
