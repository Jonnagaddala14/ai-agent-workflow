#!/usr/bin/env node
// Prints a compact map of a repo (areas, file types, configs, docs, hotspots) so the
// agent can plan which files to sample without reading the tree.
// Usage: node .agent-workflow/scripts/repo-map.js [repo-root]
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { isEntryFile } = require("./kit-files.js");

process.on("uncaughtException", (e) => {
  console.error(`repo-map: ${e.message}`);
  process.exit(1);
});
const root = path.resolve(process.argv[2] || ".");
// Without git, skip build output and dependencies. Files git tracks are intentional, so then skip only
// vendored dependencies and the kit's folder.
const SKIP = new Set(["node_modules", ".git", "build", "dist", "out", ".gradle", "vendor", "Pods", "bin", "obj",
  ".next", ".nuxt", ".svelte-kit", ".angular", ".turbo", ".parcel-cache", ".cache", "coverage", ".idea", ".vscode", "target",
  "__pycache__", ".venv", "venv", ".tox", ".mypy_cache", ".pytest_cache", ".ruff_cache", ".dart_tool", ".expo", "DerivedData",
  ".build", "_build", "deps", "Carthage", ".terraform", ".serverless", ".agent-workflow"]);
const SKIP_TRACKED = new Set(["node_modules", "vendor", "Pods", "Carthage", ".agent-workflow"]);
const CONFIG = /^(package\.json|tsconfig.*\.json|deno\.jsonc?|bunfig\.toml|build\.gradle(\.kts)?|settings\.gradle(\.kts)?|gradle\.properties|pom\.xml|build\.sbt|go\.mod|Cargo\.toml|pyproject\.toml|setup\.(py|cfg)|requirements.*\.txt|Pipfile|tox\.ini|pytest\.ini|mix\.exs|Gemfile|.*\.gemspec|composer\.json|.*\.(cs|fs|vb)proj|.*\.sln|Directory\.(Build|Packages)\.props|global\.json|nuget\.config|pubspec\.yaml|Package\.swift|Podfile|Cartfile|project\.pbxproj|CMakeLists\.txt|Makefile|meson\.build|manifest|bsconfig\.json|bslint\.json|(main|variables|versions|providers)\.tf|terragrunt\.hcl|serverless\.ya?ml|\.eslintrc.*|eslint\.config\..*|biome\.jsonc?|\.prettierrc.*|\.editorconfig|\.stylelintrc.*|detekt.*\.yml|\.ktlint.*|\.swiftlint\.yml|\.swiftformat|\.rubocop\.yml|ruff\.toml|\.flake8|\.pylintrc|mypy\.ini|\.golangci\.ya?ml|rustfmt\.toml|clippy\.toml|phpcs\.xml(\.dist)?|\.php-cs-fixer(\.dist)?\.php|analysis_options\.yaml|checkstyle.*\.xml|sonar-project\.properties|Dockerfile|docker-compose.*\.ya?ml|compose\.ya?ml|AndroidManifest\.xml|angular\.json|nx\.json|turbo\.json|lerna\.json|pnpm-workspace\.yaml|vite\.config\..*|next\.config\..*|nuxt\.config\..*|svelte\.config\..*|astro\.config\..*|webpack\.config\..*|jest\.config\..*|vitest\.config\..*|playwright\.config\..*|cypress\.config\..*|app\.json|capacitor\.config\..*|tailwind\.config\..*)$/i;
// Includes the team's agent instructions (CLAUDE.md, AGENTS.md, copilot-instructions.md), which often hold build commands and rules
const DOC = /^(readme|contributing|architecture|adr|design|coding|style|conventions?|claude|agents|copilot-instructions)/i;
const TEST = /(^|\/)(tests?|__tests__|spec|androidTest|test-?utils?|[^/]*[._-](unit|integration|functional|e2e)?tests?)(\/|$)|\.(test|spec)\.[^/]+$|Test\.(kt|java|swift)$|_test\.(go|py)$/i;
// A directory containing one of these is its own area (monorepo packages, Gradle modules, .NET projects, Roku channels)
const PROJECT = /^(package\.json|deno\.jsonc?|build\.gradle(\.kts)?|pom\.xml|build\.sbt|go\.mod|Cargo\.toml|pyproject\.toml|setup\.py|mix\.exs|composer\.json|Gemfile|pubspec\.yaml|Package\.swift|manifest|bsconfig\.json|.*\.(cs|fs|vb)proj)$/i;
// Lock files and generated code are poor samples
const NOISE = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|deno\.lock|.*\.lock|.*\.lockfile|go\.sum|packages\.lock\.json|pubspec\.lock|project\.pbxproj|.*\.xcworkspacedata)$|\.min\.(js|css)$|\.(g|designer)\.cs$|\.generated\.|\.(freezed|g|pb|pbobjc)\.(dart|go|swift|js|ts|py|m)$|_pb2\.py$|(^|\/)Migrations\//i;
// The kit's entry files and the team's Claude settings, so they don't show up as areas or samples of the project
const KIT = (f) => isEntryFile(f) || f === ".claude/settings.json";

