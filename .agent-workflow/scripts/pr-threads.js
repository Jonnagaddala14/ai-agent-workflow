#!/usr/bin/env node
// Prints a PR's unresolved review threads and review summaries in compact form,
// so the agent reads a few lines instead of raw GitHub JSON.
// Usage: node .agent-workflow/scripts/pr-threads.js <pr-number> [--bots] [--all]   (also --fetch / --reply / --resolve; run with no args for help)
const { execFileSync } = require("child_process");
const fs = require("fs");

const QUERY = `query($owner:String!,$repo:String!,$n:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$n){
  title headRefOid
  reviewThreads(first:100){pageInfo{hasNextPage} nodes{id isResolved isOutdated path line originalLine
    comments(first:20){pageInfo{hasNextPage} nodes{body author{__typename login}}}}}
  reviews(last:30){pageInfo{hasPreviousPage} nodes{state body author{__typename login} commit{oid}}}}}}`;

const clip = (s, max) => {
  const t = (s || "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max) + "…" : t;
};
const who = (a) => (a ? `@${a.login}` : "@ghost");
const isBot = (a) => a && a.__typename === "Bot";

function format(pr, n, includeBots, allReviews) {
  const out = [`PR #${n}: ${clip(pr.title, 100)} (head ${pr.headRefOid.slice(0, 7)})`];
  let t = 0;
  for (const th of pr.reviewThreads.nodes) {
    if (th.isResolved) continue;
    const cs = th.comments.nodes.filter((c) => includeBots || !isBot(c.author));
    if (!cs.length) continue;
    const loc = `${th.path}:${th.line ?? th.originalLine ?? "?"}${th.isOutdated ? " [outdated]" : ""}`;
    out.push(`T${++t} ${loc} ${who(cs[0].author)}: ${clip(cs[0].body, 500)} {${th.id}}`);
    for (const r of cs.slice(1)) out.push(`   ↳ ${who(r.author)}: ${clip(r.body, 200)}`);
    if (th.comments.pageInfo.hasNextPage) out.push("   ↳ (more than 20 comments; later ones not shown)");
  }
  // Review summaries can't be resolved, so by default only those on the current head are shown:
  // a later push usually means they were addressed
  let g = 0;
  let older = 0;
  for (const rv of pr.reviews.nodes) {
    if (!(rv.body || "").trim() || (!includeBots && isBot(rv.author))) continue;
    if (!allReviews && rv.commit?.oid !== pr.headRefOid) {
      older++;
      continue;
    }
    out.push(`G${++g} ${who(rv.author)} (${rv.state}): ${clip(rv.body, 400)}`);
  }
  if (!t && !g) out.push("No unresolved review comments.");
  if (older) out.push(`(${older} review summary(ies) on earlier commits hidden; --all shows them)`);
  if (pr.reviewThreads.pageInfo.hasNextPage) out.push("(more than 100 threads; only the first 100 shown)");
  if (pr.reviews.pageInfo.hasPreviousPage) out.push("(more than 30 reviews; only the latest 30 checked for summaries)");
  return out.join("\n");
}

const USAGE = `Usage:
  node pr-threads.js <pr-number> [--bots] [--all]  list unresolved threads, and review summaries on the
                                                   current head (--all: on any commit)
  node pr-threads.js --fetch <pr-number>           fetch the PR's base and head into refs/wf/<worktree>/pr-<n>-base/-head
                                                   (no checkout, no branches) and print the refs and a diffstat
  node pr-threads.js --reply <threadId> <file>     reply in a thread (body read from file; only after user consent)
  node pr-threads.js --resolve <threadId>          resolve a thread (only after user consent)`;

const gh = (args) => execFileSync("gh", args, { encoding: "utf8", maxBuffer: 50e6, stdio: ["ignore", "pipe", "pipe"] });
// Works for github.com and GitHub Enterprise hosts
const parseUrl = (url) => {
  const m = url.match(/^https?:\/\/([^/]+)\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/pull\/\d+)?\/?$/);
  if (!m) throw new Error(`unexpected GitHub url: ${url}`);
  return { host: m[1], owner: m[2], repo: m[3] };
};
const prInfo = (n) => {
  const v = JSON.parse(gh(["pr", "view", String(n), "--json", "url,baseRefName"]));
  return { ...parseUrl(v.url), base: v.baseRefName };
};
// typed: -F (numbers etc.); literal: -f (sent as-is, so "@..." or "true" in a body isn't reinterpreted)
const gql = (host, query, typed, literal = []) => {
  const res = JSON.parse(gh(["api", "graphql", ...(host === "github.com" ? [] : ["--hostname", host]),
    "-f", `query=${query}`, ...typed.flatMap((f) => ["-F", f]), ...literal.flatMap((f) => ["-f", f])]));
  if (res.errors) throw new Error(res.errors.map((e) => e.message).join("; "));
  return res.data;
};

