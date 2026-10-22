---
description: Address a PR's unresolved review comments (or a saved review file) — propose an action per comment, get consent, fix.
argument-hint: <PR number | .agent-workflow/plans/<…>.review.md>
---
Target: $ARGUMENTS

Follow @.agent-workflow/stages/fix.md.
- **PR number:** do section B steps 1–4 here (proposals, my choice, branch check). Then spawn `wf-implementer` with `.agent-workflow/plans/pr-<n>.comments.md` and the C-ids I picked. Then do step 6 here.
- **Review file:** ask me which F-ids to fix, then spawn `wf-implementer` with the file and those IDs. Then do steps 5–6 of section A here.

For the fix check, spawn `wf-reviewer` with the same file and "fix diff only"; it appends a `## Round N` there. Do at most 2 rounds. If a sub-agent returns a question, ask me, then spawn it again with my answer.
