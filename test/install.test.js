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
  assert.equal(Object.keys(m.files).length, 35);
  for (const rel of [".agent-workflow/AGENT_WORKFLOW.md", ".agent-workflow/scripts/mcp-servers.js", ".claude/commands/wf.md",
    ".claude/rules/agent-workflow.md", ".claude/agents/wf-reviewer.md", ".github/prompts/wf.prompt.md", ".github/prompts/wf-plan.prompt.md",
    ".github/agents/wf.agent.md", ".github/agents/wf-implementer.agent.md", ".github/agents/wf-reviewer.agent.md",
    ".github/hooks/wf-plan-gate.json", ".github/instructions/agent-workflow.instructions.md"]) {
    assert.ok(exists(dir, rel), rel);
  }
  const hook = JSON.parse(read(dir, ".claude/settings.local.json")).hooks.PreToolUse[0];
  assert.match(hook.matcher, /Bash/);
  assert.match(hook.hooks[0].command, /plan-gate\.js/);
  const copilotHook = JSON.parse(read(dir, ".github/hooks/wf-plan-gate.json")).hooks.PreToolUse[0];
  assert.equal(copilotHook.matcher, hook.matcher);
  // Same command in both: bare `node` + absolute canonical script path with forward slashes (cmd, bash and PowerShell)
  assert.equal(copilotHook.command, hook.hooks[0].command);
  assert.equal(copilotHook.command, `node "${fs.realpathSync.native(dir).replace(/\\/g, "/")}/.agent-workflow/hooks/plan-gate.js"`);
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
  assert.equal(Object.keys(manifest(a).files).length, 24);
  const b = repo();
  install(b, "--copilot-only");
  assert.ok(exists(b, ".github/prompts/wf-plan.prompt.md"));
  assert.ok(exists(b, ".github/agents/wf.agent.md"));
  assert.ok(exists(b, ".github/hooks/wf-plan-gate.json"));
  assert.ok(!exists(b, ".claude"));
  assert.equal(Object.keys(manifest(b).files).length, 26);
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

test("old kits and subfolders are refused", () => {
  const v2 = repo();
  fs.writeFileSync(path.join(v2, ".wf-manifest.json"), "{}");
  assert.match(install(v2).stderr, /0\.2\.0.*0\.3\.1 installer/);
  const v1 = repo();
  fs.writeFileSync(path.join(v1, ".wf-version"), "0.1.0");
  assert.match(install(v1).stderr, /0\.1\.0/);
  const sub = path.join(repo(), "sub");
  fs.mkdirSync(sub);
  assert.match(install(sub).stderr, /repo root/);
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
