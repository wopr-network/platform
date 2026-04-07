---
name: wopr-security
description: WOPR security configuration reference covering trust levels, capabilities, sandbox isolation, access patterns, and session security.
---

# WOPR Security Configuration

WOPR implements a three-layer security model: Trust Levels (who), Capabilities (what), and Sandbox (where). This skill covers security configuration and best practices.

## Trust Levels

Trust levels determine the base security context for any injection source.

| Level | Source | Default Behavior |
|-------|--------|------------------|
| `owner` | CLI, daemon, cron, internal | Full access to all capabilities |
| `trusted` | Plugins, verified users | Scoped access per configuration |
| `semi-trusted` | API, gateway forwarded | Limited tools, optional sandbox |
| `untrusted` | P2P discovery, unknown sources | Sandboxed, minimal tools |

### Trust Level Hierarchy

```
owner (100) > trusted (75) > semi-trusted (50) > untrusted (0)
```

Higher trust levels can grant capabilities to lower levels. Lower trust levels cannot escalate their own privileges.

## Capabilities System

Capabilities control what actions a session or agent can perform.

### Available Capabilities

| Capability | Description |
|------------|-------------|
| `inject` | Send messages to sessions |
| `inject.tools` | Use A2A tools during execution |
| `inject.network` | Make HTTP requests (`http_fetch`) |
| `inject.exec` | Execute shell commands (`exec_command`) |
| `session.spawn` | Create new sessions |
| `session.history` | Read own session history |
| `cross.inject` | Inject messages into other sessions |
| `cross.read` | Read other sessions' history |
| `config.read` | Read configuration |
| `config.write` | Modify WOPR configuration |
| `memory.read` | Read memory files |
| `memory.write` | Write memory files |
| `cron.manage` | Create/delete cron jobs |
| `event.emit` | Emit events |
| `a2a.call` | Use agent-to-agent communication tools |
| `*` | Wildcard - all capabilities |

### Capability Profiles by Trust Level

```javascript
// Owner: Full access
owner: ["*"]

// Trusted: Operational access
trusted: ["inject", "inject.tools", "session.spawn", "session.history",
          "memory.read", "memory.write", "config.read", "event.emit", "a2a.call"]

// Semi-trusted: Limited interaction
"semi-trusted": ["inject", "inject.tools", "session.history",
                 "memory.read", "config.read", "a2a.call"]

// Untrusted: Message injection only (no tools)
untrusted: ["inject"]

// Gateway: Cross-session forwarding
gateway: ["inject", "inject.tools", "cross.inject", "cross.read",
          "session.history", "memory.read", "a2a.call"]
```

## Session Security Configuration

### CLI Commands

```bash
# View security status
wopr security status

# Set enforcement mode
wopr security enforcement off    # No enforcement (testing)
wopr security enforcement warn   # Log violations but allow (migration)
wopr security enforcement enforce # Block violations (production)

# List all session configs
wopr security sessions

# View specific session config
wopr security session <name>

# Configure session properties
wopr security session <name> <property> <value>
```

### Session Properties

#### Access Patterns

Control who can inject into a session:

```bash
# Allow anyone
wopr security session gateway access "*"

# Only trusted and above
wopr security session main access "trust:trusted"

# Allow untrusted (for gateway sessions)
wopr security session public-api access "trust:untrusted"

# Specific P2P peer
wopr security session alice access "p2p:MCoxK8f2..."
```

#### Indexable Patterns

Control which session transcripts THIS session can see in memory search:

```bash
# Can see all sessions' transcripts
wopr security session admin indexable "*"

# Can only see own transcripts
wopr security session p2p-peer indexable "self"

# Self plus specific pattern
wopr security session gateway indexable "self,session:api-.*"
```

#### Capabilities

Set what a session can do:

```bash
# Full capabilities
wopr security session main capabilities "*"

# Limited capabilities
wopr security session sandbox capabilities "inject,inject.tools,session.history"
```

### Access Pattern Types

| Pattern | Description |
|---------|-------------|
| `*` | Matches anyone |
| `trust:owner` | Owner trust level only |
| `trust:trusted` | Trusted or higher |
| `trust:semi-trusted` | Semi-trusted or higher |
| `trust:untrusted` | Any trust level |
| `session:<name>` | From specific session |
| `p2p:<publicKey>` | Specific P2P peer |
| `type:<sourceType>` | By source type (cli, daemon, p2p, etc.) |

## Docker Sandbox Isolation

Untrusted sources can run in hardened Docker containers for isolation.

### Sandbox Configuration

```bash
docker run \
  --read-only \                     # Read-only root filesystem
  --tmpfs /tmp --tmpfs /var/tmp \   # Ephemeral temp dirs
  --network none \                  # No network (prevents exfiltration)
  --cap-drop ALL \                  # Drop all Linux capabilities
  --security-opt no-new-privileges \  # Prevent privilege escalation
  --pids-limit 100 \                # Limit process count
  --memory 512m \                   # Memory limit
  --memory-swap 512m \              # No swap
  --cpus 0.5 \                      # CPU limit
  --ulimit nofile=1024:1024 \       # File descriptor limits
  wopr-sandbox:latest
```

### Sandbox Configuration by Trust Level

| Trust Level | Enabled | Network | Memory | CPU | Timeout |
|-------------|---------|---------|--------|-----|---------|
| `owner` | No | host | - | - | - |
| `trusted` | No | host | - | - | - |
| `semi-trusted` | Yes | bridge | 512MB | 0.5 | 300s |
| `untrusted` | Yes | none | 256MB | 0.25 | 60s |

### Sandbox CLI Commands

