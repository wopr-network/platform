#!/bin/bash
# NemoClaw Platform — DigitalOcean cloud-init script
#
# Provisions a production-ready VPS with:
#   - 5GB swap
#   - Docker CE + Compose plugin
#   - deploy user (SSH + Docker access)
#   - /opt/nemoclaw-platform/ with compose stack, Caddyfile, .env
#   - Auto-pulls GHCR images and starts the stack
#
# Usage:
#   doctl compute droplet create nemoclaw-platform \
#     --region sfo2 --size s-2vcpu-4gb --image ubuntu-24-04-x64 \
#     --ssh-keys <KEY_ID> --user-data-file vps/cloud-init.sh \
#     --tag-names nemoclaw,platform,production
#
# After provisioning:
#   1. Get the droplet IP
#   2. Update Cloudflare DNS: nemopod.com, api.nemopod.com, app.nemopod.com → IP (proxy OFF)
#   3. Set GitHub repo secrets: PROD_HOST, PROD_SSH_KEY
#   4. Caddy auto-provisions TLS via Cloudflare DNS challenge
#
# Secrets:
#   Copy vps/.env.production to the droplet at /opt/nemoclaw-platform/.env
#   OR fill in the heredoc below before provisioning.

set -euo pipefail

# --- Swap (5GB) ---
fallocate -l 5G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# --- Docker ---
apt-get update
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
# Resolve VERSION_CODENAME before writing — cloud-init eats $() in heredocs
CODENAME=$(grep VERSION_CODENAME /etc/os-release | cut -d= -f2)
ARCH=$(dpkg --print-architecture)
echo "deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${CODENAME} stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# --- Deploy user ---
useradd -m -s /bin/bash -G docker deploy
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys

# --- Generate deploy SSH keypair (for GitHub Actions) ---
ssh-keygen -t ed25519 -f /home/deploy/.ssh/id_ed25519 -N "" -C "deploy@nemoclaw-platform"
chown deploy:deploy /home/deploy/.ssh/id_ed25519 /home/deploy/.ssh/id_ed25519.pub

# --- Project directory ---
mkdir -p /opt/nemoclaw-platform/caddy
chown -R deploy:deploy /opt/nemoclaw-platform

# --- Caddy Dockerfile (with Cloudflare DNS plugin) ---
cat > /opt/nemoclaw-platform/caddy/Dockerfile << 'CADDYEOF'
FROM caddy:2-builder AS builder
RUN xcaddy build --with github.com/caddy-dns/cloudflare

FROM caddy:2-alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
CADDYEOF

# --- Caddyfile ---
cat > /opt/nemoclaw-platform/Caddyfile << 'CADDYFILEEOF'
{
	acme_dns cloudflare {env.CLOUDFLARE_API_TOKEN}
}

nemopod.com {
	reverse_proxy nemoclaw-ui:3000
}

app.nemopod.com {
	reverse_proxy nemoclaw-ui:3000
}

api.nemopod.com {
	reverse_proxy nemoclaw-platform:3100
}

*.nemopod.com {
	reverse_proxy nemoclaw-platform:3100
}
CADDYFILEEOF

