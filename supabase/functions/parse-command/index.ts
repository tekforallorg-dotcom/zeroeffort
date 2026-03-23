/**
 * parse-command — Supabase Edge Function
 *
 * Receives natural language drone commands from the app.
 * Calls Claude API for intent parsing.
 * Returns structured JSON — never raw LLM output to the drone.
 *
 * Security: Anthropic API key is a Supabase secret, never in client code.
 * Set it with: npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxx
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

const SYSTEM_PROMPT = `You are ZeroEffort's drone command interpreter. Your ONLY job is to parse natural language drone commands into structured JSON.

You must respond with ONLY a valid JSON object — no markdown, no explanation, no preamble.

JSON schema:
{
  "intent": string,        // one of: takeoff, land, hover, return_home, emergency_stop, move_up, move_down, move_forward, move_backward, move_left, move_right, rotate_left, rotate_right, go_to_gps, set_altitude, capture_photo, start_video, stop_video, orbit, reveal_shot, pull_back, follow, unknown
  "params": {
    "altitude_m": number | null,
    "distance_m": number | null,
    "heading_degrees": number | null,
    "speed_ms": number | null,
    "latitude": number | null,
    "longitude": number | null,
    "duration_s": number | null,
    "radius_m": number | null,
    "direction": "clockwise" | "counterclockwise" | null
  },
  "confidence": number,           // 0.0 to 1.0
  "ambiguities": string[],        // list of unclear parts
  "safety_concerns": string[],    // potential risks detected
  "human_response": string,       // friendly response to show user
  "needs_clarification": boolean  // if true, do NOT execute
}

Rules:
- If the command is vague, set needs_clarification=true and ask ONE question in human_response.
- If the command mentions dangerous actions, add them to safety_concerns.
- Always fill human_response with a friendly plain-English acknowledgment.
- Default altitude for takeoff is 3 meters if not specified.
- Never guess GPS coordinates — set needs_clarification=true instead.
- For "orbit me" default radius is 10m, default direction is clockwise.
- For "reveal shot" default is rise 15m + move forward 10m.`;

Deno.serve(async (req: Request) => {
  // CORS headers for mobile app
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      throw new Error(
        "ANTHROPIC_API_KEY not set. Run: npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxx"
      );
    }

    const { command, drone_state } = await req.json();

    if (!command || typeof command !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing 'command' string in request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build context about current drone state if available
    const stateContext = drone_state
      ? `\n\nCurrent drone state: battery=${drone_state.battery_percent}%, altitude=${drone_state.altitude_m}m, gps_satellites=${drone_state.gps_satellites}, is_airborne=${drone_state.is_airborne}`
      : "";

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Parse this drone command: "${command}"${stateContext}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Claude API error:", response.status, errorText);
      throw new Error(`Claude API returned ${response.status}`);
    }

    const data = await response.json();
    const textBlock = data.content?.find(
      (block: { type: string }) => block.type === "text"
    );

    if (!textBlock?.text) {
      throw new Error("No text response from Claude API");
    }

    // Parse the JSON response — strip any accidental markdown fences
    const cleanText = textBlock.text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    const parsedIntent = JSON.parse(cleanText);

    return new Response(JSON.stringify(parsedIntent), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("parse-command error:", error);

    return new Response(
      JSON.stringify({
        error: "Failed to parse command",
        details: error instanceof Error ? error.message : "Unknown error",
        // Fallback safe response
        intent: "unknown",
        params: {},
        confidence: 0,
        ambiguities: ["Could not parse command"],
        safety_concerns: [],
        human_response:
          "Sorry, I couldn't understand that command. Could you try rephrasing it?",
        needs_clarification: true,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
