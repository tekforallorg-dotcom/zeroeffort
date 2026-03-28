import type {
  DronePlugin, DroneState, ConnectionStatus, ConnectionResult,
  CommandResult, PhotoResult, ObstacleData,
} from '../interface';

let ExpoDjiModule: any = null;
let moduleLoadError: string | null = null;

try {
  const mod = require('../../../modules/expo-dji');
  ExpoDjiModule = mod.ExpoDjiModule;
} catch (err: any) {
  moduleLoadError = err.message || 'Failed to load ExpoDji module';
  console.error('[DJI] Module load error:', moduleLoadError);
}

export class DJIAdapter implements DronePlugin {
  readonly plugin_id: string;
  readonly drone_name: string;
  readonly nativeAvailable: boolean;
  readonly nativeError: string | null;

  private _status: ConnectionStatus = 'disconnected';
  private _is_airborne = false;
  private _altitude_m = 0;
  private _battery_percent = 0;
  private _gps_satellites = 0;
  private _latitude = 0;
  private _longitude = 0;
  private _heading = 0;
  private _speed = 0;
  private _signal = 0;
  private _is_busy = false;
  private _last_error: string | null = null;

  constructor(pluginId: string, droneName: string) {
    this.plugin_id = pluginId;
    this.drone_name = droneName;
    this.nativeAvailable = ExpoDjiModule !== null;
    this.nativeError = moduleLoadError;

    if (this.nativeAvailable) {
      try {
        const ok = ExpoDjiModule.isAvailable();
        console.log('[DJI] ' + droneName + ' Expo module loaded, isAvailable: ' + ok);
      } catch (err: any) {
        (this as any).nativeAvailable = false;
        (this as any).nativeError = err.message;
        console.error('[DJI] isAvailable failed:', err.message);
      }
    } else {
      console.error('[DJI] ' + droneName + ' NATIVE MODULE NOT AVAILABLE: ' + this.nativeError);
    }
  }

  async connect(): Promise<ConnectionResult> {
    if (this._status === 'connected') return { success: true, status: 'connected', message: 'Already connected' };

    if (!this.nativeAvailable || !ExpoDjiModule) {
      this._status = 'error';
      var msg = 'DJI native bridge unavailable: ' + (this.nativeError || 'Module not loaded');
      this._last_error = msg;
      return { success: false, status: 'error', message: msg };
    }

    this._status = 'connecting';
    try {
      console.log('[DJI] Registering SDK...');
      var reg = await ExpoDjiModule.registerSDK();
      console.log('[DJI] Register:', JSON.stringify(reg));
      if (!reg.success) { this._status = 'error'; this._last_error = reg.message; return { success: false, status: 'error', message: reg.message }; }

      console.log('[DJI] Waiting 3s for USB detection...');
      await new Promise(function(r) { setTimeout(r, 3000); });

      console.log('[DJI] Checking connection...');
      var conn = await ExpoDjiModule.connect();
      console.log('[DJI] Connect:', JSON.stringify(conn));

      if (conn.success) {
        this._status = 'connected';
        this._signal = 90;
        this.setupListeners();
        return { success: true, status: 'connected', message: conn.message };
      } else {
        this._status = 'error';
        this._last_error = conn.message;
        return { success: false, status: 'error', message: conn.message };
      }
    } catch (err: any) {
      this._status = 'error';
      this._last_error = err.message;
      return { success: false, status: 'error', message: err.message };
    }
  }

  private setupListeners() {
    if (!ExpoDjiModule) return;
    try {
      ExpoDjiModule.addListener('onTelemetry', (d: any) => {
        if (d.altitude !== undefined) this._altitude_m = d.altitude;
        if (d.latitude !== undefined) this._latitude = d.latitude;
        if (d.longitude !== undefined) this._longitude = d.longitude;
        if (d.heading !== undefined) this._heading = d.heading;
        if (d.speed !== undefined) this._speed = d.speed;
        if (d.satellites !== undefined) this._gps_satellites = d.satellites;
        if (d.isFlying !== undefined) this._is_airborne = d.isFlying;
      });
    } catch (e) { console.warn('[DJI] Listener setup failed:', e); }
  }