function fetchPr(n) {
  const { namespace, git } = require("./snapshot.js");
  const { host, owner, repo, base } = prInfo(n);
  const top = git(["rev-parse", "--show-toplevel"]);
  // Prefer the remote that points at the PR's repo (https or ssh); else fetch by URL (e.g. a clone of a fork)
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const want = new RegExp(`${esc(host)}[/:]${esc(owner)}/${esc(repo)}(\\.git)?/?$`, "i");
  const remote =
    git(["-C", top, "remote", "-v"])
      .split("\n")
      .map((l) => l.split(/\s+/))
      .find(([, url, kind]) => kind === "(fetch)" && want.test(url))?.[0] || `https://${host}/${owner}/${repo}.git`;
  const ns = namespace(top);
  const PB = `${ns}pr-${n}-base`;
  const PH = `${ns}pr-${n}-head`;
  git(["-C", top, "fetch", "-q", remote, `+refs/heads/${base}:${PB}`, `+refs/pull/${n}/head:${PH}`]);
  // PB...PH needs the merge base, which a shallow clone may not have
  let stat;
  try {
    git(["-C", top, "merge-base", PB, PH]);
    stat = git(["-C", top, "-c", "core.quotePath=false", "diff", "--stat", `${PB}...${PH}`]);
  } catch {
    stat = `No merge base (shallow clone?): read the diff with \`gh pr diff ${n}\` instead of git diff.\n` +
      gh(["pr", "diff", String(n), "--name-only"]).trim();
  }
  console.log([`PB=${PB}`, `PH=${PH}`, `remote=${remote}`, stat].join("\n"));
}

function main() {
  const argv = process.argv.slice(2);
  try {
    if (argv[0] === "--reply" || argv[0] === "--resolve") {
      const [, id, file] = argv;
      if (!id || (argv[0] === "--reply" && !file)) throw new Error(USAGE);
      const { host } = parseUrl(JSON.parse(gh(["repo", "view", "--json", "url"])).url);
      if (argv[0] === "--resolve") {
        const d = gql(host, "mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{isResolved}}}", [], [`id=${id}`]);
        return console.log(`resolved: ${d.resolveReviewThread.thread.isResolved}`);
      }
      if (!fs.readFileSync(file, "utf8").trim()) throw new Error(`reply file ${file} is empty`);
      // gh reads the body from the file (-F body=@file), so its length isn't capped by the command line
      const d = gql(host,
        "mutation($id:ID!,$body:String!){addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$id,body:$body}){comment{url}}}",
        [`body=@${file}`], [`id=${id}`]);
      return console.log(`replied: ${d.addPullRequestReviewThreadReply.comment.url}`);
    }
    const fetch = argv[0] === "--fetch";
    const n = Number(fetch ? argv[1] : argv[0]);
    if (!Number.isInteger(n) || n <= 0) throw new Error(USAGE);
    if (fetch) return fetchPr(n);
    // Take owner/repo from the PR itself, so forks and multiple remotes resolve to the right repo
    const { host, owner, repo } = prInfo(n);
    // owner/repo as literals: -F would turn an all-digit name into a number and fail the String! type
    const pr = gql(host, QUERY, [`n=${n}`], [`owner=${owner}`, `repo=${repo}`]).repository.pullRequest;
    if (!pr) throw new Error(`PR #${n} not found`);
    console.log(format(pr, n, argv.includes("--bots"), argv.includes("--all")));
  } catch (e) {
    const missing = e.code === "ENOENT" && String(e.syscall).startsWith("spawn"); // gh/git itself not found, not a missing file
    if (e.message === USAGE) console.error(USAGE);
    else console.error(`pr-threads: ${missing ? `${e.path || "gh"} not installed` : clip(e.stderr || e.message, 300)}`);
    process.exit(1);
  }
}

if (require.main === module) main();
module.exports = { format, parseUrl }; // for the tests
