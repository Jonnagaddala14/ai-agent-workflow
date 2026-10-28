---
name: wf-implement
description: "Implement an approved plan in a fresh chat, then verify."
disable-model-invocation: true
argument-hint: <.agent-workflow/plans/<slug>.md>
---
Plan: the path after `/wf-implement`. If it's missing, ask for it.

Follow [.agent-workflow/stages/implement.md](../../../.agent-workflow/stages/implement.md). Then tell me to start a new chat with `/wf-review <plan>`.
