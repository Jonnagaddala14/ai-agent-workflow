---
disable-model-invocation: true
description: Full workflow — standards (first time), MCP sources, plan, consent, implement, review, consent, fix. One command.
argument-hint: <requirement, bug, ticket key, or empty to pick from the tracker>
---
Task: $ARGUMENTS

0. **Standards:** if `.agent-workflow/STANDARDS.md` is missing, offer to generate it (follow `.agent-workflow/stages/standards.md`) and STOP for my decisions and approval before going on.
1. **Plan (here):** follow @.agent-workflow/stages/plan.md using @.agent-workflow/PLAN_TEMPLATE.md: MCP sources and work item first (an empty task means: list my open items from the connected tracker and ask which), then understand, tier, context, plan. Use Explore sub-agents only for wide searches in a big repo. STOP for my approval.
2. **Implement:**
   - **Quick** (`Tier: quick`): after I approve, implement and verify here (top of `.agent-workflow/stages/implement.md`), self-check the diff, and go to step 5. Spawn `wf-reviewer` only if the diff touches security, data or a public API; if it finds anything, show the findings, ask which to fix, and apply them here (`.agent-workflow/stages/fix.md` section A from step 3; there's no implementer to resume).
   - **Full:** after I approve, spawn `wf-implementer` with the plan path. Relay its 3–6 lines. If it's blocked, stop and ask me.
3. **Review:** spawn `wf-reviewer` with the plan path (plus "milestone N" for milestone 2 onwards). Show its findings as returned (with their `Decide:` notes), then ask which to fix and which decisions to change. If I say `none`, go on to the next milestone (step 2), or to step 5 if none are left.
4. **Fix:** in the Full tier, always through the sub-agents here, whatever the size (this conversation doesn't read code in the Full tier). Send the review file, the IDs I picked and my settled choices to the step-2 `wf-implementer` with SendMessage; it already knows the code, takes the fix checkpoint and verifies. Then send "fix diff only" to the step-3 `wf-reviewer`; it appends a `## Round N`. Rounds as in `.agent-workflow/stages/fix.md`.
5. **Finish** (after the last milestone): set `Status: DONE`, run `node .agent-workflow/scripts/snapshot.js --clean <slug>`, and give a 3–6 line report. Ask whether to commit, push, or open a PR. Do nothing without a yes.

In the Full tier, don't read code or diffs in this conversation after step 1. The sub-agents do that.

**Resume, don't respawn.** If a sub-agent returns a question, ask me, then send my answer to that same sub-agent with SendMessage, so it continues with its context and the open fix checkpoint. Spawn a fresh one only if it can't be resumed, and tell it what's already done. Each new milestone gets a fresh implementer and reviewer.
