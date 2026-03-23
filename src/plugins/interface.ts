/**
 * DronePlugin — the universal drone adapter contract.
 *
 * Every drone (Mock, Solo, DJI) implements this interface.
 * The core app ONLY talks to this interface — never to SDKs directly.
 * Swapping drones = changing ONE line of code.
 *
 * This file is the MOST IMPORTANT design decision in ZeroEffort.
 * It never changes without a formal Change Record.
 */

// ─── Connection ────────────────────────────────────────────────

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ConnectionResult {
  success: boolean;
  status: ConnectionStatus;
  message: string;
}

// ─── Drone State (telemetry snapshot) ──────────────────────────

export interface DroneState {
  /** Whether the drone is currently in the air */
  is_airborne: boolean;

  /** Current altitude in meters above takeoff point */
  altitude_m: number;

  /** Battery percentage 0-100 */
  battery_percent: number;

  /** Number of GPS satellites locked */
  gps_satellites: number;

  /** Current latitude (null if no GPS fix) */
  latitude: number | null;

  /** Current longitude (null if no GPS fix) */
  longitude: number | null;

  /** Current heading in degrees (0-360, 0=North) */
  heading_degrees: number;

  /** Ground speed in m/s */
  speed_ms: number;

  /** Signal strength 0-100 */
  signal_strength: number;

  /** Whether the drone is currently executing a command */
  is_busy: boolean;

  /** Last error message, if any */
  last_error: string | null;
}

// ─── Command Results ───────────────────────────────────────────

export interface CommandResult {
  success: boolean;
  message: string;
  /** Duration the command took in milliseconds */
  duration_ms?: number;
}

export interface PhotoResult {
  success: boolean;
  message: string;
  /** Local URI to the captured photo (null on failure) */
  uri: string | null;
  /** Timestamp of capture */
  timestamp: string;
}

// ─── Obstacle Data ─────────────────────────────────────────────

export interface ObstacleData {
  /** Whether obstacle detection is available on this drone */
  supported: boolean;
  /** Distance to nearest obstacle in meters (null if not supported) */
  nearest_m: number | null;
  /** Direction of nearest obstacle */
  direction: 'front' | 'back' | 'left' | 'right' | 'above' | 'below' | null;
}

// ─── The Plugin Interface — THE contract ───────────────────────

export interface DronePlugin {
  /** Unique identifier matching drone_plugins.id in Supabase */
  readonly plugin_id: string;

  /** Human-readable drone name */
  readonly drone_name: string;

  // ── Connection ────────────────────────────────────────────

  /** Establish connection to the drone */
  connect(): Promise<ConnectionResult>;

  /** Disconnect cleanly */
  disconnect(): Promise<void>;

  /** Current connection status */
  getConnectionStatus(): ConnectionStatus;

  // ── Telemetry ─────────────────────────────────────────────

  /** Get a snapshot of current drone state. Poll every ~2s. */
  getState(): DroneState;

  // ── Flight Commands ───────────────────────────────────────

  /** Take off to specified altitude (meters) */
  takeoff(altitude_m: number): Promise<CommandResult>;

  /** Land at current position */
  land(): Promise<CommandResult>;

  /** Hold position (hover in place) */
  hover(): Promise<CommandResult>;

  /** Return to home/takeoff point and land */
  returnHome(): Promise<CommandResult>;

  /**
   * EMERGENCY STOP — immediately halt all motors.
   * This is SYNCHRONOUS. It must never fail. It must never await.
   * The drone will fall from the sky. Use only in true emergency.
   */
  emergencyStop(): void;

  // ── Movement ──────────────────────────────────────────────

  /** Fly to absolute GPS coordinates */
  goToGPS(lat: number, lon: number, alt_m: number): Promise<CommandResult>;

  /** Move relative to current position (meters: forward, right, up) */
  moveRelative(forward_m: number, right_m: number, up_m: number): Promise<CommandResult>;

  /** Set heading (0-360 degrees, 0=North) */
  setHeading(degrees: number): Promise<CommandResult>;

  /** Set altitude (absolute, meters above takeoff) */
  setAltitude(alt_m: number): Promise<CommandResult>;

  // ── Camera ────────────────────────────────────────────────

  /** Capture a single photo */
  capturePhoto(): Promise<PhotoResult>;

  /** Start video recording */
  startVideo(): Promise<CommandResult>;

  /** Stop video recording */
  stopVideo(): Promise<CommandResult>;

  // ── Sensors ───────────────────────────────────────────────

  /** Get obstacle detection data (if supported) */
  getObstacleData(): Promise<ObstacleData>;
}
