# PLAN: <short title>

Status: DRAFT
<!-- DRAFT → APPROVED (<date>) → IMPLEMENTED → DONE (or ABANDONED). Only the user's approval moves it to APPROVED.
     With milestones it stays APPROVED until the last milestone is done; tick the milestones as they're done. -->

## Goal
<1–2 sentences: what is being built and why>

- Sources: <e.g. Jira ABC-123, Figma frame X, or "none">
- Base snapshot: <output of `node .agent-workflow/scripts/snapshot.js <slug>-base` at approval; reviews diff against this>

## Approach
- Chosen: <approach, one line>
- Alternatives considered: <option> — <why not>

## Decisions & constraints
- <approved choices, e.g. "Use existing AuthService, no new library">
- Out of scope: <items>

## Context facts
<!-- Summarised findings from code and optional sources. Cite source; no raw dumps. -->
- <fact> — (src: path/to/file.ts:42 | Jira ABC-123 | Figma frame X)

## Files to touch
| File | Change |
|------|--------|
| path/to/file | <one-line description> |
| path/to/new-file (new) | <one-line description> |

## Acceptance criteria
- [ ] AC1: <observable behaviour> — verified by <test / command / manual check>
- [ ] AC2: <observable behaviour> — verified by <...>

## Steps
<!-- For large tasks, group steps under "### [ ] Milestone 1", "### [ ] Milestone 2"; one session each, ticked to [x] when done. -->
- [ ] 1. <step>
- [ ] 2. <step>
- [ ] 3. Add/update tests for <behaviour>

## Risks / open questions
- <risk or "none">

## Verify
```
<build / test / lint commands>
```
Expected: <what success looks like>

<!-- Review findings go in .agent-workflow/plans/<slug>.review.md, not here. -->
