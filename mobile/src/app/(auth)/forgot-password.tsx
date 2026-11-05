import React, { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { ScreenContainer } from '@/components/shared/screen-container';
import { Header } from '@/components/shared/header';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { AuthService } from '@/features/auth/services/auth-service';
import { forgotPasswordSchema } from '@/features/auth/utils/auth-schemas';
import { ForgotPasswordRequest, AuthRepository } from '@/features/auth/api/auth-repository';

export default function ForgotPasswordScreen() {
  const { colors } = useTheme();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const { control, handleSubmit } = useForm<ForgotPasswordRequest>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: '',
    },
  });

  const onSubmit = async (data: ForgotPasswordRequest) => {
    setIsSubmitting(true);
    setGlobalError(null);
    try {
      await AuthRepository.forgotPassword(data);
      setIsSuccess(true);
    } catch (error: any) {
      setGlobalError(error.message || 'Failed to send reset link. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <ScreenContainer>
        <Header showBack onBack={() => router.back()} />
        <View style={styles.successContainer}>
          <Text variant="displaySmall" style={styles.title} align="center">Check Your Email</Text>
          <Text variant="bodyLarge" color="textSecondary" align="center" style={styles.successMessage}>
            We have sent a password reset link to your email address.
          </Text>
          <Button
            title="Back to Login"
            onPress={() => router.back()}
            style={styles.submitButton}
          />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Header showBack onBack={() => router.back()} />
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text variant="displaySmall" style={styles.title}>Forgot Password</Text>
            <Text variant="bodyLarge" color="textSecondary" align="center">
              Enter your email address and we&apos;ll send you a link to reset your password.
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
              name="email"
              label="Email"
              placeholder="Enter your email"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              containerStyle={styles.inputSpacing}
            />

            <Button
              title="Send Reset Link"
              onPress={handleSubmit(onSubmit)}
              isLoading={isSubmitting}
              style={styles.submitButton}
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
  successContainer: {
    flex: 1,
    padding: Spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  successMessage: {
    marginTop: Spacing.md,
    marginBottom: Spacing.xxl,
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
    width: '100%',
  },
});
