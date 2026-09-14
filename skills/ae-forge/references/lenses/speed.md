# Speed

**Covers:** latency and capacity. **Escalates to:** Signal.

- Define a user-visible budget before optimizing.
- Measure a representative baseline and candidate with the same method.
- Locate the bottleneck before changing code.
- Include data volume, concurrency, warm-up, and tail latency where relevant.
- Record accuracy, cost, or complexity traded for speed.

Required evidence: reproducible measurement and budget comparison.
Will not accept synthetic microbenchmarks as end-to-end proof.
