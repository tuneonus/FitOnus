import React, { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { ScreenContainer } from '@/components/shared/screen-container';
import { Header } from '@/components/shared/header';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { AuthRepository } from '@/features/auth/api/auth-repository';
import { useAuthStore } from '@/features/auth/stores/auth-store';

const verifySchema = z.object({
  code: z.string().min(6, 'Verification code must be at least 6 characters'),
});

type VerifyRequest = z.infer<typeof verifySchema>;

export default function VerifyEmailScreen() {
  const { colors } = useTheme();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const updateUser = useAuthStore((state) => state.updateUser);

  const { control, handleSubmit } = useForm<VerifyRequest>({
    resolver: zodResolver(verifySchema),
    defaultValues: {
      code: '',
    },
  });

  const onSubmit = async (data: VerifyRequest) => {
    setIsSubmitting(true);
    setGlobalError(null);
    try {
      await AuthRepository.verifyEmail(data.code);
      updateUser({ isEmailVerified: true });
      // The gatekeeper layout might handle navigation to app group, 
      // or we can manually redirect if needed.
    } catch (error: any) {
      setGlobalError(error.message || 'Verification failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    // Call resend API
  };

  return (
    <ScreenContainer>
      <Header showBack onBack={() => router.back()} />
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text variant="displaySmall" style={styles.title}>Verify Email</Text>
            <Text variant="bodyLarge" color="textSecondary" align="center">
              We&apos;ve sent a verification code to your email.
            </Text>
          </View>

          {globalError && (
            <View style={[styles.errorContainer, { backgroundColor: colors.errorLight }]}>
              <Text color="error" variant="bodyMedium">{globalError}</Text>
            </View>
          )}

          <View style={styles.form}>
            <FormInput
              control={control}
              name="code"
              label="Verification Code"
              placeholder="Enter 6-digit code"
              keyboardType="number-pad"
              containerStyle={styles.inputSpacing}
            />

            <Button
              title="Verify"
              onPress={handleSubmit(onSubmit)}
              isLoading={isSubmitting}
              style={styles.submitButton}
            />

            <Button
              title="Resend Code"
              variant="ghost"
              onPress={handleResend}
              style={styles.resendButton}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: Spacing.xl,
  },
  header: {
    marginBottom: Spacing.xxxl,
    alignItems: 'center',
  },
  title: {
    marginBottom: Spacing.sm,
  },
  errorContainer: {
    padding: Spacing.md,
    borderRadius: 8,
    marginBottom: Spacing.lg,
  },
  form: {
    marginBottom: Spacing.xxl,
  },
  inputSpacing: {
    marginBottom: Spacing.lg,
  },
  submitButton: {
    marginTop: Spacing.md,
  },
  resendButton: {
    marginTop: Spacing.md,
  },
});
