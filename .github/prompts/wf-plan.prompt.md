---
agent: agent
description: Understand requirements, gather context, write a compact plan, get approval. No code changes. (For the whole flow in one chat, use /wf.)
---
Task: ${input:task:Requirement, bug report, ticket key, or leave empty to pick from the tracker}

Follow [.agent-workflow/stages/plan.md](../../.agent-workflow/stages/plan.md) using [.agent-workflow/PLAN_TEMPLATE.md](../../.agent-workflow/PLAN_TEMPLATE.md).

After I approve: a quick plan is implemented here (top of `.agent-workflow/stages/implement.md`); for a full plan, tell me to start a new chat with `/wf-implement .agent-workflow/plans/<slug>.md`.
