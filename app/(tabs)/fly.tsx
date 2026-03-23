/**
 * Fly Screen — live control surface during flight. NOW INTERACTIVE.
 *
 * Shows: camera placeholder → live telemetry → command input → scrollable
 * command timeline → emergency action strip (always visible at bottom).
 *
 * Emergency buttons execute REAL commands through the pipeline.
 */
import { useState, useCallback, useRef } from 'react';
import {
  StyleSheet, Text, View, Pressable, ScrollView,
  TextInput, ActivityIndicator, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SafeScreen from '@/components/SafeScreen';
import { useDrone, type CommandEntry } from '@/store/droneStore';
import {
  Colors, Typography, Surfaces, Shadow, Spacing, Radii, FontFamily,
} from '@/theme';

export default function FlyScreen() {
  const {
    droneState, connectionStatus, commandHistory, isProcessing,
    sendCommand,
  } = useDrone();

  const [input, setInput] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const isConnected = connectionStatus === 'connected';
  const isAirborne = droneState?.is_airborne ?? false;

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isProcessing) return;
    setInput('');
    await sendCommand(text);
  }, [input, isProcessing, sendCommand]);

  const handleEmergency = useCallback(async (command: string) => {
    await sendCommand(command);
  }, [sendCommand]);

  // Battery icon based on level
  const batteryIcon = (): React.ComponentProps<typeof Ionicons>['name'] => {
    if (!droneState) return 'battery-dead-outline';
    const b = droneState.battery_percent;
    if (b > 75) return 'battery-full-outline';
    if (b > 50) return 'battery-half-outline';
    if (b > 20) return 'battery-half-outline';
    return 'battery-dead-outline';
  };

  return (
    <SafeScreen edges={['top', 'left', 'right']} padded={false}>
      {/* ── Camera Feed Placeholder ──────────────────── */}
      <View style={styles.cameraPlaceholder}>
        {isAirborne ? (
          <>
            <Ionicons name="videocam" size={48} color={Colors.electricSky} />
            <Text style={[Typography.bodySmall, { color: Colors.electricSky }]}>
              Camera feed active
            </Text>
            <Text style={[Typography.mono, styles.altitudeDisplay]}>
              {droneState?.altitude_m ?? 0}m
            </Text>
          </>
        ) : isConnected ? (
          <>
            <Ionicons name="videocam-outline" size={48} color={Colors.textTertiary} />
            <Text style={[Typography.bodySmall, styles.cameraText]}>
              Take off to activate camera
            </Text>
          </>
        ) : (
          <>
            <Ionicons name="wifi-outline" size={48} color={Colors.textTertiary} />
            <Text style={[Typography.bodySmall, styles.cameraText]}>
              Connect drone from Home tab
            </Text>
          </>
        )}
      </View>

      {/* ── Status Overlay ──────────────────────────── */}
      <View style={[Surfaces.glass, styles.statusOverlay]}>
        <StatusChip
          icon={batteryIcon()}
          value={droneState ? `${droneState.battery_percent}%` : '--%'}
          warn={droneState ? droneState.battery_percent < 20 : false}
        />
        <StatusChip
          icon="arrow-up-outline"
          value={droneState ? `${droneState.altitude_m}m` : '--m'}
        />
        <StatusChip
          icon="navigate-outline"
          value={droneState ? `${droneState.heading_degrees}°` : '--°'}
        />
        <StatusChip
          icon="speedometer-outline"
          value={droneState ? `${droneState.speed_ms}m/s` : '--'}
        />
      </View>

      {/* ── Airborne indicator ──────────────────────── */}
      {isAirborne && (
        <View style={styles.airborneChip}>
          <View style={styles.airborneDot} />
          <Text style={styles.airborneText}>AIRBORNE</Text>
        </View>
      )}

      {/* ── Command Timeline ───────────────────────── */}
      <View style={styles.timeline}>
        {commandHistory.length === 0 ? (
          <Text style={[Typography.bodySmall, styles.timelineEmpty]}>
            {isConnected ? 'Type a command below to start flying' : 'Connect drone from Home tab'}
          </Text>
        ) : (
          <ScrollView
            ref={scrollRef}
            style={styles.timelineScroll}
            showsVerticalScrollIndicator={false}
          >
            {commandHistory.slice(0, 10).map((entry) => (
              <TimelineEntry key={entry.id} entry={entry} />
            ))}
          </ScrollView>
        )}
      </View>

      {/* ── Command Input Bar ──────────────────────── */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.inputField}
          placeholder={isConnected ? 'Command your drone...' : 'Connect first...'}
          placeholderTextColor={Colors.textTertiary}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          editable={isConnected && !isProcessing}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable
          onPress={handleSend}
          disabled={!input.trim() || isProcessing || !isConnected}
          style={({ pressed }) => [
            styles.sendBtn,
            pressed && { transform: [{ scale: 0.95 }] },
            (!input.trim() || isProcessing || !isConnected) && { opacity: 0.3 },
          ]}
          accessibilityLabel="Send command"
          accessibilityRole="button"
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color={Colors.electricSky} />
          ) : (
            <Ionicons name="send" size={18} color={Colors.electricSky} />
          )}
        </Pressable>
      </View>

      {/* ── Emergency Action Strip (always visible) ── */}
      <View style={styles.emergencyStrip}>
        <EmergencyButton
          icon="pause-outline"
          label="Hover"
          color={Colors.warning}
          onPress={() => handleEmergency('hover')}
          disabled={!isAirborne || isProcessing}
        />
        <EmergencyButton
          icon="arrow-down-outline"
          label="Land"
          color={Colors.warning}
          onPress={() => handleEmergency('land')}
          disabled={!isAirborne || isProcessing}
        />
        <EmergencyButton
          icon="home-outline"
          label="RTH"
          color={Colors.electricSky}
          onPress={() => handleEmergency('return home')}
          disabled={!isAirborne || isProcessing}
        />
        <EmergencyButton
          icon="stop-outline"
          label="STOP"
          color={Colors.danger}
          isStop
          onPress={() => handleEmergency('emergency stop')}
          disabled={!isConnected}
        />
      </View>
    </SafeScreen>
  );
}

