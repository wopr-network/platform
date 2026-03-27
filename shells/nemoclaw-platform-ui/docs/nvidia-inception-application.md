# NVIDIA Inception Program Application

## Company / Project Name
NemoPod (nemopod.com)

## One-Line Description
One-click deployment platform for NVIDIA NeMo AI agents — built by a solo disabled developer using AI-assisted development in one week.

## The Story

I'm a solo developer with one arm, on disability. In one week — March 17-23, 2026 — I built and shipped NemoPod: a production platform that lets anyone deploy NVIDIA NeMo-powered AI agents with a single text input and an Enter key.

No team. No funding. No office. Just me, Claude Code (Anthropic's AI coding assistant), and NVIDIA's NeMo framework.

The result isn't a prototype. It's a live production system:
- **nemopod.com** — public landing page
- **app.nemopod.com** — authenticated dashboard with instant agent deployment
- Hot container pool with atomic PostgreSQL claims (no cold starts)
- Tab-based chat interface with persistent message history
- Per-instance SSE routing to isolated NeMo containers
- Stripe billing integration with $5 free signup credits
- Full CI/CD pipeline (GitHub Actions → GHCR → DigitalOcean)

This is the kind of product that used to require a 10-person team and a quarter of runway. AI-assisted development changed the math. And NVIDIA's NeMo framework is what makes the product possible.

## How NemoPod Uses NVIDIA Technology

**NeMo / NemoClaw**: Every NemoPod instance is an NVIDIA NeMo container running the NemoClaw agent framework. The platform manages the lifecycle — provisioning, networking, inference routing, billing — so users never touch Docker or GPUs.

**Inference**: Chat messages route through NeMo's inference gateway. Every conversation is GPU compute. More NemoPod users = more NeMo inference.

**Architecture**:
```
User → NemoPod UI → Platform API → Hot Pool Claim → NeMo Container
                                                    ↓
                                              NeMo Inference Gateway
                                                    ↓
                                              GPU (inference)
```

## What We Need From NVIDIA

1. **Inference API access or DGX Cloud credits** — Currently routing through OpenRouter. Direct NVIDIA inference would reduce latency, cut costs, and let us offer the full NeMo model catalog to users.

2. **GPU-backed hosting** — Running on a $6/mo DigitalOcean droplet. A sponsored DGX or GPU instance would let us scale the hot pool and support real concurrent users.

3. **Technical partnership** — Early access to NeMo releases so NemoPod stays current. Integration guidance for NeMo's latest agent capabilities.

4. **Co-marketing** — NemoPod is a story NVIDIA's developer relations can tell: a disabled solo developer shipped a NeMo platform in a week using AI tools. This is the most authentic adoption story in the NeMo ecosystem.

## What NVIDIA Gets

- **Adoption at the edge**: NemoPod puts NeMo in front of users who would never set up GPU infrastructure themselves. Every signup is a new NeMo user.
- **Inference demand**: Every chat message burns GPU cycles. We're a demand generator for NVIDIA compute.
- **A case study that writes itself**: Solo developer, disability, one week, production product. This is the story that makes AI development real for people, not a conference demo.
- **Ecosystem proof**: NemoPod proves NeMo is production-ready for managed deployment, not just research.

## Technical Details

| Component | Technology |
|-----------|-----------|
| Agent framework | NVIDIA NeMo / NemoClaw |
| Platform API | Node.js, Hono, PostgreSQL, tRPC |
| Frontend | Next.js 15, Tailwind, platform-ui-core |
| Container orchestration | Docker API, hot pool with FOR UPDATE SKIP LOCKED |
| Chat | SSE streaming, per-instance routing, DB persistence |
| Auth | BetterAuth (sessions, signup, OAuth) |
| Billing | Stripe + credit ledger (double-entry) |
| Hosting | DigitalOcean (current), needs GPU upgrade |
| CI/CD | GitHub Actions → GHCR → automated deploy |
| AI development | Claude Code (Anthropic) — the tool that made solo development possible |

## Links

- **Live product**: https://nemopod.com
- **App**: https://app.nemopod.com
- **GitHub org**: https://github.com/wopr-network

## Contact

[Your name]
[Your email]
[Your location]

---

*NemoPod is one of four products in the WOPR Network portfolio, all built by the same solo developer using AI-assisted development. The others: WOPR (multi-channel bot platform), Paperclip (managed bot hosting), and Holy Ship (guaranteed code shipping). All share a common platform-core for auth, billing, and fleet management.*