# --- docker-compose.yml ---
cat > /opt/nemoclaw-platform/docker-compose.yml << 'COMPOSEEOF'
services:
  postgres:
    image: postgres:16-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_USER=nemoclaw
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=nemoclaw_platform
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U nemoclaw"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  caddy:
    build:
      context: ./caddy
      dockerfile: Dockerfile
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      nemoclaw-platform:
        condition: service_healthy
      nemoclaw-ui:
        condition: service_healthy
    environment:
      - CLOUDFLARE_API_TOKEN=${CLOUDFLARE_API_TOKEN}
    restart: unless-stopped

  nemoclaw-platform:
    image: ghcr.io/wopr-network/nemoclaw-platform:latest
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - platform_data:/data
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      - DATABASE_URL=postgresql://nemoclaw:${POSTGRES_PASSWORD}@postgres:5432/nemoclaw_platform
      - NEMOCLAW_IMAGE=${NEMOCLAW_IMAGE:-ghcr.io/wopr-network/nemoclaw:latest}
      - BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
      - BETTER_AUTH_URL=https://api.nemopod.com
      - UI_ORIGIN=https://nemopod.com,https://app.nemopod.com
      - PLATFORM_DOMAIN=nemopod.com
      - COOKIE_DOMAIN=.nemopod.com
      - RESEND_API_KEY=${RESEND_API_KEY}
      - RESEND_FROM_EMAIL=${RESEND_FROM_EMAIL:-noreply@nemopod.com}
      - STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
      - STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}
      - STRIPE_DEFAULT_PRICE_ID=${STRIPE_DEFAULT_PRICE_ID}
      - STRIPE_CREDIT_PRICE_5=${STRIPE_CREDIT_PRICE_5}
      - STRIPE_CREDIT_PRICE_10=${STRIPE_CREDIT_PRICE_10}
      - STRIPE_CREDIT_PRICE_25=${STRIPE_CREDIT_PRICE_25}
      - STRIPE_CREDIT_PRICE_50=${STRIPE_CREDIT_PRICE_50}
      - STRIPE_CREDIT_PRICE_100=${STRIPE_CREDIT_PRICE_100}
      - PLATFORM_SECRET=${PLATFORM_SECRET}
      - PLATFORM_ENCRYPTION_SECRET=${PLATFORM_ENCRYPTION_SECRET}
      - PROVISION_SECRET=${PROVISION_SECRET}
      - GATEWAY_URL=${GATEWAY_URL:-https://gateway.wopr.bot}
      - METER_WAL_PATH=/data/meter-wal.jsonl
      - METER_DLQ_PATH=/data/meter-dlq.jsonl
      - NODE_ENV=production
    ports:
      - "3100:3100"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3100/health"]
      interval: 30s
      timeout: 5s
      retries: 3
    restart: unless-stopped

  nemoclaw-ui:
    image: ghcr.io/wopr-network/nemoclaw-platform-ui:latest
    environment:
      - NEXT_PUBLIC_API_URL=https://api.nemopod.com
      - INTERNAL_API_URL=http://nemoclaw-platform:3100
      - NEXTAUTH_URL=https://nemopod.com
      - NEXTAUTH_SECRET=${BETTER_AUTH_SECRET}
    healthcheck:
      test: ["CMD-SHELL", "node -e \"require('http').get('http://localhost:3000', (r) => process.exit(r.statusCode === 200 ? 0 : 1))\""]
      interval: 30s
      timeout: 5s
      retries: 3
    restart: unless-stopped

volumes:
  caddy_data:
  caddy_config:
  platform_data:
  postgres_data:

networks:
  default:
    name: nemoclaw-platform
COMPOSEEOF

# --- .env ---
# Injected by provision.sh (replaces this marker with real values).
# If running cloud-init standalone, scp vps/.env.production to
# /opt/nemoclaw-platform/.env before the droplet boots.
# ENV_INJECT_MARKER

chmod 600 /opt/nemoclaw-platform/.env
chown deploy:deploy /opt/nemoclaw-platform/.env

# --- GHCR login (images are private) ---
GHCR_TOKEN=$(grep GHCR_TOKEN /opt/nemoclaw-platform/.env | cut -d= -f2)
if [ -n "$GHCR_TOKEN" ] && [ "$GHCR_TOKEN" != "REPLACE_ME" ]; then
  echo "$GHCR_TOKEN" | docker login ghcr.io -u wopr-network --password-stdin
  # Also set up for deploy user
  su - deploy -c "echo $GHCR_TOKEN | docker login ghcr.io -u wopr-network --password-stdin"
fi

# --- Pull images and start ---
cd /opt/nemoclaw-platform
docker compose --env-file .env pull nemoclaw-platform nemoclaw-ui postgres 2>/dev/null || true
docker compose --env-file .env up -d

# --- Signal completion ---
echo "NEMOCLAW_PLATFORM_READY $(date -Iseconds)" > /var/log/cloud-init-nemoclaw.log
echo "Deploy SSH public key:" >> /var/log/cloud-init-nemoclaw.log
cat /home/deploy/.ssh/id_ed25519.pub >> /var/log/cloud-init-nemoclaw.log
