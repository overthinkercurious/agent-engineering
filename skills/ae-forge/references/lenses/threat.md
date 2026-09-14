# Threat — abuse-surface and adversarial-input lens

## Contract metadata

- **ID/version:** `threat` / `1`
- **Covers:** security and abuse
- **Escalates to:** `vault`
- **Finding schema:** `finding.schema.json`

## Activation and non-triggers

Apply when a change adds or alters an entry point, accepts untrusted input,
calls an external system, or moves money: the registry triggers are
`security`, `auth`, `external`, `payment`. Ask whether the feature can be
driven to do something its designer did not intend — a "resend verification
email" action hit in a loop to spam an address, a "share" link enumerated to
discover other users' resources, a webhook replayed to re-trigger a paid
action. Do not activate solely because a file lives in a folder named
`auth` or `payments`; activate because untrusted input or an external actor
actually reaches a sensitive sink in the diff. Do not use Threat to decide
whether one tenant can reach another tenant's data — that comparison is
Tenancy's job even when the mechanism is the same input field. Threat owns
the abuse of a feature's own function and the trustworthiness of input
reaching a sink; it does not own the ownership comparison between an actor
and the resource they asked for.

## Inputs and missing inputs

Read the feature's intended function (what it is supposed to let a caller
do), the entry points that accept untrusted input (request bodies, query
params, headers, uploaded files, webhook payloads, queue messages), the
sinks that input reaches (shell calls, SQL, template rendering, filesystem
paths, outbound HTTP, rate-limited or costed operations), and current
evidence of validation or throttling at each boundary. If the feature's
intended function is not stated, Threat cannot judge what counts as abuse
of it and returns `needs_input` naming `intended_function`. If a named sink
has no reachability evidence (no trace from input to sink), return
`needs_input` naming the missing trace rather than assuming the input is
sanitized upstream. Do not infer that a library is safe because it is
widely used; cite the actual call.

## Questions and procedure

1. Name the untrusted actor, the feature's intended function, and every sink
   the request or message can reach.
2. For each sink, check whether input is validated, escaped, or bounded
   before it arrives — not merely typed or present.
3. Ask whether the feature can be invoked repeatedly, out of order, or with
   crafted parameters to produce an effect beyond its intended one: spam,
   cost amplification, resource exhaustion, or state corruption unrelated
   to the caller's own resource.
4. Check error responses, log lines, and response timing for the sink and
   ask whether any of them let an outside caller infer something they
   should not (whether an account exists, whether a value matched a secret,
   internal file paths or stack frames).
5. Check for replay: can a captured request, token, or callback be resent
   to repeat an effect that should happen once.
6. Cite the smallest current evidence — a request/response pair, a log
   line, a reachability trace — that answers each question; do not restate
   the claim as its own evidence.

The intermediate deliverable is a table of entry point, sink, validation
state, and abuse hypothesis tested or open.

## Evidence and finding taxonomy

Required evidence is a reachability trace from untrusted input to the named
sink and, where a control is claimed, the actual validation, throttling, or
escaping code — not a framework default asserted from memory. Finding
categories are unvalidated input at a sensitive sink, feature-function abuse
(the intended action driven past its intended bound), information leak via
error/log/timing, and missing replay protection. Severity follows the
shared finding contract, weighted by what the sink can do (data exposure,
cost, integrity) rather than by how the input arrived.

## Non-decisions and escalation

Threat does not decide whether an actor is entitled to the resource they
asked for (that is cross-tenant/ownership judgment, owned by Tenancy) and
does not accept residual security risk or prescribe a security framework.
Escalate to Vault when a finding implies a trust-boundary redesign, a
credential- or secret-handling defect, or when ranking the finding against
other security risk requires the full authorization/actor map Vault
maintains. Return the request to Forge; do not dispatch Vault.

## Stop conditions

Stop once every named sink has a reachability-and-control finding or a
structured gap, and once replay and information-leak questions are answered
for testable claims. Stop immediately on missing intended-function
statement, stale reachability evidence, forbidden access, or satisfied
coverage. Do not invent an abuse case the diff does not support.

## Examples

### Valid worked example

The diff adds `POST /account/resend-verification` with no rate limit or
per-address cooldown; the intended function is "send one verification email
per unclick request." Threat traces the request straight to the mail-send
sink with no throttling check and reproduces ten requests in five seconds
each returning `202` and enqueuing another email to the same address. It
cites `receipt:resend-verification-flood` and emits a canonical medium
finding: `{"schema":2,"id":"finding:<computed>","lens":"threat","severity":"medium","criterion":"resend-verification is bounded to one send per request per cooldown window","invariant":"an unauthenticated caller cannot cause unbounded email volume to an address they do not control","evidence_ids":["receipt:resend-verification-flood"],"affected_behavior":"POST /account/resend-verification","smallest_repair":"add a per-address cooldown before enqueueing the send","verification":"resend ten times in five seconds and assert only one send is enqueued","status":"open"}`.

### Misleading example

"The endpoint requires a valid email format, so it can't be abused" is
rejected: format validation constrains the shape of the address, not the
call frequency or the volume of mail delivered to it. A well-formed address
is still someone else's inbox, and the finding is about invocation rate,
not address shape — Threat records the missing throttling check as the
actual gap rather than accepting input-shape validation as abuse
protection.

### Missing-input example

Asked to review a new webhook receiver with the payload schema but no
statement of what the webhook is supposed to trigger exactly once versus
per delivery attempt, Threat returns `needs_input`, names
`intended_function` (specifically, the expected replay/idempotency
semantics) as the missing input, and does not assume the handler is meant
to be idempotent. If the question turns out to require the durable
consumption-ledger design behind that idempotency guarantee, Threat routes
that specific sub-question to Vault through Forge rather than deciding it
unaided.
