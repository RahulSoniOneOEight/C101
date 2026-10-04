# C101 Agent Operating Contract

All engineering and AI agents working in this repository must:

1. Read `client-projects/client101/workflow/workflow-state.yaml` before acting.
2. Treat repository contracts and current artifacts as authoritative; chat history is not project truth.
3. Treat AI output as a proposal requiring human review.
4. Preserve the separation between business capability, engineering domain, and provider.
5. Do not change canonical entity ownership without updating the Data Contract and dependency map.
6. Record material business-rule, workflow, integration, finance, security, data, or architecture
   feedback in a governed Change Contract before implementation.
7. Keep integrations idempotent, auditable, and explicit about fixture versus production behavior.
8. Resolve client-facing components through
   `client-projects/client101/experience/design/ui-implementation-registry.yaml`.
9. Never commit secrets, signing material, customer production data, or local environment files.
10. Never self-authorize a production release; human production authorization is mandatory.

The Flutter runtime is a prototype until required journeys, integrations, QA evidence, staging, and
human approvals are complete.
