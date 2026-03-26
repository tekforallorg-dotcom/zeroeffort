/**
 * droneStore — global state for the active drone and command history.
 *
 * Uses React Context (no external state lib needed for v1).
 * Provides: drone instance, live telemetry, command history, and
 * the sendCommand() function that runs the full pipeline.
 */
import React, { createContext, useContext, useCallback, useRef, useState, useEffect } from 'react';
import type { DronePlugin, DroneState, ConnectionStatus } from '@/plugins/interface';
import { MockAdapter } from '@/plugins/mock/MockAdapter';
import { SoloAdapter } from '@/plugins/solo/SoloAdapter';
import { createMini2Adapter, createMini4ProAdapter, createAir3Adapter } from '@/plugins/dji/DJIAdapter';
import { parseCommand, type ParsedIntent } from '@/core/intentParser';
import { checkSafety, type SafetyResult, type GateVerdict } from '@/core/safetyGate';

// ─── Command Log Entry ─────────────────────────────────────────

export interface CommandEntry {
  id: string;
  userInput: string;
  parsedIntent: ParsedIntent | null;
  gateResult: GateVerdict;
  gateReason: string;
  executed: boolean;
  droneResponse: string;
  timestamp: number;
}

// ─── Store Shape ───────────────────────────────────────────────

interface DroneStore {
  /** Current drone adapter */
  drone: DronePlugin;
  /** Active adapter ID ('mock-adapter' or '3dr-solo') */
  activeAdapterId: string;
  /** Live telemetry (updated every 2s when connected) */
  droneState: DroneState | null;
  /** Connection status */
  connectionStatus: ConnectionStatus;
  /** Command history (newest first) */
  commandHistory: CommandEntry[];
  /** Whether a command is currently being processed */
  isProcessing: boolean;
  /** Switch to a different drone adapter */
  switchAdapter: (adapterId: string) => void;
  /** Connect to the drone */
  connectDrone: () => Promise<void>;
  /** Disconnect from the drone */
  disconnectDrone: () => Promise<void>;
  /** Send a command through the full pipeline */
  sendCommand: (input: string) => Promise<CommandEntry>;
  /** Execute a previously warned command (user confirmed) */
  confirmAndExecute: (entry: CommandEntry) => Promise<CommandEntry>;
}

const DroneContext = createContext<DroneStore | null>(null);

// ─── Intent → DronePlugin method mapping ───────────────────────

async function executeIntent(
  drone: DronePlugin,
  intent: ParsedIntent
): Promise<{ success: boolean; message: string }> {
  const p = intent.params;

  switch (intent.intent) {
    case 'takeoff':
      return drone.takeoff(p.altitude_m ?? 3);
    case 'land':
      return drone.land();
    case 'hover':
      return drone.hover();
    case 'return_home':
      return drone.returnHome();
    case 'emergency_stop':
      drone.emergencyStop();
      return { success: true, message: 'Emergency stop executed.' };
    case 'move_up':
      return drone.moveRelative(0, 0, p.altitude_m ?? p.distance_m ?? 5);
    case 'move_down':
      return drone.moveRelative(0, 0, -(p.altitude_m ?? p.distance_m ?? 5));
    case 'move_forward':
      return drone.moveRelative(p.distance_m ?? 5, 0, 0);
    case 'move_backward':
      return drone.moveRelative(-(p.distance_m ?? 5), 0, 0);
    case 'move_left':
      return drone.moveRelative(0, -(p.distance_m ?? 5), 0);
    case 'move_right':
      return drone.moveRelative(0, p.distance_m ?? 5, 0);
    case 'rotate_left':
      return drone.setHeading(
        ((drone.getState().heading_degrees - (p.heading_degrees ?? 90)) + 360) % 360
      );
    case 'rotate_right':
      return drone.setHeading(
        (drone.getState().heading_degrees + (p.heading_degrees ?? 90)) % 360
      );
    case 'set_altitude':
      return drone.setAltitude(p.altitude_m ?? 10);
    case 'set_heading':
      return drone.setHeading(p.heading_degrees ?? 0);
    case 'capture_photo': {
      const photo = await drone.capturePhoto();
      return { success: photo.success, message: photo.message };
    }
    case 'start_video':
      return drone.startVideo();
    case 'stop_video':
      return drone.stopVideo();
    case 'go_to_gps':
      if (p.latitude != null && p.longitude != null) {
        return drone.goToGPS(p.latitude, p.longitude, p.altitude_m ?? drone.getState().altitude_m);
      }
      return { success: false, message: 'No GPS coordinates provided.' };
    case 'orbit':
      // Simulate orbit as a series of moves (simplified for MockAdapter)
      return drone.moveRelative(0, p.radius_m ?? 10, 0);
    case 'reveal_shot':
      // Rise + move forward
      await drone.moveRelative(0, 0, 15);
      return drone.moveRelative(10, 0, 0);
    case 'pull_back':
      return drone.moveRelative(-(p.distance_m ?? 10), 0, p.altitude_m ?? 5);
    default:
      return { success: false, message: `Unknown command: ${intent.intent}` };
  }
}

