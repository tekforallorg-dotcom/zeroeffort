import type {
  DronePlugin, DroneState, ConnectionStatus, ConnectionResult,
  CommandResult, PhotoResult, ObstacleData,
} from '../interface';

var ExpoDjiModule: any = null;
var moduleLoadError: string | null = null;

try {
  ExpoDjiModule = require('../../../modules/expo-dji').ExpoDjiModule;
} catch (err: any) {
  moduleLoadError = err.message || 'Module load failed';
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
      console.log('[DJI] ' + droneName + ' Expo module LOADED');
      try { console.log('[DJI] buildTag: ' + ExpoDjiModule.getBuildTag()); } catch {}
    } else {
      console.error('[DJI] ' + droneName + ' MODULE MISSING: ' + this.nativeError);
    }
  }

  async connect(): Promise<ConnectionResult> {
    if (!this.nativeAvailable) {
      this._status = 'error';
      this._last_error = 'Native module missing: ' + (this.nativeError || 'unknown');
      return { success: false, status: 'error', message: this._last_error };
    }
    this._status = 'connecting';
    try {
      console.log('[DJI] registerSDK...');
      var reg = await ExpoDjiModule.registerSDK();
      console.log('[DJI] reg:', JSON.stringify(reg));
      if (!reg.success) { this._status = 'error'; this._last_error = reg.message; return { success: false, status: 'error', message: reg.message }; }
      console.log('[DJI] waiting 3s...');
      await new Promise(function(r) { setTimeout(r, 3000); });
      var conn = await ExpoDjiModule.connect();
      console.log('[DJI] conn:', JSON.stringify(conn));
      if (conn.success) { this._status = 'connected'; this._signal = 90; return { success: true, status: 'connected', message: conn.message }; }
      this._status = 'error'; this._last_error = conn.message;
      return { success: false, status: 'error', message: conn.message };
    } catch (err: any) {
      this._status = 'error'; this._last_error = err.message;
      return { success: false, status: 'error', message: err.message };
    }
  }

  async disconnect(): Promise<void> {
    if (ExpoDjiModule) try { await ExpoDjiModule.disconnect(); } catch {}
    this._status = 'disconnected'; this._signal = 0;
  }
  getConnectionStatus(): ConnectionStatus { return this._status; }
  getState(): DroneState {
    return { is_airborne: this._is_airborne, altitude_m: this._altitude_m, battery_percent: this._battery_percent,
      gps_satellites: this._gps_satellites, latitude: this._latitude, longitude: this._longitude,
      heading_degrees: this._heading, speed_ms: this._speed, signal_strength: this._signal,
      is_busy: this._is_busy, last_error: this._last_error };
  }
  async takeoff(a: number = 3): Promise<CommandResult> { if (!ExpoDjiModule) return {success:false,message:'No module'}; return await ExpoDjiModule.takeoff(a); }
  async land(): Promise<CommandResult> { if (!ExpoDjiModule) return {success:false,message:'No module'}; return await ExpoDjiModule.land(); }
  async hover(): Promise<CommandResult> { if (!ExpoDjiModule) return {success:false,message:'No module'}; return await ExpoDjiModule.hover(); }
  async returnHome(): Promise<CommandResult> { if (!ExpoDjiModule) return {success:false,message:'No module'}; return await ExpoDjiModule.returnHome(); }
  emergencyStop(): void { if (ExpoDjiModule) try { ExpoDjiModule.emergencyStop(); } catch {} }
  async goToGPS(lat: number, lon: number, alt: number): Promise<CommandResult> { if (!ExpoDjiModule) return {success:false,message:'No module'}; return await ExpoDjiModule.goToGPS(lat,lon,alt); }
  async moveRelative(f: number, r: number, u: number): Promise<CommandResult> { if (!ExpoDjiModule) return {success:false,message:'No module'}; return await ExpoDjiModule.moveRelative(f,r,u); }
  async setHeading(d: number): Promise<CommandResult> { if (!ExpoDjiModule) return {success:false,message:'No module'}; return await ExpoDjiModule.setHeading(d); }
  async setAltitude(a: number): Promise<CommandResult> { if (!ExpoDjiModule) return {success:false,message:'No module'}; return await ExpoDjiModule.setAltitude(a); }
  async capturePhoto(): Promise<PhotoResult> { if (!ExpoDjiModule) return {success:false,message:'No module',uri:null,timestamp:''}; var r = await ExpoDjiModule.capturePhoto(); return {success:r.success,message:r.message,uri:null,timestamp:r.timestamp}; }
  async startVideo(): Promise<CommandResult> { if (!ExpoDjiModule) return {success:false,message:'No module'}; return await ExpoDjiModule.startVideo(); }
  async stopVideo(): Promise<CommandResult> { if (!ExpoDjiModule) return {success:false,message:'No module'}; return await ExpoDjiModule.stopVideo(); }
  async getObstacleData(): Promise<ObstacleData> { return { supported: false, nearest_m: null, direction: null }; }
}

export function createMini2SEAdapter(): DJIAdapter { return new DJIAdapter('dji-mini-2-se', 'DJI Mini 2 SE'); }
export function createMini2Adapter(): DJIAdapter { return new DJIAdapter('dji-mini-2', 'DJI Mini 2'); }
export function createMini4ProAdapter(): DJIAdapter { return new DJIAdapter('dji-mini-4-pro', 'DJI Mini 4 Pro'); }
export function createAir3Adapter(): DJIAdapter { return new DJIAdapter('dji-air-3', 'DJI Air 3'); }