// ─── Status Chip ────────────────────────────────────────────────

function StatusChip({
  icon, value, warn = false,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  value: string;
  warn?: boolean;
}) {
  return (
    <View style={styles.statusChip}>
      <Ionicons name={icon} size={14} color={warn ? Colors.warning : Colors.textSecondary} />
      <Text style={[Typography.mono, warn && { color: Colors.warning }]}>{value}</Text>
    </View>
  );
}

// ─── Timeline Entry ─────────────────────────────────────────────

function TimelineEntry({ entry }: { entry: CommandEntry }) {
  const iconName = entry.gateResult === 'pass'
    ? 'checkmark-circle' : entry.gateResult === 'warn'
    ? 'warning' : 'close-circle';

  const iconColor = entry.gateResult === 'pass'
    ? Colors.success : entry.gateResult === 'warn'
    ? Colors.warning : Colors.danger;

  return (
    <View style={styles.timelineEntry}>
      <Ionicons name={iconName as 'checkmark-circle'} size={14} color={iconColor} />
      <View style={styles.timelineContent}>
        <Text style={styles.timelineCommand} numberOfLines={1}>{entry.userInput}</Text>
        <Text style={styles.timelineResponse} numberOfLines={1}>{entry.droneResponse}</Text>
      </View>
      {entry.parsedIntent?.source === 'local' && (
        <View style={styles.localTag}>
          <Text style={styles.localTagText}>LOCAL</Text>
        </View>
      )}
    </View>
  );
}

// ─── Emergency Button ───────────────────────────────────────────

