# Privacy lens (personal data and its obligations)

## Exclusive constraint

Adds personal-data depth to Security's privacy boundary and Data's retention
boundary: what is collected, why it is justified, how long it stays, and what
happens when a person asks for it back or asks for it gone. Security owns who
may access data; this lens owns whether holding it is justified at all.

## Activates

Signals: `privacy`, `pii`, `gdpr`, `consent`, `retention`, `deletion`,
`data-subject`, `anonymize`, or a change that begins collecting, sharing, or
retaining information about a person.

Skip when the change touches no personal data. A user identifier in a log is
personal data; a build flag is not.

## Checklist

**Justify the collection (Security, Product)**

1. Name each new personal field, why the stated feature needs it, and what
   breaks without it. Collected-because-it-might-be-useful is the failure this
   check exists to catch.
2. Confirm the least identifying form that works is used — an aggregate, a
   pseudonym, a coarser precision — rather than the raw identifier by default.
3. Confirm special categories are identified explicitly — health, biometric,
   precise location, financial, anything about a child — because they carry
   stricter obligations than ordinary data.

**Trace where it goes (Security, Data)**

4. Trace the new data to every destination: database, logs, traces, analytics,
   error reports, caches, backups, and every third party.
5. Confirm a third-party destination is intended and disclosed. An analytics
   SDK receiving an email address is a disclosure the product may never have
   made.
6. Confirm data crossing a regional boundary does so deliberately, and that
   the project's stated region constraints still hold.

**Bound how long it stays (Data)**

7. Confirm a retention period exists and is enforced by something that runs,
   not by intention. Data with no deletion path is retained forever by default.
8. Confirm deletion reaches derived copies: search indexes, caches, analytics
   stores, embeddings, and backups — and state honestly where deletion is
   deferred to backup expiry.
9. Confirm an anonymisation claim survives correlation. Removing a name from a
   record that still carries a unique device identifier is pseudonymisation,
   and must not be described as anonymisation.

**Serve the person (Product, Experience)**

10. Confirm export and deletion requests can be satisfied for the new data,
    and that the change does not create a store nobody can enumerate per user.
11. Confirm consent, where it is the basis, is specific, recorded with what was
    agreed and when, and withdrawable — and that withdrawal actually stops the
    processing.
12. Confirm the user-facing explanation matches what the system does. A privacy
    notice describing yesterday's behaviour is a correctness defect.

## Evidence

List the fields, their destinations, and the retention mechanism inspected.
State what was read in code versus inferred from documentation: a policy
document is a claim about the system, not evidence of it.

## Findings

Every finding names the data, the destination or duration at issue, and the
obligation or expectation it breaks. This lens raises engineering findings; it
does not give legal advice, and a finding that turns on jurisdiction must say
so and route to a human.

## Authority

This lens narrows what a role must check; it never outranks the project's own
privacy policy, its data-handling standards, its legal advice, or an enforced
gate. Where the project or its counsel has decided a question, that decision
wins and this lens records the difference as a finding rather than overriding
it.

## Hands off

Does not own: access control and authentication (Security), secret handling
(`secrets-hygiene`), schema migration mechanics (Data), legal interpretation
or jurisdictional advice, or the final delivery verdict (Verifier).
