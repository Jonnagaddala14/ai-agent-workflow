# PLAN: Cancel an order

Status: DONE
<!-- DRAFT → APPROVED (<date>) → IMPLEMENTED → DONE (or ABANDONED). -->

## Goal
Let customers cancel an order while it's still `Pending`, from the order details page.

- Sources: Jira SHOP-118
- Base snapshot: 8c1d0e4b2f7a9e3c5d6b1a0f9e8d7c6b5a4f3e2d

## Approach
- Chosen: `POST /orders/{id}/cancel` → `OrderService.CancelAsync`, which sets `Status = Cancelled`
- Alternatives considered: `DELETE /orders/{id}` — loses order history needed for reporting (SHOP-118 comment)

## Decisions & constraints
- Only `Pending` orders can be cancelled; others return 409
- Out of scope: refunds, emails

## Context facts
- Order status enum has `Pending, Paid, Shipped` — (src: API/Models/Order.cs:8)
- Endpoint pattern + NotFound mapping — (src: API/Endpoints/OrderEndpoints.cs:15-40)
- Order details page calls `getOrder` — (src: Web/src/pages/OrderDetailsPage.js:12)

## Files to touch
| File | Change |
|------|--------|
| API/Models/Order.cs | add `Cancelled` status |
| API/Migrations/<timestamp>_AddCancelled.cs (new) | EF migration for the new status |
| API/Services/IOrderService.cs, OrderService.cs | add `CancelAsync(id)` |
| API/Endpoints/OrderEndpoints.cs | map `POST /orders/{id}/cancel` |
| Web/src/api/orders.js | add `cancelOrder(id)` |
| Web/src/pages/OrderDetailsPage.js | Cancel button for Pending orders |

## Acceptance criteria
- [x] AC1: Pending order → 200 and status `Cancelled` — verified by manual call with curl
- [x] AC2: Non-pending order → 409; unknown id → 404 — verified by curl
- [x] AC3: Button shown only for Pending; page refreshes status after cancel — verified manually

## Steps
- [x] 1. Add `Cancelled` to the enum (+ EF migration)
- [x] 2. `CancelAsync` in the service
- [x] 3. Endpoint mapping with 404/409 handling
- [x] 4. `cancelOrder` API function + button with loading/error state

## Risks / open questions
- No test project yet (STANDARDS: Recommended); verification is manual

## Verify
```
dotnet build API && npm --prefix Web run build && npm --prefix Web run lint
```
Expected: all succeed; AC1–AC3 checks pass
