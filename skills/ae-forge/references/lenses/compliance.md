# Compliance lens (controls someone will ask you to evidence)

## Exclusive constraint

Adds control-framework depth to Security's boundary and Data's retention
boundary: which obligations apply to this system, which technical controls
satisfy them, and whether the evidence an auditor would ask for actually
exists.

`privacy` owns personal data and what a person may demand about it. This lens
owns the *control frameworks* a system is held to — access review, change
management, audit trails, segregation of duties — most of which apply to data
that is not personal at all.

## Activates

Signals: `compliance`, `soc2`, `pci`, `hipaa`, `iso27001`, `audit-trail`,
`audit-log`, `regulated`, `attestation`, `evidence`, `segregation-of-duties`,
`access-review`, or a change touching a system the project states is in scope
for a framework.

Skip unless the project itself says a framework applies. Assuming a regime
nobody has adopted produces work with no obligation behind it, which is the
most expensive kind.

## Checklist

**Design (Architect)**

1. Name the framework, the control, and the source that says it applies. A
   control cited without a source is a guess wearing a reference number.
2. State whether this change puts new data or a new system in scope. Scope
   expansion is the finding; the control gap is a consequence of it.
3. Decide what the audit trail records **before** building it: actor, action,
   target, time, and outcome. A log that records the action but not who took
   it satisfies nothing.
4. Decide retention for the trail separately from retention for the data. They
   are usually different, and frameworks generally specify the trail.
5. For anything touching payment card data, prefer keeping it out of scope
   entirely. The cheapest control is not holding the data.

**Implementation (Builder)**

6. Make the audit trail append-only and separate from the record it describes.
   A trail the application can rewrite is not evidence of anything.
7. Record the actor from the verified identity, never from a client-supplied
   field. An attributable action attributed by the actor is unattributed.
8. Never log the sensitive value itself into the trail. Record that it changed,
   by whom, and to what class — not the number.
9. Keep privileged actions distinguishable from ordinary ones in the trail.
   "Someone updated a row" and "an administrator overrode a limit" must not be
   the same entry.
10. Make time monotonic and unambiguous. A trail with local timestamps and no
    offset cannot establish an order across systems.

**Verification (Verifier)**

11. Produce the evidence an auditor would request for one control, end to end.
    If you cannot produce it from the running system, the control is not
    implemented regardless of what the design says.
12. Confirm a privileged action appears in the trail with its actor.
13. Confirm the trail cannot be modified through the application's own paths.

## Evidence

Name the framework and control with its source, the trail's location and
schema with `path:line`, its retention, and the one control you actually
produced evidence for. State clearly which controls were inspected and which
were assumed from documentation.

## Findings

Every finding names the control, what evidence is missing, and what an auditor
would conclude. This lens raises engineering findings about controls; it does
not give legal or certification advice, and a finding that turns on
interpretation of a regime must say so and route to a human.

## Authority

This lens narrows what a role must check; it never outranks the project's own
compliance programme, its auditors' guidance, its legal advice, or an enforced
gate. Where the project or its assessors have decided a question, that decision
wins and this lens records the difference as a finding rather than overriding
it.

## Hands off

Does not own: personal-data justification and data-subject requests
(`privacy`), authentication and session mechanics (`identity-auth`), the
system's own credentials (`secrets-hygiene`), operator alerting
(`observability`), legal interpretation, or the final delivery verdict
(Verifier).
