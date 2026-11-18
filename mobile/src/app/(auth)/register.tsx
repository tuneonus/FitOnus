import React, { useRef, useState } from 'react';
import { View, StyleSheet, Keyboard, type TextInputInstance } from 'react-native';
import { router } from 'expo-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff } from 'lucide-react-native';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';

import { ScreenContainer } from '@/components/shared/screen-container';
import { Header } from '@/components/shared/header';
import { Logo } from '@/shared/components/common/Logo';
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

  const nameInputRef = useRef<TextInputInstance>(null);
  const emailInputRef = useRef<TextInputInstance>(null);
  const passwordInputRef = useRef<TextInputInstance>(null);
  const confirmPasswordInputRef = useRef<TextInputInstance>(null);

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
      <KeyboardAwareScrollView 
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        bottomOffset={Spacing.xl + 64}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Logo size={64} />
          </View>
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
            ref={nameInputRef}
            control={control}
            name="name"
            label="Full Name"
            placeholder="Enter your name"
            autoCapitalize="words"
            autoComplete="name"
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => emailInputRef.current?.focus()}
            containerStyle={styles.inputSpacing}
          />

          <FormInput
            ref={emailInputRef}
            control={control}
            name="email"
            label="Email"
            placeholder="Enter your email"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => passwordInputRef.current?.focus()}
            containerStyle={styles.inputSpacing}
          />

          <FormInput
            ref={passwordInputRef}
            control={control}
            name="password"
            label="Password"
            placeholder="Create a password"
            secureTextEntry={!showPassword}
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => confirmPasswordInputRef.current?.focus()}
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
            ref={confirmPasswordInputRef}
            control={control}
            name="confirmPassword"
            label="Confirm Password"
            placeholder="Confirm your password"
            secureTextEntry={!showConfirmPassword}
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
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
        </View>
      </KeyboardAwareScrollView>

      <KeyboardStickyView
        offset={{ closed: 0, opened: 0 }}
        style={[
          styles.stickyFooter,
          {
            backgroundColor: colors.background,
            borderTopColor: colors.border,
          },
        ]}
      >
        <Button
          title="Sign Up"
          onPress={handleSubmit(onSubmit)}
          isLoading={isSubmitting}
        />
      </KeyboardStickyView>
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
    paddingBottom: Spacing.xl + 40,
  },
  header: {
    marginBottom: Spacing.xxxl,
    alignItems: 'center',
  },
  logoContainer: {
    marginBottom: Spacing.lg,
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
  stickyFooter: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
