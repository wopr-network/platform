---
name: wopr
description: Complete WOPR CLI reference for session management, skills, plugins, providers, middleware, cron jobs, security, sandbox isolation, and inter-agent communication.
---

# WOPR CLI Reference

WOPR is a self-sovereign AI session management system with P2P capabilities. This is the complete command reference.

## Setup & Configuration

```bash
wopr onboard                              # Interactive onboarding wizard
wopr configure                            # Re-run configuration wizard
```

## Authentication

```bash
wopr auth                                 # Show auth status
wopr auth login                           # Login with Claude Max/Pro (OAuth)
wopr auth api-key <key>                   # Use API key instead
wopr auth logout                          # Clear credentials
```

## Sessions

```bash
wopr session list                         # List all sessions
wopr session create <name> [context]      # Create session with optional context
wopr session create <name> --provider <id> [--fallback chain]  # Create with provider
wopr session show <name> [--limit N]      # Show details and conversation history
wopr session delete <name>                # Delete a session
wopr session set-provider <name> <id> [--model name] [--fallback chain]  # Update provider
wopr session init-docs <name>             # Initialize SOUL.md, AGENTS.md, USER.md
wopr session inject <name> <message>      # Inject message, get AI response
wopr session log <name> <message>         # Log message (no AI response)
```

## Skills

```bash
wopr skill list                           # List installed skills
wopr skill search <query>                 # Search registries for skills
wopr skill install <source> [name]        # Install from registry or URL
wopr skill create <name> [description]    # Create a new skill
wopr skill remove <name>                  # Remove a skill
wopr skill cache clear                    # Clear registry cache
wopr skill registry list                  # List configured registries
wopr skill registry add <name> <url>      # Add a skill registry
wopr skill registry remove <name>         # Remove a registry
```

## Plugins

```bash
wopr plugin list                          # List installed plugins
wopr plugin install <source>              # Install (npm pkg, github:u/r, ./local)
wopr plugin remove <name>                 # Remove a plugin
wopr plugin enable <name>                 # Enable a plugin
wopr plugin disable <name>                # Disable a plugin
wopr plugin search <query>                # Search npm for plugins
wopr plugin registry list                 # List plugin registries
wopr plugin registry add <name> <url>     # Add a plugin registry
wopr plugin registry remove <name>        # Remove a plugin registry
```

## Providers (AI Models)

```bash
wopr providers list                       # List all providers and status
wopr providers add <id> [credential]      # Add/update provider credential
wopr providers remove <id>                # Remove provider credential
wopr providers health-check               # Check health of all providers
wopr providers default <id> [options]     # Set global provider defaults
  --model <name>                          # Default model for this provider
  --reasoning-effort <level>              # For Codex: minimal/low/medium/high/xhigh
wopr providers show-defaults [id]         # Show global provider defaults
```

### Supported Providers

- `anthropic` - Claude models via Agent SDK
- `codex` - OpenAI Codex agent for coding tasks

## Cron Jobs (Scheduled Messages)

```bash
wopr cron list                            # List scheduled jobs
wopr cron add <name> <sched> <sess> <msg> # Add cron [--now] [--once]
wopr cron once <time> <session> <message> # One-time job (now, +5m, +1h, 09:00)
wopr cron now <session> <message>         # Run immediately (no scheduling)
wopr cron remove <name>                   # Remove a cron job
```

### Cron History (A2A Tool)

Agents can view execution history using the `cron_history` tool:

```
cron_history                              # View recent executions
cron_history name="job-name"              # Filter by job name
cron_history session="target-session"     # Filter by target session
cron_history failedOnly=true              # Show only failures
cron_history successOnly=true             # Show only successes
cron_history since=1706745600000          # Filter by timestamp (ms)
cron_history limit=10 offset=20           # Pagination
```

## Configuration

```bash
wopr config get [key]                     # Show config (all or specific key)
wopr config set <key> <value>             # Set config value
wopr config list                          # List all config values
wopr config reset                         # Reset to defaults
```

## Middleware

```bash
wopr middleware list                      # List all middleware
wopr middleware chain                     # Show execution order
wopr middleware show <name>               # Show middleware details
wopr middleware enable <name>             # Enable middleware
wopr middleware disable <name>            # Disable middleware
wopr middleware priority <name> <n>       # Set middleware priority
```

## Context Providers

```bash
wopr context list                         # List all context providers
wopr context show <name>                  # Show context provider details
wopr context enable <name>                # Enable context provider
wopr context disable <name>               # Disable context provider
wopr context priority <name> <n>          # Set context provider priority
```

## Daemon

```bash
wopr daemon start                         # Start the daemon
wopr daemon stop                          # Stop the daemon
wopr daemon status                        # Check if daemon is running
wopr daemon logs                          # Show daemon logs
```

## Security

```bash
wopr security status                      # Show security status and enforcement mode
wopr security enforcement <mode>          # Set enforcement mode (off|warn|enforce)

wopr security sessions                    # List all session security configs
wopr security session <name>              # Show session security config
wopr security session <name> <prop> <val> # Set session property
```

### Session Security Properties

