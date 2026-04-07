# WOPR Skills Registry

Official skill registry for [WOPR](https://github.com/TSavo/wopr) - Self-sovereign AI session management over P2P.

## Installation

```bash
npm install -g @tsavo/wopr
```

## Usage

Add this registry:
```bash
wopr skill registry add wopr github:TSavo/wopr-skills/skills
```

Search for skills:
```bash
wopr skill search <query>
```

Install a skill:
```bash
wopr skill install github:TSavo/wopr-skills/skills/<skill-name>
```

## Available Skills

| Skill | Description |
|-------|-------------|
| `wopr` | Complete WOPR CLI reference - sessions, skills, plugins, providers, middleware, cron, security, sandbox |
| `meta-wopr` | Installation, configuration, daemon setup, Docker deployment, troubleshooting |
| `wopr-security` | Security model - trust levels, capabilities, sandbox isolation, access patterns |
| `wopr-p2p` | P2P networking plugin - Hyperswarm, identity, discovery, invites, encrypted messaging |

## Quick Install All Skills

```bash
wopr skill registry add wopr github:TSavo/wopr-skills/skills
wopr skill install github:TSavo/wopr-skills/skills/wopr
wopr skill install github:TSavo/wopr-skills/skills/meta-wopr
wopr skill install github:TSavo/wopr-skills/skills/wopr-security
wopr skill install github:TSavo/wopr-skills/skills/wopr-p2p
```

## Contributing

1. Fork this repo
2. Create `skills/<skill-name>/SKILL.md`
3. Follow the [Agent Skills spec](https://github.com/anthropics/agent-skills)
4. Submit a PR