```bash
wopr sandbox status                 # Show sandbox status
wopr sandbox list                   # List all containers
wopr sandbox create <session>       # Create sandbox for session
wopr sandbox destroy <session>      # Destroy sandbox
wopr sandbox exec <session> <cmd>   # Execute in sandbox
wopr sandbox prune                  # Remove idle containers
wopr sandbox recreate <session>     # Recreate with new config
```

## P2P Security Configuration

### CLI Commands

```bash
# Show P2P security settings
wopr security p2p

# Set trust level for discovered peers
wopr security p2p discovery-trust untrusted

# Enable/disable auto-accept of peers
wopr security p2p auto-accept false
```

### P2P Security Defaults

```json
{
  "p2p": {
    "discoveryTrust": "untrusted",
    "autoAccept": false,
    "keyRotationGraceHours": 24,
    "maxPayloadSize": 1048576
  }
}
```

### Critical P2P Security Rules

1. **Discovery default**: All discovered peers are `untrusted`
2. **Auto-accept disabled**: Peers must be explicitly granted access
3. **Gateway routing**: Discovered peers should only inject to gateway sessions
4. **Key rotation**: 24-hour grace period for rotated keys
5. **Payload limits**: 1MB maximum payload size

## Audit Logging

### Enable Audit

```bash
wopr security audit enable
wopr security audit disable
```

### Audit Configuration

```json
{
  "audit": {
    "enabled": true,
    "logSuccess": false,
    "logDenied": true
  }
}
```

### Audit Events

| Event Type | Description |
|------------|-------------|
| `access_granted` | Access was allowed |
| `access_denied` | Access was blocked |
| `capability_check` | Capability was checked |
| `sandbox_start` | Sandbox container started |
| `sandbox_stop` | Sandbox container stopped |
| `policy_violation` | Security policy violated |
| `rate_limit_exceeded` | Rate limit hit |
| `trust_elevation` | Trust level elevated |
| `trust_revocation` | Trust level revoked |

## Tool to Capability Mapping

Each A2A tool requires specific capabilities:

| Tool | Required Capability |
|------|---------------------|
| `sessions_list` | `session.history` |
| `sessions_send` | `cross.inject` |
| `sessions_history` | `session.history` |
| `sessions_spawn` | `session.spawn` |
| `config_get` | `config.read` |
| `config_set` | `config.write` |
| `memory_read` | `memory.read` |
| `memory_write` | `memory.write` |
| `memory_search` | `memory.read` |
| `cron_schedule` | `cron.manage` |
| `cron_list` | `cron.manage` |
| `event_emit` | `event.emit` |
| `http_fetch` | `inject.network` |
| `exec_command` | `inject.exec` |
| `security_whoami` | `inject` (always allowed) |
| `security_check` | `inject` (always allowed) |

## Security Best Practices

### 1. Principle of Least Privilege

Grant only the capabilities each session needs.

```bash
# Research agent: needs network, no exec
wopr security session researcher capabilities "inject,inject.tools,inject.network,session.history"

# Code executor: needs exec, no network
wopr security session executor capabilities "inject,inject.tools,inject.exec,session.history"

# Review agent: read-only, no tools
wopr security session reviewer capabilities "inject,session.history"
```

### 2. Session Isolation

Use separate sessions for different trust levels.

```bash
# Create isolated sessions
wopr session create untrusted-handler "Handle untrusted requests"
wopr session create trusted-executor "Execute trusted operations"
```

### 3. Gateway Pattern for External Input

Route all external input through gateway sessions.

```bash
# Create gateway session
wopr session create external-gateway "You validate and filter external requests"

# Allow untrusted access
wopr security session external-gateway access "trust:untrusted"

# Give gateway cross-inject capability
wopr security session external-gateway capabilities "inject,inject.tools,cross.inject,session.history"
```

### 4. Audit Everything

Enable audit logging for security visibility.

```bash
wopr security audit enable
```

### 5. Start with Warn Mode

Use warn mode during migration to identify issues:

```bash
wopr security enforcement warn
# Monitor for violations
wopr security enforcement enforce  # Enable when ready
```

## Enforcement Modes

| Mode | Behavior |
|------|----------|
| `off` | No security enforcement (development only) |
| `warn` | Log violations but allow execution (migration) |
| `enforce` | Block violations (production) |

## A2A Security Tools

Agents can query their security context:

```javascript
// Query own security context
security_whoami()
// Returns: { trustLevel, capabilities, sandbox status }

// Check if action is allowed
security_check({ capability: "inject.network" })
// Returns: { allowed: true/false, reason: "..." }
```

## Default Security Configuration

```json
{
  "enforcement": "warn",
  "defaults": {
    "minTrustLevel": "semi-trusted",
    "sandbox": { "enabled": false, "network": "host" },
    "tools": { "deny": ["config.write"] },
    "rateLimit": { "perMinute": 60, "perHour": 1000 }
  },
  "defaultAccess": ["trust:trusted"],
  "p2p": {
    "discoveryTrust": "untrusted",
    "autoAccept": false,
    "keyRotationGraceHours": 24,
    "maxPayloadSize": 1048576
  },
  "audit": {
    "enabled": true,
    "logSuccess": false,
    "logDenied": true
  }
}
```

## Verification Checklist

Before enabling enforcement mode, verify:

- [ ] All sessions have appropriate access patterns configured
- [ ] Gateway sessions are set up for external input
- [ ] P2P auto-accept is disabled
- [ ] Sandbox is enabled for untrusted/semi-trusted
- [ ] Audit logging is enabled
- [ ] Rate limits are configured
- [ ] Session indexable patterns are set appropriately
