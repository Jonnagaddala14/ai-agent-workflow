// Plan-gate hook tests: the shell parser on its own, then the hook end to end against a temporary project.
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const HOOK = path.join(__dirname, "../.agent-workflow/hooks/plan-gate.js");
const { parse } = require(HOOK);

const tmpDirs = [];
after(() => tmpDirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true, maxRetries: 3 })));
const tmp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-gate-"));
  tmpDirs.push(dir);
  return dir;
};
function project(plans = { "add-login.md": "# PLAN: x\n\nStatus: DRAFT\n" }) {
  const root = tmp();
  fs.mkdirSync(path.join(root, ".agent-workflow/plans"), { recursive: true });
  for (const [name, body] of Object.entries(plans)) fs.writeFileSync(path.join(root, ".agent-workflow/plans", name), body);
  return root;
}
const run = (root, toolInput) =>
  spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ cwd: root, tool_input: toolInput }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    encoding: "utf8",
  });

test("parse splits commands and marks redirect targets", () => {
  assert.deepEqual(parse(`grep "a > b" src && echo hi 2>&1 >> 'out file' | tee -a x; ls`), [
    ["grep", "a > b", "src"],
    ["echo", "hi", { to: "1" }, { to: "out file" }],
    ["tee", "-a", "x"],
    ["ls"],
  ]);
  assert.deepEqual(parse("a\nb"), [["a"], ["b"]]);
});

test("edit tools: code is blocked, the workflow folder and outside files aren't", () => {
  const root = project();
  const blocked = run(root, { file_path: path.join(root, "src/app.js") });
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /add-login\.md is still DRAFT/);
  assert.equal(run(root, { file_path: "src/app.js" }).status, 2);
  assert.equal(run(root, { file_path: ".agent-workflow/plans/add-login.md" }).status, 0);
  assert.equal(run(root, { file_path: ".agent-workflow/STANDARDS.md" }).status, 0);
  assert.equal(run(root, { file_path: path.join(os.tmpdir(), "elsewhere.txt") }).status, 0);
  assert.equal(run(root, { notebook_path: "nb.ipynb" }).status, 2);
});

test("shell commands that write project files are blocked", () => {
  const root = project();
  for (const command of [
    "echo x > src/a.js",
    "cmd /c \"echo x > src/a.js\"",
    "cat a | tee out.txt",
    "cd src && rm a.js",
    "powershell -NoProfile -Command \"Set-Content -Path src/a.txt -Value x\"",
    "sed -i 's/a/b/' src/a.js",
    "perl -pi -e 's/a/b/' src/a.js",
    "git checkout -- src/a.js",
    "git -C . stash",
    "mv a.js b.js",
    "Set-Content -Path src/a.txt -Value x",
    "Remove-Item src/a.txt",
  ]) {
    assert.equal(run(root, { command }).status, 2, command);
  }
});

test("read-only shell commands and writes outside the project pass", () => {
  const root = project();
  const tmp = path.join(os.tmpdir(), "wf-gate-out.txt").replace(/\\/g, "/");
  for (const command of [
    "git status && git diff --stat",
    "grep -rn 'a > b' src 2>/dev/null",
    "node .agent-workflow/scripts/snapshot.js add-login-base",
    "echo hi 2>&1",
    `echo x > "${tmp}"`,
    "echo draft >> .agent-workflow/plans/add-login.md",
    "git stash list",
    "ls | head -5",
    "Get-ChildItem 2>$null",
    "sed 's/a/b/' src/a.js",
  ]) {
    assert.equal(run(root, { command }).status, 0, command);
  }
});

test("Copilot harness payloads are understood, and a JSON deny decision is printed", () => {
  const root = project();
  const raw = (data) =>
    spawnSync(process.execPath, [HOOK], { input: JSON.stringify(data), env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: "utf8" });
  // VS Code tools use filePath, Copilot CLI tools use path; camelCase events send toolArgs, sometimes as a JSON string
  for (const data of [
    { cwd: root, tool_name: "Edit", tool_input: { filePath: path.join(root, "src/app.js") } },
    { cwd: root, toolName: "edit", toolArgs: { path: "src/app.js" } },
    { cwd: root, toolName: "create", toolArgs: JSON.stringify({ path: "src/new.js" }) },
    { cwd: root, toolName: "powershell", toolArgs: { command: "Set-Content src/a.txt x" } },
    { cwd: root, toolName: "apply_patch", toolArgs: { input: "*** Begin Patch\n*** Update File: src/app.js\n@@\n-a\n+b\n*** End Patch\n" } },
    { cwd: root, toolName: "multi_replace_string_in_file", toolArgs: { replacements: [{ filePath: ".agent-workflow/STANDARDS.md" }, { filePath: path.join(root, "src/app.js") }] } },
  ]) {
    const r = raw(data);
    assert.equal(r.status, 2, JSON.stringify(data));
    assert.equal(JSON.parse(r.stdout).permissionDecision, "deny");
    assert.match(JSON.parse(r.stdout).permissionDecisionReason, /still DRAFT/);
  }
  assert.equal(raw({ cwd: root, toolName: "view", toolArgs: { path: "src/app.js" } }).status, 0);
  assert.equal(raw({ cwd: root, toolName: "edit", toolArgs: "not json" }).status, 0);
  assert.equal(raw({ cwd: root, toolName: "edit", toolArgs: { path: ".agent-workflow/plans/add-login.md" } }).status, 0);
  assert.equal(raw({ cwd: root, toolName: "apply_patch", toolArgs: { input: "*** Begin Patch\n*** Add File: .agent-workflow/STANDARDS.md\n+x\n*** End Patch\n" } }).status, 0);
});

test("only plan headers count as DRAFT", () => {
  const root = project({
    "a.md": "# PLAN: a\nStatus: APPROVED (2026-10-22)\n## Steps\nStatus: DRAFT\n",
    "a.review.md": "Status: DRAFT\n",
    "pr-1.reply-C1.md": "status: draft\n",
    "pr-1.comments.md": "Status: DRAFT\n",
  });
  assert.equal(run(root, { file_path: "src/app.js" }).status, 0);
  fs.writeFileSync(path.join(root, ".agent-workflow/plans/b.md"), "# PLAN: b\n**Status:** `DRAFT`\n");
  assert.equal(run(root, { file_path: "src/app.js" }).status, 2);
});

test("no plans folder, or bad input, never blocks", () => {
  const root = tmp();
  assert.equal(run(root, { file_path: "src/app.js" }).status, 0);
  for (const input of ["not json", "null", "42"]) {
    assert.equal(spawnSync(process.execPath, [HOOK], { input, encoding: "utf8" }).status, 0, input);
  }
  // An internal error (here: plans/ is a file, so readdirSync throws) fails open instead of denying
  const broken = tmp();
  fs.mkdirSync(path.join(broken, ".agent-workflow"));
  fs.writeFileSync(path.join(broken, ".agent-workflow/plans"), "");
  const r = run(broken, { file_path: "src/app.js" });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /not blocking/);
});
