/**
 * SoloAdapter — DronePlugin implementation for 3DR Solo.
 *
 * Communicates with Solo via a local MAVLink bridge (Node.js script
 * running on the same WiFi network). The bridge translates HTTP to UDP.
 *
 * Architecture:
 *   Phone (this adapter) -> HTTP -> Mac bridge -> UDP -> Solo (10.1.1.1:14550)
 */
import type {
  DronePlugin, DroneState, ConnectionStatus, ConnectionResult,
  CommandResult, PhotoResult, ObstacleData,
} from '../interface';
import {
  MSG, MAV_CMD, COPTER_MODE,
  encodeHeartbeat, encodeCommandLong, encodeSetMode, encodeRequestDataStream,
  parsePacket, decodeHeartbeat, decodeGlobalPosition, decodeSysStatus,
  decodeVfrHud, decodeGpsRaw, decodeCommandAck,
  type HeartbeatData, type GlobalPositionData, type SysStatusData,
  type VfrHudData, type GpsRawData,
} from './mavlink';

const HEARTBEAT_INTERVAL = 1000;
const TELEMETRY_INTERVAL = 500;
const COMMAND_TIMEOUT = 10000;

function uint8ToBase64(arr: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]!);
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return arr;
}

export class SoloAdapter implements DronePlugin {
  readonly plugin_id = '3dr-solo';
  readonly drone_name = '3DR Solo';

  private bridgeUrl: string;
  private _status: ConnectionStatus = 'disconnected';
  private _heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private _telemetryTimer: ReturnType<typeof setInterval> | null = null;
  private _lastHeartbeat: HeartbeatData | null = null;
  private _lastPosition: GlobalPositionData | null = null;
  private _lastSysStatus: SysStatusData | null = null;
  private _lastVfrHud: VfrHudData | null = null;
  private _lastGps: GpsRawData | null = null;
  private _is_busy = false;
  private _last_error: string | null = null;

  constructor(bridgeUrl?: string) {
    this.bridgeUrl = bridgeUrl ?? 'http://10.1.1.123:8765';
  }

