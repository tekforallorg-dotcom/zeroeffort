/**
 * Home Screen — the emotional dock. NOW INTERACTIVE.
 *
 * Shows: live drone status → working prompt input → quick shot cards.
 * Commands flow through the full pipeline: parse → safety → execute.
 * "Talk to your drone. Get the shot."
 */
import { useState, useCallback } from 'react';
import {
  StyleSheet, Text, View, Pressable, ScrollView,
  TextInput, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SafeScreen from '@/components/SafeScreen';
import MicButton from '@/components/MicButton';
import { useDrone, type CommandEntry } from '@/store/droneStore';
import { useAuth } from '@/lib/auth';
import {
  Colors, Typography, Surfaces, Shadow, Spacing, Radii, FontFamily,
} from '@/theme';

// ─── Quick Shot presets ────────────────────────────────────────

const QUICK_SHOTS = [
  { id: 'orbit', label: 'Orbit Me', icon: 'sync-outline' as const, command: 'orbit me slowly' },
  { id: 'reveal', label: 'Rise & Reveal', icon: 'arrow-up-outline' as const, command: 'do a reveal shot' },
  { id: 'selfie', label: 'Selfie', icon: 'camera-outline' as const, command: 'take off, take a photo, and land' },
  { id: 'circle', label: 'Slow Circle', icon: 'refresh-outline' as const, command: 'fly in a slow circle around me' },
  { id: 'pullback', label: 'Pull Back', icon: 'return-down-back-outline' as const, command: 'pull back shot' },
] as const;

export default function HomeScreen() {
  const {
    droneState, connectionStatus, commandHistory, isProcessing,
    connectDrone, disconnectDrone, sendCommand, confirmAndExecute,
  } = useDrone();
  const { user, signOut } = useAuth();

  const [input, setInput] = useState('');
  const [pendingWarn, setPendingWarn] = useState<CommandEntry | null>(null);
  const isConnected = connectionStatus === 'connected';

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isProcessing) return;
    setInput('');

    const entry = await sendCommand(text);
    if (entry.gateResult === 'warn') {
      setPendingWarn(entry);
    }
  }, [input, isProcessing, sendCommand]);

  const handleQuickShot = useCallback(async (command: string) => {
    if (isProcessing) return;
    const entry = await sendCommand(command);
    if (entry.gateResult === 'warn') {
      setPendingWarn(entry);
    }
  }, [isProcessing, sendCommand]);

  const handleConfirm = useCallback(async () => {
    if (!pendingWarn) return;
    await confirmAndExecute(pendingWarn);
    setPendingWarn(null);
  }, [pendingWarn, confirmAndExecute]);

  const handleDismiss = useCallback(() => {
    setPendingWarn(null);
  }, []);

  const handleConnect = useCallback(async () => {
    if (isConnected) {
      await disconnectDrone();
    } else {
      await connectDrone();
    }
  }, [isConnected, connectDrone, disconnectDrone]);

  return (
    <SafeScreen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Header ──────────────────────────────────── */}
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <Text style={Typography.label}>ZEROEFFORT</Text>
              <Pressable onPress={signOut} style={styles.logoutBtn} accessibilityLabel="Sign out">
                <Ionicons name="log-out-outline" size={18} color={Colors.textTertiary} />
              </Pressable>
            </View>
            <Text style={[Typography.display, styles.title]}>
              {isConnected ? 'Ready to Fly' : 'Connect to Start'}
            </Text>
            {user?.email && (
              <Text style={[Typography.bodySmall, styles.userEmail]}>{user.email}</Text>
            )}
          </View>

          {/* ── Drone Status Module ────────────────────── */}
          <View style={[Surfaces.panel, Shadow.sm, styles.statusCard]}>
            <View style={styles.statusRow}>
              <View style={[
                styles.statusDot,
                isConnected && styles.statusDotConnected,
                connectionStatus === 'connecting' && styles.statusDotConnecting,
              ]} />
              <Text style={[Typography.h3, styles.statusText]}>
                {connectionStatus === 'connecting' ? 'Connecting...'
                  : isConnected ? 'Mock Drone Connected'
                  : 'No drone connected'}
              </Text>
            </View>
            <View style={styles.hudRow}>
              <HudTile label="BAT" value={droneState ? `${droneState.battery_percent}%` : '--%'} warn={droneState ? droneState.battery_percent < 20 : false} />
              <HudTile label="ALT" value={droneState ? `${droneState.altitude_m}m` : '--m'} />
              <HudTile label="GPS" value={droneState ? `${droneState.gps_satellites}` : '--'} />
              <HudTile label="SIG" value={droneState ? `${droneState.signal_strength}` : '--'} />
            </View>
          </View>

          {/* ── Prompt Input ────────────────────────────── */}
          <View style={[Surfaces.glass, Shadow.md, styles.promptContainer]}>
            <TextInput
              style={styles.promptInput}
              placeholder="Tell your drone what to do..."
              placeholderTextColor={Colors.textTertiary}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={handleSend}
              returnKeyType="send"
              editable={!isProcessing}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable
              onPress={handleSend}
              disabled={!input.trim() || isProcessing}
              style={({ pressed }) => [
                styles.sendButton,
                pressed && styles.sendButtonPressed,
                (!input.trim() || isProcessing) && styles.sendButtonDisabled,
              ]}
              accessibilityLabel="Send command"
              accessibilityRole="button"
            >
              {isProcessing ? (
                <ActivityIndicator size="small" color={Colors.electricSky} />
              ) : (
                <Ionicons name="send" size={20} color={
                  input.trim() ? Colors.electricSky : Colors.textTertiary
                } />
              )}
            </Pressable>
          </View>

          {/* ── Voice Input (Mic Button) ─────────────────── */}
          <View style={styles.micSection}>
            <MicButton
              onTranscript={(text) => {
                setInput(text);
                // Auto-send after voice transcript
                sendCommand(text);
              }}
              disabled={isProcessing}
              size={56}
            />
          </View>

          {/* ── Warning Confirmation ────────────────────── */}
          {pendingWarn && (
            <View style={[Surfaces.panel, styles.warnCard]}>
              <View style={styles.warnHeader}>
                <Ionicons name="warning-outline" size={20} color={Colors.warning} />
                <Text style={[Typography.h3, styles.warnTitle]}>Confirmation Needed</Text>
              </View>
              <Text style={[Typography.bodySmall, styles.warnText]}>
                {pendingWarn.gateReason}
              </Text>
              <View style={styles.warnActions}>
                <Pressable onPress={handleDismiss} style={styles.warnCancel}>
                  <Text style={styles.warnCancelText}>Cancel</Text>
                </Pressable>
                <Pressable onPress={handleConfirm} style={styles.warnConfirm}>
                  <Text style={styles.warnConfirmText}>Continue</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* ── Quick Shots ────────────────────────────── */}
          <View style={styles.quickShotsSection}>
            <Text style={[Typography.label, styles.sectionLabel]}>QUICK SHOTS</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickShotsList}
            >
              {QUICK_SHOTS.map((shot) => (
                <Pressable
                  key={shot.id}
                  onPress={() => handleQuickShot(shot.command)}
                  disabled={isProcessing}
                  style={({ pressed }) => [
                    Surfaces.chassis, styles.quickShotCard,
                    pressed && Surfaces.active,
                  ]}
                  accessibilityLabel={`Quick shot: ${shot.label}`}
                  accessibilityRole="button"
                >
                  <Ionicons name={shot.icon} size={24} color={Colors.textSecondary} />
                  <Text style={styles.quickShotLabel}>{shot.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {/* ── Command History ─────────────────────────── */}
          {commandHistory.length > 0 && (
            <View style={styles.historySection}>
              <Text style={[Typography.label, styles.sectionLabel]}>RECENT COMMANDS</Text>
              {commandHistory.slice(0, 5).map((entry) => (
                <CommandCard key={entry.id} entry={entry} />
              ))}
            </View>
          )}

          {/* ── Connect Button ─────────────────────────── */}
          <Pressable
            onPress={handleConnect}
            disabled={connectionStatus === 'connecting'}
            style={({ pressed }) => [
              styles.connectButton,
              isConnected && styles.connectButtonDisconnect,
              pressed && styles.connectButtonPressed,
            ]}
            accessibilityLabel={isConnected ? 'Disconnect drone' : 'Connect your drone'}
            accessibilityRole="button"
          >
            {connectionStatus === 'connecting' ? (
              <ActivityIndicator size="small" color={Colors.obsidian} />
            ) : (
              <Ionicons
                name={isConnected ? 'close-outline' : 'wifi-outline'}
                size={20}
                color={isConnected ? Colors.textPrimary : Colors.obsidian}
              />
            )}
            <Text style={[
              styles.connectButtonText,
              isConnected && styles.connectButtonTextDisconnect,
            ]}>
              {connectionStatus === 'connecting' ? 'Connecting...'
                : isConnected ? 'Disconnect'
                : 'Connect Drone'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeScreen>
  );
}

// ─── HUD Tile ──────────────────────────────────────────────────

function HudTile({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <View style={styles.hudTile}>
      <Text style={[Typography.label, styles.hudLabel]}>{label}</Text>
      <Text style={[Typography.mono, warn && { color: Colors.warning }]}>{value}</Text>
    </View>
  );
}

// ─── Command Card ──────────────────────────────────────────────

function CommandCard({ entry }: { entry: CommandEntry }) {
  const iconName = entry.gateResult === 'pass'
    ? 'checkmark-circle-outline'
    : entry.gateResult === 'warn'
    ? 'warning-outline'
    : 'close-circle-outline';

  const iconColor = entry.gateResult === 'pass'
    ? Colors.success
    : entry.gateResult === 'warn'
    ? Colors.warning
    : Colors.danger;

  return (
    <View style={[Surfaces.chassis, styles.commandCard]}>
      <View style={styles.commandHeader}>
        <Ionicons name={iconName as 'checkmark-circle-outline'} size={16} color={iconColor} />
        <Text style={[Typography.bodySmall, styles.commandInput]} numberOfLines={1}>
          {entry.userInput}
        </Text>
        {entry.parsedIntent?.source === 'local' && (
          <View style={styles.localBadge}>
            <Text style={styles.localBadgeText}>LOCAL</Text>
          </View>
        )}
      </View>
      <Text style={[Typography.bodySmall, styles.commandResponse]} numberOfLines={2}>
        {entry.droneResponse}
      </Text>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingBottom: Spacing.hero },
  header: { marginTop: Spacing.lg, marginBottom: Spacing.xxl },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logoutBtn: { padding: Spacing.sm },
  userEmail: { color: Colors.textTertiary, marginTop: Spacing.xs },
  title: { marginTop: Spacing.xs },

  // Status
  statusCard: { padding: Spacing.lg, marginBottom: Spacing.xxl },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.textTertiary, marginRight: Spacing.sm },
  statusDotConnected: { backgroundColor: Colors.success },
  statusDotConnecting: { backgroundColor: Colors.warning },
  statusText: { color: Colors.textSecondary },
  hudRow: { flexDirection: 'row', justifyContent: 'space-between' },
  hudTile: { alignItems: 'center', gap: Spacing.xs },
  hudLabel: { color: Colors.textTertiary },

  // Prompt
  promptContainer: {
    padding: Spacing.md, paddingLeft: Spacing.lg,
    flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.xxl,
  },
  promptInput: {
    flex: 1, fontFamily: FontFamily.bodyRegular, fontSize: 15,
    color: Colors.textPrimary, paddingVertical: Spacing.sm,
  },
  sendButton: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(52,200,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    marginLeft: Spacing.sm,
  },
  sendButtonPressed: { transform: [{ scale: 0.95 }] },
  sendButtonDisabled: { opacity: 0.4 },

  // Mic
  micSection: {
    alignItems: 'center', marginBottom: Spacing.xxl,
  },

  // Warning
  warnCard: {
    padding: Spacing.lg, marginBottom: Spacing.xxl,
    borderWidth: 1, borderColor: Colors.warningGlow,
  },
  warnHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  warnTitle: { color: Colors.warning },
  warnText: { color: Colors.textSecondary, marginBottom: Spacing.md },
  warnActions: { flexDirection: 'row', gap: Spacing.md, justifyContent: 'flex-end' },
  warnCancel: {
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg,
    borderRadius: Radii.md, backgroundColor: 'rgba(255,255,255,0.06)',
  },
  warnCancelText: { fontFamily: FontFamily.headingSemiBold, fontSize: 13, color: Colors.textSecondary },
  warnConfirm: {
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg,
    borderRadius: Radii.md, backgroundColor: Colors.warning,
  },
  warnConfirmText: { fontFamily: FontFamily.headingSemiBold, fontSize: 13, color: Colors.obsidian },

  // Quick shots
  quickShotsSection: { marginBottom: Spacing.xxl },
  sectionLabel: { marginBottom: Spacing.md },
  quickShotsList: { gap: Spacing.md },
  quickShotCard: {
    width: 96, height: 88, alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, padding: Spacing.md,
  },
  quickShotLabel: {
    fontFamily: FontFamily.headingSemiBold, fontSize: 10,
    letterSpacing: 0.4, color: Colors.textSecondary, textAlign: 'center',
  },

  // History
  historySection: { marginBottom: Spacing.xxl },
  commandCard: { padding: Spacing.md, marginBottom: Spacing.sm },
  commandHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xs },
  commandInput: { flex: 1, color: Colors.textPrimary },
  commandResponse: { color: Colors.textTertiary, marginLeft: 24 },
  localBadge: {
    backgroundColor: 'rgba(52,200,255,0.12)', borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 1,
  },
  localBadgeText: {
    fontFamily: FontFamily.monoRegular, fontSize: 8,
    color: Colors.electricSky, letterSpacing: 0.5,
  },

  // Connect
  connectButton: {
    backgroundColor: Colors.electricSky, borderRadius: Radii.lg,
    paddingVertical: Spacing.lg, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
  },
  connectButtonDisconnect: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  connectButtonPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  connectButtonText: {
    fontFamily: FontFamily.headingSemiBold, fontSize: 16,
    color: Colors.obsidian, letterSpacing: -0.2,
  },
  connectButtonTextDisconnect: { color: Colors.textSecondary },
});