// Why the last git call failed, when it wasn't "not a git repository" (or git missing): e.g. "dubious ownership"
let gitError = null;
const sh = (cmd, args) => {
  if (cmd === "git") args = ["-c", "core.quotePath=false", ...args]; // print non-ASCII paths as-is
  try {
    return execFileSync(cmd, args, { cwd: root, encoding: "utf8", maxBuffer: 100e6, stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    const msg = String(e.stderr || "").trim();
    if (cmd === "git" && e.code !== "ENOENT" && msg && !/not a git repository/i.test(msg)) gitError = msg.split("\n")[0];
    return null;
  }
};

function listFiles() {
  const git = sh("git", ["ls-files"]);
  // "" is a git repo with nothing tracked yet, still a git repo
  if (git !== null) return { files: git.split("\n").filter(Boolean).filter((f) => !f.split("/").some((p) => SKIP_TRACKED.has(p))), git: true };
  const files = [];
  (function walk(dir, rel) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // unreadable (permissions): leave it out of the map
    }
    for (const e of entries) {
      if (SKIP.has(e.name)) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else files.push(r);
    }
  })(root, "");
  return { files, git: false };
}

const ext = (f) => (path.extname(f) || path.basename(f)).toLowerCase();
const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
const inc = (m, k) => m.set(k, (m.get(k) || 0) + 1);

const listed = listFiles();
const git = listed.git;
const files = listed.files.filter((f) => !KIT(f));
const out = [`Repo: ${path.basename(root)} — ${files.length} files${git ? "" : gitError ? ` (git failed: ${gitError}; listed without git)` : " (not a git repo)"}`];

// Area = deepest directory (depth ≤ 4) with a project manifest, else the top-level directory
const projectDirs = [...new Set(files.filter((f) => PROJECT.test(path.basename(f)) && f.includes("/") && f.split("/").length <= 5)
  .map((f) => f.slice(0, f.lastIndexOf("/") + 1)))].sort((a, b) => b.length - a.length);
// A test project (e.g. "api/Api.Tests/", "Shop.UnitTests/") belongs to the project it tests, if that's a sibling
const testedBy = (d) => {
  const m = d.match(/^(.*\/)?([^/]+?)[._-]?(unit|integration|functional|e2e)?tests?\/$/i);
  return m && projectDirs.find((p) => p.toLowerCase() === `${m[1] || ""}${m[2]}/`.toLowerCase());
};
const areaOf = (f) => {
  const d = projectDirs.find((p) => f.startsWith(p));
  return (d && (testedBy(d) || d)) || (f.includes("/") ? f.split("/")[0] + "/" : "(root)");
};

out.push("", "## Areas (project dirs, else top-level dirs: files, main types, tests, largest subdirs)");
const areas = new Map();
for (const f of files) {
  const a = areaOf(f);
  if (!areas.has(a)) areas.set(a, { n: 0, ext: new Map(), sub: new Map(), tests: 0 });
  const s = areas.get(a);
  s.n++;
  inc(s.ext, ext(f));
  if (TEST.test(f)) s.tests++;
  if (a !== "(root)" && !f.startsWith(a)) {
    inc(s.sub, path.posix.basename(projectDirs.find((p) => f.startsWith(p))) + "/"); // a folded-in test project
  } else {
    const parts = (a === "(root)" ? f : f.slice(a.length)).split("/");
    if (parts.length > 1) inc(s.sub, parts[0] + "/");
  }
}
for (const [a, s] of [...areas.entries()].sort((x, y) => y[1].n - x[1].n).slice(0, 25)) {
  const exts = top(s.ext, 4).map(([e, n]) => `${e} ${n}`).join(", ");
  const subs = top(s.sub, 6).map(([d, n]) => `${d}(${n})`).join(" ");
  out.push(`- ${a} ${s.n} — ${exts}; tests ${s.tests}${subs ? `; ${subs}` : ""}`);
}

const configs = files.filter((f) => f.split("/").length <= 4 && CONFIG.test(path.basename(f)));
out.push("", "## Build, lint and CI configs");
out.push(...configs.slice(0, 40).map((f) => `- ${f}`));
const ci = files.filter((f) => /^(\.github\/workflows\/|\.gitlab-ci|azure-pipelines|Jenkinsfile|\.circleci\/|bitbucket-pipelines)/i.test(f));
if (ci.length) out.push(`- CI: ${ci.slice(0, 8).join(", ")}`);
if (!configs.length && !ci.length) out.push("- none found");

const docs = files.filter((f) => /\.(md|adoc|rst)$/i.test(f) && (DOC.test(path.basename(f)) || /(^|\/)(docs?|adr|adrs|decisions)\//i.test(f)));
out.push("", `## Docs (${docs.length})`);
out.push(...(docs.length ? docs.slice(0, 15).map((f) => `- ${f}`) : ["- none found"]));

if (git) {
  // Capped, so a very busy repo doesn't overflow the output buffer and lose the whole section
  const log = sh("git", ["log", "--since=6.months.ago", "--max-count=2000", "--name-only", "--pretty=format:"]);
  const hot = new Map();
  const known = new Set(files);
  for (const f of (log || "").split("\n")) if (f && known.has(f) && !configs.includes(f) && !NOISE.test(f)) inc(hot, f);
  out.push("", "## Hotspots (most changed in 6 months — good samples)");
  out.push(...(hot.size ? top(hot, 15).map(([f, n]) => `- ${f} (${n})`) : ["- no recent history"]));
  const head = sh("git", ["rev-parse", "--short", "HEAD"]);
  if (head) out.push("", `HEAD: ${head.trim()}`);
}

console.log(out.join("\n"));
