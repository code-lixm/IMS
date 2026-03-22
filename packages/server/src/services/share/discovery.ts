import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { createSocket, type RemoteInfo } from "node:dgram";

const DISCOVERY_PORT = 34567;
const DEVICE_TTL_MS = 30_000;

export interface Device {
  deviceId: string; deviceName: string; ip: string; apiPort: number; version: string; lastSeen: number;
}

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

  isDiscovering() { return this.discovering; }

  getDevices(): Device[] {
    const cutoff = Date.now() - DEVICE_TTL_MS;
    return [...this.devices.values()].filter(d => d.lastSeen > cutoff);
  }

  async startDiscovery(): Promise<void> {
    if (this.discovering) return;
    const sock = createSocket({ type: "udp4", reusePort: true });
    sock.on("message", (msg, rinfo) => this.handleMessage(msg, rinfo));
    sock.on("error", (err) => console.error("[discovery] socket error:", err.message));
    sock.bind(DISCOVERY_PORT, () => {
      try { sock.setBroadcast(true); } catch {}
      console.log(`[discovery] listening on UDP ${DISCOVERY_PORT}`);
    });
    this.socket = sock;
    await this.broadcast();
    this.broadcastTimer = setInterval(() => { void this.broadcast(); }, 10_000);
    this.cleanupTimer = setInterval(() => { this.cleanupStale(); }, DEVICE_TTL_MS);
    this.discovering = true;
  }

  async stopDiscovery(): Promise<void> {
    if (!this.discovering) return;
    if (this.broadcastTimer !== null) clearInterval(this.broadcastTimer);
    if (this.cleanupTimer !== null) clearInterval(this.cleanupTimer);
    this.broadcastTimer = null; this.cleanupTimer = null;
    this.socket?.close(); this.socket = null;
    this.devices.clear(); this.discovering = false;
    console.log("[discovery] stopped");
  }

  private async broadcast() {
    if (!this.socket) return;
    const payload = Buffer.from(JSON.stringify({ type: "announce", deviceId: this.localDeviceId, deviceName: this.localDeviceName, apiPort: this.localApiPort, version: "0.1.0", ts: Date.now() }));
    for (const addr of ["255.255.255.255", "192.168.1.255", "192.168.0.255"]) {
      try { this.socket.send(payload, DISCOVERY_PORT, addr); } catch {}
    }
  }

  private handleMessage(msg: Buffer, rinfo: RemoteInfo) {
    let data: { type: string; deviceId: string; deviceName: string; apiPort: number; version: string; ts: number };
    try { data = JSON.parse(msg.toString()); } catch { return; }
    if (data.type !== "announce" || data.deviceId === this.localDeviceId) return;
    this.devices.set(data.deviceId, { deviceId: data.deviceId, deviceName: data.deviceName, ip: rinfo.address, apiPort: data.apiPort, version: data.version ?? "0.1.0", lastSeen: data.ts ?? Date.now() });
    console.log(`[discovery] found ${data.deviceName} (${rinfo.address}:${data.apiPort})`);
  }

  private cleanupStale() {
    const cutoff = Date.now() - DEVICE_TTL_MS;
    for (const [id, dev] of this.devices) { if (dev.lastSeen < cutoff) this.devices.delete(id); }
  }

  private static loadOrCreateDeviceId(): string {
    const idFile = join(homedir(), ".interview-manager", "device-id.txt");
    try { if (existsSync(idFile)) return readFileSync(idFile, "utf-8").trim(); } catch {}
    const id = `dev_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    try { mkdirSync(dirname(idFile), { recursive: true }); writeFileSync(idFile, id); } catch {}
    return id;
  }
}

let _discovery: DiscoveryService | null = null;
export function getDiscovery(deviceName: string, apiPort?: number): DiscoveryService {
  if (!_discovery) _discovery = new DiscoveryService(deviceName, apiPort);
  return _discovery;
}
