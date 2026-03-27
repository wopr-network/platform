# NemoClaw Dashboard UX Design

**Date:** 2026-03-12
**Status:** Approved

## Problem

The current instance list page (inherited from platform-ui-core) has:
- Two "create" buttons (header + empty state) — should be zero since signup auto-provisions a NemoClaw
- A complex create form (name, presets, provider, channels, plugins) — overkill for NemoClaw
- Table layout with provider column, search/filter — designed for WOPR power users, not NemoClaw's "it just works" model
- No easy way to see your NemoClaw and navigate to its subdomain (`*.runnemo.com`)

## Design

### Core concept

Signup = creating your first NemoClaw. A NemoClaw is a digital AI organization that runs your company. No create buttons on the dashboard. The dashboard's job is: show me my NemoClaw(s), let me get to them.

### The NemoClaw card

Each NemoClaw is represented by a card showing:
- **Name** (user-chosen or auto-generated at signup)
- **Status indicator** — running / stopped / error (colored dot or badge)
- **Subdomain link** — `name.runnemo.com` — clickable, opens in new tab
- **Settings gear** — navigates to instance detail/settings

Clicking the card itself opens the subdomain.

### Adaptive layout: hero → grid

**Single NemoClaw (hero mode):**
- Large centered hero card. Name, status, subdomain link, settings — all prominent.
- Subtle "Add another NemoClaw" link below the hero. Not a button, not in a header.

**Multiple NemoClaws (grid mode):**
- Card grid. Same info per card, denser layout.
- `+` card at the end of the grid to add another.
- Search/filter appears only at 5+ NemoClaws.

**Transition:** When the second NemoClaw is created, the hero becomes the first card in the grid. No pinned primary. No jarring layout shift.

### Adding another NemoClaw

Click the `+` card → enter a name → done. New NemoClaw spins up at `newname.runnemo.com`.

No preset selection. No provider dropdown. No channel toggles. No plugin toggles. Just a name.

### What gets removed from core's instance list

The NemoClaw brand shell overrides the instance list page with this simpler component. Core stays as-is for WOPR.

Removed elements:
- Both "create" buttons (header + empty state)
- Provider column
- Preset selection
- Channel toggles
- Plugin toggles
- Search/filter (until 5+ instances)
- The entire `/instances/new` create form page

## Signup flow

User signs up → NemoClaw auto-provisioned → lands on dashboard with hero card showing their running NemoClaw at `name.runnemo.com`.

## Implementation scope

This design lives entirely in the `nemoclaw-platform-ui` brand shell. It overrides the core instance list page with a NemoClaw-specific component. The core instance list remains unchanged for WOPR's needs.

### New components (in nemoclaw-platform-ui)
- `NemoClawDashboard` — adaptive hero/grid layout
- `NemoClawCard` — individual instance card
- `AddNemoClawCard` — the `+` card with name input

### Modified pages (in nemoclaw-platform-ui)
- `src/app/instances/page.tsx` — render `NemoClawDashboard` instead of core's `InstanceListClient`
- `src/app/instances/new/page.tsx` — remove or redirect (no standalone create page)
