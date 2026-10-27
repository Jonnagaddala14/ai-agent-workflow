// Tests for snapshot.js, repo-map.js and pr-threads.js (formatting only; nothing calls GitHub).
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync, execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const SCRIPTS = path.join(__dirname, "../.agent-workflow/scripts");
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

const tmpDirs = [];
after(() => tmpDirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true, maxRetries: 3 })));
const tmp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-scripts-"));
  tmpDirs.push(dir);
  return dir;
};
function repo(files = {}) {
  const dir = tmp();
  execFileSync("git", ["init", "-q", dir]);
  execFileSync("git", ["-C", dir, "config", "core.autocrlf", "false"]);
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), body);
  }
  return dir;
}
const script = (dir, name, ...args) =>
  spawnSync(process.execPath, [path.join(SCRIPTS, name), ...args], { cwd: dir, encoding: "utf8" });
const git = (dir, ...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();

test("snapshot --head works before the first commit", () => {
  const dir = repo();
  assert.equal(script(dir, "snapshot.js", "--head").stdout.trim(), EMPTY_TREE);
});

test("a snapshot includes untracked files and leaves the index alone", () => {
  const dir = repo({ "new.txt": "hello\n" });
  const r = script(dir, "snapshot.js", "task-base");
  assert.equal(r.status, 0, r.stderr);
  const tree = r.stdout.trim();
  assert.match(git(dir, "ls-tree", "--name-only", tree), /new\.txt/);
  assert.equal(git(dir, "rev-parse", "refs/wf/main/task-base"), tree);
  assert.equal(git(dir, "diff", "--cached", "--name-only"), "");
});

test("snapshot --clean removes only that slug's refs", () => {
  const dir = repo({ "a.txt": "a\n" });
  for (const name of ["a-base", "a-fix1", "a.b-base", "ab-base", "a-other"]) script(dir, "snapshot.js", name);
  assert.match(script(dir, "snapshot.js", "--clean", "a").stdout, /removed 2/);
  const left = git(dir, "for-each-ref", "--format=%(refname)", "refs/wf/").split("\n");
  assert.deepEqual(left.sort(), ["refs/wf/main/a-other", "refs/wf/main/a.b-base", "refs/wf/main/ab-base"]);
});

test("snapshot rejects unknown flags", () => {
  const r = script(repo(), "snapshot.js", "--nope");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /usage/);
});

test("repo-map lists team agent docs and tracked bin/, and hides kit files", () => {
  const dir = repo({
    "CLAUDE.md": "build: npm test\n",
    "AGENTS.md": "rules\n",
    "bin/cli.js": "#!/usr/bin/env node\n",
    "src/index.js": "\n",
    ".claude/commands/wf.md": "kit\n",
    "vendor/lib.js": "\n",
  });
  git(dir, "add", "-A");
  const out = script(dir, "repo-map.js").stdout;
  assert.match(out, /## Docs \(2\)\n- AGENTS\.md\n- CLAUDE\.md/);
  assert.match(out, /- bin\/ 1/);
  assert.doesNotMatch(out, /\.claude|vendor/);
});

test("repo-map without git skips build output", () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, "bin"));
  fs.writeFileSync(path.join(dir, "bin/app.dll"), "");
  fs.writeFileSync(path.join(dir, "README.md"), "");
  const out = script(dir, "repo-map.js").stdout;
  assert.match(out, /1 files \(not a git repo\)/);
  assert.doesNotMatch(out, /bin\//);
});

test("mcp-servers lists names and kinds from each tool's config, never secrets", () => {
  const dir = repo({
    ".vscode/mcp.json": `{\n  // jira\n  "servers": { "jira": { "type": "http", "url": "https://jira.example.com/mcp", "headers": { "Authorization": "Bearer s3cret" } }, },\n}`,
    ".mcp.json": JSON.stringify({ mcpServers: { figma: { command: "npx", args: ["-y", "figma-mcp", "--token", "t0ken"], env: { FIGMA_TOKEN: "t0ken" } } } }),
    ".cursor/mcp.json": "{ broken",
  });
  const out = script(dir, "mcp-servers.js").stdout;
  assert.match(out, /configured in this repo \(2\)/);
  assert.match(out, /- jira \(http, host jira\.example\.com\) — \.vscode\/mcp\.json \[VS Code\]/);
  assert.match(out, /- figma \(stdio, command npx figma-mcp\) — \.mcp\.json \[Claude Code\]/);
  assert.match(out, /Could not parse: \.cursor\/mcp\.json/);
  assert.doesNotMatch(out, /s3cret|t0ken|Bearer/);
  assert.match(script(repo(), "mcp-servers.js").stdout, /none/);
});

test("pr-threads shows review summaries on the head only, unless --all", () => {
  const { format } = require(path.join(SCRIPTS, "pr-threads.js"));
  const human = { __typename: "User", login: "ana" };
  const bot = { __typename: "Bot", login: "ci" };
  const pr = {
    title: "Add login",
    headRefOid: "abcdef1234",
    reviewThreads: {
      pageInfo: { hasNextPage: false },
      nodes: [
        { id: "T_1", isResolved: false, isOutdated: false, path: "a.js", line: 3,
          comments: { pageInfo: { hasNextPage: false }, nodes: [{ body: "fix this", author: human }, { body: "bot", author: bot }] } },
        { id: "T_2", isResolved: true, path: "b.js", line: 1, comments: { pageInfo: {}, nodes: [{ body: "done", author: human }] } },
      ],
    },
    reviews: {
      pageInfo: { hasPreviousPage: false },
      nodes: [
        { state: "COMMENTED", body: "old summary", author: human, commit: { oid: "0000000" } },
        { state: "CHANGES_REQUESTED", body: "new summary", author: human, commit: { oid: "abcdef1234" } },
      ],
    },
  };
  const out = format(pr, 7, false, false);
  assert.match(out, /^PR #7: Add login \(head abcdef1\)/);
  assert.match(out, /T1 a\.js:3 @ana: fix this \{T_1\}/);
  assert.doesNotMatch(out, /T2|done|bot/);
  assert.match(out, /G1 @ana \(CHANGES_REQUESTED\): new summary/);
  assert.doesNotMatch(out, /old summary/);
  assert.match(out, /1 review summary\(ies\) on earlier commits hidden/);
  const all = format(pr, 7, true, true);
  assert.match(all, /↳ @ci: bot/);
  assert.match(all, /G1 @ana \(COMMENTED\): old summary\nG2 @ana \(CHANGES_REQUESTED\): new summary/);
  assert.doesNotMatch(all, /hidden/);
});

test("pr-threads parses github.com and Enterprise URLs", () => {
  const { parseUrl } = require(path.join(SCRIPTS, "pr-threads.js"));
  assert.deepEqual(parseUrl("https://github.com/o/r/pull/12"), { host: "github.com", owner: "o", repo: "r" });
  assert.deepEqual(parseUrl("https://ghe.corp.com/team/app.git"), { host: "ghe.corp.com", owner: "team", repo: "app" });
  assert.throws(() => parseUrl("git@github.com:o/r.git"));
});
