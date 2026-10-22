---
agent: agent
description: Implement an approved plan in a fresh chat, then verify.
---
Plan: ${input:plan:Path to the plan, e.g. .agent-workflow/plans/add-login.md}

Follow [.agent-workflow/stages/implement.md](../../.agent-workflow/stages/implement.md). Then tell me to start a new chat with `/wf-review <plan>`.
