# AI / LLM lens (model-backed features and agents)

## Provenance

```yaml
standards: OWASP Top 10 for LLM Applications; OWASP Top 10 for Agentic Applications
note: excessive agency is split into excessive functionality, permissions, and autonomy
verified: "2026-09-20 genai.owasp.org/llm-top-10/ and genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/"
review_after: "2027-03-20"
```

Short review window on purpose: this is the fastest-moving risk area in the
catalogue. Past `review_after`, `lens-select` reports `LENS STALE` and the
categories below must be re-checked against the current list before being
quoted as authoritative.

## Exclusive constraint

Adds model-specific depth to Security's trust boundary and Reliability's
failure model: what happens when the untrusted input is *instructions*, what
an agent is allowed to do on its own, and how a non-deterministic component is
tested at all. Security still owns who may act; this lens owns the fact that
the model can be talked into acting on someone else's behalf.

## Activates

Signals: `ai-llm`, `prompt`, `agent`, `rag`, `embedding`, `tool-call`,
`mcp`, `fine-tune`, or a detected LLM SDK in the project.

Skip when the change does not reach a model, a prompt, a tool definition, or
retrieved context. A project that merely *has* an LLM dependency does not make
every change an AI change.

## Checklist

**Treat model output as untrusted input (Security)**

1. Trace every path where model output reaches something that acts on it — a
   shell, a query, a filesystem, an HTTP call, a rendered page, another agent.
   Model output is attacker-influenced data, not a trusted instruction.
2. Confirm retrieved or tool-returned content cannot change the model's
   instructions. Indirect injection arrives through a document, a web page, a
   ticket, or a previous agent's output, not through the user's message.
3. Confirm output reaching a browser is escaped. A model that can be induced
   to emit markup gives an attacker stored XSS with extra steps.
4. Confirm system prompts and tool definitions are not treated as secrets —
   assume they are recoverable — and that nothing sensitive lives in them.

**Bound what the agent can do (Security, Architect)**

5. Check **excessive functionality**: can the agent reach tools beyond the task
   it was given? Every tool in scope is reachable by a hijacked goal.
6. Check **excessive permissions**: does each tool run with the narrowest
   credential that works, scoped to the acting user rather than the service?
7. Check **excessive autonomy**: does any high-impact, irreversible or
   spending action proceed without a human in the loop?
8. Confirm authorization is enforced at the tool boundary, by the application —
   never by asking the model nicely in a prompt. A prompt is not an access
   control.
9. For multi-step or multi-agent flows, confirm a hijacked goal cannot persist
   across steps and that each step re-checks permission rather than inheriting
   trust from the first.

**Ground what it says (Reliability, Experience)**

10. For retrieval, confirm the retrieved set is scoped to what the requesting
    user may see. A shared vector index is a cross-tenant read unless it is
    filtered at query time.
11. Confirm the interface distinguishes generated content from retrieved fact,
    and surfaces its source where the answer is consequential.
12. Confirm a refusal, a low-confidence answer, and an empty retrieval each
    have a defined behaviour rather than an invented one.

**Operate it (Reliability)**

13. Confirm timeouts, bounded retries and idempotency on model and tool calls;
    a retried tool call that books, pays, or sends must be idempotent.
14. Confirm token, cost and rate ceilings exist per user and per run, and that
    an agent loop has a hard step limit. Unbounded autonomy is an unbounded
    bill.
15. Confirm failures degrade to something useful, and that prompts, inputs and
    outputs logged for debugging are scrubbed of personal data and secrets.

**Test the non-deterministic part (Builder, Verifier)**

16. Confirm behaviour is pinned by evaluation cases, not by a single happy-path
    example — including adversarial cases for the injection paths above.
17. Confirm the model version, and any prompt or tool-definition change, is
    treated as a deployable change with a way to roll back.

## Evidence

Name the model, version, and the exact prompt or tool definitions inspected. A
review of "the AI feature" that did not read the system prompt and the tool
schemas has not reviewed the attack surface. State which injection paths were
actually exercised versus reasoned about.

## Findings

Every finding names the untrusted path, what the model can be induced to do,
and which tool or permission makes it consequential. "Prompt injection is
possible" is not actionable; "a retrieved document can cause the delete tool to
run against another tenant's records" is.

## Authority

This lens narrows what a role must check; it never outranks the project's own
model policy, its documented tool permissions, or an enforced gate. Where the
project defines an approved model, a spending ceiling, or a human-approval
boundary, that wins and this lens records the difference as a finding.

Its categories are dated and move quickly. Past `review_after`, treat them as
a starting point and re-verify before quoting them as current.

## Hands off

Does not own: general authorization policy outside model-reachable paths
(Security), stored-data invariants behind a retrieval index (Data), general
runtime resilience (Reliability), the user journey around the feature
(Experience), or the final delivery verdict (Verifier).