  async disconnect(): Promise<void> {
    if (ExpoDjiModule) try { await ExpoDjiModule.disconnect(); } catch {}
    this._status = 'disconnected'; this._signal = 0;
  }

  getConnectionStatus(): ConnectionStatus { return this._status; }

  getState(): DroneState {
    return {
      is_airborne: this._is_airborne,
      altitude_m: Math.round(this._altitude_m * 10) / 10,
      battery_percent: Math.round(this._battery_percent),
      gps_satellites: this._gps_satellites,
      latitude: this._latitude, longitude: this._longitude,
      heading_degrees: Math.round(this._heading),
      speed_ms: Math.round(this._speed * 10) / 10,
      signal_strength: this._signal,
      is_busy: this._is_busy, last_error: this._last_error,
    };
  }

  async takeoff(alt: number = 3): Promise<CommandResult> {
    if (!ExpoDjiModule) return { success: false, message: 'No native module' };
    return await ExpoDjiModule.takeoff(alt);
  }
  async land(): Promise<CommandResult> {
    if (!ExpoDjiModule) return { success: false, message: 'No native module' };
    return await ExpoDjiModule.land();
  }
  async hover(): Promise<CommandResult> {
    if (!ExpoDjiModule) return { success: false, message: 'No native module' };
    return await ExpoDjiModule.hover();
  }
  async returnHome(): Promise<CommandResult> {
    if (!ExpoDjiModule) return { success: false, message: 'No native module' };
    return await ExpoDjiModule.returnHome();
  }
  emergencyStop(): void {
    if (ExpoDjiModule) try { ExpoDjiModule.emergencyStop(); } catch {}
    this._is_airborne = false; this._altitude_m = 0; this._speed = 0;
  }
  async goToGPS(lat: number, lon: number, alt: number): Promise<CommandResult> {
    if (!ExpoDjiModule) return { success: false, message: 'No native module' };
    return await ExpoDjiModule.goToGPS(lat, lon, alt);
  }
  async moveRelative(f: number, r: number, u: number): Promise<CommandResult> {
    if (!ExpoDjiModule) return { success: false, message: 'No native module' };
    return await ExpoDjiModule.moveRelative(f, r, u);
  }
  async setHeading(d: number): Promise<CommandResult> {
    if (!ExpoDjiModule) return { success: false, message: 'No native module' };
    return await ExpoDjiModule.setHeading(d);
  }
  async setAltitude(a: number): Promise<CommandResult> {
    if (!ExpoDjiModule) return { success: false, message: 'No native module' };
    return await ExpoDjiModule.setAltitude(a);
  }
  async capturePhoto(): Promise<PhotoResult> {
    if (!ExpoDjiModule) return { success: false, message: 'No native module', uri: null, timestamp: new Date().toISOString() };
    var r = await ExpoDjiModule.capturePhoto();
    return { success: r.success, message: r.message, uri: r.uri || null, timestamp: r.timestamp };
  }
  async startVideo(): Promise<CommandResult> {
    if (!ExpoDjiModule) return { success: false, message: 'No native module' };
    return await ExpoDjiModule.startVideo();
  }
  async stopVideo(): Promise<CommandResult> {
    if (!ExpoDjiModule) return { success: false, message: 'No native module' };
    return await ExpoDjiModule.stopVideo();
  }
  async getObstacleData(): Promise<ObstacleData> {
    return { supported: false, nearest_m: null, direction: null };
  }
}

export function createMini2SEAdapter(): DJIAdapter { return new DJIAdapter('dji-mini-2-se', 'DJI Mini 2 SE'); }
export function createMini2Adapter(): DJIAdapter { return new DJIAdapter('dji-mini-2', 'DJI Mini 2'); }
export function createMini4ProAdapter(): DJIAdapter { return new DJIAdapter('dji-mini-4-pro', 'DJI Mini 4 Pro'); }
export function createAir3Adapter(): DJIAdapter { return new DJIAdapter('dji-air-3', 'DJI Air 3'); }
