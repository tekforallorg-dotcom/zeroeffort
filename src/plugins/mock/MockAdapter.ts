/**
 * MockAdapter — full drone simulation, no hardware needed.
 *
 * Simulates: connection, takeoff, landing, movement, battery drain,
 * GPS position, heading, photo capture, and emergency stop.
 *
 * Use this for all development and testing until real adapters exist.
 * Implements the DronePlugin interface exactly.
 */
import type {
  DronePlugin,
  DroneState,
  ConnectionStatus,
  ConnectionResult,
  CommandResult,
  PhotoResult,
  ObstacleData,
} from '../interface';

/** Simulated battery drain rate: percent per second while airborne */
const BATTERY_DRAIN_RATE = 0.15;

/** Simulated movement speed: meters per second */
const MOVE_SPEED_MS = 2.0;

/** Simulated connection delay (ms) */
const CONNECT_DELAY_MS = 1200;

/** Simulated command execution time (ms) */
const COMMAND_DELAY_MS = 800;

/** Starting GPS coordinates (Abuja, Nigeria — Ventures Park area) */
const HOME_LAT = 9.0643;
const HOME_LON = 7.4892;

export class MockAdapter implements DronePlugin {
  readonly plugin_id = 'mock-adapter';
  readonly drone_name = 'Mock Drone (Simulator)';

  // ── Internal State ──────────────────────────────────────────

  private _status: ConnectionStatus = 'disconnected';
  private _is_airborne = false;
  private _altitude_m = 0;
  private _battery_percent = 100;
  private _gps_satellites = 0;
  private _latitude = HOME_LAT;
  private _longitude = HOME_LON;
  private _heading_degrees = 0;
  private _speed_ms = 0;
  private _signal_strength = 0;
  private _is_busy = false;
  private _last_error: string | null = null;
  private _is_recording_video = false;
  private _photo_count = 0;

  /** Timer for battery drain simulation */
  private _drainTimer: ReturnType<typeof setInterval> | null = null;

  // ── Helpers ─────────────────────────────────────────────────

  /** Simulate async delay for realism */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Guard: must be connected */
  private assertConnected(): void {
    if (this._status !== 'connected') {
      throw new Error('Drone is not connected');
    }
  }

  /** Guard: must be airborne */
  private assertAirborne(): void {
    this.assertConnected();
    if (!this._is_airborne) {
      throw new Error('Drone is not airborne');
    }
  }

  /** Start battery drain timer */
  private startBatteryDrain(): void {
    this.stopBatteryDrain();
    this._drainTimer = setInterval(() => {
      if (this._is_airborne && this._battery_percent > 0) {
        this._battery_percent = Math.max(
          0,
          this._battery_percent - BATTERY_DRAIN_RATE
        );
        // Force land if battery hits 0
        if (this._battery_percent <= 0) {
          this._is_airborne = false;
          this._altitude_m = 0;
          this._speed_ms = 0;
          this.stopBatteryDrain();
          console.log('[MockAdapter] Battery depleted — forced landing');
        }
      }
    }, 1000);
  }

  /** Stop battery drain timer */
  private stopBatteryDrain(): void {
    if (this._drainTimer) {
      clearInterval(this._drainTimer);
      this._drainTimer = null;
    }
  }

  /** Simulate position shift (very rough — not real GPS math) */
  private shiftPosition(forward_m: number, right_m: number): void {
    const headingRad = (this._heading_degrees * Math.PI) / 180;
    // ~111,111 meters per degree latitude
    const mPerDeg = 111_111;
    const dLat = (forward_m * Math.cos(headingRad) - right_m * Math.sin(headingRad)) / mPerDeg;
    const dLon = (forward_m * Math.sin(headingRad) + right_m * Math.cos(headingRad)) / mPerDeg;
    this._latitude += dLat;
    this._longitude += dLon;
  }

  // ── Connection ──────────────────────────────────────────────

