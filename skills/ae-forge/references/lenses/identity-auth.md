# Identity and authentication lens (who the caller is, and for how long)

## Exclusive constraint

Adds identity-protocol depth to Security's trust boundary and Experience's
sign-in journey: how a caller proves who they are, what that proof is worth,
how long it lasts, and how it is withdrawn.

Security owns *who may do what* once identity is established. This lens owns
*how identity is established and maintained* — the flow, the token, the
session, and every way each of those can be replayed, confused, or outlived.
`secrets-hygiene` owns credentials the system holds about itself; this lens
owns credentials the system holds about a person.

## Activates

Signals: `auth`, `oauth`, `oidc`, `sso`, `saml`, `login`, `signin`, `signup`,
`session`, `token`, `jwt`, `refresh`, `mfa`, `password`, `logout`,
`account-linking`, or a change that alters how a request becomes an identity.

Skip when the change runs entirely behind an already-established identity and
alters neither the proof nor its lifetime.

## Checklist

**Design (Architect)**

1. Name the flow precisely — authorization code with PKCE, client credentials,
   device code, magic link, password. "OAuth" is not a flow, and the security
   properties differ per flow, not per provider.
2. State where the token is stored and why that store was chosen. Browser
   storage that JavaScript can read is readable by anything injected into the
   page; an httpOnly cookie is not, and carries CSRF obligations instead. Name
   the trade you took.
3. State the lifetime of every credential in the flow: authorization code,
   access token, refresh token, session. A refresh token with no expiry is a
   password with better branding.
4. Decide what logout actually does. Clearing a client-side token ends the
   appearance of a session; only server-side revocation ends the session.
5. For account linking, state how two identities are proven to be the same
   person. Matching on an email address the provider did not verify lets
   anyone who can register that address take the account.

**Implementation (Builder)**

6. Validate the token's signature, issuer, audience and expiry — all four.
   Decoding a JWT is not validating it, and a decoded-but-unvalidated token is
   attacker-controlled input with a trustworthy shape.
7. Bind the authorization request to its callback with `state`, and the code
   to the client with PKCE. Without `state`, an attacker can complete a login
   into the victim's browser using their own account.
8. Take the user identifier from the verified claim, never from the request
   body, a query parameter, or a header the client can set.
9. Handle the reuse case explicitly: a refresh token presented twice means it
   leaked. Rotating and revoking the family is the standard response; silently
   issuing a second one is not.
10. Make failures indistinguishable. "No such user" and "wrong password" as
    separate messages is an account enumeration oracle.

**Verification (Verifier)**

11. Confirm an expired token is rejected, not merely absent from the happy
    path. Set the clock forward or mint an expired token; do not infer it.
12. Confirm logout invalidates server-side, by reusing the old token after it.
13. Confirm the callback rejects a mismatched or missing `state`.

## Evidence

Name the flow, the validation site with `path:line`, the storage location, and
each lifetime with its source. State which properties were exercised against a
running system and which were read in code — an auth flow that type-checks and
an auth flow that rejects a forged token are different claims.

## Findings

Every finding names the actor who benefits, the step that lets them, and what
they reach. "Token handling could be improved" is not a finding; "an expired
access token is accepted because only the signature is checked at
`api/auth.ts:44`, so a leaked token never stops working" is.

## Authority

This lens narrows what a role must check; it never outranks the project's own
security decisions, its identity provider's documented behaviour, or an
enforced gate. Where the project has deliberately accepted a weaker property,
that decision wins and this lens records the difference as a finding rather
than overriding it.

## Hands off

Does not own: authorization and permission policy once identity is established
(Security), the system's own service credentials (`secrets-hygiene`), personal
data justification and retention (`privacy`), session storage schema mechanics
(Data), or the final delivery verdict (Verifier).
