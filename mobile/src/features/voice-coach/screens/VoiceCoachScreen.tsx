import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Mic, MicOff, Square, Volume2, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRouteParams } from '../../../app/navigation/NavigationContext';
import { Button } from '../../../shared/components/ui/Button';
import {
  requestRecordingPermissionsAsync,
  useAudioRecorder,
  RecordingPresets,
  setAudioModeAsync,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { CoachApi } from '../../ai-coach/services/coach-api';
import { speechService } from '../../ai-coach/services/speech-service';
import { useCoachStore } from '../../ai-coach/store/coachStore';
import { ActionBlock } from '../../ai-coach/components/blocks/ActionBlock';
import { MetricsBlock } from '../../ai-coach/components/blocks/MetricsBlock';
import type { Block, CoachResponse } from '../../ai-coach/types/coach';
import { useVoiceStore } from '../store/voiceStore';
import { voiceCommands } from '../constants/commands';
import { VoiceWaveform } from '../components/VoiceWaveform';
import { useTheme } from '@/hooks/use-theme';
import { normalizeMobileApiError } from '@/services/error-normalizer';

type Phase = 'idle' | 'listening' | 'processing' | 'response' | 'error';

export function VoiceCoachScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { goBack } = useNavigation();
  const params = useRouteParams<{ cmd?: string }>();
  const { micPermission, setMicPermission } = useVoiceStore();
  const addCompletedTurn = useCoachStore((s) => s.addCompletedTurn);
  const conversationId = useCoachStore((s) => s.conversationId);

  const [phase, setPhase] = useState<Phase>('idle');
  const [command, setCommand] = useState(params.cmd ?? voiceCommands[0]!);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState<CoachResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const sentParam = useRef(false);

  // Stop recording, speech and reset audio mode when unmounting
  useEffect(() => {
    return () => {
      if (recorder.isRecording) {
        void recorder.stop();
      }
      void speechService.stop();
      void setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });
    };
  }, [recorder]);

  const handleRequestPermission = async () => {
    try {
      const res = await requestRecordingPermissionsAsync();
      setMicPermission(res.granted ? 'granted' : 'denied');
      return res.granted;
    } catch {
      setMicPermission('denied');
      return false;
    }
  };

  const handleClose = async () => {
    if (recorder.isRecording) {
      await recorder.stop();
    }
    await speechService.stop();
    goBack();
  };

  const askCoach = async (queryText: string) => {
    setErrorMessage(null);
    setResponse(null);
    setTranscript(queryText);
    setPhase('processing');
    void speechService.stop();
    setIsSpeaking(false);

    try {
      const currentConvoId = conversationId ?? undefined;
      const realResponse = await CoachApi.sendMessage({
        message: queryText,
        conversationId: currentConvoId,
      });
      setResponse(realResponse);
      addCompletedTurn(queryText, realResponse);
      setPhase('response');

      // Voice conversation mode: automatically read aloud the assistant's reply
      if (realResponse.text) {
        setIsSpeaking(true);
        void speechService.speak('voice-response', realResponse.text, {
          onDone: () => setIsSpeaking(false),
          onError: () => setIsSpeaking(false),
        });
      }
    } catch (err: any) {
      const normalized = normalizeMobileApiError(
        err,
        'Unable to reach AI Coach right now. Please check your network connection.'
      );
      setErrorMessage(normalized.userMessage);
      setPhase('error');
    }
  };

  // If a command param was passed, trigger it once
  useEffect(() => {
    if (params.cmd && !sentParam.current) {
      sentParam.current = true;
      setCommand(params.cmd);
      void askCoach(params.cmd);
    }
  }, [params.cmd]);

  const toggleAssistantSpeech = async () => {
    if (!response?.text) return;
    if (isSpeaking) {
      await speechService.stop();
      setIsSpeaking(false);
    } else {
      setIsSpeaking(true);
      await speechService.speak('voice-response', response.text, {
        onDone: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false),
      });
    }
  };

  const listen = async () => {
    let granted = micPermission === 'granted';
    if (!granted) {
      granted = await handleRequestPermission();
      if (!granted) return;
    }

    void speechService.stop();
    setIsSpeaking(false);
    setErrorMessage(null);

    try {
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setPhase('listening');
      setTranscript('');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Could not start microphone recording.');
      setPhase('error');
    }
  };

  const stop = async () => {
    setPhase('processing');
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) {
        setPhase('idle');
        return;
      }

      const file = new File(uri);
      const base64 = await file.base64();
      if (!base64) {
        setErrorMessage('Voice recording was empty. Please try speaking again.');
        setPhase('error');
        return;
      }

      const result = await CoachApi.transcribeAudio({
        mimeType: 'audio/m4a',
        base64,
      });

      const heardText = result.transcript?.trim();
      if (!heardText) {
        setErrorMessage("We couldn't hear any speech. Please try speaking again.");
        setPhase('error');
        return;
      }

      setTranscript(heardText);
      await askCoach(heardText);
    } catch (err: any) {
      const normalized = normalizeMobileApiError(
        err,
        'Could not transcribe voice audio. Please try again.'
      );
      setErrorMessage(normalized.userMessage);
      setPhase('error');
    }
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
    processing: 'Understanding your request…',
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
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="Close voice coach"
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
                  onPress={() => {
                    if (transcript) {
                      void askCoach(transcript);
                    } else {
                      void listen();
                    }
                  }}
                  style={{ marginTop: 20 }}
                />
              </View>
            )}

            {phase === 'response' && response && (
              <View style={styles.responseWrap}>
                <View style={styles.responseHeaderRow}>
                  <Text style={[styles.responseRole, { color: colors.heroMuted }]}>
                    AI Coach
                  </Text>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={toggleAssistantSpeech}
                    accessibilityRole="button"
                    accessibilityLabel={isSpeaking ? 'Stop speaking' : 'Read aloud'}
                    style={[
                      styles.speakerBtn,
                      {
                        backgroundColor: isSpeaking
                          ? `${colors.highlight}30`
                          : `${colors.heroInk}15`,
                      },
                    ]}
                  >
                    {isSpeaking ? (
                      <Square size={16} color={colors.highlight} fill={colors.highlight} />
                    ) : (
                      <Volume2 size={16} color={colors.heroInk} />
                    )}
                  </TouchableOpacity>
                </View>
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
                        onPress={() => {
                          setCommand(c);
                          void askCoach(c);
                        }}
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
                  accessibilityRole="button"
                  accessibilityLabel="Stop recording and send"
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
                  accessibilityRole="button"
                  accessibilityLabel="Start voice recording"
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
  responseHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  responseRole: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  speakerBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
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
