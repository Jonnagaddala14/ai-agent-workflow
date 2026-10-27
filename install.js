#!/usr/bin/env node
// Installs or upgrades the workflow kit into a target repo.
// Usage: node install.js <target-repo> [--claude-only | --copilot-only] [--gitignore] [--force]
//   --gitignore  write the ignore rules to the repo's .gitignore (shared) instead of .git/info/exclude (local)
//   --force      also overwrite kit files you've edited locally
// Everything goes into .agent-workflow/, plus the small entry files each tool only looks for in fixed places
// (.claude/commands, .claude/agents, .claude/rules, .claude/settings.local.json, .github/prompts, .github/agents,
// .github/hooks, .github/instructions). All of it is git-ignored, so nothing is committed and no committed file is edited.
// Records what it installed in .agent-workflow/manifest.json, so upgrades update untouched files, skip files
// you've edited, and remove files a newer kit no longer ships. Never touches STANDARDS.md or plans/.
const { execFileSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const KIT = __dirname;
const DIR = ".agent-workflow";
const USAGE = "Usage: node install.js <target-repo> [--claude-only | --copilot-only] [--gitignore] [--force]";
const FLAGS = ["--claude-only", "--copilot-only", "--gitignore", "--force"];
const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const unknown = args.filter((a) => a.startsWith("-") && !FLAGS.includes(a));
if (unknown.length) fail(`Unknown option: ${unknown.join(", ")}\n${USAGE}`);
if (flag("--claude-only") && flag("--copilot-only")) fail(`Pass at most one of --claude-only and --copilot-only.\n${USAGE}`);
const positional = args.filter((a) => !a.startsWith("-"));
if (positional.length !== 1) fail(USAGE);
const target = positional[0];
if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) fail(`Not a folder: ${target}\n${USAGE}`);
// Canonical path (long form, real casing, links resolved): it's baked into the Copilot hook command
const T = fs.realpathSync.native(path.resolve(target));
// Windows and macOS paths are case-insensitive, and the same folder can be reached through a link
const same = (a, b) => {
  const norm = (p) => fs.realpathSync.native(p).replace(/[\\/]+$/, "");
  return process.platform === "win32" ? norm(a).toLowerCase() === norm(b).toLowerCase() : norm(a) === norm(b);
};
if (same(T, KIT)) fail("Target is the kit itself. Pass a different repo.");
const claude = !flag("--copilot-only");
const copilot = !flag("--claude-only");
const force = flag("--force");
const VERSION = fs.readFileSync(path.join(KIT, "VERSION"), "utf8").trim();
const MANIFEST = path.join(T, DIR, "manifest.json");
const toPosix = (p) => p.split(path.sep).join("/");
const HOOK_MATCHER = "Edit|Write|MultiEdit|NotebookEdit|Bash|PowerShell";
// One hook command for both tools: bare `node` (a quoted node.exe path is a parse error in PowerShell) and the
// script's absolute path (the Copilot harness has no project-dir variable and may run hooks from another cwd;
// `$VAR` only expands in sh-like shells). Both hook files are local and git-ignored, so an absolute path is fine.
const HOOK_COMMAND = `node "${toPosix(path.join(T, DIR, "hooks", "plan-gate.js"))}"`;
// The plan-gate hook entry merged into the target's .claude/settings.local.json
const HOOK = { matcher: HOOK_MATCHER, hooks: [{ type: "command", command: HOOK_COMMAND }] };
const log = [];
const note = (action, rel, why = "") => log.push(`  ${action.padEnd(10)} ${rel}${why ? ` (${why})` : ""}`);

