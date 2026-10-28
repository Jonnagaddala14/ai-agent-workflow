---
name: wf-standards
description: "Generate STANDARDS.md by analysing the codebase (first time), or refresh it."
disable-model-invocation: true
argument-hint: <empty to generate, or --refresh>
---
Mode: the text after `/wf-standards`. Empty means generate; `--refresh` means refresh.

Follow [.agent-workflow/stages/standards.md](../../../.agent-workflow/stages/standards.md) using [STANDARDS_TEMPLATE.md](../../../.agent-workflow/templates/STANDARDS_TEMPLATE.md). Write `.agent-workflow/STANDARDS.md`, then stop for my decisions and approval.
