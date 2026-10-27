---
description: Review a plan's diff, local changes, or a GitHub PR against requirements, code, and STANDARDS.md.
argument-hint: [.agent-workflow/plans/<slug>.md | PR number/URL] [--post]
---
Target: $ARGUMENTS

1. Spawn `wf-reviewer` with the target. Show its findings as returned (with their `Decide:` notes), then ask which to fix and which decisions to change. If I say `none`, finish as `.agent-workflow/stages/review.md` describes (end of section 4).
2. If I pick findings, follow `.agent-workflow/stages/fix.md` section A from step 2 (its "Who does what" table decides who applies and who checks). For a PR target, do the branch check (section B, step 4) first. Send round 2 and any answers to the same sub-agents with SendMessage instead of spawning new ones.
3. If `--post` was given (for a teammate's PR): write the findings as one review comment to `.agent-workflow/plans/pr-<n>.post.md` and show it. Only after I confirm, post it with `gh pr review <n> --comment --body-file .agent-workflow/plans/pr-<n>.post.md`. Use `--request-changes` instead of `--comment` only if I ask. Afterwards, unless fixes follow, run `node .agent-workflow/scripts/snapshot.js --clean pr-<n>`.
