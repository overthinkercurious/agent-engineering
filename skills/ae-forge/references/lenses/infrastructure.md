# Infrastructure lens (declared environment and deployment)

## Exclusive constraint

Adds infrastructure-as-code and deployment depth to Architect and Reliability:
what a change does to the running environment, whether it can be applied
safely, and whether it can be undone. Reliability still owns runtime failure;
this lens owns the change to the ground it runs on.

## Activates

Signals: `infrastructure`, `deployment`, `terraform`, `kubernetes`, `helm`,
`docker`, `ci`, `pipeline`, or detected IaC files, container definitions, or
orchestration manifests.

Skip for an application-only change that alters no declared environment,
image, or pipeline.

## Checklist

**Know what the change will do (Architect, Reliability)**

1. Read the plan or diff the tooling produces before applying. A resource
   marked for replacement rather than update is the difference between a
   config change and an outage.
2. Identify anything stateful in the blast radius — a volume, a database, a
   load balancer with a stable address — and confirm it is not being
   recreated.
3. Confirm the change is expressed in code, not applied by hand. Drift between
   declared state and reality makes every later plan untrustworthy.

**Apply it safely (Reliability)**

4. Confirm the rollout is incremental where the platform allows it, with a
   health signal gating progression rather than a fixed wait.
5. Confirm health and readiness checks actually reflect readiness. A check
   that reports healthy before dependencies are reachable routes traffic into
   a broken instance.
6. Confirm resource requests and limits are set deliberately: an unbounded
   container competes with its neighbours, an over-tight limit restarts under
   normal load.
7. Confirm the change survives an instance being replaced without warning,
   because it will be.

**Undo it (Reliability)**

8. Confirm a rollback path exists and is stated, including the case where the
   new version has already written incompatible state — a code rollback is not
   a data rollback.
9. Confirm secrets come from the platform's secret mechanism, not baked into
   an image, a manifest, or a build argument.
10. Confirm the image is pinned to a digest or immutable tag. A floating tag
    makes the deployed artifact unknowable after the fact.

**Pipeline (Architect, Security)**

11. Confirm the pipeline's own credentials are scoped to what it deploys, and
    that a pull request from a fork cannot reach them.
12. Confirm build inputs are pinned, so the artifact that was reviewed is the
    artifact that ships.
13. Confirm the change does not widen network exposure — a new ingress, an
    opened port, a public bucket — without that being the stated intent.

## Evidence

Include the actual plan output or rendered manifest diff, not a summary of it.
State which environment it was produced against; a plan against a stale
workspace describes a different world.

## Findings

Every finding names the resource, what happens on apply, and what a user or
operator experiences. "Risky change" is not actionable; "applying this
replaces the load balancer, changing its address and dropping in-flight
connections" is.

## Authority

This lens narrows what a role must check; it never outranks the project's own
deployment conventions, its declared environments and change windows, or an
enforced gate. Where the project documents a rollout policy, that wins and
this lens records the difference as a finding.

## Hands off

Does not own: application runtime behaviour and retries (Reliability),
database migration correctness (Data and `database-performance`), application
authorization (Security), or the final delivery verdict (Verifier).
