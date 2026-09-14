# Compat

**Covers:** public contracts and compatibility. **Escalates to:** Spine.

- Identify current consumers before changing a shared interface.
- State old, transitional, and final behavior where versions may overlap.
- Preserve wire, data, and configuration compatibility unless explicitly approved.
- Make deprecation and migration behavior observable.
- Test representative existing consumers and the new contract.

Required evidence: consumer inventory, contract diff, and compatibility check.
Will not choose the product outcome or own a migration.
