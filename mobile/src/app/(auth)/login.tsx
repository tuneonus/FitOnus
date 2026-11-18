import React, { useRef, useState } from 'react';
import { View, StyleSheet, Keyboard, type TextInputInstance } from 'react-native';
import { router } from 'expo-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff } from 'lucide-react-native';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';

import { ScreenContainer } from '@/components/shared/screen-container';
import { Logo } from '@/shared/components/common/Logo';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { AuthService } from '@/features/auth/services/auth-service';
import { loginSchema } from '@/features/auth/utils/auth-schemas';
import { LoginRequest } from '@/features/auth/api/auth-repository';

export default function LoginScreen() {
  const { colors } = useTheme();
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const emailInputRef = useRef<TextInputInstance>(null);
  const passwordInputRef = useRef<TextInputInstance>(null);

  const { control, handleSubmit } = useForm<LoginRequest>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginRequest) => {
    setIsSubmitting(true);
    setGlobalError(null);
    try {
      await AuthService.login(data);
      // The router will automatically navigate to / (app group) because of the root _layout gatekeeper
    } catch (error: any) {
      setGlobalError(error.message || 'Login failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScreenContainer>
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
          <Text variant="displaySmall" style={styles.title}>Welcome Back</Text>
          <Text variant="bodyLarge" color="textSecondary">Sign in to continue to OnusFit</Text>
        </View>

        {globalError && (
          <View style={[styles.errorContainer, { backgroundColor: colors.errorLight }]}>
            <Text color="error" variant="bodyMedium">{globalError}</Text>
          </View>
        )}

        <View style={styles.form}>
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
            placeholder="Enter your password"
            secureTextEntry={!showPassword}
            autoComplete="password"
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
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

          <Button
            title="Forgot Password?"
            variant="ghost"
            onPress={() => router.push('/(auth)/forgot-password')}
            style={styles.forgotPasswordButton}
          />
        </View>

        <View style={styles.footer}>
          <Text variant="bodyMedium" color="textSecondary">Don&apos;t have an account? </Text>
          <Button
            title="Sign Up"
            variant="ghost"
            onPress={() => router.push('/(auth)/register')}
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
          title="Login"
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
    justifyContent: 'center',
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
  forgotPasswordButton: {
    alignSelf: 'flex-end',
    marginBottom: Spacing.lg,
  },
  submitButton: {
    marginTop: Spacing.md,
  },
  stickyFooter: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 'auto',
  },
});
