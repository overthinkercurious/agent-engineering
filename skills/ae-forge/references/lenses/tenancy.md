# Tenancy — cross-boundary authorization lens

## Contract metadata

- **ID/version:** `tenancy` / `1`
- **Covers:** authorization and tenant isolation
- **Escalates to:** `vault`
- **Finding schema:** `finding.schema.json`

## Activation and non-triggers

Apply when a change touches an authorization decision or a resource scoped
to a tenant, account, or user: the registry triggers are `auth`,
`authorization`, `tenant`. Ask specifically whether one identity can reach
another identity's data or actions — through a swapped ID in a URL or
request body, an internal/admin route with a weaker check than its public
counterpart, or a shared resource (cache key, queue message, background job
context, search index, export) that does not carry the owning tenant with
it. Do not activate merely because a route requires login; a login check is
not an isolation check. Do not use Tenancy to judge general input-handling
abuse of a feature's own function (spam, injection, replay) — that is
Threat's job even on the same endpoint. Tenancy owns exactly one question
class: does the acting identity match the resource's actual owner, on every
path that reaches the resource.

## Inputs and missing inputs

Read the tenant/account/user identity model, the authorization matrix
(which identity may act on which resource), the specific data/write access
points in the diff, and current evidence of the ownership comparison at
each one. If the authorization model or the resource-owner mapping is
missing, Tenancy cannot say what "cross-tenant" means for this resource and
returns `needs_input` naming `authorization_model`. If an access point's
server-side check cannot be located (only a client-side guard is visible),
treat the check as absent rather than assumed present.

## Questions and procedure

1. List every place in the diff that reads, writes, or acts on a
   tenant/account/user-scoped resource, including internal, admin, batch,
   and background-job code paths, not only the primary user-facing route.
2. For each access point, find the exact comparison between the acting
   identity (or its tenant/account) and the resource's actual owner. A
   check that only confirms "some session exists" or "the ID is well
   formed" does not count.
3. Check whether the identifier used to select the resource is
   server-derived (from the authenticated session) or client-supplied
   (from a URL, body, or header) and, if client-supplied, whether it is
   re-verified against the session's own tenant before use.
4. Inspect shared/pooled infrastructure the resource passes through: cache
   keys, queue messages, background job payloads, search index documents,
   exports, and webhooks — ask whether each carries and re-checks the
   owning tenant, or whether it can return/deliver another tenant's data
   into the wrong context.
5. Confirm the failure mode is deny-by-default: an unknown or unverifiable
   ownership state must reject, not pass through.
6. Test same-tenant success and cross-tenant denial for each access point;
   cite the smallest current evidence for both.

The intermediate deliverable is an access-point table: resource, identifier
source, ownership comparison, and same-tenant/cross-tenant test result.

## Evidence and finding taxonomy

Required evidence is the authorization matrix entry for the resource and a
negative isolation test (an authenticated cross-tenant request that must be
denied) alongside the positive same-tenant test. Finding categories are
missing ownership comparison (authentication mistaken for authorization),
client-trusted identifier used without server-side re-derivation, and
shared-resource leakage across tenant context (cache, queue, job, search,
export). Severity follows the shared finding contract, weighted by what the
exposed or corrupted resource is, not by how deeply the route is nested.

## Non-decisions and escalation

Tenancy does not define business roles or permission levels, does not
accept an authorization exception on the business's behalf, and does not
judge general input-validation or replay abuse unrelated to ownership.
Escalate to Vault when a finding requires threat-modeling a new trust
boundary, ranking the finding against the full security/privacy picture, or
when no authorization model exists to build the access-point table from.
Return the request to Forge; do not dispatch Vault.

## Stop conditions

Stop once every access point in the diff has an ownership-comparison
finding or a structured gap, and once same-tenant and cross-tenant tests
are recorded for each. Stop immediately on missing authorization model,
stale isolation-test evidence, forbidden access, or satisfied coverage. Do
not invent a cross-tenant finding the diff does not support.

## Examples

### Valid worked example

The diff adds `GET /reports/:reportId/export`, guarded by
`requireSession()` only; `reportId` is taken from the URL and used directly
to fetch the report with no comparison to `session.tenant_id`. Tenancy
authenticates as tenant A, requests a `reportId` known to belong to tenant
B, and observes a `200` response containing tenant B's report data —
`receipt:report-export-idor`. It emits a canonical high finding:
`{"schema":2,"id":"finding:<computed>","lens":"tenancy","severity":"high","criterion":"report export is scoped to the requesting tenant","invariant":"a caller can only export a report owned by their own tenant","evidence_ids":["receipt:report-export-idor"],"affected_behavior":"GET /reports/:reportId/export","smallest_repair":"compare the fetched report's tenant_id to session.tenant_id and return 404 on mismatch","verification":"authenticate as tenant A, request tenant B's known reportId, assert 403/404","status":"open"}`.

### Misleading example

"The route is behind `requireSession()`, so only logged-in users can hit
it" is rejected: `requireSession()` proves a caller is authenticated, not
that the specific `reportId` they supplied belongs to them. Any logged-in
user can substitute another tenant's ID, so Tenancy records the missing
tenant-ownership comparison as the actual gap rather than accepting session
presence as an isolation control.

### Missing-input example

Asked to review a new background job that copies report rows into a shared
cache keyed only by `reportId` (no tenant segment in the key), with no
authorization model stating whether cache reads re-check the caller's
tenant, Tenancy returns `needs_input`, names `authorization_model` (the
cache read/write ownership rule) as the missing input, and does not assume
the cache key is safe because the write path is internal. If resolving this
turns into modeling the shared-cache trust boundary end to end, Tenancy
routes that to Vault through Forge rather than deciding it unaided.
