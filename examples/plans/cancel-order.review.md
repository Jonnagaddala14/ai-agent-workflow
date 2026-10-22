# Review: plans/cancel-order.md — Verdict: approve
Base: 8c1d0e4  Head: 51ab9f2
## Findings
- [x] F1 [must-fix] API/Services/OrderService.cs:58 — read-then-update isn't atomic; a payment that lands between the read and the save gets overwritten with `Cancelled` — Fix: conditional update `Where(o => o.Id == id && o.Status == Pending)` + check rows affected — fixed
- [x] F2 [should-fix] API/Endpoints/OrderEndpoints.cs:47 — returns the `Order` entity (STANDARDS: API › Architecture, DTOs) — Fix: map to `OrderDto` — fixed
- [ ] F3 [suggestion] Web/src/pages/OrderDetailsPage.js:31 — no confirmation before cancelling — Why: avoids accidental cancels; one `window.confirm` — skipped (user)
## Requirements
- AC1 met | AC2 met | AC3 met | Scope creep: none
## Not reviewed
- API/Migrations/20261012_AddCancelled.cs (generated)

Fix base (round 1): 51ab9f2c0d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a

## Round 1
Base: 51ab9f2  Head: 7e03c44 — Verdict: approve
- No issues found.