```bash
wopr security session main indexable "*"              # See all transcripts
wopr security session p2p-alice indexable self        # Only own transcripts
wopr security session gateway access "trust:untrusted"  # Allow untrusted
wopr security session main capabilities "*"           # Full capabilities
```

### P2P Security

```bash
wopr security p2p                         # Show P2P security settings
wopr security p2p discovery-trust <level> # Set trust for discovered peers
wopr security p2p auto-accept <true|false> # Enable/disable auto-accept
```

### Audit

```bash
wopr security audit                       # Show audit settings
wopr security audit enable                # Enable audit logging
wopr security audit disable               # Disable audit logging
```

### Other Security Commands

```bash
wopr security sources                     # List source-specific configs
wopr security defaults                    # Show default security policy
```

## Sandbox (Docker Isolation)

```bash
wopr sandbox status                       # Show sandbox status and containers
wopr sandbox list                         # List all sandbox containers
wopr sandbox create <session>             # Create sandbox for a session
wopr sandbox destroy <session>            # Destroy sandbox for a session
wopr sandbox exec <session> <command>     # Execute command in sandbox
wopr sandbox prune                        # Remove all idle containers
wopr sandbox recreate <session>           # Recreate container (apply config changes)
```

## Common Workflows

### Send a message to another session
```bash
wopr session inject other-session "Hello from this session"
```

### Spawn a helper agent for a subtask
```bash
wopr session create helper "You are a research assistant"
wopr session inject helper "Research quantum computing advances in 2025"
# ... use the response ...
wopr session delete helper
```

### Schedule a daily check-in
```bash
wopr cron add daily-standup "0 9 * * *" main "Good morning! What's the plan for today?"
```

### Set up a one-time reminder
```bash
wopr cron once +30m main "Reminder: Check on the build status"
```

### Install skills from registry
```bash
wopr skill registry add wopr github:TSavo/wopr-skills/skills
wopr skill search git
wopr skill install github:TSavo/wopr-skills/skills/git-essentials
```

### Switch AI model for a session
```bash
wopr session set-provider my-session anthropic --model claude-sonnet-4-20250514
```

## A2A Tools Reference

These tools are available to agents within WOPR sessions:

### Session Management
- `sessions_list` - List all sessions
- `sessions_spawn` - Create a new session (requires session.spawn capability)
- `sessions_send` - Send message to another session (requires cross.inject capability)
- `sessions_history` - Read session history (requires session.history capability)

### Cron/Scheduling
- `cron_schedule` - Schedule a recurring cron job
- `cron_once` - Schedule a one-time job
- `cron_list` - List all scheduled cron jobs
- `cron_cancel` - Cancel a scheduled cron job
- `cron_history` - View cron execution history with filtering and pagination

### Memory & Semantic Search
- `memory_read` - Read from persistent memory files
- `memory_write` - Write to persistent memory files
- `memory_search` - **Semantic search** across memory files AND session transcripts
- `memory_get` - Get specific memory entry with line ranges

#### Memory Search Details

The `memory_search` tool performs vector similarity search using OpenAI embeddings (`text-embedding-3-small`). It indexes:

- **Global memory files** (`/data/identity/memory/*.md`)
- **Session memory files** (per-session memory)
- **Session transcripts** (all `.conversation.jsonl` files)

```
memory_search query="consciousness debate Alvin"     # Semantic search
memory_search query="PR merge GitHub" maxResults=10  # With result limit
```

Results include relevance scores (0-1) and source file paths.

**Configuration:**
```bash
wopr config set memory.embeddings.provider openai
wopr config set memory.embeddings.apiKey $OPENAI_API_KEY
wopr config set memory.sync.indexSessions true       # Index session transcripts
wopr config set memory.sync.onSearch true            # Lazy sync before search
```

### Identity & Soul
- `identity_get` - Get agent identity
- `identity_update` - Update agent identity
- `soul_get` - Get agent soul/persona
- `soul_update` - Update agent soul/persona
- `self_reflect` - Self-reflection and memory update

### Events
- `event_emit` - Emit a custom event
- `event_list` - List event subscriptions

### Network
- `http_fetch` - Make HTTP requests (requires inject.network capability)

### Execution
- `exec_command` - Execute shell commands (requires inject.exec capability)

### Configuration
- `config_get` - Read configuration
- `config_set` - Modify configuration (requires config.write capability)
- `config_provider_defaults` - Manage provider defaults

### Utility
- `security_whoami` - Show current trust level and capabilities
- `security_check` - Check if a specific capability is available
- `notify` - Send notifications

## Environment Variables

```bash
WOPR_HOME                                 # Base directory (default: ~/.wopr)
ANTHROPIC_API_KEY                         # API key for Claude (Anthropic)
OPENAI_API_KEY                            # API key for Codex (OpenAI)
WOPR_DAEMON_PORT                          # Daemon port (default: 7437)
WOPR_DAEMON_HOST                          # Daemon host (default: 127.0.0.1)
```

## P2P Plugin

For P2P networking capabilities, install the P2P plugin:

```bash
wopr plugin install wopr-plugin-p2p
```

See the `wopr-p2p` skill for complete P2P documentation.
