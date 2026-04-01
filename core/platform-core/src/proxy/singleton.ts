import type { ProxyManager } from "./manager.js";

let _pm: ProxyManager | null = null;

export function setProxyManager(pm: ProxyManager): void {
  _pm = pm;
}

export function getProxyManager(): ProxyManager {
  if (!_pm) throw new Error("ProxyManager not initialized — call setProxyManager() at boot");
  return _pm;
}
