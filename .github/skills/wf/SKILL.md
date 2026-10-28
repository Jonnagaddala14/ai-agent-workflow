---
name: wf
description: "Full workflow in one chat — standards (first time), MCP sources, plan, approval, implement, review, pick fixes, fix."
disable-model-invocation: true
argument-hint: <requirement, bug, ticket key, or empty to pick from the tracker>
---
Task: the text after `/wf`. Empty means: pick a work item from the connected tracker.

Act as the `wf` orchestrator for the rest of this chat: follow the steps in [wf.agent.md](../../agents/wf.agent.md) (its body, not its frontmatter), spawning the `wf-implementer` and `wf-reviewer` sub-agents where it says. Selecting the `wf` agent directly does the same.