// ─── Provider ──────────────────────────────────────────────────

export function DroneProvider({ children }: { children: React.ReactNode }) {
  const droneRef = useRef<DronePlugin>(new MockAdapter());
  const [activeAdapterId, setActiveAdapterId] = useState('mock-adapter');
  const [droneState, setDroneState] = useState<DroneState | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [commandHistory, setCommandHistory] = useState<CommandEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const telemetryTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Switch the active drone adapter (disconnects current first) */
  const switchAdapter = useCallback((adapterId: string) => {
    // Disconnect current
    if (droneRef.current.getConnectionStatus() === 'connected') {
      droneRef.current.disconnect();
    }
    if (telemetryTimer.current) {
      clearInterval(telemetryTimer.current);
      telemetryTimer.current = null;
    }

    // Create new adapter
    switch (adapterId) {
      case 'dji-mini-2':
        droneRef.current = createMini2Adapter('native');
        break;
      case 'dji-mini-4-pro':
        droneRef.current = createMini4ProAdapter('native');
        break;
      case 'dji-air-3':
      case 'dji-air-3s':
        droneRef.current = createAir3Adapter('native');
        break;
      case '3dr-solo':
        droneRef.current = new SoloAdapter();
        break;
      case 'mock-adapter':
      default:
        droneRef.current = new MockAdapter();
        break;
    }

    setActiveAdapterId(adapterId);
    setConnectionStatus('disconnected');
    setDroneState(null);
    console.log('[droneStore] Switched to adapter:', adapterId);
  }, []);

  // Poll telemetry every 2s when connected
  const startTelemetry = useCallback(() => {
    if (telemetryTimer.current) clearInterval(telemetryTimer.current);
    telemetryTimer.current = setInterval(() => {
      const drone = droneRef.current;
      if (drone.getConnectionStatus() === 'connected') {
        setDroneState(drone.getState());
      }
    }, 2000);
    // Immediate first read
    setDroneState(droneRef.current.getState());
  }, []);

  const stopTelemetry = useCallback(() => {
    if (telemetryTimer.current) {
      clearInterval(telemetryTimer.current);
      telemetryTimer.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopTelemetry();
  }, [stopTelemetry]);

  const connectDrone = useCallback(async () => {
    setConnectionStatus('connecting');
    const result = await droneRef.current.connect();
    setConnectionStatus(result.status);
    if (result.success) {
      startTelemetry();
    }
  }, [startTelemetry]);

  const disconnectDrone = useCallback(async () => {
    stopTelemetry();
    await droneRef.current.disconnect();
    setConnectionStatus('disconnected');
    setDroneState(null);
  }, [stopTelemetry]);

  const addEntry = useCallback((entry: CommandEntry) => {
    setCommandHistory((prev) => [entry, ...prev]);
    return entry;
  }, []);

  /** Full pipeline: parse → safety → execute → feedback */
  const sendCommand = useCallback(
    async (input: string): Promise<CommandEntry> => {
      const id = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const currentState = droneRef.current.getConnectionStatus() === 'connected'
        ? droneRef.current.getState()
        : null;

      setIsProcessing(true);

      try {
        // Step 1: Parse
        const parsed = await parseCommand(input, currentState);

        // Step 2: Safety check
        if (!currentState && parsed.intent !== 'unknown') {
          // Not connected — block everything except unknown (which is already blocked)
          const entry: CommandEntry = {
            id, userInput: input, parsedIntent: parsed,
            gateResult: 'block', gateReason: 'Connect your drone first!',
            executed: false, droneResponse: '', timestamp: Date.now(),
          };
          return addEntry(entry);
        }

        const safety: SafetyResult = currentState
          ? checkSafety(parsed, currentState)
          : { verdict: 'block', reason: 'Drone not connected', intent: parsed };

        // Step 3: Handle verdict
        if (safety.verdict === 'block') {
          const entry: CommandEntry = {
            id, userInput: input, parsedIntent: safety.intent,
            gateResult: 'block', gateReason: safety.reason,
            executed: false, droneResponse: safety.reason, timestamp: Date.now(),
          };
          return addEntry(entry);
        }

        if (safety.verdict === 'warn') {
          // Return the entry without executing — UI will show confirmation
          const entry: CommandEntry = {
            id, userInput: input, parsedIntent: safety.intent,
            gateResult: 'warn', gateReason: safety.reason,
            executed: false, droneResponse: safety.reason, timestamp: Date.now(),
          };
          return addEntry(entry);
        }

        // Step 4: Execute (verdict === 'pass')
        const result = await executeIntent(droneRef.current, safety.intent);

        // Refresh telemetry immediately after command
        setDroneState(droneRef.current.getState());

        const entry: CommandEntry = {
          id, userInput: input, parsedIntent: safety.intent,
          gateResult: 'pass', gateReason: '',
          executed: result.success, droneResponse: result.message,
          timestamp: Date.now(),
        };
        return addEntry(entry);
      } catch (err) {
        console.error('[sendCommand] Error:', err);
        const entry: CommandEntry = {
          id, userInput: input, parsedIntent: null,
          gateResult: 'block', gateReason: 'An unexpected error occurred.',
          executed: false, droneResponse: 'Something went wrong. Try again.',
          timestamp: Date.now(),
        };
        return addEntry(entry);
      } finally {
        setIsProcessing(false);
      }
    },
    [addEntry]
  );

  /** Execute a previously warned command after user confirmation */
  const confirmAndExecute = useCallback(
    async (entry: CommandEntry): Promise<CommandEntry> => {
      if (!entry.parsedIntent) return entry;

      setIsProcessing(true);
      try {
        const result = await executeIntent(droneRef.current, entry.parsedIntent);
        setDroneState(droneRef.current.getState());

        const updated: CommandEntry = {
          ...entry,
          gateResult: 'pass',
          executed: result.success,
          droneResponse: result.message,
        };

        // Replace in history
        setCommandHistory((prev) =>
          prev.map((e) => (e.id === entry.id ? updated : e))
        );
        return updated;
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  const value: DroneStore = {
    drone: droneRef.current,
    activeAdapterId,
    droneState,
    connectionStatus,
    commandHistory,
    isProcessing,
    switchAdapter,
    connectDrone,
    disconnectDrone,
    sendCommand,
    confirmAndExecute,
  };

  return (
    <DroneContext.Provider value={value}>
      {children}
    </DroneContext.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────────

export function useDrone(): DroneStore {
  const ctx = useContext(DroneContext);
  if (!ctx) {
    throw new Error('useDrone must be used within <DroneProvider>');
  }
  return ctx;
}
