# Secrets hygiene lens (credential lifecycle and exposure)

## Exclusive constraint

Adds credential-lifecycle depth to Security's secret-handling boundary and to
Builder and Verifier's inspection of the diff: where a secret comes from, how
it travels, where it can be written down by accident, and what happens when it
leaks. It does not decide authorization policy — Security still owns who may
act.

## Activates

Signals: `secret`, `credential`, `token`, `api-key`, `env`, `vault`,
`rotation`, `signing`, or any `access` risk on a change that reads or writes
configuration.

Skip when the change touches no credential, configuration value, or outbound
authentication. A file named `config` is not activation; a value that
authenticates something is.

## Checklist

**Origin (Security, Architect)**

1. Name where each secret the change uses comes from: an environment variable,
   a secret manager, a file, or a literal. A literal is a finding regardless of
   the repository's visibility.
2. Confirm a secret reaching client-side or user-inspectable code is intended
   to be public. Anything shipped to a browser, a mobile bundle, or a container
   image the user can pull is public.
3. Confirm a new secret has a documented owner and a way to rotate it. A
   credential nobody can rotate is an incident that has not happened yet.

**Transport and storage (Security, Builder)**

4. Confirm secrets are not passed as command-line arguments, where they land in
   process listings and shell history.
5. Confirm secrets are not written to logs, error messages, traces, metrics
   labels, crash reports, or analytics — including indirectly, by logging a
   whole request, config object, or exception payload.
6. Confirm secrets are not persisted to a cache, temporary file, or database
   column that was not designed to hold them.
7. Confirm test fixtures, seed data, snapshots, and example configuration use
   obviously fake values, not scrubbed real ones.

**In the diff (Verifier)**

8. Inspect the actual diff for high-entropy strings, private-key headers,
   connection strings with embedded passwords, and `.env` files that became
   tracked.
9. Confirm a removed secret was also rotated. Deleting a credential from the
   working tree leaves it in history, so the repository is not the boundary —
   the credential's validity is.
10. Confirm `.gitignore` and any secret-scanning gate the project already runs
    still cover the paths this change introduced.

**Failure (Security, Reliability)**

11. Confirm a missing or invalid secret fails closed with a clear operator
    error, rather than silently falling back to an unauthenticated path or a
    development default.

## Evidence

A passing secret scanner is a floor, not a pass: it finds known shapes, not a
credential in an unusual format or one passed through a variable. State which
paths were inspected by eye and which were covered only by a scanner.

## Findings

Every finding names the credential, where it becomes exposed, and who could
read it at that point. "Hardcoded secret" without naming what it unlocks is
not actionable; "the service-role key is readable from the client bundle, and
it bypasses row-level security" is.

## Authority

This lens narrows what a role must check; it never outranks the project's own
documented conventions or an enforced gate. Where the project already runs a
secret-scanning gate or names an approved secret source, that wins and this
lens records any difference as a finding rather than imposing its own default.

## Hands off

Does not own: who is allowed to perform an action (Security's authorization
boundary), how a credential is stored at rest by an infrastructure provider,
key-management architecture beyond this repository's use of it, incident
response after a confirmed leak, or the final delivery verdict (Verifier).
