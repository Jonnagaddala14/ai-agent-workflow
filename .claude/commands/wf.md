---
description: Full workflow — plan, consent, implement, review, consent, fix. One command.
argument-hint: <requirement or Jira key>
---
Task: $ARGUMENTS

0. **Standards:** if `.agent-workflow/STANDARDS.md` doesn't exist, offer to run the Standards stage first (one time). Only if I agree, read `.agent-workflow/stages/standards.md` and follow it. If I decline, continue without it.
1. **Plan (here):** follow @.agent-workflow/stages/plan.md using @.agent-workflow/PLAN_TEMPLATE.md. Use Explore sub-agents for wide searches. STOP for my approval.
2. **Implement:** after I approve, spawn `wf-implementer` with the plan path. Relay its 3–6 lines. If it's blocked, stop and ask me.
3. **Review:** spawn `wf-reviewer` with the plan path (plus "milestone N" for milestone 2 onwards). Show its findings as returned, then ask which to fix. If I say `none`, go on to the next milestone (step 2), or to step 5 if none are left.
4. **Fix:** spawn `wf-implementer` with the review file and the IDs I picked; it takes the fix checkpoint and verifies. Then spawn `wf-reviewer` with the review file and "fix diff only"; it appends a `## Round N`. If that round has findings, ask me again. Do at most 2 rounds.
5. **Finish** (after the last milestone): set `Status: DONE`, run `node .agent-workflow/scripts/snapshot.js --clean <slug>`, and give a 3–6 line report. Ask whether to commit, push, or open a PR. Do nothing without a yes.

Don't read code or diffs in this conversation after step 1. The sub-agents do that.

For plans with milestones, repeat steps 2–4 for each milestone; the plan stays `APPROVED` until the last one is done. If a sub-agent returns a question, ask me, then spawn it again with my answer. It reuses the open fix checkpoint.
