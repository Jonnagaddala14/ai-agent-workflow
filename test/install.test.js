// Installer tests: each runs install.js against a fresh temporary git repo.
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync, execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const KIT = path.join(__dirname, "..");
const VERSION = fs.readFileSync(path.join(KIT, "VERSION"), "utf8").trim();

const tmpDirs = [];
after(() => tmpDirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true, maxRetries: 3 })));
function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-install-"));
  tmpDirs.push(dir);
  execFileSync("git", ["init", "-q", dir]);
  execFileSync("git", ["-C", dir, "config", "core.autocrlf", "false"]);
  return dir;
}
const install = (dir, ...flags) =>
  spawnSync(process.execPath, [path.join(KIT, "install.js"), dir, ...flags], { encoding: "utf8" });
const manifest = (dir) => JSON.parse(fs.readFileSync(path.join(dir, ".agent-workflow/manifest.json"), "utf8"));
const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), "utf8");
const exists = (dir, rel) => fs.existsSync(path.join(dir, rel));

test("fresh install writes the kit, entry files, hook, ignore rules and manifest", () => {
  const dir = repo();
  const r = install(dir);
  assert.equal(r.status, 0, r.stderr);
  const m = manifest(dir);
  assert.equal(m.version, VERSION);
  assert.deepEqual(m.skipped, []);
  assert.equal(m.partial, undefined);
  assert.equal(Object.keys(m.files).length, 36);
  for (const rel of [".agent-workflow/AGENT_WORKFLOW.md", ".agent-workflow/scripts/mcp-servers.js", ".claude/commands/wf.md",
    ".claude/rules/agent-workflow.md", ".claude/agents/wf-reviewer.md", ".github/skills/wf/SKILL.md", ".github/skills/wf-plan/SKILL.md",
    ".github/agents/wf.agent.md", ".github/agents/wf-implementer.agent.md", ".github/agents/wf-reviewer.agent.md",
    ".github/hooks/wf-plan-gate.json", ".github/instructions/agent-workflow.instructions.md"]) {
    assert.ok(exists(dir, rel), rel);
  }
  const hook = JSON.parse(read(dir, ".claude/settings.local.json")).hooks.PreToolUse[0];
  assert.match(hook.matcher, /Bash/);
  // Copilot runtime names too, since on a PreToolUse entry the harness matches tokens against runtime or Claude names
  for (const name of ["edit", "create", "bash", "powershell", "str_replace_editor", "replace_string_in_file", "run_in_terminal"]) {
    assert.ok(hook.matcher.split("|").includes(name), `matcher lacks ${name}`);
  }
  assert.match(hook.hooks[0].command, /plan-gate\.js/);
  const copilotHook = JSON.parse(read(dir, ".github/hooks/wf-plan-gate.json")).hooks.PreToolUse[0];
  assert.equal(copilotHook.matcher, hook.matcher);
  // Same command in both: node (bare on Windows, absolute elsewhere) + absolute canonical script path with forward slashes
  assert.equal(copilotHook.command, hook.hooks[0].command);
  const node = process.platform === "win32" ? "node" : `"${hook.hooks[0].command.match(/^"([^"]+)"/)[1]}"`;
  if (process.platform !== "win32") assert.ok(fs.existsSync(node.slice(1, -1)), node);
  assert.equal(copilotHook.command, `${node} "${fs.realpathSync.native(dir).replace(/\\/g, "/")}/.agent-workflow/hooks/plan-gate.js"`);
  assert.match(read(dir, ".git/info/exclude"), /# ai-agent-workflow:start[\s\S]*\/\.agent-workflow\/\*[\s\S]*\/\.github\/agents\/wf\*\.agent\.md/);
  assert.equal(execFileSync("git", ["-C", dir, "status", "--porcelain"], { encoding: "utf8" }), "");
});

test("core rules and sub-agents are generated per tool, without the other tool's lines", () => {
  const dir = repo();
  install(dir);
  const claudeRules = read(dir, ".claude/rules/agent-workflow.md");
  const copilotRules = read(dir, ".github/instructions/agent-workflow.instructions.md");
  assert.match(claudeRules, /SendMessage/);
  assert.doesNotMatch(claudeRules, /one-shot/);
  assert.match(copilotRules, /one-shot/);
  assert.doesNotMatch(copilotRules, /SendMessage/);
  const claudeReviewer = read(dir, ".claude/agents/wf-reviewer.md");
  const copilotReviewer = read(dir, ".github/agents/wf-reviewer.agent.md");
  assert.match(claudeReviewer, /^---\nname: wf-reviewer\n[\s\S]*\ntools: Read, Grep/);
  assert.doesNotMatch(claudeReviewer, /user-invocable/);
  assert.match(copilotReviewer, /\ntools: \[read, search, edit, execute\]\nuser-invocable: false\n---\n/);
  assert.match(read(dir, ".claude/agents/wf-implementer.md"), /You'll be resumed/);
  assert.doesNotMatch(read(dir, ".github/agents/wf-implementer.agent.md"), /resumed/);
  for (const text of [claudeRules, copilotRules, claudeReviewer, copilotReviewer]) {
    assert.doesNotMatch(text, /<!-- (claude|copilot) -->/);
  }
});

test("the always-loaded core stays small", () => {
  const words = fs.readFileSync(path.join(KIT, ".agent-workflow/AGENT_WORKFLOW.md"), "utf8").split(/\s+/).length;
  assert.ok(words < 650, `AGENT_WORKFLOW.md has ${words} words`);
});

test("repo-map hides every entry file the installer writes", () => {
  const dir = repo();
  install(dir);
  execFileSync("git", ["-C", dir, "add", "-f", "-A"]);
  const out = spawnSync(process.execPath, [path.join(KIT, ".agent-workflow/scripts/repo-map.js"), dir], { encoding: "utf8" }).stdout;
  assert.match(out, /— 0 files/);
});

test("re-running changes nothing", () => {
  const dir = repo();
  install(dir);
  const r = install(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /\b(added|updated|removed|SKIPPED)\b/);
  assert.match(r.stdout, /hook present/);
});

test("an edited kit file is skipped, and --force overwrites it", () => {
  const dir = repo();
  install(dir);
  const rel = ".agent-workflow/stages/plan.md";
  fs.appendFileSync(path.join(dir, rel), "\nmy edit\n");
  let r = install(dir);
  assert.match(r.stdout, /SKIPPED\s+\.agent-workflow\/stages\/plan\.md/);
  assert.deepEqual(manifest(dir).skipped, [rel]);
  r = install(dir, "--force");
  assert.match(r.stdout, /updated\s+\.agent-workflow\/stages\/plan\.md \(forced/);
  assert.doesNotMatch(read(dir, rel), /my edit/);
  assert.deepEqual(manifest(dir).skipped, []);
});

test("CRLF line endings don't count as an edit", () => {
  const dir = repo();
  install(dir);
  const p = path.join(dir, ".agent-workflow/stages/plan.md");
  fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace(/\n/g, "\r\n"));
  assert.match(install(dir).stdout, /unchanged\s+\.agent-workflow\/stages\/plan\.md/);
});

test("single-tool installs leave the other tool out", () => {
  const a = repo();
  install(a, "--claude-only");
  assert.ok(exists(a, ".claude/commands/wf.md"));
  assert.ok(!exists(a, ".github"));
  assert.equal(Object.keys(manifest(a).files).length, 25);
  const b = repo();
  install(b, "--copilot-only");
  assert.ok(exists(b, ".github/skills/wf-plan/SKILL.md"));
  assert.ok(exists(b, ".github/agents/wf.agent.md"));
  assert.ok(exists(b, ".github/hooks/wf-plan-gate.json"));
  assert.ok(!exists(b, ".claude"));
  assert.equal(Object.keys(manifest(b).files).length, 27);
  // A later --claude-only run on the same repo keeps the Copilot files
  install(b, "--claude-only");
  assert.ok(exists(b, ".github/agents/wf.agent.md"));
  assert.ok(exists(b, ".github/hooks/wf-plan-gate.json"));
  assert.ok(exists(b, ".claude/commands/wf.md"));
});

test("bad arguments are refused", () => {
  const dir = repo();
  for (const flags of [["--gitingore"], ["--claude-only", "--copilot-only"], ["extra"]]) {
    const r = install(dir, ...flags);
    assert.equal(r.status, 1, flags.join(" "));
    assert.match(r.stderr, /Usage/);
  }
  assert.ok(!exists(dir, ".agent-workflow"));
});

test("subfolders are refused", () => {
  const sub = path.join(repo(), "sub");
  fs.mkdirSync(sub);
  assert.match(install(sub).stderr, /repo root/);
});

test("--help prints the usage", () => {
  const r = install("--help");
  assert.equal(r.status, 0);
  assert.match(r.stdout, /--uninstall/);
});

test("--dry-run reports the changes and writes nothing", () => {
  const dir = repo();
  const r = install(dir, "--dry-run");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /dry run[\s\S]*added\s+\.agent-workflow\/AGENT_WORKFLOW\.md/);
  assert.deepEqual(fs.readdirSync(dir), [".git"]);
  assert.doesNotMatch(read(dir, ".git/info/exclude"), /ai-agent-workflow/);
});

test("--dry-run of an upgrade reports the generated files that would change", () => {
  const dir = repo();
  install(dir);
  // An older, unedited install: the core and the files generated from it agree with their manifest fingerprints,
  // but the kit's core has since changed
  const core = ".agent-workflow/AGENT_WORKFLOW.md";
  const rules = ".claude/rules/agent-workflow.md";
  const instr = ".github/instructions/agent-workflow.instructions.md";
  const hash = (s) => require("crypto").createHash("sha256").update(s).digest("hex");
  const older = {
    [core]: "# older core\n",
    [rules]: read(dir, rules).split("\n")[0] + "\n# older core\n",
    [instr]: read(dir, instr).split("\n").slice(0, 4).join("\n") + "\n# older core\n",
  };
  const m = manifest(dir);
  for (const [rel, text] of Object.entries(older)) {
    fs.writeFileSync(path.join(dir, rel), text);
    m.files[rel] = hash(text);
  }
  fs.writeFileSync(path.join(dir, ".agent-workflow/manifest.json"), JSON.stringify(m));
  const r = install(dir, "--dry-run");
  for (const rel of Object.keys(older)) {
    assert.match(r.stdout, new RegExp(`updated\\s+${rel.replace(/[.]/g, "\\.")}`), rel);
    assert.equal(read(dir, rel), older[rel]); // nothing written
  }
  // An edited core, by contrast, is kept and the generated files follow it
  fs.writeFileSync(path.join(dir, core), "# my core\n");
  install(dir);
  assert.match(read(dir, rules), /# my core/);
  assert.match(read(dir, instr), /# my core/);
});

test("--uninstall removes the kit and its hook, and keeps plans, standards and other settings", () => {
  const dir = repo();
  fs.mkdirSync(path.join(dir, ".claude"));
  fs.writeFileSync(path.join(dir, ".claude/settings.local.json"), JSON.stringify({ permissions: { allow: ["Bash(ls)"] } }));
  install(dir);
  fs.mkdirSync(path.join(dir, ".agent-workflow/plans"));
  fs.writeFileSync(path.join(dir, ".agent-workflow/plans/a.md"), "# PLAN: a\n");
  fs.appendFileSync(path.join(dir, ".claude/commands/wf.md"), "\nmy edit\n");
  const r = install(dir, "--uninstall");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /kept\s+\.claude\/commands\/wf\.md \(edited locally/);
  assert.match(r.stdout, /Kept your \.agent-workflow\/plans/);
  assert.deepEqual(JSON.parse(read(dir, ".claude/settings.local.json")), { permissions: { allow: ["Bash(ls)"] } });
  assert.deepEqual(fs.readdirSync(path.join(dir, ".agent-workflow")), ["plans"]);
  assert.deepEqual(fs.readdirSync(path.join(dir, ".claude/commands")), ["wf.md"]);
  assert.ok(!exists(dir, ".github"));
  assert.doesNotMatch(read(dir, ".git/info/exclude"), /ai-agent-workflow/);
  assert.match(install(dir, "--uninstall").stderr, /No kit install found/);
});

test("a settings.local.json with an unexpected shape is skipped, and the install completes", () => {
  const dir = repo();
  fs.mkdirSync(path.join(dir, ".claude"));
  const odd = JSON.stringify({ hooks: { PreToolUse: { matcher: "Edit" } } });
  fs.writeFileSync(path.join(dir, ".claude/settings.local.json"), odd);
  const r = install(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /SKIPPED\s+\.claude\/settings\.local\.json \(unexpected shape/);
  assert.equal(read(dir, ".claude/settings.local.json"), odd);
  assert.equal(manifest(dir).version, VERSION);
});

test("upgrade removes files the kit no longer ships, unless edited", () => {
  const dir = repo();
  install(dir);
  const m = manifest(dir);
  const hash = (s) => require("crypto").createHash("sha256").update(s).digest("hex");
  fs.writeFileSync(path.join(dir, ".agent-workflow/old.md"), "old\n");
  fs.writeFileSync(path.join(dir, ".agent-workflow/edited.md"), "mine\n");
  m.files[".agent-workflow/old.md"] = hash("old\n");
  m.files[".agent-workflow/edited.md"] = hash("original\n");
  m.version = "0.3.1";
  fs.writeFileSync(path.join(dir, ".agent-workflow/manifest.json"), JSON.stringify(m));
  const r = install(dir);
  assert.match(r.stdout, /upgraded from 0\.3\.1/);
  assert.match(r.stdout, /removed\s+\.agent-workflow\/old\.md/);
  assert.match(r.stdout, /kept\s+\.agent-workflow\/edited\.md/);
  assert.ok(!exists(dir, ".agent-workflow/old.md"));
  assert.ok(exists(dir, ".agent-workflow/edited.md"));
});

test("upgrading from prompt files removes them and installs the skills", () => {
  const dir = repo();
  install(dir);
  const m = manifest(dir);
  const old = ".github/prompts/wf-plan.prompt.md";
  fs.mkdirSync(path.join(dir, ".github/prompts"), { recursive: true });
  fs.writeFileSync(path.join(dir, old), "old prompt\n");
  m.files[old] = require("crypto").createHash("sha256").update("old prompt\n").digest("hex");
  m.version = "0.5.1";
  fs.writeFileSync(path.join(dir, ".agent-workflow/manifest.json"), JSON.stringify(m));
  const r = install(dir);
  assert.match(r.stdout, /removed\s+\.github\/prompts\/wf-plan\.prompt\.md/);
  assert.ok(!exists(dir, ".github/prompts"));
  assert.ok(exists(dir, ".github/skills/wf-plan/SKILL.md"));
});

test("an edited prompt file from 0.5.x is kept, tracked in the manifest and still ignored", () => {
  const dir = repo();
  install(dir);
  const m = manifest(dir);
  const rel = ".github/prompts/wf.prompt.md";
  fs.mkdirSync(path.join(dir, ".github/prompts"), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), "my edited prompt\n");
  m.files[rel] = require("crypto").createHash("sha256").update("original prompt\n").digest("hex");
  m.version = "0.5.1";
  fs.writeFileSync(path.join(dir, ".agent-workflow/manifest.json"), JSON.stringify(m));
  assert.match(install(dir).stdout, /kept\s+\.github\/prompts\/wf\.prompt\.md \(no longer part of the kit/);
  assert.ok(exists(dir, rel));
  assert.ok(rel in manifest(dir).files);
  assert.equal(execFileSync("git", ["-C", dir, "status", "--porcelain", "-uall"], { encoding: "utf8" }), "");
  install(dir, "--uninstall", "--force");
  assert.ok(!exists(dir, rel));
});

test("a --claude-only upgrade leaves the old Copilot prompt files alone, and ignored", () => {
  const dir = repo();
  install(dir);
  const m = manifest(dir);
  const rel = ".github/prompts/wf-plan.prompt.md";
  fs.mkdirSync(path.join(dir, ".github/prompts"), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), "old prompt\n");
  m.files[rel] = require("crypto").createHash("sha256").update("old prompt\n").digest("hex");
  fs.writeFileSync(path.join(dir, ".agent-workflow/manifest.json"), JSON.stringify(m));
  install(dir, "--claude-only");
  assert.ok(exists(dir, rel));
  assert.equal(execFileSync("git", ["-C", dir, "status", "--porcelain", "-uall"], { encoding: "utf8" }), "");
});

test("manifest paths outside what the kit installs are never removed", () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "wf-install-"));
  tmpDirs.push(parent);
  const dir = path.join(parent, "repo");
  fs.mkdirSync(dir);
  execFileSync("git", ["init", "-q", dir]);
  install(dir);
  const hash = (s) => require("crypto").createHash("sha256").update(s).digest("hex");
  // Files whose fingerprints match, so only the path check stands between them and removal
  const victims = { "../victim.txt": path.join(parent, "victim.txt"), ".github/workflows/ci.yml": path.join(dir, ".github/workflows/ci.yml"),
    ".agent-workflow/STANDARDS.md": path.join(dir, ".agent-workflow/STANDARDS.md"), [path.join(parent, "abs.txt")]: path.join(parent, "abs.txt") };
  const m = manifest(dir);
  for (const [rel, abs] of Object.entries(victims)) {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, "keep me\n");
    m.files[rel] = hash("keep me\n");
  }
  fs.writeFileSync(path.join(dir, ".agent-workflow/manifest.json"), JSON.stringify(m));
  const r = install(dir, "--force");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /warning\s+manifest lists 4 path\(s\) the kit never installs/);
  for (const abs of Object.values(victims)) assert.ok(fs.existsSync(abs), abs);
  m.files = { ...manifest(dir).files, ...Object.fromEntries(Object.keys(victims).map((rel) => [rel, hash("keep me\n")])) };
  fs.writeFileSync(path.join(dir, ".agent-workflow/manifest.json"), JSON.stringify(m));
  assert.equal(install(dir, "--uninstall", "--force").status, 0);
  for (const abs of Object.values(victims)) assert.ok(fs.existsSync(abs), abs);
});

