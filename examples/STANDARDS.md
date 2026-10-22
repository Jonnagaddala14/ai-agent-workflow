# Engineering Standards — ShopDemo

Status: APPROVED (2026-10-10)
Generated at commit: 3f2a9c1

## General (all areas)
- Linters/formatters: `API/.editorconfig`, `Web/.eslintrc.json`, `Web/.prettierrc`; rules there aren't repeated here
- Config & secrets: settings from `appsettings*.json` + env vars; no secrets in source (e.g. API/Program.cs)

## Area: API/ — .NET 8 Minimal API + EF Core
### Architecture
- Layers: Endpoints → Services → `AppDbContext`; endpoints never use `AppDbContext` directly (e.g. API/Endpoints/OrderEndpoints.cs)
- Services are registered as scoped through interfaces `I<Name>Service` (e.g. API/Services/OrderService.cs)
- DTOs live in `API/DTOs`; entities are never returned from endpoints (e.g. API/DTOs/OrderDto.cs)
### Code
- Async all the way: `async Task<T>`, no `.Result`/`.Wait()` (e.g. API/Services/OrderService.cs)
- Not found → service returns `null`, endpoint maps it to `Results.NotFound()` (e.g. API/Endpoints/OrderEndpoints.cs)
- Logging via `ILogger<T>`; no PII in log messages
### Testing
- None yet (see Recommended)

## Area: Web/ — React 18 SPA
### Architecture
- API calls only in `src/api/*.js`, not inside components (e.g. Web/src/api/orders.js)
- Pages in `src/pages`, reusable components in `src/components`
### Code
- Function components + hooks only (e.g. Web/src/pages/OrdersPage.js)
- Loading and error state shown for every API call (e.g. Web/src/pages/OrdersPage.js)

## Decisions needed
- (none — resolved 2026-10-10: date handling standardised on UTC ISO strings)

## Recommended (not yet followed)
- Add xUnit tests for `API/Services` (no test project exists)
- Validate request DTOs with FluentValidation or data annotations at the endpoint
