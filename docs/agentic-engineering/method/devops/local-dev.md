# Local Development Environments

How to test infrastructure changes locally before they reach production.

---

## Purpose

Agents testing infrastructure changes need a local environment that mirrors production topology — not just a convenient single-machine shortcut. The local environment determines what classes of bugs are caught before the change reaches production.

Two approaches exist, serving different purposes. Choosing the wrong one for the situation means some bugs only surface in production.

## Two Approaches

### High-Fidelity Topology Replication

Replicate the production node topology in a local environment. Run separate isolated hosts for each production node, connected via a bridge network. Services communicate across the network boundary the same way they do in production.

This approach catches:
- Network routing bugs — services that assume localhost but need to reach a remote host
- Credential propagation issues — secrets that must be injected across a network boundary
- Container-in-container limitations — behaviors that differ in containerized environments
- Port-mapping edge cases — services that bind to unexpected interfaces

Tradeoff: slower startup, higher resource requirements.

### Flat Single-Host Composition

All services on one shared network. Lower fidelity, faster iteration.

Resource-constrained services (GPU-intensive, memory-heavy) use conditional startup mechanisms — profiles, feature flags, or environment conditions — to manage resource usage.

This approach is appropriate when:
- Testing application-level logic, not infrastructure
- Running CI pipelines where resource constraints apply
- Iterating rapidly on a single service in isolation

Tradeoff: misses network-topology bugs, credential-propagation bugs, and container-in-container gotchas.

## When to Use Which

| Scenario | Approach |
|----------|----------|
| Testing deploy scripts | High-fidelity topology |
| Testing network routing changes | High-fidelity topology |
| Testing credential propagation | High-fidelity topology |
| Provisioning a new service | High-fidelity topology |
| Application-level feature development | Flat composition |
| Running the test suite | Flat composition |
| CI pipeline testing | Flat composition |
| Rapid iteration on a single service | Flat composition |

The decision rule: if the change touches how services find and communicate with each other, use the high-fidelity topology. If the change is within a single service, the flat approach is sufficient.

## Agentic Engineering Implications

Agents testing infrastructure changes should use the high-fidelity topology. Agents doing normal feature development use the flat approach.

The choice is not about caution — it's about fitness for purpose. An agent testing a deploy script against a flat environment is not actually testing the deploy script. It's testing a different, simpler system that shares some code with the real one.

The local environment is a gate. If the gate doesn't resemble the real environment, the gate is not catching the bugs it's supposed to catch.

## Anti-Patterns

- **Testing flat when deploying to multi-node** — passing locally against the flat environment and assuming production will behave the same. It won't, for network-topology reasons.
- **Skipping local infrastructure testing entirely** — "it works in CI." CI often runs flat. CI is not production.
- **Environment drift** — local environment diverges from production over time as production evolves. Keep local configs in sync with production configs.
- **Hardcoded localhost** — service A calls `http://localhost:PORT/path` instead of the production service address. Works flat, fails in topology replication.

See [WOPR implementation](../../wopr/devops/local-dev.md).
