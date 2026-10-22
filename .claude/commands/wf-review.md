---
description: Review a plan's diff, local changes, or a GitHub PR against requirements, code, and STANDARDS.md.
argument-hint: [.agent-workflow/plans/<slug>.md | PR number/URL] [--post]
---
Target: $ARGUMENTS

0. If `.agent-workflow/STANDARDS.md` doesn't exist, offer to run `/wf-standards` first (one time). If I decline, continue.
1. Spawn `wf-reviewer` with the target. Show its findings as returned, then ask which to fix. If I say `none`, finish as `.agent-workflow/stages/review.md` describes (end of section 4).
2. If I pick findings:
   - For a PR target, first do the branch check in `.agent-workflow/stages/fix.md` (section B, step 4).
   - Spawn `wf-implementer` with the review file and those IDs.
   - Then do section A steps 5–6 of `.agent-workflow/stages/fix.md` here: spawn `wf-reviewer` with the review file and "fix diff only" (at most 2 rounds, asking me before each), then finish.
3. If `--post` was given (for a teammate's PR): write the findings as one review comment to `.agent-workflow/plans/pr-<n>.post.md` and show it. Only after I confirm, post it with `gh pr review <n> --comment --body-file .agent-workflow/plans/pr-<n>.post.md`. Use `--request-changes` instead of `--comment` only if I ask. Afterwards, unless fixes follow, run `node .agent-workflow/scripts/snapshot.js --clean pr-<n>`.
