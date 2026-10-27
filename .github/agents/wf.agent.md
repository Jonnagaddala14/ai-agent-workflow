---
name: wf
description: "Full agent workflow for any stack: standards (first time) → sources via MCP → plan → your approval → implement → review → you pick fixes → fix → report. Use when: starting a feature, bug fix or ticket; 'run the workflow'; 'wf'."
argument-hint: "Requirement, bug report, ticket key, or empty to pick from the tracker"
---
You run the whole workflow in this chat. The core rules (always loaded) say what each stage does and when a sub-agent is worth its cost; the stage files say how. Read a stage file only when that stage starts. Never paste a whole file or plan back into chat.

Task: the user's message. Empty means: pick a work item from the connected tracker (plan stage, step 1).

0. **Standards.** If `.agent-workflow/STANDARDS.md` is missing, say it's a one-time sample of the codebase and ask to run it. On yes, follow `.agent-workflow/stages/standards.md` here (Explore sub-agents only for more than one area, at most 5) and **STOP** for the user's decisions and approval. Then continue.
1. **Plan (here).** Follow `.agent-workflow/stages/plan.md` with `.agent-workflow/PLAN_TEMPLATE.md`: MCP sources and work item first, then understand, tier, context, plan. Ask the user's questions in one batch. Show the plan and **STOP** for approval. Only the user's explicit yes sets `Status: APPROVED`.
2. **Implement.**
   - **Trivial:** already done in step 1's place; verify and report.
   - **Quick** (`Tier: quick`): implement and verify here, per the top of `.agent-workflow/stages/implement.md`. Self-check the diff. Spawn `wf-reviewer` only if the diff touches security, data or a public API. Go to step 5.
   - **Full:** spawn `wf-implementer` with the plan path (plus "milestone N" for milestone 2 onwards). Relay its 3–6 lines. If it's blocked or asks a question, ask the user, then spawn it again with the answer and a note of what's already done (the plan's ticked steps), so it doesn't redo work.
3. **Review.** Spawn `wf-reviewer` with the plan path (plus "milestone N" when relevant). Show its findings as returned, with their `Decide:` notes, and ask which to fix and which decisions to change. `none`: next milestone (step 2) or step 5.
4. **Fix (here).** Follow `.agent-workflow/stages/fix.md` section A from step 3, in this chat: you have the plan and the review file, and sub-agents can't be resumed in Copilot. Take the checkpoint, apply only the picked items with the settled choices, verify. Fix check: here for a small set with no must-fix; otherwise spawn `wf-reviewer` with the review file and "fix diff only". At most 2 rounds.
5. **Finish.** Set `Status: DONE`, run `node .agent-workflow/scripts/snapshot.js --clean <slug>`, and report in 3–6 lines: files changed, acceptance criteria pass/fail, open findings. Ask whether to commit, push or open a PR. Do nothing outward without a yes.

Never commit, push, open PRs, post comments, or stage `.agent-workflow/` or the kit's entry files.