function EmergencyButton({
  icon, label, color, isStop = false, onPress, disabled = false,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  color: string;
  isStop?: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.emergencyButton,
        isStop && styles.emergencyButtonStop,
        pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] },
        disabled && { opacity: 0.3 },
      ]}
      accessibilityLabel={`Emergency: ${label}`}
      accessibilityRole="button"
    >
      <Ionicons name={icon} size={22} color={color} />
      <Text style={[styles.emergencyLabel, { color }, isStop && styles.emergencyLabelStop]}>
        {label}
      </Text>
    </Pressable>
  );
}

// ─── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Camera
  cameraPlaceholder: {
    flex: 1, minHeight: 200,
    backgroundColor: Colors.pitchBlack,
    alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
  },
  cameraText: { color: Colors.textTertiary },
  altitudeDisplay: { fontSize: 48, color: Colors.electricSky, marginTop: Spacing.sm },

  // Status overlay
  statusOverlay: {
    position: 'absolute', top: 50, left: Spacing.lg, right: Spacing.lg,
    flexDirection: 'row', justifyContent: 'space-around',
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md,
  },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },

  // Airborne chip
  airborneChip: {
    position: 'absolute', top: 95, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(52,199,89,0.15)', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 4,
  },
  airborneDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success,
  },
  airborneText: {
    fontFamily: FontFamily.monoRegular, fontSize: 10,
    color: Colors.success, letterSpacing: 1,
  },

  // Timeline
  timeline: {
    backgroundColor: Colors.carbonFiber, maxHeight: 180,
    borderTopWidth: 0.5, borderTopColor: 'rgba(200,220,255,0.06)',
  },
  timelineScroll: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  timelineEmpty: { textAlign: 'center', color: Colors.textTertiary, paddingVertical: Spacing.xl },
  timelineEntry: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 0.5, borderBottomColor: 'rgba(200,220,255,0.04)',
  },
  timelineContent: { flex: 1 },
  timelineCommand: {
    fontFamily: FontFamily.bodyRegular, fontSize: 13, color: Colors.textPrimary,
  },
  timelineResponse: {
    fontFamily: FontFamily.bodyRegular, fontSize: 11, color: Colors.textTertiary, marginTop: 1,
  },
  localTag: {
    backgroundColor: 'rgba(52,200,255,0.12)', borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  localTagText: {
    fontFamily: FontFamily.monoRegular, fontSize: 7,
    color: Colors.electricSky, letterSpacing: 0.5,
  },

  // Input bar
  inputBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.obsidian,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
    borderTopWidth: 0.5, borderTopColor: 'rgba(200,220,255,0.06)',
    gap: Spacing.sm,
  },
  inputField: {
    flex: 1, fontFamily: FontFamily.bodyRegular, fontSize: 14,
    color: Colors.textPrimary, backgroundColor: Colors.carbonFiber,
    borderRadius: Radii.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(52,200,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Emergency strip
  emergencyStrip: {
    flexDirection: 'row', backgroundColor: Colors.obsidian,
    borderTopWidth: 0.5, borderTopColor: 'rgba(255,59,48,0.15)',
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg,
    justifyContent: 'space-around',
    paddingBottom: Platform.OS === 'ios' ? Spacing.xxl : Spacing.md,
  },
  emergencyButton: {
    alignItems: 'center', justifyContent: 'center', gap: Spacing.xs,
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md,
    borderRadius: Radii.md, backgroundColor: 'rgba(255,255,255,0.04)',
  },
  emergencyButtonStop: {
    backgroundColor: 'rgba(255,59,48,0.12)', ...Shadow.dangerGlow,
  },
  emergencyLabel: {
    fontFamily: FontFamily.headingSemiBold, fontSize: 9,
    letterSpacing: 0.8, textTransform: 'uppercase',
  },
  emergencyLabelStop: { fontFamily: FontFamily.displayBold },
});
