# Stage: Standards (generate once from the code, then maintain)

Runs when `.agent-workflow/STANDARDS.md` doesn't exist, or when the user runs it with `--refresh`. If it was triggered automatically, first say that it's a one-time analysis of a sample of the codebase, and ask before starting.

## Generate
1. **Map the repo (no file bodies yet):** run `node .agent-workflow/scripts/repo-map.js`. Read only:
   - the manifests and lint configs it lists that tell you the stack;
   - the docs it lists (README, CONTRIBUTING, architecture, ADRs). Documented rules win over inferred ones.
   Split the repo into **areas**: deployable units or modules with their stack, e.g. `app/` Android, `api/` .NET, `web/` React, `roku/` channel.
2. **Sample each area.** For more than one area, use parallel Explore sub-agents, one per area, and at most 5. If there are more areas, group those with the same stack and parent folder (e.g. several .NET projects under `src/`) into one sub-agent, and write one shared section for them. Without sub-agents (e.g. Copilot), do the areas one at a time. Write each area's notes (25 lines or fewer) before starting the next, and don't re-read files from earlier areas.
   - Pick 2–3 representative files per role: entry point, UI, state/view model, service/use case, data/repository, API client, config, test. Prefer the hotspots from the repo map.
   - Read for structure: folder layout, imports and dependency direction, signatures, naming, error handling, logging, validation, configuration and secrets, tests.
   - Each sub-agent returns 25 lines or fewer: the conventions it saw, with one evidence path each, plus any inconsistencies.
3. **Infer the rules:**
   - Record a rule only if most of the samples follow it. Cite one example: `(e.g. api/Services/UserService.cs)`.
   - If the samples disagree, add a "Decisions needed" entry with the options you saw. Don't pick one silently.
   - Leave out anything a linter or formatter enforces; reference its config instead.
   - Put good practices the code doesn't follow yet under "Recommended (not yet followed)". Reviews treat these as suggestions only.
4. **Write `.agent-workflow/STANDARDS.md`** from `.agent-workflow/templates/STANDARDS_TEMPLATE.md`:
   - `Status: DRAFT (generated <date>)` and `Generated at commit: <sha>`.
   - About 120 lines at most, with sections per area.
5. **Consent:** show a short summary (areas, number of rules, decisions needed) and ask the user to resolve the decisions and approve. Then set `Status: APPROVED (<date>)`.

## Refresh (`--refresh`)
- Run `git diff --stat <Generated at commit>`. Re-sample only the areas with significant changes or new modules.
- Show the proposed changes to `.agent-workflow/STANDARDS.md` as a diff. Apply them after consent, and update `Generated at commit`.

## Maintain (during Review or Fix)
- When the user settles a convention ("we always do X", resolving a reply/clarify comment, choosing in "Decisions needed"), propose a one-line rule for `.agent-workflow/STANDARDS.md` and add it after consent.