  private async sendPacket(packet: Uint8Array): Promise<void> {
    await fetch(`${this.bridgeUrl}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: uint8ToBase64(packet) }),
    });
  }

  private async pollMessages(): Promise<void> {
    try {
      const res = await fetch(`${this.bridgeUrl}/recv`);
      if (!res.ok) return;
      const { messages } = (await res.json()) as { messages: string[] };
      for (const b64 of messages) {
        const data = base64ToUint8(b64);
        const msg = parsePacket(data);
        if (!msg) continue;
        switch (msg.msgId) {
          case MSG.HEARTBEAT: this._lastHeartbeat = decodeHeartbeat(msg); break;
          case MSG.GLOBAL_POSITION_INT: this._lastPosition = decodeGlobalPosition(msg); break;
          case MSG.SYS_STATUS: this._lastSysStatus = decodeSysStatus(msg); break;
          case MSG.VFR_HUD: this._lastVfrHud = decodeVfrHud(msg); break;
          case MSG.GPS_RAW_INT: this._lastGps = decodeGpsRaw(msg); break;
          case MSG.COMMAND_ACK: {
            const ack = decodeCommandAck(msg);
            console.log(`[Solo] ACK cmd=${ack.command} result=${ack.result}`);
            break;
          }
        }
      }
    } catch { /* bridge momentarily unreachable */ }
  }

  private async sendCommandAndWait(
    command: number, p1=0, p2=0, p3=0, p4=0, p5=0, p6=0, p7=0
  ): Promise<CommandResult> {
    this._is_busy = true;
    try {
      const packet = encodeCommandLong(command, p1, p2, p3, p4, p5, p6, p7);
      const res = await fetch(`${this.bridgeUrl}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: uint8ToBase64(packet), command, timeout: COMMAND_TIMEOUT }),
      });
      const result = (await res.json()) as { success: boolean; message: string };
      this._is_busy = false;
      if (!result.success) this._last_error = result.message;
      return result;
    } catch (err) {
      this._is_busy = false;
      const msg = err instanceof Error ? err.message : 'Command failed';
      this._last_error = msg;
      return { success: false, message: msg };
    }
  }

  async connect(): Promise<ConnectionResult> {
    if (this._status === 'connected') return { success: true, status: 'connected', message: 'Already connected' };
    this._status = 'connecting';
    try {
      console.log('[Solo] Connecting to bridge at', this.bridgeUrl);
      const healthRes = await fetch(`${this.bridgeUrl}/health`, { signal: AbortSignal.timeout(5000) });
      if (!healthRes.ok) throw new Error('Bridge not responding');
      const health = (await healthRes.json()) as { solo_connected: boolean };
      if (!health.solo_connected) {
        this._status = 'error';
        return { success: false, status: 'error', message: 'Bridge running but Solo not responding. Is Solo powered on?' };
      }
      this._heartbeatTimer = setInterval(() => { this.sendPacket(encodeHeartbeat()).catch(() => {}); }, HEARTBEAT_INTERVAL);
      await this.sendPacket(encodeRequestDataStream(0, 2));
      this._telemetryTimer = setInterval(() => { this.pollMessages(); }, TELEMETRY_INTERVAL);
      await this.pollMessages();
      this._status = 'connected';
      console.log('[Solo] Connected');
      return { success: true, status: 'connected', message: '3DR Solo connected' };
    } catch (err) {
      this._status = 'error';
      return { success: false, status: 'error', message: `Connection failed: ${err instanceof Error ? err.message : 'Unknown'}` };
    }
  }

  async disconnect(): Promise<void> {
    if (this._heartbeatTimer) { clearInterval(this._heartbeatTimer); this._heartbeatTimer = null; }
    if (this._telemetryTimer) { clearInterval(this._telemetryTimer); this._telemetryTimer = null; }
    this._status = 'disconnected';
    this._lastHeartbeat = this._lastPosition = this._lastSysStatus = this._lastVfrHud = this._lastGps = null;
  }

  getConnectionStatus(): ConnectionStatus { return this._status; }

  getState(): DroneState {
    return {
      is_airborne: this._lastHeartbeat?.isArmed ?? false,
      altitude_m: Math.round((this._lastPosition?.relativeAlt ?? 0) * 10) / 10,
      battery_percent: Math.max(0, this._lastSysStatus?.batteryRemaining ?? 0),
      gps_satellites: this._lastGps?.satellites ?? 0,
      latitude: this._lastPosition?.lat ?? null,
      longitude: this._lastPosition?.lon ?? null,
      heading_degrees: Math.round(this._lastPosition?.heading ?? this._lastVfrHud?.heading ?? 0),
      speed_ms: Math.round((this._lastVfrHud?.groundspeed ?? 0) * 10) / 10,
      signal_strength: this._status === 'connected' ? 90 : 0,
      is_busy: this._is_busy,
      last_error: this._last_error,
    };
  }

  async takeoff(altitude_m: number = 3): Promise<CommandResult> {
    if (this._status !== 'connected') return { success: false, message: 'Not connected' };
    console.log('[Solo] GUIDED mode');
    await this.sendPacket(encodeSetMode(COPTER_MODE.GUIDED));
    await new Promise(r => setTimeout(r, 1000));
    console.log('[Solo] Arming');
    const arm = await this.sendCommandAndWait(MAV_CMD.COMPONENT_ARM_DISARM, 1);
    if (!arm.success) return { success: false, message: `Arm failed: ${arm.message}` };
    await new Promise(r => setTimeout(r, 2000));
    const alt = Math.min(Math.max(altitude_m, 1), 120);
    console.log('[Solo] Takeoff to', alt, 'm');
    return this.sendCommandAndWait(MAV_CMD.NAV_TAKEOFF, 0, 0, 0, 0, 0, 0, alt);
  }

  async land(): Promise<CommandResult> {
    await this.sendPacket(encodeSetMode(COPTER_MODE.LAND));
    return { success: true, message: 'Landing' };
  }

  async hover(): Promise<CommandResult> {
    await this.sendPacket(encodeSetMode(COPTER_MODE.LOITER));
    return { success: true, message: 'Hovering' };
  }

  async returnHome(): Promise<CommandResult> {
    await this.sendPacket(encodeSetMode(COPTER_MODE.RTL));
    return { success: true, message: 'Returning home' };
  }

  emergencyStop(): void {
    console.log('[Solo] EMERGENCY STOP');
    const packet = encodeCommandLong(MAV_CMD.COMPONENT_ARM_DISARM, 0, 21196);
    this.sendPacket(packet).catch(() => {});
    this._is_busy = false;
    this._last_error = 'Emergency stop triggered';
  }

  async goToGPS(lat: number, lon: number, alt_m: number): Promise<CommandResult> {
    return this.sendCommandAndWait(MAV_CMD.NAV_TAKEOFF, 0, 0, 0, 0, lat, lon, alt_m);
  }

  async moveRelative(forward_m: number, right_m: number, up_m: number): Promise<CommandResult> {
    try {
      const res = await fetch(`${this.bridgeUrl}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forward_m, right_m, up_m }),
      });
      return (await res.json()) as CommandResult;
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : 'Move failed' };
    }
  }

  async setHeading(degrees: number): Promise<CommandResult> {
    return this.sendCommandAndWait(115, degrees, 10, 1, 0);
  }

  async setAltitude(alt_m: number): Promise<CommandResult> {
    const delta = alt_m - (this._lastPosition?.relativeAlt ?? 0);
    return this.moveRelative(0, 0, delta);
  }

  async capturePhoto(): Promise<PhotoResult> {
    const r = await this.sendCommandAndWait(MAV_CMD.DO_DIGICAM_CONTROL, 0, 0, 0, 0, 1);
    return { success: r.success, message: r.success ? 'GoPro photo triggered' : r.message, uri: null, timestamp: new Date().toISOString() };
  }

  async startVideo(): Promise<CommandResult> {
    return this.sendCommandAndWait(MAV_CMD.DO_DIGICAM_CONTROL, 0, 0, 0, 0, 0, 1);
  }

  async stopVideo(): Promise<CommandResult> {
    return this.sendCommandAndWait(MAV_CMD.DO_DIGICAM_CONTROL, 0, 0, 0, 0, 0, 0);
  }

  async getObstacleData(): Promise<ObstacleData> {
    return { supported: false, nearest_m: null, direction: null };
  }
}
