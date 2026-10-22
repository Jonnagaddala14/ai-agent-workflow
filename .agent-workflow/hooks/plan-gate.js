#!/usr/bin/env node
// PreToolUse hook: while any .agent-workflow/plans/*.md is still "Status: DRAFT", block edits
// to files outside that folder. Exit 2 = block, and stderr is shown to the agent.
const fs = require("fs");
const path = require("path");

let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  let data;
  try {
    data = JSON.parse(input);
  } catch {
    process.exit(0); // never block on malformed input
  }

  const root = process.env.CLAUDE_PROJECT_DIR || data.cwd || process.cwd();
  const plansDir = path.join(root, ".agent-workflow", "plans");
  const target = data.tool_input?.file_path || data.tool_input?.notebook_path;
  if (!target || !fs.existsSync(plansDir)) process.exit(0);

  const inside = (dir, p) => {
    const rel = path.relative(dir, p);
    return !rel.startsWith("..") && !path.isAbsolute(rel);
  };
  const abs = path.resolve(root, target);
  if (!inside(root, abs)) process.exit(0); // only gate files in this project
  if (inside(plansDir, abs)) process.exit(0); // editing a plan is fine

  // Tolerates markdown around the field: "**Status:** DRAFT", "- Status: `DRAFT`", "## Status: DRAFT"
  const DRAFT = /^\W*Status\W*:?\W*DRAFT\b/im;
  const drafts = fs
    .readdirSync(plansDir)
    .filter((f) => f.endsWith(".md"))
    .filter((f) => DRAFT.test(fs.readFileSync(path.join(plansDir, f), "utf8")));

  if (drafts.length) {
    console.error(
      `Blocked: .agent-workflow/plans/${drafts.join(", .agent-workflow/plans/")} is still DRAFT. ` +
        "Finish the plan and get user approval (Status: APPROVED) before editing code. " +
        "If that plan is abandoned, ask the user whether to delete it or set it to 'Status: ABANDONED'."
    );
    process.exit(2);
  }
  process.exit(0);
});
