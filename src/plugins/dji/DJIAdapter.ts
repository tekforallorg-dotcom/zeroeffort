import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import type {
  DronePlugin, DroneState, ConnectionStatus, ConnectionResult,
  CommandResult, PhotoResult, ObstacleData,
} from '../interface';

type DJIMode = 'simulation' | 'native';

const SIM_HOME_LAT = 9.0643;
const SIM_HOME_LON = 7.4892;

export class DJIAdapter implements DronePlugin {
  readonly plugin_id: string;
  readonly drone_name: string;
  private mode: DJIMode;
  private nativeModule: any = null;
  private eventEmitter: NativeEventEmitter | null = null;

  private _status: ConnectionStatus = 'disconnected';
  private _is_airborne = false;
  private _altitude_m = 0;
  private _battery_percent = 100;
  private _gps_satellites = 0;
  private _latitude = SIM_HOME_LAT;
  private _longitude = SIM_HOME_LON;
  private _heading = 0;
  private _speed = 0;
  private _signal = 0;
  private _is_busy = false;
  private _last_error: string | null = null;
  private _photo_count = 0;
  private _drainTimer: ReturnType<typeof setInterval> | null = null;

  constructor(pluginId: string, droneName: string, config: { mode: DJIMode; model: string }) {
    this.plugin_id = pluginId;
    this.drone_name = droneName;
    this.mode = config.mode;

    if (config.mode === 'native' && Platform.OS === 'android') {
      try {
        this.nativeModule = NativeModules.DJIBridge ?? null;
        if (this.nativeModule) {
          this.eventEmitter = new NativeEventEmitter(this.nativeModule);
        }
      } catch {
        console.warn('[DJI] Native module not available, falling back to simulation');
        this.mode = 'simulation';
      }
    }
    console.log(`[DJI] ${droneName} adapter created (${this.mode} mode)`);
  }

  async connect(): Promise<ConnectionResult> {
    if (this._status === 'connected') return { success: true, status: 'connected', message: 'Already connected' };
    this._status = 'connecting';

    if (this.mode === 'native' && this.nativeModule) {
      try {
        console.log('[DJI] Registering SDK...');
        const regResult = await this.nativeModule.registerSDK();
        console.log('[DJI] Register result:', JSON.stringify(regResult));
        if (!regResult.success) {
          this._status = 'error';
          return { success: false, status: 'error', message: regResult.message };
        }
        console.log('[DJI] Waiting for USB product detection...');
        await new Promise(r => setTimeout(r, 3000));
        const result = await this.nativeModule.connect();
        if (result.success) {
          this._status = 'connected';
          this.setupNativeListeners();
          return { success: true, status: 'connected', message: `${this.drone_name} connected via RC` };
        } else {
          this._status = 'error';
          return { success: false, status: 'error', message: result.message };
        }
      } catch (err) {
        this._status = 'error';
        return { success: false, status: 'error', message: err instanceof Error ? err.message : 'Connection failed' };
      }
    }

    // Simulation mode
    console.log(`[DJI] Simulating ${this.drone_name} connection...`);
    await new Promise(r => setTimeout(r, 2500));
    this._battery_percent = 75 + Math.random() * 25;
    this._gps_satellites = 10 + Math.floor(Math.random() * 5);
    this._signal = 85 + Math.floor(Math.random() * 15);
    this._latitude = SIM_HOME_LAT;
    this._longitude = SIM_HOME_LON;
    this._status = 'connected';
    console.log(`[DJI] ${this.drone_name} connected (sim) — battery: ${Math.round(this._battery_percent)}%`);
    return { success: true, status: 'connected', message: `${this.drone_name} connected (simulation)` };
  }

  private setupNativeListeners(): void {
    if (!this.eventEmitter) return;
    this.eventEmitter.addListener('DJI_TELEMETRY', (data: any) => {
      if (data.battery !== undefined) this._battery_percent = data.battery;
      if (data.altitude !== undefined) this._altitude_m = data.altitude;
      if (data.latitude !== undefined) this._latitude = data.latitude;
      if (data.longitude !== undefined) this._longitude = data.longitude;
      if (data.heading !== undefined) this._heading = data.heading;
      if (data.speed !== undefined) this._speed = data.speed;
      if (data.satellites !== undefined) this._gps_satellites = data.satellites;
      if (data.isFlying !== undefined) this._is_airborne = data.isFlying;
    });
  }

  async disconnect(): Promise<void> {
    if (this._drainTimer) { clearInterval(this._drainTimer); this._drainTimer = null; }
    if (this.mode === 'native' && this.nativeModule) {
      try { await this.nativeModule.disconnect(); } catch {}
    }
    this._status = 'disconnected';
    this._signal = 0;
  }

  getConnectionStatus(): ConnectionStatus { return this._status; }

  getState(): DroneState {
    return {
      is_airborne: this._is_airborne,
      altitude_m: Math.round(this._altitude_m * 10) / 10,
      battery_percent: Math.round(this._battery_percent),
      gps_satellites: this._gps_satellites,
      latitude: this._latitude,
      longitude: this._longitude,
      heading_degrees: Math.round(this._heading),
      speed_ms: Math.round(this._speed * 10) / 10,
      signal_strength: this._signal,
      is_busy: this._is_busy,
      last_error: this._last_error,
    };
  }

