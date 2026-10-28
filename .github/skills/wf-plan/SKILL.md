---
name: wf-plan
description: "Understand requirements, gather context, write a compact plan, get approval. No code changes. (For the whole flow in one chat, use /wf.)"
disable-model-invocation: true
argument-hint: <requirement, bug, ticket key, or empty to pick from the tracker>
---
Task: the text after `/wf-plan`. Empty means: pick a work item from the connected tracker.

Follow [.agent-workflow/stages/plan.md](../../../.agent-workflow/stages/plan.md) using [.agent-workflow/PLAN_TEMPLATE.md](../../../.agent-workflow/PLAN_TEMPLATE.md).

After I approve: a quick plan is implemented here (top of `.agent-workflow/stages/implement.md`); for a full plan, tell me to start a new chat with `/wf-implement .agent-workflow/plans/<slug>.md`.
