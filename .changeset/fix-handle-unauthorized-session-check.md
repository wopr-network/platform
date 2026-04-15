---
"@wopr-network/platform-ui-core": patch
---

Fix: handleUnauthorized() session-validity check now uses API_BASE_URL
instead of a relative path. The relative fetch hit the shell domain
(which has no /api/auth route), returned 404 HTML, JSON.parse threw, and
the catch arm redirected every 401 — even when the user's session was
perfectly valid. Any shell page that called an endpoint returning 401
for non-session reasons (e.g. /api/billing/dividend/stats which requires
a service token) would bounce the user to /login. On Nemopod this
manifested as /billing/credits landing on /instances.
