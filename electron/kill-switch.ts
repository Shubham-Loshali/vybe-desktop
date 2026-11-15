/**
 * Desktop Kill Switch & Version Validator for Vybe
 * Communicates with Cloudflare Worker: https://vybe.shubham-loshali18.workers.dev/desktop
 */
import { app } from "electron";

export interface KillSwitchPayload {
  version?: string;
  minimum_version?: string;
  blocked_versions?: string[];
  force_shutdown?: boolean;
  url?: string;
  announcementurl?: string;
}

export interface KillSwitchResult {
  killed: boolean;
  reason?: string;
  updateUrl?: string;
}

const CLOUDFLARE_WORKER_DESKTOP = "https://vybe.shubham-loshali18.workers.dev/desktop";

function parseVersion(v: string): number[] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  return m ? m.slice(1).map(Number) : null;
}

function isOlderThan(current: string, minimum: string): boolean {
  const c = parseVersion(current);
  const m = parseVersion(minimum);
  if (!c || !m) return false;
  for (let i = 0; i < 3; i++) {
    if (c[i] < m[i]) return true;
    if (c[i] > m[i]) return false;
  }
  return false;
}

export async function checkDesktopKillSwitch(): Promise<KillSwitchResult> {
  try {
    const res = await fetch(CLOUDFLARE_WORKER_DESKTOP, {
      signal: AbortSignal.timeout(6000),
      headers: { "User-Agent": `VybeDesktop/${app.getVersion()}` },
    });
    if (!res.ok) {
      // Endpoint 404 or worker not returning /desktop yet: don't block
      return { killed: false };
    }
    const data = (await res.json()) as KillSwitchPayload;
    const current = app.getVersion();
    const downloadUrl = data.url || "https://github.com/Shubham-Loshali/Vybe-desktop/releases/latest";

    if (data.force_shutdown === true) {
      return {
        killed: true,
        reason: "Vybe Desktop is currently disabled for maintenance. Please check back later.",
        updateUrl: downloadUrl,
      };
    }

    if (Array.isArray(data.blocked_versions) && data.blocked_versions.includes(current)) {
      return {
        killed: true,
        reason: `Version ${current} of Vybe Desktop has been retired. Please update to continue.`,
        updateUrl: downloadUrl,
      };
    }

    if (data.minimum_version && isOlderThan(current, data.minimum_version)) {
      return {
        killed: true,
        reason: `Version ${data.minimum_version} or higher is required. You are running ${current}.`,
        updateUrl: downloadUrl,
      };
    }

    return { killed: false };
  } catch {
    // Network down or offline: keep local player accessible
    return { killed: false };
  }
}