const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");
const write = (p, s) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, s);
};
// Line endings are ignored, so git's CRLF conversion on Windows doesn't count as a local edit
const hash = (buf) => crypto.createHash("sha256").update(buf.toString("utf8").replace(/\r\n/g, "\n")).digest("hex");
const git = (...a) => {
  try {
    return execFileSync("git", ["-C", T, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
};

// Ignore rules, the hook and snapshots all assume the target is the repo root
const top = git("rev-parse", "--show-toplevel");
if (top && !same(top, T)) fail(`Target is inside the git repo at ${path.resolve(top)}. Install at the repo root instead.`);
// Kits before 0.3.0 lived in the repo root and edited committed files. 0.3.x's installer migrates 0.2.0.
if (!fs.existsSync(MANIFEST) && fs.existsSync(path.join(T, ".wf-manifest.json"))) {
  fail("This repo has kit 0.2.0. Upgrade it with the 0.3.1 installer first (it moves STANDARDS.md and plans/ for you), then re-run.");
}
if (!fs.existsSync(MANIFEST) && fs.existsSync(path.join(T, ".wf-version"))) {
  fail("This repo has kit 0.1.0, which can't be upgraded. Delete its files (AGENT_WORKFLOW.md, workflow/, .wf-version," +
    " the @AGENT_WORKFLOW.md line in CLAUDE.md), then re-run.");
}

let old = { files: {} };
try {
  if (fs.existsSync(MANIFEST)) old = JSON.parse(read(MANIFEST));
} catch {
  log.push("  warning    manifest unreadable; treating all existing kit files as edited");
}
const installed = {};
const skipped = [];

// In a git checkout of the kit, only files git tracks are shipped, so stray files (.DS_Store, scratch notes) aren't.
// New kit files must be `git add`ed before they install.
let shipped = null;
try {
  shipped = new Set(execFileSync("git", ["-C", KIT, "ls-files"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\n"));
} catch {} // a downloaded copy of the kit, not a git checkout
if (shipped && !shipped.has("VERSION")) shipped = null; // a downloaded copy inside some other repo
function walk(rel) {
  const abs = path.join(KIT, rel);
  if (!fs.existsSync(abs)) return [];
  if (fs.statSync(abs).isFile()) {
    const f = toPosix(rel);
    return (shipped ? shipped.has(f) : !path.basename(f).startsWith(".")) ? [f] : [];
  }
  return fs.readdirSync(abs).flatMap((n) => walk(path.join(rel, n)));
}

// Writes a kit file (or generated content) unless the target's copy was edited locally
function copy(rel, data = fs.readFileSync(path.join(KIT, rel))) {
  const dst = path.join(T, rel);
  const h = hash(data);
  if (!fs.existsSync(dst)) {
    write(dst, data);
    installed[rel] = h;
    return note("added", rel);
  }
  const cur = hash(fs.readFileSync(dst));
  if (cur === h) {
    installed[rel] = h;
    return note("unchanged", rel);
  }
  if (cur === old.files[rel] || force) {
    write(dst, data);
    installed[rel] = h;
    return note("updated", rel, cur === old.files[rel] ? "" : "forced; local edits overwritten");
  }
  if (old.files[rel]) installed[rel] = old.files[rel]; // keep treating it as edited next time
  skipped.push(rel);
  note("SKIPPED", rel, "edited locally; re-run with --force to overwrite");
}

// Kit files for the chosen tools. The kit folder's user content (standards, plans, manifest) is never copied.
const pick = (dir, re) => walk(dir).filter((f) => re.test(path.posix.basename(f)));
const own = (f) => !/^\.agent-workflow\/(STANDARDS\.md|manifest\.json|plans\/)/.test(f);
const kitFiles = [
  ...walk(DIR).filter(own),
  ...(claude ? pick(".claude/commands", /^wf.*\.md$/) : []),
  ...(copilot ? [...pick(".github/prompts", /^wf.*\.prompt\.md$/), ...pick(".github/agents", /^wf.*\.agent\.md$/)] : []),
];
kitFiles.forEach((rel) => copy(rel));

// Lines ending in <!-- claude --> or <!-- copilot --> are kept only for that tool, without the marker
const forTool = (text, tool) =>
  text
    .split(/\r?\n/)
    .flatMap((l) => {
      const m = l.match(/\s*<!-- (claude|copilot) -->\s*$/);
      return !m ? [l] : m[1] === tool ? [l.slice(0, m.index)] : [];
    })
    .join("\n");
// Generated files are built from the installed copies, so local edits to them reach both tools on the next install
const installedText = (rel) => read(path.join(T, rel)) || read(path.join(KIT, rel));

// The core rules, always loaded by each tool
const core = installedText(`${DIR}/AGENT_WORKFLOW.md`).trim();
const managed = "Managed by install.js: edit .agent-workflow/AGENT_WORKFLOW.md instead, then re-run the installer.";
const RULES = ".claude/rules/agent-workflow.md";
const INSTR = ".github/instructions/agent-workflow.instructions.md";
if (claude) copy(RULES, Buffer.from(`<!-- ${managed} -->\n${forTool(core, "claude")}\n`));
if (copilot) copy(INSTR, Buffer.from(`---\napplyTo: "**"\ndescription: "${managed}"\n---\n${forTool(core, "copilot")}\n`));
// The sub-agents, one source each in .agent-workflow/agents/
const agentFiles = [];
for (const src of walk(`${DIR}/agents`).filter((f) => f.endsWith(".md"))) {
  const name = path.posix.basename(src, ".md");
  const text = installedText(src);
  for (const [tool, rel] of [["claude", `.claude/agents/${name}.md`], ["copilot", `.github/agents/${name}.agent.md`]]) {
    if (tool === "claude" ? !claude : !copilot) continue;
    copy(rel, Buffer.from(forTool(text, tool)));
    agentFiles.push(rel);
  }
}
// The Copilot hook file is generated per repo (absolute script path), so it goes through copy() like the files above.
const COPILOT_HOOK_FILE = ".github/hooks/wf-plan-gate.json";
if (copilot) {
  const cfg = { version: 1, hooks: { PreToolUse: [{ type: "command", matcher: HOOK_MATCHER, command: HOOK_COMMAND, timeoutSec: 10 }] } };
  copy(COPILOT_HOOK_FILE, Buffer.from(JSON.stringify(cfg, null, 2) + "\n"));
}
const entryFiles = [...kitFiles, ...agentFiles, ...(claude ? [RULES] : []), ...(copilot ? [INSTR, COPILOT_HOOK_FILE] : [])];

// Remove files an older kit version installed that this version no longer ships
const COPILOT_DIRS = [".github/prompts/", ".github/agents/", ".github/hooks/"];
const otherTool = (rel) =>
  (!claude && rel.startsWith(".claude/")) || (!copilot && (COPILOT_DIRS.some((d) => rel.startsWith(d)) || rel === INSTR));
for (const [rel, h] of Object.entries(old.files || {})) {
  if (entryFiles.includes(rel)) continue;
  if (otherTool(rel)) {
    installed[rel] = h; // installed earlier for the tool not chosen this time; leave it alone
    if ((old.skipped || []).includes(rel)) {
      skipped.push(rel); // still edited, so the install stays partial
      note("SKIPPED", rel, "edited locally, from an earlier install; re-run for that tool with --force to overwrite");
    }
    continue;
  }
  const dst = path.join(T, rel);
  if (!fs.existsSync(dst)) continue;
  if (hash(fs.readFileSync(dst)) === h || force) {
    fs.rmSync(dst);
    note("removed", rel, "no longer part of the kit");
    // Drop directories the removal left empty
    for (let d = path.dirname(dst); d !== T && fs.readdirSync(d).length === 0; d = path.dirname(d)) fs.rmdirSync(d);
  } else {
    note("kept", rel, `no longer part of the kit, but edited locally; move your edits into ${DIR}/ and delete it`);
  }
}

// The hook entry. Ours is found by its script name, so matcher and path changes update in place.
function findHook(settings) {
  const pre = settings.hooks?.PreToolUse || [];
  const mine = pre.flatMap((e) => e.hooks || []).find((h) => String(h.command).includes("plan-gate.js"));
  return { mine, entry: pre.find((e) => (e.hooks || []).includes(mine)) };
}
if (claude) {
  const rel = ".claude/settings.local.json";
  const p = path.join(T, rel);
  const before = fs.existsSync(p) ? read(p) : null;
  let s = null;
  try {
    s = before ? JSON.parse(before.replace(/^\uFEFF/, "")) : {};
  } catch {
    note("SKIPPED", rel, "not valid JSON; add the plan-gate hook entry by hand");
  }
  if (s) {
    const { mine, entry } = findHook(s);
    if (mine && mine.command === HOOK.hooks[0].command && entry.matcher === HOOK.matcher) {
      note("unchanged", rel, "hook present");
    } else {
      if (mine && (entry.matcher === HOOK.matcher || entry.hooks.length === 1)) {
        entry.matcher = HOOK.matcher;
        Object.assign(mine, HOOK.hooks[0]);
      } else {
        // Our hook shares an entry with the user's hooks: move it out rather than change their matcher
        if (mine) entry.hooks.splice(entry.hooks.indexOf(mine), 1);
        ((s.hooks ??= {}).PreToolUse ??= []).push(structuredClone(HOOK));
      }
      write(p, JSON.stringify(s, null, 2) + "\n");
      note(before === null ? "added" : "updated", rel, "plan-gate hook");
    }
  }
}

// Ignore everything the kit puts in the repo. Default: .git/info/exclude, which is local and never committed.
const IGNORE = [
  `/${DIR}/*`,
  "/.claude/commands/wf*.md",
  "/.claude/agents/wf-*.md",
  `/${RULES}`,
  "/.claude/settings.local.json",
  "/.github/prompts/wf*.prompt.md",
  "/.github/agents/wf*.agent.md",
  "/.github/hooks/wf-plan-gate.json",
  `/${INSTR}`,
];
const BLOCK_RE = /# ai-agent-workflow:start[\s\S]*?# ai-agent-workflow:end\r?\n?/;
const block = `# ai-agent-workflow:start (managed by install.js)\n${IGNORE.join("\n")}\n# ai-agent-workflow:end\n`;
const common = git("rev-parse", "--git-common-dir");
const excludeRel = common && toPosix(path.relative(T, path.join(path.resolve(T, common), "info", "exclude")));
const [useRel, otherRel] = flag("--gitignore") ? [".gitignore", excludeRel] : [excludeRel, ".gitignore"];
if (!useRel) {
  note("SKIPPED", "ignore rules", "not a git repo; add them to .gitignore yourself");
} else {
  const p = path.join(T, useRel);
  const cur = read(p);
  const next = BLOCK_RE.test(cur) ? cur.replace(BLOCK_RE, block) : (cur && !cur.endsWith("\n") ? cur + "\n" : cur) + block;
  if (next === cur) note("unchanged", useRel, "ignore rules");
  else {
    write(p, next);
    note(BLOCK_RE.test(cur) ? "updated" : "appended", useRel, "ignore rules");
  }
  // Switching between --gitignore and the default: take the block out of the other file
  const op = otherRel && path.join(T, otherRel);
  if (op && BLOCK_RE.test(read(op))) {
    const rest = read(op).replace(BLOCK_RE, "");
    if (rest.trim()) write(op, rest);
    else fs.rmSync(op);
    note(rest.trim() ? "updated" : "removed", otherRel, "ignore rules moved");
  }
}

write(MANIFEST, JSON.stringify({ version: VERSION, skipped, files: installed }, null, 2) + "\n");

const from = old.version && old.version !== VERSION ? ` (upgraded from ${old.version})` : "";
console.log(`ai-agent-workflow ${VERSION}${from} → ${T}\n${log.join("\n")}`);
if (skipped.length) {
  console.log(`\n${skipped.length} edited file(s) kept, so this install is partial. Review them, or re-run with --force.`);
}

// Ignore rules don't apply to files git already tracks
if (common) {
  const tracked = git("ls-files", "--", DIR, ...entryFiles.filter((f) => !f.startsWith(`${DIR}/`)), ".claude/settings.local.json");
  if (tracked) {
    const list = tracked.split("\n");
    console.log(
      `\nWarning: git already tracks ${list.length} of these file(s), so ignoring them has no effect:\n` +
        list.map((f) => `  ${f}`).join("\n") +
        `\nTo stop tracking them (the files stay on disk): git rm --cached -- ${list.map((f) => `"${f}"`).join(" ")}`
    );
  }
} else {
  console.log("\nWarning: target isn't a git repo. Review and snapshots need git.");
}
console.log(`\nNext: open the repo and run /wf-standards${fs.existsSync(path.join(T, DIR, "STANDARDS.md")) ? " --refresh (STANDARDS.md exists)" : " once"}, or just /wf <requirement> (it offers the standards step when needed).`);
