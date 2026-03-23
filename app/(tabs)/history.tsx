/**
 * History Screen — flight timeline, saved commands, stats. NOW WIRED.
 *
 * Shows all past commands with full details, stats summary,
 * and the ability to re-run successful commands.
 */
import { useCallback } from 'react';
import { StyleSheet, Text, View, Pressable, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SafeScreen from '@/components/SafeScreen';
import { useDrone, type CommandEntry } from '@/store/droneStore';
import { useRouter } from 'expo-router';
import {
  Colors, Typography, Surfaces, Shadow, Spacing, Radii, FontFamily,
} from '@/theme';

export default function HistoryScreen() {
  const { commandHistory, sendCommand, isProcessing, connectionStatus } = useDrone();
  const router = useRouter();
  const isConnected = connectionStatus === 'connected';

  // Stats
  const totalCommands = commandHistory.length;
  const successCount = commandHistory.filter((e) => e.gateResult === 'pass' && e.executed).length;
  const blockedCount = commandHistory.filter((e) => e.gateResult === 'block').length;
  const photoCount = commandHistory.filter(
    (e) => e.parsedIntent?.intent === 'capture_photo' && e.executed
  ).length;

  const handleRerun = useCallback(async (command: string) => {
    if (isProcessing || !isConnected) return;
    await sendCommand(command);
  }, [isProcessing, isConnected, sendCommand]);

  return (
    <SafeScreen>
      {/* ── Header ────────────────────────────────────── */}
      <View style={styles.header}>
        <Text style={Typography.label}>FLIGHT LOG</Text>
        <Text style={[Typography.h1, styles.title]}>History</Text>
      </View>

      {commandHistory.length === 0 ? (
        /* ── Empty State ───────────────────────────────── */
        <View style={styles.emptyContainer}>
          <View style={[Surfaces.panel, Shadow.sm, styles.emptyCard]}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="time-outline" size={48} color={Colors.textTertiary} />
            </View>
            <Text style={[Typography.h2, styles.emptyTitle]}>No flights yet</Text>
            <Text style={[Typography.bodySmall, styles.emptyBody]}>
              Your flight history, saved commands, and shot recipes will appear
              here. Every flight tells a story.
            </Text>
            <Pressable
              onPress={() => router.navigate('/')}
              style={({ pressed }) => [styles.ctaButton, pressed && styles.ctaButtonPressed]}
              accessibilityLabel="Start your first flight"
              accessibilityRole="button"
            >
              <Ionicons name="paper-plane-outline" size={18} color={Colors.obsidian} />
              <Text style={styles.ctaText}>Start Flying</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          {/* ── Stats Bar ──────────────────────────────── */}
          <View style={[Surfaces.panel, Shadow.sm, styles.statsBar]}>
            <StatTile label="COMMANDS" value={`${totalCommands}`} />
            <StatTile label="EXECUTED" value={`${successCount}`} color={Colors.success} />
            <StatTile label="BLOCKED" value={`${blockedCount}`} color={blockedCount > 0 ? Colors.danger : undefined} />
            <StatTile label="PHOTOS" value={`${photoCount}`} color={Colors.electricSky} />
          </View>

          {/* ── Command Timeline ───────────────────────── */}
          <FlatList
            data={commandHistory}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <HistoryCard
                entry={item}
                onRerun={handleRerun}
                canRerun={isConnected && !isProcessing && item.gateResult === 'pass'}
              />
            )}
          />
        </>
      )}
    </SafeScreen>
  );
}

// ─── Stat Tile ──────────────────────────────────────────────────

function StatTile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.statTile}>
      <Text style={[Typography.label, styles.statLabel]}>{label}</Text>
      <Text style={[Typography.monoLarge, color ? { color } : undefined]}>{value}</Text>
    </View>
  );
}

// ─── History Card ───────────────────────────────────────────────