test("a repo git refuses to open is reported, not treated as a plain folder", () => {
  const dir = repo();
  execFileSync("git", ["-C", dir, "config", "core.repositoryformatversion", "99"]);
  const r = install(dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /git can't open[\s\S]*99/);
  assert.ok(!exists(dir, ".agent-workflow"));
});

test("Claude commands run only when typed, like the Copilot skills", () => {
  const dir = path.join(KIT, ".claude/commands");
  for (const f of fs.readdirSync(dir).filter((n) => /^wf.*\.md$/.test(n))) {
    assert.match(fs.readFileSync(path.join(dir, f), "utf8"), /^---\r?\n(?:.*\r?\n)*?disable-model-invocation: true\r?\n(?:.*\r?\n)*?---/, f);
    // An unquoted [ starts a YAML list, and "[a] [b]" isn't valid YAML at all
    assert.doesNotMatch(fs.readFileSync(path.join(dir, f), "utf8"), /^[\w-]+: \[/m, f);
  }
});

test("every skill's links resolve, it names itself, and it uses no prompt-file variables", () => {
  const skills = path.join(KIT, ".github/skills");
  for (const name of fs.readdirSync(skills)) {
    const file = path.join(skills, name, "SKILL.md");
    const text = fs.readFileSync(file, "utf8");
    assert.match(text, new RegExp(`^---\\r?\\nname: ${name}\\r?\\n`), name);
    assert.match(text, /\ndisable-model-invocation: true\r?\n/, name);
    assert.match(text, /\nargument-hint: /, name);
    assert.doesNotMatch(text, /\$\{input:/, name);
    for (const [, link] of text.matchAll(/\]\(([^)]+)\)/g)) {
      assert.ok(fs.existsSync(path.resolve(path.dirname(file), link)), `${name}: ${link}`);
    }
  }
});

test("an older hook entry is updated in place, and a shared entry keeps the user's matcher", () => {
  const dir = repo();
  const cmd = 'node "$CLAUDE_PROJECT_DIR/.agent-workflow/hooks/plan-gate.js"';
  fs.mkdirSync(path.join(dir, ".claude"));
  const settings = (pre) => fs.writeFileSync(path.join(dir, ".claude/settings.local.json"),
    JSON.stringify({ permissions: { allow: ["Bash(ls)"] }, hooks: { PreToolUse: pre } }));
  settings([{ matcher: "Edit|Write|MultiEdit|NotebookEdit", hooks: [{ type: "command", command: cmd }] }]);
  install(dir);
  let s = JSON.parse(read(dir, ".claude/settings.local.json"));
  assert.deepEqual(s.permissions, { allow: ["Bash(ls)"] });
  assert.equal(s.hooks.PreToolUse.length, 1);
  assert.match(s.hooks.PreToolUse[0].matcher, /Bash\|PowerShell/);

  const theirs = { type: "command", command: "node lint.js" };
  settings([{ matcher: "Write", hooks: [theirs, { type: "command", command: cmd }] }]);
  install(dir);
  s = JSON.parse(read(dir, ".claude/settings.local.json"));
  assert.deepEqual(s.hooks.PreToolUse[0], { matcher: "Write", hooks: [theirs] });
  assert.match(s.hooks.PreToolUse[1].hooks[0].command, /plan-gate\.js/);
});

test("invalid settings.local.json is reported, not overwritten", () => {
  const dir = repo();
  fs.mkdirSync(path.join(dir, ".claude"));
  fs.writeFileSync(path.join(dir, ".claude/settings.local.json"), "{ not json");
  const r = install(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /SKIPPED\s+\.claude\/settings\.local\.json \(not valid JSON/);
  assert.equal(read(dir, ".claude/settings.local.json"), "{ not json");
});

test("--gitignore moves the ignore block, and back", () => {
  const dir = repo();
  install(dir);
  install(dir, "--gitignore");
  assert.match(read(dir, ".gitignore"), /ai-agent-workflow:start/);
  assert.doesNotMatch(read(dir, ".git/info/exclude"), /ai-agent-workflow:start/);
  install(dir);
  assert.ok(!exists(dir, ".gitignore"));
  assert.match(read(dir, ".git/info/exclude"), /ai-agent-workflow:start/);
});

test("warns about kit files git already tracks", () => {
  const dir = repo();
  install(dir);
  execFileSync("git", ["-C", dir, "add", "-f", ".claude/commands/wf.md"]);
  assert.match(install(dir).stdout, /git already tracks 1 of these[\s\S]*git rm --cached -- "\.claude\/commands\/wf\.md"/);
});
