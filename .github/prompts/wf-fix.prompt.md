---
agent: agent
description: Address a PR's unresolved review comments (or a saved review file) — propose an action per comment, get consent, fix.
---
Target: ${input:target:PR number, or .agent-workflow/plans/<…>.review.md}

Follow [.agent-workflow/stages/fix.md](../../.agent-workflow/stages/fix.md):
- PR number → section B.
- Review file → section A.

Apply the fixes in this chat (sub-agents can't be resumed here). Spawn a `wf-reviewer` sub-agent with the file and "fix diff only" for the fix check only when a must-fix was applied or the set is larger than the "Who does what" table's small size.
