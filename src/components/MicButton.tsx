/**
 * MicButton — voice input with animated Ice Glow pulse.
 *
 * Uses plain React Native Animated (not Reanimated) for Expo Go compatibility.
 * States: idle → listening → processing → idle
 *
 * In Expo Go: records audio but can't do on-device STT.
 * With dev build: swap in @react-native-voice/voice for free device STT.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Pressable, Text, Alert, Animated, Easing } from 'react-native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontFamily, Shadow } from '@/theme';

type MicState = 'idle' | 'listening' | 'processing';

interface MicButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  size?: number;
}

const MAX_RECORD_SECONDS = 15;

export default function MicButton({
  onTranscript,
  disabled = false,
  size = 64,
}: MicButtonProps) {
  const [micState, setMicState] = useState<MicState>('idle');
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Plain RN Animated values
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  // Pulse animation loop
  useEffect(() => {
    if (micState === 'listening') {
      Animated.timing(glowAnim, {
        toValue: 1, duration: 300, useNativeDriver: true,
      }).start();

      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1, duration: 750, easing: Easing.inOut(Easing.ease), useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0, duration: 750, easing: Easing.inOut(Easing.ease), useNativeDriver: true,
          }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      Animated.timing(glowAnim, {
        toValue: 0, duration: 200, useNativeDriver: true,
      }).start();
      pulseAnim.setValue(0);
    }
  }, [micState, pulseAnim, glowAnim]);

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.9, damping: 15, stiffness: 200, useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1, damping: 15, stiffness: 200, useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  const startRecording = useCallback(async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Microphone Access', 'ZeroEffort needs microphone access for voice commands.');
        return;
      }

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();

      recordingRef.current = recording;
      setMicState('listening');
      setRecordingDuration(0);

      timerRef.current = setInterval(() => {
        setRecordingDuration((d) => {
          if (d >= MAX_RECORD_SECONDS) { stopRecording(); return d; }
          return d + 1;
        });
      }, 1000);
    } catch (err) {
      console.error('[MicButton] Start error:', err);
      setMicState('idle');
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    const recording = recordingRef.current;
    if (!recording) { setMicState('idle'); return; }

    setMicState('processing');
    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      recordingRef.current = null;

      // Expo Go fallback — no on-device STT available
      Alert.alert(
        'Voice Recorded',
        `Recorded ${recordingDuration}s. On-device speech recognition requires a development build. Please type your command for now.`,
        [{ text: 'OK', onPress: () => setMicState('idle') }]
      );
    } catch (err) {
      console.error('[MicButton] Stop error:', err);
      setMicState('idle');
    }
  }, [recordingDuration]);

  const handlePress = useCallback(() => {
    if (disabled) return;
    if (micState === 'idle') startRecording();
    else if (micState === 'listening') stopRecording();
  }, [disabled, micState, startRecording, stopRecording]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recordingRef.current) recordingRef.current.stopAndUnloadAsync().catch(() => {});
    };
  }, []);

  const isListening = micState === 'listening';
  const halfSize = size / 2;

  // Interpolations
  const haloScale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.4] });
  const haloOpacity = Animated.multiply(
    pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.35] }),
    glowAnim
  );

  return (
    <View style={[styles.container, { width: size * 1.8, height: size * 1.8 }]}>
      {/* Halo */}
      <Animated.View style={[
        styles.halo,
        { width: size * 1.4, height: size * 1.4, borderRadius: size * 0.7,
          transform: [{ scale: haloScale }], opacity: haloOpacity },
      ]} />

      {/* Button */}
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <Pressable
          onPress={handlePress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          disabled={disabled || micState === 'processing'}
          accessibilityLabel={isListening ? 'Stop recording' : 'Start voice command'}
          accessibilityRole="button"
        >
          <View style={[
            styles.button,
            { width: size, height: size, borderRadius: halfSize },
            disabled && styles.buttonDisabled,
            isListening && styles.buttonActive,
          ]}>
            <Ionicons
              name={isListening ? 'mic' : micState === 'processing' ? 'hourglass-outline' : 'mic-outline'}
              size={size * 0.44}
              color={disabled ? Colors.textTertiary : Colors.electricSky}
            />
          </View>
        </Pressable>
      </Animated.View>

      {isListening && (
        <View style={styles.durationWrap}>
          <View style={styles.recordingDot} />
          <Text style={styles.durationText}>{recordingDuration}s</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', backgroundColor: Colors.electricSky },
  button: {
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(52,200,255,0.25)',
    backgroundColor: 'rgba(52,200,255,0.08)',
    ...Shadow.glow,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonActive: {
    borderColor: 'rgba(52,200,255,0.5)',
    backgroundColor: 'rgba(52,200,255,0.15)',
  },
  durationWrap: {
    position: 'absolute', bottom: 0,
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  recordingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.danger },
  durationText: { fontFamily: FontFamily.monoRegular, fontSize: 11, color: Colors.electricSky },
});