  async takeoff(altitude_m: number = 3): Promise<CommandResult> {
    if (this._status !== 'connected') return { success: false, message: 'Not connected' };
    if (this.mode === 'native' && this.nativeModule) return await this.nativeModule.takeoff(altitude_m);
    this._is_busy = true;
    await new Promise(r => setTimeout(r, 2000));
    this._is_airborne = true;
    this._altitude_m = Math.min(altitude_m, 120);
    this._is_busy = false;
    this._drainTimer = setInterval(() => { if (this._battery_percent > 0) this._battery_percent -= 0.12; }, 1000);
    return { success: true, message: `Took off to ${this._altitude_m}m` };
  }

  async land(): Promise<CommandResult> {
    if (this.mode === 'native' && this.nativeModule) return await this.nativeModule.land();
    this._is_airborne = false; this._altitude_m = 0; this._speed = 0;
    if (this._drainTimer) { clearInterval(this._drainTimer); this._drainTimer = null; }
    return { success: true, message: 'Landed' };
  }

  async hover(): Promise<CommandResult> {
    if (this.mode === 'native' && this.nativeModule) return await this.nativeModule.hover();
    this._speed = 0;
    return { success: true, message: 'Hovering' };
  }

  async returnHome(): Promise<CommandResult> {
    if (this.mode === 'native' && this.nativeModule) return await this.nativeModule.returnHome();
    this._is_airborne = false; this._altitude_m = 0; this._speed = 0;
    this._latitude = SIM_HOME_LAT; this._longitude = SIM_HOME_LON;
    if (this._drainTimer) { clearInterval(this._drainTimer); this._drainTimer = null; }
    return { success: true, message: 'Returned home' };
  }

  emergencyStop(): void {
    console.log('[DJI] EMERGENCY STOP');
    if (this.mode === 'native' && this.nativeModule) { try { this.nativeModule.emergencyStop(); } catch {} }
    this._is_airborne = false; this._altitude_m = 0; this._speed = 0; this._is_busy = false;
    if (this._drainTimer) { clearInterval(this._drainTimer); this._drainTimer = null; }
    this._last_error = 'Emergency stop';
  }

  async goToGPS(lat: number, lon: number, alt_m: number): Promise<CommandResult> {
    if (this.mode === 'native' && this.nativeModule) return await this.nativeModule.goToGPS(lat, lon, alt_m);
    this._latitude = lat; this._longitude = lon; this._altitude_m = alt_m;
    return { success: true, message: 'Arrived at GPS' };
  }

  async moveRelative(forward_m: number, right_m: number, up_m: number): Promise<CommandResult> {
    if (this.mode === 'native' && this.nativeModule) return await this.nativeModule.moveRelative(forward_m, right_m, up_m);
    const dist = Math.sqrt(forward_m**2 + right_m**2 + up_m**2);
    this._altitude_m = Math.min(Math.max(this._altitude_m + up_m, 1), 120);
    return { success: true, message: `Moved ${dist.toFixed(1)}m` };
  }

  async setHeading(degrees: number): Promise<CommandResult> {
    if (this.mode === 'native' && this.nativeModule) return await this.nativeModule.setHeading(degrees);
    this._heading = ((degrees % 360) + 360) % 360;
    return { success: true, message: `Heading ${this._heading}` };
  }

  async setAltitude(alt_m: number): Promise<CommandResult> {
    if (this.mode === 'native' && this.nativeModule) return await this.nativeModule.setAltitude(alt_m);
    this._altitude_m = Math.min(Math.max(alt_m, 1), 120);
    return { success: true, message: `Altitude ${this._altitude_m}m` };
  }

  async capturePhoto(): Promise<PhotoResult> {
    if (this.mode === 'native' && this.nativeModule) return await this.nativeModule.capturePhoto();
    this._photo_count++;
    return { success: true, message: `Photo #${this._photo_count} (4K)`, uri: null, timestamp: new Date().toISOString() };
  }

  async startVideo(): Promise<CommandResult> {
    if (this.mode === 'native' && this.nativeModule) return await this.nativeModule.startVideo();
    return { success: true, message: 'Recording 4K' };
  }

  async stopVideo(): Promise<CommandResult> {
    if (this.mode === 'native' && this.nativeModule) return await this.nativeModule.stopVideo();
    return { success: true, message: 'Recording stopped' };
  }

  async getObstacleData(): Promise<ObstacleData> {
    return { supported: false, nearest_m: null, direction: null };
  }
}

export function createMini2Adapter(mode: DJIMode = 'simulation'): DJIAdapter {
  return new DJIAdapter('dji-mini-2', 'DJI Mini 2', { mode, model: 'mini2' });
}
export function createMini4ProAdapter(mode: DJIMode = 'simulation'): DJIAdapter {
  return new DJIAdapter('dji-mini-4-pro', 'DJI Mini 4 Pro', { mode, model: 'mini4pro' });
}
export function createAir3Adapter(mode: DJIMode = 'simulation'): DJIAdapter {
  return new DJIAdapter('dji-air-3', 'DJI Air 3', { mode, model: 'air3' });
}
