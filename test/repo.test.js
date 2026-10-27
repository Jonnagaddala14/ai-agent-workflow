// Kit repo checks: version numbers agree, and every kit path the docs mention exists.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const KIT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(KIT, rel), "utf8");
const VERSION = read("VERSION").trim();

test("VERSION, package.json and the top CHANGELOG entry agree", () => {
  assert.equal(JSON.parse(read("package.json")).version, VERSION);
  assert.equal(read("CHANGELOG.md").match(/^## (\S+)/m)?.[1], VERSION);
});

test("every .agent-workflow/ path the docs mention exists", () => {
  const md = (dir) =>
    fs.readdirSync(path.join(KIT, dir), { withFileTypes: true }).flatMap((e) => {
      const rel = `${dir}/${e.name}`;
      return e.isDirectory() ? md(rel) : e.name.endsWith(".md") ? [rel] : [];
    });
  const docs = ["README.md", ...md(".agent-workflow"), ...md(".claude"), ...md(".github")];
  // Written per repo or per task, so not in the kit
  const generated = /^\.agent-workflow\/(STANDARDS\.md|plans\/|manifest\.json|\*)?$/;
  const missing = [];
  for (const doc of docs) {
    for (const [ref] of read(doc).matchAll(/\.agent-workflow\/[\w./*-]*/g)) {
      const p = ref.replace(/[.]+$/, "");
      const check = p.includes("*") ? path.posix.dirname(p) : p; // a glob: its folder must exist
      if (!generated.test(p) && !p.startsWith(".agent-workflow/plans/") && !fs.existsSync(path.join(KIT, check))) {
        missing.push(`${doc}: ${p}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});
