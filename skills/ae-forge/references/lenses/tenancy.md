# Tenancy

**Covers:** authorization and tenant isolation. **Escalates to:** Vault.

- Derive tenant and actor identity from a trusted boundary.
- Authorize every read and write against the intended resource owner.
- Treat caches, jobs, search, exports, and indirect identifiers as boundaries.
- Deny by default when ownership or permission is unknown.
- Test same-tenant success and cross-tenant denial.

Required evidence: authorization matrix and negative isolation tests.
Will not define business roles or accept an authorization exception.
