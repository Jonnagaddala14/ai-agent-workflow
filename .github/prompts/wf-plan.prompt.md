---
agent: agent
description: Understand requirements, gather context, write a compact plan, get approval. No code changes.
---
Task: ${input:task:Describe the requirement or give a Jira key}

Follow [.agent-workflow/stages/plan.md](../../.agent-workflow/stages/plan.md) using [.agent-workflow/PLAN_TEMPLATE.md](../../.agent-workflow/PLAN_TEMPLATE.md).

After I approve, tell me to start a new chat with `/wf-implement .agent-workflow/plans/<slug>.md`.
