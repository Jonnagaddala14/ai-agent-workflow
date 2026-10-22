---
agent: agent
description: Address a PR's unresolved review comments (or a saved review file) — propose an action per comment, get consent, fix.
---
Target: ${input:target:PR number, or .agent-workflow/plans/<…>.review.md}

Follow [.agent-workflow/stages/fix.md](../../.agent-workflow/stages/fix.md):
- PR number → section B.
- Review file → section A, after asking me which IDs to fix.
