import React, { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff } from 'lucide-react-native';

import { ScreenContainer } from '@/components/shared/screen-container';
import { Header } from '@/components/shared/header';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { AuthService } from '@/features/auth/services/auth-service';
import { registerSchema } from '@/features/auth/utils/auth-schemas';
import { RegisterRequest } from '@/features/auth/api/auth-repository';

export default function RegisterScreen() {
  const { colors } = useTheme();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const { control, handleSubmit } = useForm<RegisterRequest>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (data: RegisterRequest) => {
    setIsSubmitting(true);
    setGlobalError(null);
    try {
      await AuthService.register(data);
      // Let root layout handle navigation to App group or verification screen
    } catch (error: any) {
      setGlobalError(error.message || 'Registration failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
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
            <Text variant="displaySmall" style={styles.title}>Create Account</Text>
            <Text variant="bodyLarge" color="textSecondary">Start your fitness journey today</Text>
          </View>

          {globalError && (
            <View style={[styles.errorContainer, { backgroundColor: colors.errorLight }]}>
              <Text color="error" variant="bodyMedium">{globalError}</Text>
            </View>
          )}

          <View style={styles.form}>
            <FormInput
              control={control}
              name="name"
              label="Full Name"
              placeholder="Enter your name"
              autoCapitalize="words"
              autoComplete="name"
              containerStyle={styles.inputSpacing}
            />

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

            <FormInput
              control={control}
              name="password"
              label="Password"
              placeholder="Create a password"
              secureTextEntry={!showPassword}
              containerStyle={styles.inputSpacing}
              rightIcon={
                <Button
                  title=""
                  variant="ghost"
                  size="sm"
                  onPress={() => setShowPassword(!showPassword)}
                  leftIcon={showPassword ? <EyeOff size={20} color={colors.textSecondary} /> : <Eye size={20} color={colors.textSecondary} />}
                />
              }
            />

            <FormInput
              control={control}
              name="confirmPassword"
              label="Confirm Password"
              placeholder="Confirm your password"
              secureTextEntry={!showConfirmPassword}
              containerStyle={styles.inputSpacing}
              rightIcon={
                <Button
                  title=""
                  variant="ghost"
                  size="sm"
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  leftIcon={showConfirmPassword ? <EyeOff size={20} color={colors.textSecondary} /> : <Eye size={20} color={colors.textSecondary} />}
                />
              }
            />

            <Button
              title="Sign Up"
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
    marginTop: Spacing.xl,
  },
});