  async connect(): Promise<ConnectionResult> {
    if (this._status === 'connected') {
      return { success: true, status: 'connected', message: 'Already connected' };
    }

    this._status = 'connecting';
    await this.delay(CONNECT_DELAY_MS);

    // Simulate successful connection
    this._status = 'connected';
    this._battery_percent = 85 + Math.random() * 15; // 85-100%
    this._gps_satellites = 8 + Math.floor(Math.random() * 5); // 8-12
    this._signal_strength = 85 + Math.floor(Math.random() * 15);
    this._latitude = HOME_LAT;
    this._longitude = HOME_LON;
    this._heading_degrees = 0;
    this._last_error = null;

    console.log('[MockAdapter] Connected — battery:', Math.round(this._battery_percent), '%');

    return {
      success: true,
      status: 'connected',
      message: `Mock drone connected. Battery: ${Math.round(this._battery_percent)}%`,
    };
  }

  async disconnect(): Promise<void> {
    this.stopBatteryDrain();
    if (this._is_airborne) {
      // Auto-land before disconnect
      this._is_airborne = false;
      this._altitude_m = 0;
      this._speed_ms = 0;
    }
    this._status = 'disconnected';
    this._signal_strength = 0;
    this._gps_satellites = 0;
    console.log('[MockAdapter] Disconnected');
  }

  getConnectionStatus(): ConnectionStatus {
    return this._status;
  }

  // ── Telemetry ───────────────────────────────────────────────

  getState(): DroneState {
    return {
      is_airborne: this._is_airborne,
      altitude_m: Math.round(this._altitude_m * 10) / 10,
      battery_percent: Math.round(this._battery_percent),
      gps_satellites: this._gps_satellites,
      latitude: this._latitude,
      longitude: this._longitude,
      heading_degrees: Math.round(this._heading_degrees),
      speed_ms: Math.round(this._speed_ms * 10) / 10,
      signal_strength: this._signal_strength,
      is_busy: this._is_busy,
      last_error: this._last_error,
    };
  }

  // ── Flight Commands ─────────────────────────────────────────

  async takeoff(altitude_m: number = 3): Promise<CommandResult> {
    this.assertConnected();

    if (this._is_airborne) {
      return { success: false, message: 'Already airborne' };
    }

    if (this._battery_percent < 20) {
      return { success: false, message: 'Battery too low for takeoff' };
    }

    this._is_busy = true;
    const clampedAlt = Math.min(Math.max(altitude_m, 1), 120);

    // Simulate takeoff time (~1s per 3m)
    const flightTime = Math.max(COMMAND_DELAY_MS, (clampedAlt / 3) * 1000);
    await this.delay(flightTime);

    this._is_airborne = true;
    this._altitude_m = clampedAlt;
    this._is_busy = false;
    this.startBatteryDrain();

    console.log('[MockAdapter] Takeoff to', clampedAlt, 'm');

    return {
      success: true,
      message: `Took off to ${clampedAlt}m`,
      duration_ms: flightTime,
    };
  }

  async land(): Promise<CommandResult> {
    this.assertConnected();

    if (!this._is_airborne) {
      return { success: false, message: 'Already on the ground' };
    }

    this._is_busy = true;
    const descendTime = Math.max(COMMAND_DELAY_MS, (this._altitude_m / 2) * 1000);
    await this.delay(descendTime);

    this._is_airborne = false;
    this._altitude_m = 0;
    this._speed_ms = 0;
    this._is_busy = false;
    this.stopBatteryDrain();

    console.log('[MockAdapter] Landed');

    return { success: true, message: 'Landed safely', duration_ms: descendTime };
  }

  async hover(): Promise<CommandResult> {
    this.assertAirborne();

    this._speed_ms = 0;
    this._is_busy = false;

    return { success: true, message: 'Hovering in place' };
  }

  async returnHome(): Promise<CommandResult> {
    this.assertAirborne();

    this._is_busy = true;
    // Simulate return flight
    await this.delay(2000);

    this._latitude = HOME_LAT;
    this._longitude = HOME_LON;
    this._speed_ms = 0;

    // Then land
    await this.delay(1500);
    this._is_airborne = false;
    this._altitude_m = 0;
    this._is_busy = false;
    this.stopBatteryDrain();

    console.log('[MockAdapter] Returned home and landed');

    return { success: true, message: 'Returned home and landed', duration_ms: 3500 };
  }

