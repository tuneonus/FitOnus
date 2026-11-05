import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { ArrowUp, Mic } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';

type ComposerProps = {
  onSend: (text: string) => void;
  onVoice: () => void;
  disabled?: boolean;
};

export function Composer({ onSend, onVoice, disabled }: ComposerProps) {
  const { colors } = useTheme();
  const [value, setValue] = useState('');

  const submit = () => {
    if (!value.trim() || disabled) return;
    onSend(value);
    setValue('');
  };

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: colors.surface,
            borderColor: colors.line,
          },
        ]}
      >
        <TextInput
          value={value}
          onChangeText={setValue}
          placeholder="Ask about sleep, meals, training…"
          placeholderTextColor={colors.muted}
          style={[styles.input, { color: colors.ink }]}
          returnKeyType="send"
          onSubmitEditing={submit}
        />

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onVoice}
          style={styles.voiceButton}
        >
          <Mic size={19} color={colors.ink} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        activeOpacity={0.8}
        onPress={submit}
        disabled={!canSend}
        style={[
          styles.sendButton,
          {
            backgroundColor: colors.accent,
            opacity: canSend ? 1 : 0.35,
          },
        ]}
      >
        <ArrowUp size={21} strokeWidth={2.4} color={colors.accentInk} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  inputContainer: {
    flex: 1,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 26,
    borderWidth: 1,
    paddingLeft: 16,
    paddingRight: 6,
  },
  input: {
    flex: 1,
    height: 50,
    fontSize: 15,
  },
  voiceButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

