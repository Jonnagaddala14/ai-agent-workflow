// The kit's entry files outside .agent-workflow/, as repo-root ignore patterns. One list for install.js (ignore
// rules) and repo-map.js (left out of the map), so a new entry file can't be missed by one of them.
const ENTRY_PATTERNS = [
  "/.claude/commands/wf*.md",
  "/.claude/agents/wf-*.md",
  "/.claude/rules/agent-workflow.md",
  "/.claude/settings.local.json",
  "/.github/skills/wf*/SKILL.md",
  "/.github/agents/wf*.agent.md",
  "/.github/hooks/wf-plan-gate.json",
  "/.github/instructions/agent-workflow.instructions.md",
  // No longer shipped (prompt files became skills in 0.6.1), but an upgrade keeps edited copies, which must stay ignored
  "/.github/prompts/wf*.prompt.md",
];
const ENTRY_RE = new RegExp(
  `^(${ENTRY_PATTERNS.map((p) => p.slice(1).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")).join("|")})$`
);

module.exports = { ENTRY_PATTERNS, isEntryFile: (rel) => ENTRY_RE.test(rel) };
