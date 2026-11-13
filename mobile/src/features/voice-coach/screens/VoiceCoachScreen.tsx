import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Mic, MicOff, Square, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRouteParams } from '../../../app/navigation/NavigationContext';
import { Button } from '../../../shared/components/ui/Button';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import { CoachApi } from '../../ai-coach/services/coach-api';
import { ActionBlock } from '../../ai-coach/components/blocks/ActionBlock';
import { MetricsBlock } from '../../ai-coach/components/blocks/MetricsBlock';
import type { Block, CoachResponse } from '../../ai-coach/types/coach';
import { useVoiceStore } from '../store/voiceStore';
import { voiceCommands } from '../constants/commands';
import { VoiceWaveform } from '../components/VoiceWaveform';
import { useTheme } from '@/hooks/use-theme';

type Phase = 'idle' | 'listening' | 'processing' | 'response' | 'error';

export function VoiceCoachScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { goBack } = useNavigation();
  const params = useRouteParams<{ cmd?: string }>();
  const { micPermission, setMicPermission } = useVoiceStore();
  const [phase, setPhase] = useState<Phase>('idle');
  const [command, setCommand] = useState(params.cmd ?? voiceCommands[0]!);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState<CoachResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleRequestPermission = async () => {
    try {
      const res = await requestRecordingPermissionsAsync();
      setMicPermission(res.granted ? 'granted' : 'denied');
    } catch {
      setMicPermission('denied');
    }
  };

  const askCoach = async (queryText: string) => {
    setErrorMessage(null);
    setResponse(null);
    setTranscript(queryText);
    setPhase('processing');

    try {
      const realResponse = await CoachApi.sendMessage({ message: queryText });
      setResponse(realResponse);
      setPhase('response');
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        err?.message ||
        'Unable to reach AI Coach right now. Please check your network connection.';
      setErrorMessage(msg);
      setPhase('error');
    }
  };

  const listen = () => {
    if (micPermission !== 'granted') {
      void handleRequestPermission();
      return;
    }
    setPhase('listening');
    setTranscript(command);
  };

  const stop = () => {
    setPhase('idle');
    void askCoach(command);
  };

  const updateBlock = (
    id: string,
    status: Extract<Block, { type: 'action' }>['status'],
    resultText?: string
  ) =>
    setResponse(
      (r) =>
        r && {
          ...r,
          blocks: r.blocks?.map((b) =>
            b.type === 'action' && b.id === id ? { ...b, status, resultText } : b
          ),
        }
    );

  const statusText: Record<Phase, string> = {
    idle: 'Tap the mic and speak',
    listening: 'Listening…',
    processing: 'Thinking…',
    response: 'Coach',
    error: 'I didn’t catch that',
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.hero,
          paddingTop: insets.top,
          paddingBottom: Math.max(insets.bottom, 20),
        },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.heroMuted }]}>
          Voice coach
        </Text>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={goBack}
          style={[styles.closeBtn, { backgroundColor: `${colors.heroInk}15` }]}
        >
          <X size={20} color={colors.heroInk} />
        </TouchableOpacity>
      </View>

      {micPermission !== 'granted' ? (
        <View style={styles.permissionBody}>
          <View
            style={[
              styles.permIconWrap,
              { backgroundColor: `${colors.heroInk}15` },
            ]}
          >
            {micPermission === 'denied' ? (
              <MicOff size={32} color={colors.heroInk} />
            ) : (
              <Mic size={32} color={colors.heroInk} />
            )}
          </View>
          <Text style={[styles.permHeading, { color: colors.heroInk }]}>
            {micPermission === 'denied' ? 'Microphone is off' : 'Talk to your coach'}
          </Text>
          <Text style={[styles.permDesc, { color: colors.heroMuted }]}>
            {micPermission === 'denied'
              ? 'Voice needs microphone access. You can turn it on in Settings → OnusFit → Microphone.'
              : 'Log sets mid-workout, add meals hands-free, or ask how you’re doing. Audio is processed for your request only and not stored.'}
          </Text>
          <View style={styles.permButtons}>
            <Button
              size="lg"
              fullWidth
              title={micPermission === 'denied' ? 'Check Microphone Permission' : 'Allow microphone'}
              onPress={handleRequestPermission}
            />
            {micPermission === 'unknown' && (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setMicPermission('denied')}
                style={styles.notNowBtn}
              >
                <Text style={[styles.notNowText, { color: colors.heroMuted }]}>
                  Not now
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ) : (
        <>
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.phaseStatus, { color: colors.heroMuted }]}>
              {statusText[phase]}
            </Text>

            {(phase === 'listening' || phase === 'idle' || phase === 'processing') && (
              <View style={styles.waveformWrap}>
                <VoiceWaveform active={phase === 'listening'} />
                {phase === 'processing' && (
                  <View style={styles.processingRow}>
                    <ActivityIndicator size="small" color={colors.heroMuted} />
                    <Text style={[styles.processingText, { color: colors.heroMuted }]}>
                      Understanding your request
                    </Text>
                  </View>
                )}
              </View>
            )}

            {Boolean(transcript && phase !== 'idle') && (
              <Text style={[styles.transcript, { color: colors.heroInk }]}>
                “{transcript}”
              </Text>
            )}

            {phase === 'error' && (
              <View style={styles.errorWrap}>
                <Text style={[styles.errorMsg, { color: colors.heroMuted }]}>
                  {errorMessage || 'The request could not be completed. Try asking your question again.'}
                </Text>
                <Button
                  title="Try again"
                  onPress={() => askCoach(command)}
                  style={{ marginTop: 20 }}
                />
              </View>
            )}

            {phase === 'response' && response && (
              <View style={styles.responseWrap}>
                <Text style={[styles.responseText, { color: colors.heroInk }]}>
                  {response.text}
                </Text>
                <View style={styles.blocksCol}>
                  {response.blocks?.map((b, i) =>
                    b.type === 'action' ? (
                      <ActionBlock
                        key={b.id}
                        block={b}
                        onStatusChange={(s, t) => updateBlock(b.id, s, t)}
                      />
                    ) : b.type === 'metrics' ? (
                      <MetricsBlock key={i} block={b} />
                    ) : null
                  )}
                </View>
              </View>
            )}
          </ScrollView>

          {/* Bottom commands and mic button */}
          <View style={styles.bottomBar}>
            {(phase === 'idle' || phase === 'response' || phase === 'error') && (
              <View style={styles.commandsWrap}>
                <Text style={[styles.trySaying, { color: colors.heroMuted }]}>
                  Try saying
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.commandChips}
                >
                  {voiceCommands.map((c) => {
                    const isSelected = command === c;
                    return (
                      <TouchableOpacity
                        key={c}
                        activeOpacity={0.7}
                        onPress={() => setCommand(c)}
                        style={[
                          styles.commandChip,
                          {
                            borderColor: isSelected
                              ? colors.highlight
                              : `${colors.heroInk}20`,
                            backgroundColor: isSelected
                              ? `${colors.highlight}20`
                              : 'transparent',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.commandChipText,
                            {
                              color: isSelected ? colors.highlight : colors.heroInk,
                            },
                          ]}
                        >
                          {c}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            <View style={styles.micRow}>
              {phase === 'listening' ? (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={stop}
                  style={[
                    styles.bigMicBtn,
                    { backgroundColor: colors.heroInk },
                  ]}
                >
                  <Square size={24} color={colors.hero} fill={colors.hero} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={listen}
                  disabled={phase === 'processing'}
                  style={[
                    styles.bigMicBtn,
                    {
                      backgroundColor: colors.highlight,
                      opacity: phase === 'processing' ? 0.5 : 1,
                    },
                  ]}
                >
                  <Mic size={30} color={colors.highlightInk} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  permIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permHeading: {
    marginTop: 24,
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
  },
  permDesc: {
    marginTop: 8,
    fontSize: 14.5,
    lineHeight: 22,
    textAlign: 'center',
  },
  permButtons: {
    width: '100%',
    marginTop: 32,
    gap: 10,
  },
  notNowBtn: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notNowText: {
    fontSize: 15,
    fontWeight: '600',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  phaseStatus: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '500',
  },
  waveformWrap: {
    marginTop: 20,
    alignItems: 'center',
  },
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  processingText: {
    fontSize: 13,
  },
  transcript: {
    marginTop: 24,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '600',
    lineHeight: 32,
    letterSpacing: -0.3,
  },
  errorWrap: {
    marginTop: 32,
    alignItems: 'center',
  },
  errorMsg: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  responseWrap: {
    marginTop: 24,
    gap: 16,
  },
  responseText: {
    fontSize: 16,
    lineHeight: 24,
  },
  blocksCol: {
    gap: 12,
  },
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  commandsWrap: {
    marginBottom: 16,
  },
  trySaying: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 8,
  },
  commandChips: {
    gap: 8,
  },
  commandChip: {
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commandChipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  micRow: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 8,
  },
  bigMicBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
});

