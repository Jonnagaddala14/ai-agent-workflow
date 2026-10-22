# Stage: Implement + verify

1. Stop if the plan isn't `Status: APPROVED`. Don't ask for approval again, and don't redo exploration. The plan is your only context.
2. **Drift check:** every file in "Files to touch" that isn't marked `(new)` exists and matches the plan's "Context facts". Files marked `(new)` shouldn't exist yet. If anything differs, stop and report what changed.
3. **Milestones:** if the plan has them, do only the first unticked one. For milestone 2 onwards, first run `node .agent-workflow/scripts/snapshot.js <slug>-m<N>` and add `- Milestone N base: <output>` under the plan's `Base snapshot` line, so its review covers only this milestone.
4. Do the steps in order and tick them off in the plan.
   - Match the existing code style and `.agent-workflow/STANDARDS.md`.
   - No changes outside the plan. Read other code only when a step needs it.
   - If a step can't be done as written, stop and report why. Don't improvise.
5. Run the plan's verify commands.
   - If they pass and there are milestones, tick this milestone's heading (`### [x] Milestone N`). The status stays `APPROVED` until the last milestone is done.
   - If they pass and nothing is left, set `Status: IMPLEMENTED`.
6. Report in 3–6 lines: files changed, pass/fail per acceptance criterion, which milestone is done (if any), blockers (with the error).
