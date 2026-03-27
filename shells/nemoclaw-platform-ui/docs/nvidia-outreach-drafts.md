# NVIDIA Outreach Drafts

## 1. Email to inceptionprogram@nvidia.com

**Subject:** Solo disabled developer built a managed NemoClaw platform in one week — applying to Inception

**Body:**

Hi,

I'm a solo developer with one arm, on disability. Between March 17-23, I built and shipped NemoPod (nemopod.com) — a managed deployment platform for NVIDIA NemoClaw. Users name an agent, press Enter, and get a running NemoClaw instance with a chat interface. No Docker, no GPUs, no infrastructure.

It's live in production right now: hot container pools for instant provisioning, persistent chat history, tab-based multi-agent UI, Stripe billing with $5 free credits, and full CI/CD. I built it using AI-assisted development (Claude Code) on NVIDIA's NeMo framework. The kind of thing that used to take a team and a quarter — done solo in a week.

I just submitted my Inception application. I'm looking for inference credits, GPU-backed hosting, and a technical partnership to scale NemoPod. Every user I onboard is a new NeMo user who would never have set up GPU infrastructure on their own.

Live product: https://nemopod.com
App: https://app.nemopod.com
GitHub: https://github.com/wopr-network

Happy to demo or answer any questions.

[Your name]
[Your email]

---

## 2. NVIDIA Developer Discord Post

**Channel:** #showcase (or #general / #nemo if no showcase channel)

**Post:**

I built a managed deployment platform for NemoClaw in one week as a solo developer.

**NemoPod** (https://nemopod.com) — name an AI agent, press Enter, get a running NemoClaw instance with a chat interface. No Docker, no GPUs, no infra.

What's under the hood:
- Hot container pool — pre-warmed NemoClaw containers, instant claim via atomic PostgreSQL locks
- Tab-based chat — each agent gets its own tab, persistent message history in Postgres
- SSE streaming — messages route to the correct container per instance
- Stripe billing — $5 free credits on signup, metered inference
- Full CI/CD — push to main, Docker image builds, auto-deploys

The backstory: I have one arm and I'm on disability. I built this entire platform — backend, frontend, infrastructure, billing, deployment — in one week using AI-assisted development (Claude Code). NemoPod is one of four products I run solo on the same shared platform core.

Every NemoPod user is a NeMo user who never would have set up GPU infrastructure themselves. Looking to connect with the NeMo team about inference credits and a potential Inception partnership.

[attach: screenshot of landing page]
[attach: screenshot of chat with two tabs]
