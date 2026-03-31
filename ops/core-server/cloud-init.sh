#!/bin/bash
# Core Server — DigitalOcean cloud-init script
#
# Provisions a production-ready VPS with:
#   - 5GB swap
#   - Docker CE + Compose plugin
#   - deploy user (SSH + Docker access)
#   - /opt/core-server/ with compose stack, Caddyfile
#   - Auto-pulls GHCR images and starts the stack
#   - Automatic security updates (unattended-upgrades)
#
# Usage:
#   doctl compute droplet create core-server \
#     --region sfo2 --size s-2vcpu-4gb --image ubuntu-24-04-x64 \
#     --ssh-keys <KEY_ID> --user-data-file ops/core-server/cloud-init.sh \
#     --tag-names core-server,platform,production
#
# After provisioning:
#   1. Get the droplet IP
#   2. Update Cloudflare DNS for all 8 domains → IP (proxy OFF for TLS)
#   3. Set GitHub repo secrets: CORE_PROD_HOST, PROD_SSH_KEY
#   4. SCP .env.production to /opt/core-server/.env
#   5. Caddy auto-provisions TLS via Let's Encrypt ACME
#
# Secrets:
#   SCP your .env.production to /opt/core-server/.env before first boot,
#   OR use provision.sh to inject automatically.

set -euo pipefail

INSTALL_DIR="/opt/core-server"

# ---------- Idempotency guard ----------
# Re-running is safe: each section skips if already done.

# --- Swap (5GB) ---
if [ ! -f /swapfile ]; then
  fallocate -l 5G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# --- System updates + unattended-upgrades ---
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gnupg unattended-upgrades apt-listchanges
dpkg-reconfigure -f noninteractive unattended-upgrades

# --- Docker ---
if ! command -v docker &>/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  CODENAME=$(grep VERSION_CODENAME /etc/os-release | cut -d= -f2)
  ARCH=$(dpkg --print-architecture)
  echo "deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${CODENAME} stable" > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

# --- Deploy user ---
if ! id deploy &>/dev/null; then
  useradd -m -s /bin/bash -G docker deploy
  mkdir -p /home/deploy/.ssh
  cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
  chown -R deploy:deploy /home/deploy/.ssh
  chmod 700 /home/deploy/.ssh
  chmod 600 /home/deploy/.ssh/authorized_keys

  # Generate deploy SSH keypair (for GitHub Actions)
  ssh-keygen -t ed25519 -f /home/deploy/.ssh/id_ed25519 -N "" -C "deploy@core-server"
  chown deploy:deploy /home/deploy/.ssh/id_ed25519 /home/deploy/.ssh/id_ed25519.pub
fi

# --- Project directory ---
mkdir -p "$INSTALL_DIR"
chown -R deploy:deploy "$INSTALL_DIR"

# --- Caddyfile ---
cat > "$INSTALL_DIR/Caddyfile" << 'CADDYFILEEOF'
# Consolidated Caddyfile — all 4 product brands behind one Caddy instance.
# Automatic HTTPS via Let's Encrypt (Caddy default).

# --- WOPR ---

app.wopr.bot {
	reverse_proxy wopr-ui:3000 {
		header_up X-Real-IP {remote_host}
		header_up X-Forwarded-For {remote_host}
		header_up X-Forwarded-Proto {scheme}
	}
}

api.wopr.bot {
	reverse_proxy core:3001 {
		header_up X-Real-IP {remote_host}
		header_up X-Forwarded-For {remote_host}
		header_up X-Forwarded-Proto {scheme}
	}
}

# --- Paperclip ---

app.runpaperclip.com {
	reverse_proxy paperclip-ui:3002 {
		header_up X-Real-IP {remote_host}
		header_up X-Forwarded-For {remote_host}
		header_up X-Forwarded-Proto {scheme}
	}
}

api.runpaperclip.com {
	reverse_proxy core:3001 {
		header_up X-Real-IP {remote_host}
		header_up X-Forwarded-For {remote_host}
		header_up X-Forwarded-Proto {scheme}
	}
}

# --- NemoPod ---

