#!/usr/bin/env node
// Installs or upgrades the workflow kit into a target repo.
// Usage: node install.js <target-repo> [--claude-only | --copilot-only] [--gitignore] [--force]
//   --gitignore  write the ignore rules to the repo's .gitignore (shared) instead of .git/info/exclude (local)
//   --force      also overwrite kit files you've edited locally
// Everything goes into .agent-workflow/, plus the small entry files each tool only looks for in fixed places
// (.claude/commands, .claude/agents, .claude/rules, .claude/settings.local.json, .github/prompts,
// .github/instructions). All of it is git-ignored, so nothing is committed and no committed file is edited.
// Records what it installed in .agent-workflow/manifest.json, so upgrades update untouched files, skip files
// you've edited, and remove files a newer kit no longer ships. Never touches STANDARDS.md or plans/, except
// to move them into .agent-workflow/ when upgrading from the 0.2.0 layout.
const { execFileSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const KIT = __dirname;
const DIR = ".agent-workflow";
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const target = args.find((a) => !a.startsWith("--"));
if (!target || !fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
  console.error("Usage: node install.js <target-repo> [--claude-only | --copilot-only] [--gitignore] [--force]");
  process.exit(1);
}
const T = path.resolve(target);
if (T === KIT) {
  console.error("Target is the kit itself. Pass a different repo.");
  process.exit(1);
}
const claude = !flag("--copilot-only");
const copilot = !flag("--claude-only");
const force = flag("--force");
const VERSION = fs.readFileSync(path.join(KIT, "VERSION"), "utf8").trim();
const MANIFEST = path.join(T, DIR, "manifest.json");
const OLD_MANIFEST = path.join(T, ".wf-manifest.json"); // 0.2.0 layout
const LEGACY = path.join(T, ".wf-version"); // 0.1.0, which recorded only a version
const log = [];
const note = (action, rel, why = "") => log.push(`  ${action.padEnd(10)} ${rel}${why ? ` (${why})` : ""}`);

const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");
const write = (p, s) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, s);
};
// Line endings are ignored, so git's CRLF conversion on Windows doesn't count as a local edit
const hash = (buf) => crypto.createHash("sha256").update(buf.toString("utf8").replace(/\r\n/g, "\n")).digest("hex");
const toPosix = (p) => p.split(path.sep).join("/");
const git = (...a) => {
  try {
    return execFileSync("git", ["-C", T, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
};

const legacy = !fs.existsSync(MANIFEST) && !fs.existsSync(OLD_MANIFEST) && fs.existsSync(LEGACY) ? read(LEGACY).trim() : null;
const oldLayout = !fs.existsSync(MANIFEST) && (fs.existsSync(OLD_MANIFEST) || !!legacy);
let old = { files: {} };
try {
  if (fs.existsSync(MANIFEST)) old = JSON.parse(read(MANIFEST));
  else if (fs.existsSync(OLD_MANIFEST)) old = JSON.parse(read(OLD_MANIFEST));
} catch {
  log.push("  warning    manifest unreadable; treating all existing kit files as edited");
}
const installed = {};
const skipped = [];

function walk(rel) {
  const abs = path.join(KIT, rel);
  if (!fs.existsSync(abs)) return [];
  if (fs.statSync(abs).isFile()) return [toPosix(rel)];
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

// Move STANDARDS.md and plans/ from the 0.2.0 layout (repo root) into the kit folder
if (oldLayout) {
  for (const name of ["STANDARDS.md", "plans"]) {
    const from = path.join(T, name);
    const to = path.join(T, DIR, name);
    if (!fs.existsSync(from)) continue;
    if (fs.existsSync(to)) {
      note("kept", name, `${DIR}/${name} already exists; merge them by hand`);
      continue;
    }
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(from, to);
    note("moved", name, `→ ${DIR}/${name}`);
  }
}

// Kit files for the chosen tools. The kit folder's user content (standards, plans, manifest) is never copied.
const pick = (dir, re) => walk(dir).filter((f) => re.test(path.posix.basename(f)));
const own = (f) => !/^\.agent-workflow\/(STANDARDS\.md|manifest\.json|plans\/)/.test(f);
const kitFiles = [
  ...walk(DIR).filter(own),
  ...(claude ? [...pick(".claude/commands", /^wf.*\.md$/), ...pick(".claude/agents", /^wf-.*\.md$/)] : []),
  ...(copilot ? pick(".github/prompts", /^wf-.*\.prompt\.md$/) : []),
];
kitFiles.forEach((rel) => copy(rel));

// The core rules, always loaded by each tool. Generated from the installed AGENT_WORKFLOW.md, so local edits to it
// reach both tools on the next install.
const core = read(path.join(T, DIR, "AGENT_WORKFLOW.md")).trim();
const managed = "Managed by install.js: edit .agent-workflow/AGENT_WORKFLOW.md instead, then re-run the installer.";
const RULES = ".claude/rules/agent-workflow.md";
const INSTR = ".github/instructions/agent-workflow.instructions.md";
if (claude) copy(RULES, Buffer.from(`<!-- ${managed} -->\n${core}\n`));
if (copilot) copy(INSTR, Buffer.from(`---\napplyTo: "**"\ndescription: ${managed}\n---\n${core}\n`));
const entryFiles = [...kitFiles, ...(claude ? [RULES] : []), ...(copilot ? [INSTR] : [])];

// Remove files an older kit version installed that this version no longer ships
const otherTool = (rel) =>
  (!claude && rel.startsWith(".claude/")) || (!copilot && (rel.startsWith(".github/prompts/") || rel === INSTR));
for (const [rel, h] of Object.entries(old.files || {})) {
  if (entryFiles.includes(rel)) continue;
  if (otherTool(rel)) {
    installed[rel] = h; // installed earlier for the tool not chosen this time; leave it alone
    continue;
  }
  const dst = path.join(T, rel);
  if (!fs.existsSync(dst)) continue;
  if (hash(fs.readFileSync(dst)) === h || force) {
    fs.rmSync(dst);
    note("removed", rel, "no longer part of the kit");
    // Drop directories the old layout left empty (workflow/scripts, workflow/, .claude/hooks)
    for (let d = path.dirname(dst); d !== T && fs.readdirSync(d).length === 0; d = path.dirname(d)) fs.rmdirSync(d);
  } else {
    note("kept", rel, `no longer part of the kit, but edited locally; move your edits into ${DIR}/ and delete it`);
  }
}

// Hook entries: ours is found by its script name, so moves between settings files and path changes update in place
const ours = JSON.parse(read(path.join(KIT, ".claude/settings.json"))).hooks.PreToolUse[0];
function findHook(settings) {
  const pre = settings.hooks?.PreToolUse || [];
  const mine = pre.flatMap((e) => e.hooks || []).find((h) => String(h.command).includes("plan-gate.js"));
  return { pre, mine, entry: pre.find((e) => (e.hooks || []).includes(mine)) };
}
function editJson(rel, fn) {
  const p = path.join(T, rel);
  try {
    const before = fs.existsSync(p) ? read(p) : null;
    const settings = before ? JSON.parse(before) : {};
    const action = fn(settings);
    if (!action) return;
    if (!Object.keys(settings).length && before !== null) {
      fs.rmSync(p);
      return note("removed", rel, `${action}; nothing else was in it`);
    }
    write(p, JSON.stringify(settings, null, 2) + "\n");
    note(before === null ? "added" : "updated", rel, action);
  } catch {
    note("SKIPPED", rel, "not valid JSON; fix the plan-gate hook entry by hand");
  }
}
if (claude) {
  // 0.2.0 put the hook in the committed settings.json; take it out
  editJson(".claude/settings.json", (s) => {
    const { pre, entry } = findHook(s);
    if (!entry) return null;
    pre.splice(pre.indexOf(entry), 1);
    if (!pre.length) delete s.hooks.PreToolUse;
    if (!Object.keys(s.hooks).length) delete s.hooks;
    return "plan-gate hook moved to settings.local.json";
  });
  editJson(".claude/settings.local.json", (s) => {
    const { mine, entry } = findHook(s);
    if (mine && mine.command === ours.hooks[0].command && entry.matcher === ours.matcher) {
      note("unchanged", ".claude/settings.local.json", "hook present");
      return null;
    }
    if (mine) {
      entry.matcher = ours.matcher;
      Object.assign(mine, ours.hooks[0]);
    } else ((s.hooks ??= {}).PreToolUse ??= []).push(ours);
    return "plan-gate hook";
  });
}

// 0.2.0 also edited committed files: the CLAUDE.md import and a block in copilot-instructions.md. Take them out.
function strip(rel, re) {
  const p = path.join(T, rel);
  const cur = read(p);
  if (!re.test(cur)) return;
  const next = cur.replace(re, "").replace(/\n{3,}/g, "\n\n").trim();
  if (next) write(p, next + "\n");
  else fs.rmSync(p);
  note(next ? "updated" : "removed", rel, "old kit entry taken out; commit this change");
}
if (claude) strip("CLAUDE.md", /^@AGENT_WORKFLOW\.md[ \t]*\r?\n?/m);
if (copilot) strip(".github/copilot-instructions.md", /<!-- ai-agent-workflow:start[\s\S]*?<!-- ai-agent-workflow:end -->\r?\n?/);

// Ignore everything the kit puts in the repo. Default: .git/info/exclude, which is local and never committed.
const IGNORE = [
  `/${DIR}/*`,
  "/.claude/commands/wf*.md",
  "/.claude/agents/wf-*.md",
  `/${RULES}`,
  "/.claude/settings.local.json",
  "/.github/prompts/wf-*.prompt.md",
  `/${INSTR}`,
];
const BLOCK_RE = /# ai-agent-workflow:start[\s\S]*?# ai-agent-workflow:end\r?\n?/;
const block = `# ai-agent-workflow:start (managed by install.js)\n${IGNORE.join("\n")}\n# ai-agent-workflow:end\n`;
const common = git("rev-parse", "--git-common-dir");
const excludeRel = common && toPosix(path.relative(T, path.join(path.resolve(T, common), "info", "exclude")));
const gitignore = path.join(T, ".gitignore");
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
if (flag("--ignore-plans")) note("note", "--ignore-plans", `no longer needed: plans live in ${DIR}/, which is ignored`);
if (/^\/?plans\/?\s*$/m.test(read(gitignore)) && oldLayout) {
  note("note", ".gitignore", "the plans/ line from --ignore-plans is no longer needed; remove it if nothing else uses it");
}

fs.rmSync(OLD_MANIFEST, { force: true });
if (!skipped.length) fs.rmSync(LEGACY, { force: true }); // kept until a full install, like before
write(MANIFEST, JSON.stringify({ version: VERSION, partial: skipped.length > 0, skipped, files: installed }, null, 2) + "\n");

console.log(`ai-agent-workflow ${VERSION} → ${T}\n${log.join("\n")}`);
if (skipped.length && legacy) {
  console.log(
    `\nThis repo was installed by kit ${legacy}, which didn't record fingerprints, so changed kit files can't be told` +
      ` apart from your own edits, and the ${skipped.length} changed file(s) are listed as SKIPPED. If you haven't edited any kit files,` +
      " re-run with --force. Otherwise, copy your edits aside first. Future upgrades won't need this."
  );
} else if (skipped.length) {
  console.log(`\n${skipped.length} edited file(s) kept, so this install is recorded as partial. Review them, or re-run with --force.`);
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
console.log(`\nNext: open the repo and run /wf-standards${fs.existsSync(path.join(T, DIR, "STANDARDS.md")) ? " --refresh (STANDARDS.md exists)" : " once"}.`);
