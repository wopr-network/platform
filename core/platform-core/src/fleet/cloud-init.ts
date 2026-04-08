const BOT_IMAGE_PATTERN = /^[\w.\-/]+(:[\w.-]+)?$/;
const NODE_SECRET_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Validate a Docker image reference against the allowed pattern.
 * Exported for defense-in-depth: callers can validate early (e.g. at construction).
 */
export function validateBotImage(botImage: string): void {
  if (!BOT_IMAGE_PATTERN.test(botImage)) {
    throw new Error(`Invalid botImage: ${botImage}`);
  }
}

/**
 * Generate the cloud-init user-data script for a new WOPR node.
 * Installs Docker, pulls bot image + node-agent, starts the agent daemon.
 * Injects per-node secret + platform URL for agent registration.
 */
export function generateCloudInit(
  botImage: string,
  nodeSecret?: string,
  platformUrl = "https://api.wopr.bot",
  registryHost = "registry.wopr.bot",
): string {
  validateBotImage(botImage);
  if (nodeSecret && !NODE_SECRET_PATTERN.test(nodeSecret)) {
    throw new Error(`Invalid nodeSecret: contains unsafe characters`);
  }
  const secretEnv = nodeSecret ? `  - echo 'WOPR_NODE_SECRET=${nodeSecret}' >> /etc/environment\n` : "";
  const platformEnv = `  - echo 'PLATFORM_URL=${platformUrl}' >> /etc/environment\n`;
  return `#cloud-config
packages:
  - docker.io
  - docker-compose-v2

runcmd:
  - systemctl enable docker
  - systemctl start docker
${secretEnv}${platformEnv}  - docker pull "${botImage}"
  - docker pull "${registryHost}/node-agent:latest"
  - mkdir -p /etc/wopr /var/wopr/backups
  - |
    cat > /etc/systemd/system/wopr-agent.service <<'SVCEOF'
    [Unit]
    Description=WOPR Node Agent
    After=network.target docker.service
    Requires=docker.service

    [Service]
    Type=simple
    Restart=always
    RestartSec=5
    ExecStart=/usr/bin/docker run --rm --name wopr-agent \\
      --network host \\
      -v /var/run/docker.sock:/var/run/docker.sock \\
      -v /etc/wopr:/etc/wopr \\
      -v /var/wopr/backups:/backups \\
      -e PLATFORM_URL=${platformUrl} \\
      -e CREDENTIALS_PATH=/etc/wopr/credentials.json \\
      -e BACKUP_DIR=/backups \\
      ${registryHost}/node-agent:latest
    ExecStop=/usr/bin/docker stop wopr-agent

    [Install]
    WantedBy=multi-user.target
    SVCEOF
  - systemctl daemon-reload
  - systemctl enable wopr-agent
  - systemctl start wopr-agent
  - echo "WOPR_NODE_READY" > /tmp/wopr-ready
`;
}
