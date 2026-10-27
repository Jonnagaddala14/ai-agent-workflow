#!/usr/bin/env node
// Records the whole working tree (tracked + new, untracked files; .gitignore respected)
// as a git tree object, without touching the real index, HEAD, or files.
// Diff two snapshots with: git diff <snapA> <snapB>   (includes new files)
// Usage:
//   node .agent-workflow/scripts/snapshot.js [name]     snapshot now; with a name, also save it as
//                                                refs/wf/<worktree>/<name> so git gc keeps it
//   node .agent-workflow/scripts/snapshot.js --head     HEAD's tree, or the empty tree if there are no commits
//   node .agent-workflow/scripts/snapshot.js --clean <slug>
//                                                delete <slug>-base, -head, -m<N>, -fix<N>
// Refs are shared (refs/wf/...) rather than per-worktree (refs/worktree/...), because git gc run
// from another worktree can prune objects that only per-worktree refs point to.
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const git = (args, env, input) =>
  execFileSync("git", args, {
    encoding: "utf8",
    env: { ...process.env, ...env },
    input,
    stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
  }).trim();
const safe = (s) => s.replace(/[^\w.-]/g, "-");

// refs/wf/main/ for the main worktree, refs/wf/<id>/ for a linked one, so names don't collide
function namespace(top) {
  const gitDir = path.resolve(top, git(["-C", top, "rev-parse", "--git-dir"]));
  const common = path.resolve(top, git(["-C", top, "rev-parse", "--git-common-dir"]));
  return `refs/wf/${gitDir === common ? "main" : safe(path.basename(gitDir))}/`;
}

function main() {
  const top = git(["rev-parse", "--show-toplevel"]);
  const g = (args, env, input) => git(["-C", top, ...args], env, input);
  const NS = namespace(top);
  const [cmd, arg] = process.argv.slice(2);
  if (cmd?.startsWith("-") && cmd !== "--head" && cmd !== "--clean") {
    throw new Error("usage: snapshot.js [name] | --head | --clean <slug>");
  }

  if (cmd === "--head") {
    let tree;
    try {
      tree = g(["rev-parse", "--verify", "-q", "HEAD^{tree}"]);
    } catch {
      tree = g(["mktree"], {}, ""); // no commits yet
    }
    console.log(tree);
  } else if (cmd === "--clean") {
    if (!arg) throw new Error("usage: snapshot.js --clean <slug>");
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const own = new RegExp(`^${esc(NS + safe(arg))}-(base|head|m\\d+|fix\\d+)$`); // not other slugs sharing a prefix
    const refs = g(["for-each-ref", "--format=%(refname)", NS]).split("\n").filter((r) => own.test(r));
    for (const r of refs) g(["update-ref", "-d", r]);
    console.log(`removed ${refs.length} snapshot ref(s)`);
  } else {
    const abs = (p) => path.resolve(top, p);
    const realIndex = abs(g(["rev-parse", "--git-path", "index"]));
    const tmpIndex = abs(g(["rev-parse", "--git-path", `wf-snapshot-index-${process.pid}`]));
    try {
      if (fs.existsSync(realIndex)) fs.copyFileSync(realIndex, tmpIndex); // reuses stat cache, so it's fast
      const env = { GIT_INDEX_FILE: tmpIndex };
      g(["add", "-A"], env);
      const tree = g(["write-tree"], env);
      if (cmd) g(["update-ref", NS + safe(cmd), tree]);
      console.log(tree);
    } finally {
      fs.rmSync(tmpIndex, { force: true });
    }
  }
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    const missing = e.code === "ENOENT" && String(e.syscall).startsWith("spawn");
    console.error(`snapshot: ${missing ? "git not installed" : (e.stderr || e.message).toString().trim().slice(0, 300)}`);
    process.exit(1);
  }
}
module.exports = { namespace, git }; // used by pr-threads.js --fetch
