/**
 * LAN Device Discovery via UDP broadcast.
 *
 * Each running instance:
 *  - Listens on DISCOVERY_PORT for incoming announcements
 *  - Periodically broadcasts its own presence on DISCOVERY_PORT
 *  - Keeps a map of recently seen devices
 *
 * Device info payload (JSON over UDP):
 *   {
 *     "type": "announce",
 *     "deviceId": "local-uuid",
 *     "deviceName": "My MacBook",
 *     "apiPort": 3000,
 *     "version": "0.1.0",
 *     "ts": 1742640000000
 *   }
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { createSocket, type RemoteInfo } from "node:dgram";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DISCOVERY_PORT = 34567;
const BROADCAST_INTERVAL_MS = 10_000;
const DEVICE_TTL_MS = 30_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Device {
  deviceId: string;
  deviceName: string;
  ip: string;
  apiPort: number;
  version: string;
  lastSeen: number;
}

// ---------------------------------------------------------------------------
// DiscoveryService
// ---------------------------------------------------------------------------

export class DiscoveryService {
  private socket: ReturnType<typeof createSocket> | null = null;
  private broadcastTimer: ReturnType<typeof setInterval> | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private readonly devices = new Map<string, Device>();
  private localDeviceId: string;
  private localDeviceName: string;
  private localApiPort: number;
  private discovering = false;

  constructor(deviceName: string, apiPort = 3000) {
    this.localDeviceId = DiscoveryService.loadOrCreateDeviceId();
    this.localDeviceName = deviceName;
    this.localApiPort = apiPort;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  isDiscovering(): boolean {
    return this.discovering;
  }

  getDevices(): Device[] {
    const cutoff = Date.now() - DEVICE_TTL_MS;
    return [...this.devices.values()].filter((d) => d.lastSeen > cutoff);
  }

  async startDiscovery(): Promise<void> {
    if (this.discovering) return;

    const sock = createSocket({ type: "udp4", reusePort: true });

    sock.on("message", (msg: Buffer, rinfo: RemoteInfo) => {
      this.handleMessage(msg, rinfo);
    });

    sock.on("error", (err: Error) => {
      console.error("[discovery] socket error:", err.message);
    });

    sock.bind(DISCOVERY_PORT, () => {
      try {
        sock.setBroadcast(true);
      } catch {
        // some systems disallow broadcast, continue anyway
      }
      console.log(`[discovery] listening on UDP ${DISCOVERY_PORT}`);
    });

    this.socket = sock;

    // Broadcast our presence immediately
    await this.broadcast();

    // Then periodically
    this.broadcastTimer = setInterval(() => {
      void this.broadcast();
    }, BROADCAST_INTERVAL_MS);

    // Cleanup stale devices periodically
    this.cleanupTimer = setInterval(() => {
      this.cleanupStale();
    }, DEVICE_TTL_MS);

    this.discovering = true;
  }

  async stopDiscovery(): Promise<void> {
    if (!this.discovering) return;

    if (this.broadcastTimer !== null) clearInterval(this.broadcastTimer);
    if (this.cleanupTimer !== null) clearInterval(this.cleanupTimer);
    this.broadcastTimer = null;
    this.cleanupTimer = null;

    this.socket?.close();
    this.socket = null;
    this.devices.clear();
    this.discovering = false;
    console.log("[discovery] stopped");
  }

  // -------------------------------------------------------------------------
  // Broadcast
  // -------------------------------------------------------------------------

  private async broadcast() {
    if (!this.socket) return;

    const payload = Buffer.from(
      JSON.stringify({
        type: "announce",
        deviceId: this.localDeviceId,
        deviceName: this.localDeviceName,
        apiPort: this.localApiPort,
        version: "0.1.0",
        ts: Date.now(),
      })
    );

    // Try common broadcast addresses
    const addrs = ["255.255.255.255", "192.168.1.255", "192.168.0.255"];
    for (const addr of addrs) {
      try {
        this.socket.send(payload, DISCOVERY_PORT, addr);
      } catch {
        // ignore per-address failures
      }
    }
  }

  // -------------------------------------------------------------------------
  // Handle incoming message
  // -------------------------------------------------------------------------

  private handleMessage(msg: Buffer, rinfo: RemoteInfo) {
    let data: {
      type: string;
      deviceId: string;
      deviceName: string;
      apiPort: number;
      version: string;
      ts: number;
    };

    try {
      data = JSON.parse(msg.toString());
    } catch {
      return;
    }

    if (data.type !== "announce") return;
    if (data.deviceId === this.localDeviceId) return;

    const device: Device = {
      deviceId: data.deviceId,
      deviceName: data.deviceName,
      ip: rinfo.address,
      apiPort: data.apiPort,
      version: data.version ?? "0.1.0",
      lastSeen: data.ts ?? Date.now(),
    };

    this.devices.set(data.deviceId, device);
    console.log(`[discovery] found ${device.deviceName} (${device.ip}:${device.apiPort})`);
  }

  // -------------------------------------------------------------------------
  // Cleanup stale
  // -------------------------------------------------------------------------

  private cleanupStale() {
    const cutoff = Date.now() - DEVICE_TTL_MS;
    for (const [id, dev] of this.devices) {
      if (dev.lastSeen < cutoff) {
        this.devices.delete(id);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Device ID persistence
  // -------------------------------------------------------------------------

  private static loadOrCreateDeviceId(): string {
    const idFile = join(homedir(), ".interview-manager", "device-id.txt");
    try {
      if (existsSync(idFile)) return readFileSync(idFile, "utf-8").trim();
    } catch {}
    const id = `dev_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    try {
      mkdirSync(dirname(idFile), { recursive: true });
      writeFileSync(idFile, id);
    } catch {}
    return id;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _discovery: DiscoveryService | null = null;

export function getDiscovery(deviceName: string, apiPort?: number): DiscoveryService {
  if (!_discovery) {
    _discovery = new DiscoveryService(deviceName, apiPort);
  }
  return _discovery;
}
