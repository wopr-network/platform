# Event Ingestion

How push-triggered discipline flows receive entities from external events.

---

## Pull vs Push

Not all pipelines start the same way.

**Pull-based flows** (engineering): entities pre-exist in a backlog. Workers call `claim` when they're ready to work. The pipeline waits for workers. Work accumulates and gets consumed at the pace workers can handle it.

**Push-based flows** (devops, qa, security): entities are created by external events. A release is cut, a production alert fires, a CVE is published, a coverage gap is detected. The pipeline must react immediately. There is no backlog — each event creates one entity, right now.

The distinction matters because the two models have different failure modes:
- Pull-based: backlog grows if workers are too slow. The queue is the buffer.
- Push-based: events are missed if ingestion is unavailable. The webhook is the entry point.

---

## The Event Contract

Every push-triggered entity creation requires:

1. **Target flow** — which flow should handle this event
2. **Event type** — what kind of event occurred (flow must declare it accepts this type)
3. **Refs** — structured references to external resources (repository, issue, alert ID)
4. **Artifacts** — initial data the workers will need (version number, environment, findings)

The entity starts life with this context already attached. Workers get it immediately on `claim` — no need to re-fetch from the originating system.

---

## Webhook Pattern

External systems POST events to the pipeline's webhook endpoint:

```
POST /webhook/:flowName
{
  "event": "release_cut",
  "refs": {
    "github": { "repo": "org/repo", "tag": "v1.4.2", "sha": "abc123" }
  },
  "artifacts": {
    "releaseVersion": "v1.4.2",
    "targetEnv": "production"
  }
}
```

The pipeline:
1. Validates the request signature (HMAC — see Security below)
2. Checks that the flow accepts this event type
3. Creates an entity in the flow's `initialState` with the provided refs and artifacts
4. Returns the entity ID

A worker calling `claim(role: "devops")` will receive the entity. Its prompt will have `releaseVersion` and all other artifacts available as `{{entity.artifacts.releaseVersion}}`.

---

## CLI Trigger

For manual or scripted entity creation without a webhook integration:

```bash
pipeline trigger --flow wopr-release \
  --event release_cut \
  --refs '{"github": {"repo": "org/repo", "tag": "v1.4.2"}}' \
  --artifacts '{"releaseVersion": "v1.4.2"}'
```

This calls the same internal entity-creation logic as the webhook — not a separate code path. Useful for testing flows, manual intervention, or scripted automation that doesn't have a webhook target.

---

## Flow Configuration

Flows must declare which event types they accept:

```json
{
  "name": "my-release-flow",
  "discipline": "devops",
  "initialState": "release_cut",
  "acceptsEvents": ["release_cut"]
}
```

Events not in `acceptsEvents` are rejected with a clear error. This prevents misconfigured webhooks from silently creating entities in the wrong flow.

---

## Idempotency

External systems frequently deliver the same event more than once — network retries, delivery guarantees, duplicate webhook registrations. The pipeline must handle this gracefully.

Flows declare a deduplication key:

```json
{
  "deduplicationKey": "refs.github.tag"
}
```

If an entity already exists with the same deduplication key value, the webhook returns the existing entity ID instead of creating a new one. The second delivery is a no-op. Workers are unaffected.

Without a deduplication key, every webhook delivery creates a new entity — appropriate for truly distinct events (each alert, each CVE), not for events that should be idempotent (each release tag).

---

## Security

All webhook endpoints require authentication via HMAC signature:

```
X-Pipeline-Signature: sha256=<hmac-sha256 of request body>
```

Per-flow secrets are configured in the pipeline — the sending system must know the secret to produce a valid signature. Requests with missing or invalid signatures are rejected with 401.

This is a server-to-server integration. The webhook endpoint is not a public API.

---

## Engineering Flows Are Different

Engineering flows do not use event ingestion. Entities are created by the issue tracker sync — when an issue is created in Linear (or equivalent), a corresponding entity is created in the engineering flow's backlog.

Event ingestion is for the other disciplines. Engineering starts with human intent expressed as an issue. DevOps, QA, and security start with system events that require response.

---

See [disciplines.md](disciplines.md) for why devops, qa, and security flows are push-triggered.

See [worker-protocol.md](worker-protocol.md) for how workers claim entities once they exist.

See [WOPR implementation](../../wopr/pipeline/event-ingestion.md).
