# Stage: Plan (sources → understand → context → plan → consent)

1. **Sources and work item:**
   - Run `node .agent-workflow/scripts/mcp-servers.js`. It lists the MCP servers the repo configures (names and kind only, never secrets). For each, note whether its tools are available to you now. Also use any tracker or design tools you already have connected (user-level MCP servers), even if the script lists none.
   - Configured but not connected: tell the user once, one line per server, how to connect (VS Code: `MCP: List Servers` → start; Claude Code: `/mcp` or `claude mcp add`). Don't read the config's env values or headers, and don't retry.
   - No requirement given, or the user asked for "the next ticket": if a tracker is connected, list the user's open items with a filter (at most 10: key + title) and ask which one to work on. If none is connected, ask for the requirement.
   - Ticket key or design link given: read it with field filters (summary, description, acceptance criteria, linked design). If its server isn't connected, ask the user to connect it or paste the content. Don't guess at its contents.
   - Nothing configured or connected: skip silently; the plan says `Sources: none`.
2. **Start the plan:** create `.agent-workflow/plans/<task-slug>.md` from `.agent-workflow/PLAN_TEMPLATE.md` with `Status: DRAFT`. Keep the status line plain, exactly as in the template (no bold or list marker), because tools read it. Edit no other file in this stage.
3. **Understand:**
   - Restate the goal in one sentence. Note what's out of scope.
   - Decide the tier (core rules). Say which, and why, in one line. **Trivial:** delete the DRAFT plan file, make the change, verify, report, and stop here.
   - Ask **all** unclear points in one batch, including the behaviour choices the change implies (edge cases, defaults, status codes). Don't guess.
4. **Context (read-only):**
   - Query sources with filters (IDs, fields, page size). Take acceptance criteria from the ticket and specs from the design frame.
   - Search first, then read only the ranges that matter. Find existing utilities and patterns to reuse. Read "General" and the area sections of `.agent-workflow/STANDARDS.md` that match the files you'll touch. The plan must follow them.
   - For a bug: find the root cause (`file:line`) and the shortest reproduction (a failing test or command) before writing the plan. A plan without a root cause is a guess.
5. **Plan:**
   - **Full form:** about 40 lines, self-contained. Recommend an approach and list 1–2 alternatives with why they lost. If the user's requested approach has a clearly better option, say so. If it won't fit in about 40 lines, split "Steps" into `### [ ] Milestone N` headings, one session each.
   - **Quick form** (bug fixes and small changes): about 15 lines. Keep the header, `Status`, `Goal` (with the root cause and `Sources`), `Files to touch`, `Acceptance criteria` (the reproduction, now passing, plus no regression), `Steps` and `Verify`. Drop the other sections. Add `Tier: quick` under the status line.
   - In "Files to touch", mark files that don't exist yet `(new)`.
   - Every requirement becomes a testable acceptance criterion.
6. **Consent gate:** show the plan and **STOP**. Revise it until the user explicitly approves. Then set `Status: APPROVED (<date>)`. Run `node .agent-workflow/scripts/snapshot.js <slug>-base` and record its output as `Base snapshot`. (Later stages set `IMPLEMENTED`, then `DONE`; an abandoned plan becomes `ABANDONED`.)
