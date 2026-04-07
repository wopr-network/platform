# WOPR Build UI (local)

Build `ghcr.io/wopr-network/wopr-platform-ui:local` from source with `NEXT_PUBLIC_API_URL=http://localhost:3100` baked in, and push to GHCR.

## Steps

Run these Bash commands in order. Stop and report on any failure.

### 1. Load credentials

```bash
set -a && source ~/wopr-ops/local/vps/.env && set +a
echo "Logged in as: $REGISTRY_USERNAME"
```

Do NOT print REGISTRY_PASSWORD.

### 2. Docker login

Run in a single shell so the sourced vars are visible to docker login:

```bash
bash -c 'set -a && source ~/wopr-ops/local/vps/.env && set +a && echo "$REGISTRY_PASSWORD" | docker login ghcr.io -u "$REGISTRY_USERNAME" --password-stdin'
```

### 3. Build

```bash
cd ~/wopr-platform-ui
docker build \
  --build-arg NEXT_PUBLIC_API_URL=http://localhost:3100 \
  -t ghcr.io/wopr-network/wopr-platform-ui:local .
```

### 4. Push

```bash
docker push ghcr.io/wopr-network/wopr-platform-ui:local
```

### 5. Report

Print the pushed digest. Watchtower will pick it up within ~60s and restart `wopr-vps-platform-ui` in the local DinD stack.
