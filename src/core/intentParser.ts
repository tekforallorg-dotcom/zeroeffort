/**
 * intentParser — hybrid command parsing.
 *
 * 1. Deterministic local parser handles core commands instantly (offline-safe).
 * 2. Claude API (via Supabase Edge Function) handles flexible/complex prompts.
 *
 * This improves: latency, cost, reliability, offline resilience, safety.
 */
import { supabase } from '@/lib/supabase';
import type { DroneState } from '@/plugins/interface';

// ─── Parsed Intent (matches Edge Function output) ──────────────

export interface ParsedIntent {
  intent: string;
  params: {
    altitude_m?: number | null;
    distance_m?: number | null;
    heading_degrees?: number | null;
    speed_ms?: number | null;
    latitude?: number | null;
    longitude?: number | null;
    duration_s?: number | null;
    radius_m?: number | null;
    direction?: 'clockwise' | 'counterclockwise' | null;
  };
  confidence: number;
  ambiguities: string[];
  safety_concerns: string[];
  human_response: string;
  needs_clarification: boolean;
  /** Whether this was parsed locally or via Claude API */
  source: 'local' | 'cloud';
}

// ─── Local command patterns ────────────────────────────────────

interface LocalPattern {
  patterns: RegExp[];
  intent: string;
  params?: Record<string, unknown>;
  response: string;
}

const LOCAL_COMMANDS: LocalPattern[] = [
  {
    patterns: [/^take\s*off$/i, /^launch$/i, /^lift\s*off$/i, /^go\s*up$/i],
    intent: 'takeoff',
    params: { altitude_m: 3 },
    response: 'Taking off to 3 meters.',
  },
  {
    patterns: [/^take\s*off\s+(?:to\s+)?(\d+)\s*m?$/i, /^go\s*up\s+(\d+)\s*m?$/i],
    intent: 'takeoff',
    response: 'Taking off to $1 meters.',
  },
  {
    patterns: [/^land$/i, /^land\s*now$/i, /^come\s*down$/i, /^set\s*down$/i],
    intent: 'land',
    response: 'Landing now.',
  },
  {
    patterns: [/^return\s*home$/i, /^come\s*home$/i, /^come\s*back$/i, /^rth$/i, /^go\s*home$/i],
    intent: 'return_home',
    response: 'Returning home.',
  },
  {
    patterns: [/^stop$/i, /^emergency\s*stop$/i, /^halt$/i, /^freeze$/i, /^abort$/i],
    intent: 'emergency_stop',
    response: 'Emergency stop!',
  },
  {
    patterns: [/^hover$/i, /^hold$/i, /^hold\s*position$/i, /^stay$/i, /^wait$/i],
    intent: 'hover',
    response: 'Hovering in place.',
  },
  {
    patterns: [
      /^(?:take\s*(?:a\s*)?)?photo$/i,
      /^snap$/i,
      /^shoot$/i,
      /^capture$/i,
      /^take\s*(?:a\s*)?(?:pic|picture|shot)$/i,
    ],
    intent: 'capture_photo',
    response: 'Taking a photo.',
  },
  {
    patterns: [/^start\s*(?:recording|video)$/i, /^record$/i],
    intent: 'start_video',
    response: 'Starting video recording.',
  },
  {
    patterns: [/^stop\s*(?:recording|video)$/i],
    intent: 'stop_video',
    response: 'Stopping video recording.',
  },
];

// ─── Local parser ──────────────────────────────────────────────

function parseLocally(command: string): ParsedIntent | null {
  const trimmed = command.trim();

  for (const cmd of LOCAL_COMMANDS) {
    for (const pattern of cmd.patterns) {
      const match = trimmed.match(pattern);
      if (match) {
        // Extract numeric params from capture groups
        const params = { ...cmd.params };
        if (match[1] !== undefined) {
          // For takeoff with altitude
          if (cmd.intent === 'takeoff') {
            params.altitude_m = parseInt(match[1], 10);
          }
        }

        const response = cmd.response.replace('$1', match[1] ?? '');

        return {
          intent: cmd.intent,
          params: {
            altitude_m: (params.altitude_m as number) ?? null,
            distance_m: null,
            heading_degrees: null,
            speed_ms: null,
            latitude: null,
            longitude: null,
            duration_s: null,
            radius_m: null,
            direction: null,
          },
          confidence: 1.0,
          ambiguities: [],
          safety_concerns: [],
          human_response: response,
          needs_clarification: false,
          source: 'local',
        };
      }
    }
  }

  return null; // Not a local command — fall through to Claude
}

// ─── Cloud parser (Claude API via Edge Function) ───────────────

async function parseViaCloud(
  command: string,
  droneState: DroneState | null
): Promise<ParsedIntent> {
  try {
    const { data, error } = await supabase.functions.invoke('parse-command', {
      body: {
        command,
        drone_state: droneState
          ? {
              battery_percent: droneState.battery_percent,
              altitude_m: droneState.altitude_m,
              gps_satellites: droneState.gps_satellites,
              is_airborne: droneState.is_airborne,
            }
          : null,
      },
    });

    if (error) {
      console.error('[intentParser] Edge Function error:', error);
      throw error;
    }

    return { ...data, source: 'cloud' } as ParsedIntent;
  } catch (err) {
    console.error('[intentParser] Cloud parse failed:', err);

    // Return a safe fallback — never crash, never execute blindly
    return {
      intent: 'unknown',
      params: {
        altitude_m: null,
        distance_m: null,
        heading_degrees: null,
        speed_ms: null,
        latitude: null,
        longitude: null,
        duration_s: null,
        radius_m: null,
        direction: null,
      },
      confidence: 0,
      ambiguities: ['Could not reach AI parser'],
      safety_concerns: [],
      human_response:
        "I couldn't process that command right now. Try a simple command like 'take off' or 'land'.",
      needs_clarification: true,
      source: 'cloud',
    };
  }
}

// ─── Public API ────────────────────────────────────────────────

/**
 * Parse a natural language drone command.
 * Tries local deterministic parser first, falls back to Claude API.
 */
export async function parseCommand(
  command: string,
  droneState: DroneState | null = null
): Promise<ParsedIntent> {
  // Step 1: Try local parser (instant, free, offline-safe)
  const localResult = parseLocally(command);
  if (localResult) {
    console.log('[intentParser] Local parse:', localResult.intent);
    return localResult;
  }

  // Step 2: Fall back to Claude API (flexible, costs ~$0.002)
  console.log('[intentParser] Cloud parse for:', command);
  return parseViaCloud(command, droneState);
}
