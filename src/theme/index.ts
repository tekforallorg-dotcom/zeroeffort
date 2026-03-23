/**
 * ZeroEffort — Aero-Metallic Minimal Design System
 *
 * Design language: precision-engineered flying instrument for normal people.
 * Dark-first. One accent (Electric Sky Blue). Material depth via milled plates.
 * Ice Glow = intelligent signal, not decoration.
 */

// ─── Color Palette ───────────────────────────────────────────────

export const Colors = {
  // Base chassis (darkest surfaces — the structural body)
  pitchBlack: '#050608',
  obsidian: '#0C0E12',
  graphite: '#111318',
  carbonFiber: '#16191F',
  softCharcoal: '#1B1F27',

  // Surface plates (milled metal feel — UI containers)
  titaniumDark: '#20242C',
  steelAsh: '#2A2F39',
  mistMetal: '#AEB7C2',
  silverFog: '#C9D1DB',

  // Overlays (smoked glass / frosted ice)
  smokedGlass: 'rgba(255,255,255,0.06)',
  frostedIce: 'rgba(255,255,255,0.12)',
  iceEdge: 'rgba(200,220,255,0.08)',

  // Accent — Electric Sky Blue (one accent, used sparingly)
  iceGlow: '#9BE7FF',
  electricSky: '#34C8FF',
  blueMist: '#7CDFFF',
  coldCyan: '#B8F3FF',

  // Semantic states
  success: '#34C759',
  successGlow: 'rgba(52,199,89,0.2)',
  warning: '#FF9F0A',
  warningGlow: 'rgba(255,159,10,0.2)',
  danger: '#FF3B30',
  dangerGlow: 'rgba(255,59,48,0.2)',

  // Text hierarchy
  textPrimary: '#F5F7FA',
  textSecondary: '#98A2AE',
  textTertiary: '#4A5568',
  textInverse: '#050608',

  // Pure
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
} as const;

// ─── Typography ──────────────────────────────────────────────────

export const FontFamily = {
  // Display + Headings — Space Grotesk
  displayBold: 'SpaceGrotesk_700Bold',
  headingSemiBold: 'SpaceGrotesk_600SemiBold',
  headingMedium: 'SpaceGrotesk_500Medium',
  headingRegular: 'SpaceGrotesk_400Regular',

  // Body — Inter
  bodyRegular: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',

  // Telemetry / HUD — JetBrains Mono (numbers only)
  monoRegular: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
} as const;

export const Typography = {
  display: {
    fontFamily: FontFamily.displayBold,
    fontSize: 32,
    letterSpacing: -0.8,
    color: Colors.textPrimary,
  },
  h1: {
    fontFamily: FontFamily.displayBold,
    fontSize: 24,
    letterSpacing: -0.5,
    color: Colors.textPrimary,
  },
  h2: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 18,
    letterSpacing: -0.3,
    color: Colors.textPrimary,
  },
  h3: {
    fontFamily: FontFamily.headingMedium,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  body: {
    fontFamily: FontFamily.bodyRegular,
    fontSize: 15,
    lineHeight: 22,
    color: Colors.textPrimary,
  },
  bodySmall: {
    fontFamily: FontFamily.bodyRegular,
    fontSize: 13,
    lineHeight: 20,
    color: Colors.textSecondary,
  },
  label: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
    color: Colors.textTertiary,
  },
  mono: {
    fontFamily: FontFamily.monoRegular,
    fontSize: 13,
    color: Colors.electricSky,
  },
  monoLarge: {
    fontFamily: FontFamily.monoMedium,
    fontSize: 22,
    color: Colors.textPrimary,
  },
} as const;

// ─── Surfaces (The "Milled Plate" Principle) ─────────────────────

export const Surfaces = {
  /** Base chassis plate — deepest layer */
  chassis: {
    backgroundColor: Colors.carbonFiber,
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: 'rgba(200,220,255,0.06)',
  },

  /** Elevated panel — machined metal surface on chassis */
  panel: {
    backgroundColor: Colors.titaniumDark,
    borderRadius: 16,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(200,230,255,0.12)',
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(0,0,0,0.4)',
  },

  /** Glass overlay — smoked/frosted for interactive controls */
  glass: {
    backgroundColor: 'rgba(20,25,35,0.75)',
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: 'rgba(200,220,255,0.10)',
  },

  /** Active / selected state — Ice Glow tint */
  active: {
    backgroundColor: 'rgba(52,200,255,0.10)',
    borderColor: 'rgba(52,200,255,0.30)',
    borderWidth: 1,
    borderRadius: 16,
  },

  /** Screen background — deepest black */
  screen: {
    backgroundColor: Colors.obsidian,
    flex: 1,
  },
} as const;

// ─── Shadows ─────────────────────────────────────────────────────

export const Shadow = {
  sm: {
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  md: {
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 6,
  },
  /** Ice Glow halo — for active/connected states */
  glow: {
    shadowColor: Colors.electricSky,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  /** Emergency red glow */
  dangerGlow: {
    shadowColor: Colors.danger,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 8,
  },
} as const;

// ─── Spacing (8pt grid) ─────────────────────────────────────────

export const Spacing = {
  /** 4px — micro padding */
  xs: 4,
  /** 8px — tight elements */
  sm: 8,
  /** 12px — inner card padding */
  md: 12,
  /** 16px — standard gap */
  lg: 16,
  /** 20px — section padding */
  xl: 20,
  /** 24px — generous outer margins */
  xxl: 24,
  /** 32px — hero spacing */
  xxxl: 32,
  /** 48px — section separators */
  hero: 48,
} as const;

// ─── Border Radii ────────────────────────────────────────────────

export const Radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 999,
} as const;

// ─── Motion Timing (use with Reanimated) ─────────────────────────

export const Motion = {
  /** Button press scale */
  pressScale: 0.97,
  /** Standard transition */
  duration: {
    fast: 100,
    normal: 200,
    slow: 280,
    breathing: 1500,
  },
  /** Spring configs for Reanimated */
  spring: {
    /** Snappy button response */
    snappy: { damping: 15, stiffness: 200 },
    /** Smooth drawer slide */
    smooth: { damping: 20, stiffness: 120 },
    /** Mic pulse breathing */
    breathing: { damping: 10, stiffness: 40 },
  },
} as const;

// ─── Re-export everything ────────────────────────────────────────

const theme = {
  Colors,
  FontFamily,
  Typography,
  Surfaces,
  Shadow,
  Spacing,
  Radii,
  Motion,
} as const;

export default theme;