  emergencyStop(): void {
    // SYNC. Never fails. Never awaits.
    this._is_airborne = false;
    this._altitude_m = 0;
    this._speed_ms = 0;
    this._is_busy = false;
    this._is_recording_video = false;
    this.stopBatteryDrain();
    this._last_error = 'Emergency stop triggered';

    console.log('[MockAdapter] ⚠️ EMERGENCY STOP');
  }

  // ── Movement ────────────────────────────────────────────────

  async goToGPS(lat: number, lon: number, alt_m: number): Promise<CommandResult> {
    this.assertAirborne();

    this._is_busy = true;
    this._speed_ms = MOVE_SPEED_MS;
    await this.delay(2000);

    this._latitude = lat;
    this._longitude = lon;
    this._altitude_m = Math.min(Math.max(alt_m, 1), 120);
    this._speed_ms = 0;
    this._is_busy = false;

    return { success: true, message: `Arrived at GPS position`, duration_ms: 2000 };
  }

  async moveRelative(forward_m: number, right_m: number, up_m: number): Promise<CommandResult> {
    this.assertAirborne();

    this._is_busy = true;
    this._speed_ms = MOVE_SPEED_MS;

    const distance = Math.sqrt(forward_m ** 2 + right_m ** 2 + up_m ** 2);
    const flightTime = Math.max(COMMAND_DELAY_MS, (distance / MOVE_SPEED_MS) * 1000);
    await this.delay(flightTime);

    this.shiftPosition(forward_m, right_m);
    const newAlt = this._altitude_m + up_m;
    this._altitude_m = Math.min(Math.max(newAlt, 1), 120);
    this._speed_ms = 0;
    this._is_busy = false;

    return {
      success: true,
      message: `Moved ${distance.toFixed(1)}m`,
      duration_ms: flightTime,
    };
  }

  async setHeading(degrees: number): Promise<CommandResult> {
    this.assertAirborne();

    this._is_busy = true;
    await this.delay(COMMAND_DELAY_MS);

    this._heading_degrees = ((degrees % 360) + 360) % 360;
    this._is_busy = false;

    return { success: true, message: `Heading set to ${this._heading_degrees}°` };
  }

  async setAltitude(alt_m: number): Promise<CommandResult> {
    this.assertAirborne();

    const clamped = Math.min(Math.max(alt_m, 1), 120);
    this._is_busy = true;

    const delta = Math.abs(clamped - this._altitude_m);
    const flightTime = Math.max(COMMAND_DELAY_MS, (delta / 2) * 1000);
    await this.delay(flightTime);

    this._altitude_m = clamped;
    this._is_busy = false;

    return {
      success: true,
      message: `Altitude set to ${clamped}m`,
      duration_ms: flightTime,
    };
  }

  // ── Camera ──────────────────────────────────────────────────

  async capturePhoto(): Promise<PhotoResult> {
    this.assertConnected();

    this._is_busy = true;
    await this.delay(500);

    this._photo_count += 1;
    this._is_busy = false;

    const timestamp = new Date().toISOString();
    console.log('[MockAdapter] Photo captured (#' + this._photo_count + ')');

    return {
      success: true,
      message: `Photo #${this._photo_count} captured`,
      uri: `mock://photo_${this._photo_count}_${Date.now()}.jpg`,
      timestamp,
    };
  }

  async startVideo(): Promise<CommandResult> {
    this.assertConnected();

    if (this._is_recording_video) {
      return { success: false, message: 'Already recording' };
    }

    this._is_recording_video = true;
    console.log('[MockAdapter] Video recording started');

    return { success: true, message: 'Video recording started' };
  }

  async stopVideo(): Promise<CommandResult> {
    this.assertConnected();

    if (!this._is_recording_video) {
      return { success: false, message: 'Not recording' };
    }

    this._is_recording_video = false;
    console.log('[MockAdapter] Video recording stopped');

    return { success: true, message: 'Video recording stopped' };
  }

  // ── Sensors ─────────────────────────────────────────────────

  async getObstacleData(): Promise<ObstacleData> {
    // Mock drone has no obstacle sensors
    return {
      supported: false,
      nearest_m: null,
      direction: null,
    };
  }
}
