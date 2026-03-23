/**
 * safetyGate — validates commands against live drone state.
 *
 * Pipeline position: intent parse → normalize → SAFETY CHECK → execute
 *
 * Returns: pass (execute), warn (show confirmation first), or block (refuse).
 * Raw LLM output must NEVER execute directly — always through this gate.
 */
import type { DroneState } from '@/plugins/interface';
import type { ParsedIntent } from './intentParser';

// ─── Gate Result ───────────────────────────────────────────────

export type GateVerdict = 'pass' | 'warn' | 'block';

export interface SafetyResult {
  verdict: GateVerdict;
  /** Human-friendly explanation of why it was blocked/warned */
  reason: string;
  /** The original intent, possibly with clamped params */
  intent: ParsedIntent;
}

// ─── Safety Rules ──────────────────────────────────────────────

interface SafetyRule {
  /** Human-readable name for logging */
  name: string;
  /** Check function — return null if rule passes, otherwise a SafetyResult */
  check: (intent: ParsedIntent, state: DroneState) => SafetyResult | null;
}

const SAFETY_RULES: SafetyRule[] = [
  // ── GPS check ─────────────────────────────────────────────
  {
    name: 'gps_minimum',
    check: (intent, state) => {
      const flightIntents = [
        'takeoff', 'move_forward', 'move_backward', 'move_left', 'move_right',
        'move_up', 'move_down', 'go_to_gps', 'orbit', 'reveal_shot', 'pull_back', 'follow',
      ];
      if (flightIntents.includes(intent.intent) && state.gps_satellites < 6) {
        return {
          verdict: 'block',
          reason: `GPS signal too weak (${state.gps_satellites} satellites). Need at least 6 for safe flight.`,
          intent,
        };
      }
      return null;
    },
  },

  // ── Battery too low to fly ────────────────────────────────
  {
    name: 'battery_critical',
    check: (intent, state) => {
      const nonLandingIntents = [
        'takeoff', 'move_forward', 'move_backward', 'move_left', 'move_right',
        'move_up', 'go_to_gps', 'orbit', 'reveal_shot', 'pull_back', 'follow',
        'set_altitude', 'set_heading',
      ];
      if (nonLandingIntents.includes(intent.intent) && state.battery_percent < 15) {
        return {
          verdict: 'block',
          reason: `Battery critically low (${state.battery_percent}%). Only landing and return home are allowed.`,
          intent,
        };
      }
      return null;
    },
  },

  // ── Battery warning on takeoff ────────────────────────────
  {
    name: 'battery_low_takeoff',
    check: (intent, state) => {
      if (intent.intent === 'takeoff' && state.battery_percent < 30 && state.battery_percent >= 15) {
        return {
          verdict: 'warn',
          reason: `Battery is at ${state.battery_percent}%. You may have limited flight time. Continue?`,
          intent,
        };
      }
      return null;
    },
  },

  // ── Battery warning while airborne ────────────────────────
  {
    name: 'battery_low_airborne',
    check: (intent, state) => {
      const nonLandingIntents = [
        'move_forward', 'move_backward', 'move_left', 'move_right',
        'move_up', 'go_to_gps', 'orbit', 'reveal_shot', 'pull_back',
      ];
      if (
        nonLandingIntents.includes(intent.intent) &&
        state.is_airborne &&
        state.battery_percent < 20 &&
        state.battery_percent >= 15
      ) {
        return {
          verdict: 'warn',
          reason: `Battery at ${state.battery_percent}%. I recommend returning home soon. Continue anyway?`,
          intent,
        };
      }
      return null;
    },
  },

  // ── Altitude limit (120m legal max) ───────────────────────
  {
    name: 'altitude_max',
    check: (intent, _state) => {
      const alt = intent.params.altitude_m;
      if (alt !== null && alt !== undefined && alt > 120) {
        // Clamp rather than block — safer UX
        const clamped: ParsedIntent = {
          ...intent,
          params: { ...intent.params, altitude_m: 120 },
        };
        return {
          verdict: 'warn',
          reason: `Requested altitude ${alt}m exceeds the 120m legal limit. I'll cap it at 120m. Continue?`,
          intent: clamped,
        };
      }
      return null;
    },
  },

  // ── Ambiguous intent should never execute ─────────────────
  {
    name: 'ambiguous_intent',
    check: (intent, _state) => {
      if (intent.needs_clarification) {
        return {
          verdict: 'block',
          reason: intent.human_response || 'That command was unclear. Could you rephrase it?',
          intent,
        };
      }
      return null;
    },
  },

  // ── Unknown intent ────────────────────────────────────────
  {
    name: 'unknown_intent',
    check: (intent, _state) => {
      if (intent.intent === 'unknown') {
        return {
          verdict: 'block',
          reason: intent.human_response || "I didn't understand that command. Try something like 'take off' or 'take a photo'.",
          intent,
        };
      }
      return null;
    },
  },

  // ── Can't takeoff if already airborne ─────────────────────
  {
    name: 'already_airborne',
    check: (intent, state) => {
      if (intent.intent === 'takeoff' && state.is_airborne) {
        return {
          verdict: 'block',
          reason: "Already airborne! Try 'set altitude' to change height, or 'land' first.",
          intent,
        };
      }
      return null;
    },
  },

  // ── Can't land if already on ground ───────────────────────
  {
    name: 'already_grounded',
    check: (intent, state) => {
      const airborneMoves = [
        'land', 'hover', 'return_home', 'move_forward', 'move_backward',
        'move_left', 'move_right', 'move_down', 'set_heading', 'orbit',
        'reveal_shot', 'pull_back', 'follow',
      ];
      if (airborneMoves.includes(intent.intent) && !state.is_airborne) {
        return {
          verdict: 'block',
          reason: "The drone is on the ground. Take off first!",
          intent,
        };
      }
      return null;
    },
  },

  // ── Drone is busy ─────────────────────────────────────────
  {
    name: 'drone_busy',
    check: (intent, state) => {
      // Emergency stop always goes through
      if (intent.intent === 'emergency_stop') return null;

      if (state.is_busy) {
        return {
          verdict: 'warn',
          reason: 'The drone is still executing the previous command. Send this anyway?',
          intent,
        };
      }
      return null;
    },
  },
];

// ─── Public API ────────────────────────────────────────────────

/**
 * Run all safety checks against the current drone state.
 * Returns the first failing rule, or pass if all rules clear.
 *
 * Emergency stop ALWAYS passes — it bypasses all safety checks.
 */
export function checkSafety(
  intent: ParsedIntent,
  droneState: DroneState
): SafetyResult {
  // Emergency stop bypasses everything — it's the nuclear option
  if (intent.intent === 'emergency_stop') {
    return { verdict: 'pass', reason: '', intent };
  }

  // Run all rules in order — first failure wins
  for (const rule of SAFETY_RULES) {
    const result = rule.check(intent, droneState);
    if (result) {
      console.log(`[safetyGate] Rule '${rule.name}' → ${result.verdict}: ${result.reason}`);
      return result;
    }
  }

  // All rules passed
  return { verdict: 'pass', reason: '', intent };
}