app.nemopod.com {
	reverse_proxy nemoclaw-ui:3003 {
		header_up X-Real-IP {remote_host}
		header_up X-Forwarded-For {remote_host}
		header_up X-Forwarded-Proto {scheme}
	}
}

api.nemopod.com {
	reverse_proxy core:3001 {
		header_up X-Real-IP {remote_host}
		header_up X-Forwarded-For {remote_host}
		header_up X-Forwarded-Proto {scheme}
	}
}

# --- Holy Ship ---

app.holyship.wtf {
	reverse_proxy holyship-ui:3004 {
		header_up X-Real-IP {remote_host}
		header_up X-Forwarded-For {remote_host}
		header_up X-Forwarded-Proto {scheme}
	}
}

api.holyship.wtf {
	reverse_proxy holyship:3005 {
		header_up X-Real-IP {remote_host}
		header_up X-Forwarded-For {remote_host}
		header_up X-Forwarded-Proto {scheme}
	}
}
CADDYFILEEOF

# --- docker-compose.prod.yml ---
cat > "$INSTALL_DIR/docker-compose.yml" << 'COMPOSEEOF'
services:
  postgres:
    image: postgres:16-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    command:
      - "postgres"
      - "-c"
      - "shared_buffers=256MB"
      - "-c"
      - "work_mem=16MB"
      - "-c"
      - "effective_cache_size=512MB"
      - "-c"
      - "maintenance_work_mem=64MB"
      - "-c"
      - "max_connections=100"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 512M
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "5"
    networks:
      - platform

  core:
    image: registry.wopr.bot/core-server:latest
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      NODE_ENV: production
      PORT: "3001"
      HOST: "0.0.0.0"
      DATABASE_URL: ${DATABASE_URL}
      CORE_ALLOWED_SERVICE_TOKENS: ${CORE_ALLOWED_SERVICE_TOKENS}
      BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET}
      BETTER_AUTH_URL: https://api.wopr.bot
      STRIPE_SECRET_KEY: ${STRIPE_SECRET_KEY}
      STRIPE_WEBHOOK_SECRET: ${STRIPE_WEBHOOK_SECRET}
      CRYPTO_SERVICE_URL: ${CRYPTO_SERVICE_URL}
      CRYPTO_SERVICE_KEY: ${CRYPTO_SERVICE_KEY}
      TRUSTED_PROXY_IPS: ${TRUSTED_PROXY_IPS:-172.16.0.0/12}
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - core_data:/data
    healthcheck:
      test: ["CMD", "curl", "-sf", "http://localhost:3001/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 1G
    logging:
      driver: json-file
      options:
        max-size: "20m"
        max-file: "5"
    networks:
      - platform

  wopr-ui:
    image: registry.wopr.bot/wopr-ui:latest
    depends_on:
      core:
        condition: service_healthy
    environment:
      NEXT_PUBLIC_API_URL: https://api.wopr.bot
      INTERNAL_API_URL: http://core:3001
      CORE_SERVICE_TOKEN: ${WOPR_UI_SERVICE_TOKEN}
    healthcheck:
      test: ["CMD-SHELL", "node -e \"require('http').get('http://localhost:3000', (r) => process.exit(r.statusCode === 200 ? 0 : 1))\""]
      interval: 30s
      timeout: 5s
      retries: 3
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 512M
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    networks:
      - platform

  paperclip-ui:
    image: registry.wopr.bot/paperclip-ui:latest
    depends_on:
      core:
        condition: service_healthy
    environment:
      NEXT_PUBLIC_API_URL: https://api.runpaperclip.com
      INTERNAL_API_URL: http://core:3001
      CORE_SERVICE_TOKEN: ${PAPERCLIP_UI_SERVICE_TOKEN}
      PORT: "3002"
    healthcheck:
      test: ["CMD-SHELL", "node -e \"require('http').get('http://localhost:3002', (r) => process.exit(r.statusCode === 200 ? 0 : 1))\""]
      interval: 30s
      timeout: 5s
      retries: 3
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 512M
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    networks:
      - platform

  nemoclaw-ui:
    image: registry.wopr.bot/nemoclaw-ui:latest
    depends_on:
      core:
        condition: service_healthy
    environment:
      NEXT_PUBLIC_API_URL: https://api.nemopod.com
      INTERNAL_API_URL: http://core:3001
      CORE_SERVICE_TOKEN: ${NEMOCLAW_UI_SERVICE_TOKEN}
      PORT: "3003"
    healthcheck:
      test: ["CMD-SHELL", "node -e \"require('http').get('http://localhost:3003', (r) => process.exit(r.statusCode === 200 ? 0 : 1))\""]
      interval: 30s
      timeout: 5s
      retries: 3
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 512M
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    networks:
      - platform

  holyship:
    image: registry.wopr.bot/holyship:latest
    depends_on:
      core:
        condition: service_healthy
      postgres:
        condition: service_healthy
    environment:
      NODE_ENV: production
      PORT: "3005"
      DATABASE_URL: ${DATABASE_URL}
      CORE_URL: http://core:3001
      CORE_SERVICE_TOKEN: ${HOLYSHIP_SERVICE_TOKEN}
    healthcheck:
      test: ["CMD", "curl", "-sf", "http://localhost:3005/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 512M
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    networks:
      - platform

  holyship-ui:
    image: registry.wopr.bot/holyship-ui:latest
    depends_on:
      holyship:
        condition: service_healthy
    environment:
      NEXT_PUBLIC_API_URL: https://api.holyship.wtf
      INTERNAL_API_URL: http://holyship:3005
      CORE_SERVICE_TOKEN: ${HOLYSHIP_UI_SERVICE_TOKEN}
      PORT: "3004"
    healthcheck:
      test: ["CMD-SHELL", "node -e \"require('http').get('http://localhost:3004', (r) => process.exit(r.statusCode === 200 ? 0 : 1))\""]
      interval: 30s
      timeout: 5s
      retries: 3
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 512M
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    networks:
      - platform

  caddy:
    image: caddy:2-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      core:
        condition: service_healthy
      wopr-ui:
        condition: service_healthy
      paperclip-ui:
        condition: service_healthy
      nemoclaw-ui:
        condition: service_healthy
      holyship:
        condition: service_healthy
      holyship-ui:
        condition: service_healthy
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 128M
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "5"
    networks:
      - platform

networks:
  platform:
    name: platform
    driver: bridge

volumes:
  pgdata:
  core_data:
  caddy_data:
  caddy_config:
COMPOSEEOF

# --- .env placeholder ---
if [ ! -f "$INSTALL_DIR/.env" ]; then
  cat > "$INSTALL_DIR/.env" << 'ENVEOF'
# SCP your real .env.production here before starting the stack.
# See ops/core-server/.env.example for required variables.
POSTGRES_USER=platform
POSTGRES_PASSWORD=REPLACE_ME
POSTGRES_DB=platform
DATABASE_URL=postgresql://platform:REPLACE_ME@postgres:5432/platform
ENVEOF
fi

chmod 600 "$INSTALL_DIR/.env"
chown deploy:deploy "$INSTALL_DIR/.env"

# --- GHCR login ---
GHCR_TOKEN=$(grep GHCR_TOKEN "$INSTALL_DIR/.env" 2>/dev/null | cut -d= -f2 || true)
if [ -n "$GHCR_TOKEN" ] && [ "$GHCR_TOKEN" != "REPLACE_ME" ]; then
  echo "$GHCR_TOKEN" | docker login ghcr.io -u wopr-network --password-stdin
  su - deploy -c "echo '$GHCR_TOKEN' | docker login ghcr.io -u wopr-network --password-stdin"
fi

# --- Pull images and start ---
cd "$INSTALL_DIR"
docker compose pull 2>/dev/null || true
docker compose up -d

# --- Signal completion ---
echo "CORE_SERVER_READY $(date -Iseconds)" > /var/log/cloud-init-core-server.log
echo "Deploy SSH public key:" >> /var/log/cloud-init-core-server.log
cat /home/deploy/.ssh/id_ed25519.pub >> /var/log/cloud-init-core-server.log