function HistoryCard({
  entry, onRerun, canRerun,
}: {
  entry: CommandEntry;
  onRerun: (command: string) => void;
  canRerun: boolean;
}) {
  const iconName = entry.gateResult === 'pass'
    ? 'checkmark-circle' : entry.gateResult === 'warn'
    ? 'warning' : 'close-circle';

  const iconColor = entry.gateResult === 'pass'
    ? Colors.success : entry.gateResult === 'warn'
    ? Colors.warning : Colors.danger;

  const time = new Date(entry.timestamp).toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  return (
    <View style={[Surfaces.chassis, styles.historyCard]}>
      <View style={styles.cardHeader}>
        <Ionicons name={iconName as 'checkmark-circle'} size={16} color={iconColor} />
        <Text style={styles.cardCommand} numberOfLines={1}>{entry.userInput}</Text>
        {entry.parsedIntent?.source === 'local' && (
          <View style={styles.localBadge}>
            <Text style={styles.localBadgeText}>LOCAL</Text>
          </View>
        )}
        {entry.parsedIntent?.source === 'cloud' && (
          <View style={styles.cloudBadge}>
            <Text style={styles.cloudBadgeText}>CLOUD</Text>
          </View>
        )}
      </View>

      <Text style={styles.cardResponse} numberOfLines={2}>
        {entry.droneResponse}
      </Text>

      <View style={styles.cardFooter}>
        <Text style={styles.cardTime}>{time}</Text>
        {entry.parsedIntent?.intent && (
          <Text style={styles.cardIntent}>{entry.parsedIntent.intent}</Text>
        )}
        {canRerun && (
          <Pressable
            onPress={() => onRerun(entry.userInput)}
            style={({ pressed }) => [styles.rerunBtn, pressed && { opacity: 0.7 }]}
            accessibilityLabel={`Rerun: ${entry.userInput}`}
          >
            <Ionicons name="refresh-outline" size={12} color={Colors.electricSky} />
            <Text style={styles.rerunText}>Rerun</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: { marginTop: Spacing.lg, marginBottom: Spacing.xxl },
  title: { marginTop: Spacing.xs },

  // Empty
  emptyContainer: { flex: 1, justifyContent: 'center', paddingBottom: Spacing.hero },
  emptyCard: { padding: Spacing.xxxl, alignItems: 'center', gap: Spacing.lg },
  emptyIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm,
  },
  emptyTitle: { color: Colors.textSecondary },
  emptyBody: {
    textAlign: 'center', lineHeight: 22,
    color: Colors.textTertiary, paddingHorizontal: Spacing.lg,
  },
  ctaButton: {
    marginTop: Spacing.md, backgroundColor: Colors.electricSky,
    borderRadius: Radii.md, paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xxl, flexDirection: 'row',
    alignItems: 'center', gap: Spacing.sm,
  },
  ctaButtonPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  ctaText: { fontFamily: FontFamily.headingSemiBold, fontSize: 14, color: Colors.obsidian },

  // Stats
  statsBar: {
    flexDirection: 'row', justifyContent: 'space-around',
    padding: Spacing.lg, marginBottom: Spacing.xl,
  },
  statTile: { alignItems: 'center', gap: Spacing.xs },
  statLabel: { color: Colors.textTertiary },

  // List
  listContent: { paddingBottom: Spacing.hero },

  // Card
  historyCard: { padding: Spacing.md, marginBottom: Spacing.sm },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xs,
  },
  cardCommand: {
    flex: 1, fontFamily: FontFamily.bodyMedium, fontSize: 14, color: Colors.textPrimary,
  },
  localBadge: {
    backgroundColor: 'rgba(52,200,255,0.12)', borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 1,
  },
  localBadgeText: {
    fontFamily: FontFamily.monoRegular, fontSize: 8,
    color: Colors.electricSky, letterSpacing: 0.5,
  },
  cloudBadge: {
    backgroundColor: 'rgba(155,231,255,0.08)', borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 1,
  },
  cloudBadgeText: {
    fontFamily: FontFamily.monoRegular, fontSize: 8,
    color: Colors.iceGlow, letterSpacing: 0.5,
  },
  cardResponse: {
    fontFamily: FontFamily.bodyRegular, fontSize: 13,
    color: Colors.textTertiary, marginLeft: 24, marginBottom: Spacing.sm,
  },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginLeft: 24 },
  cardTime: {
    fontFamily: FontFamily.monoRegular, fontSize: 10, color: Colors.textTertiary,
  },
  cardIntent: {
    fontFamily: FontFamily.monoRegular, fontSize: 10,
    color: Colors.textTertiary, flex: 1,
  },
  rerunBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(52,200,255,0.08)', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  rerunText: {
    fontFamily: FontFamily.headingSemiBold, fontSize: 10, color: Colors.electricSky,
  },
});
