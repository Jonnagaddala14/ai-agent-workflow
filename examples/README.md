# Examples (illustrative)

Hand-written samples of what each stage should produce, for a made-up .NET API + React app. They aren't output from a real run. Use them to judge whether your agent's output is the right size and shape. In a real repo these files are written to `.agent-workflow/` (`.agent-workflow/STANDARDS.md`, `.agent-workflow/plans/…`).

| File | Produced by | What to notice |
|---|---|---|
| [STANDARDS.md](STANDARDS.md) | `/wf-standards` | Rules cite an example file; inconsistencies are listed under "Decisions needed", not guessed |
| [plans/cancel-order.md](plans/cancel-order.md) | `/wf-plan` | About 40 lines; approach with an alternative; testable acceptance criteria; snapshot recorded |
| [plans/cancel-order.review.md](plans/cancel-order.review.md) | `/wf-review` + `/wf-fix` | Severity, `file:line` and the rule broken; `## Round 1` (the fix check) appended after the fixes |
| [plans/pr-42.comments.md](plans/pr-42.comments.md) | `/wf-fix 42` | One proposed action per reviewer comment: fix, reply or clarify |
