import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Keyboard, type TextInputInstance } from 'react-native';
import { Check } from 'lucide-react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { Button } from '../../../shared/components/ui/Button';
import { TextField } from '../../../shared/components/ui/TextField';
import { StatusBanner } from '../../../shared/components/ui/StatusBanner';
import { PasswordField } from '../components/PasswordField';
import { AuthHeader, AuthSwitchPrompt } from '../components/AuthHeader';
import { PasswordStrength } from '../components/PasswordStrength';
import { authService } from '../services/authService';
import { isValidEmail, passwordStrength } from '../utils/validation';
import { useTheme } from '@/hooks/use-theme';

export function SignupScreen() {
  const { colors } = useTheme();
  const { navigate, reset } = useNavigation();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const nameRef = useRef<TextInputInstance>(null);
  const emailRef = useRef<TextInputInstance>(null);
  const passwordRef = useRef<TextInputInstance>(null);

  const strength = passwordStrength(password);
  const errors = {
    name: !name.trim() ? 'Tell us what to call you.' : undefined,
    email: !isValidEmail(email) ? 'Enter a valid email address.' : undefined,
    password:
      password.length > 0 && password.length < 12
        ? 'Password must be at least 12 characters.'
        : strength.score < 3
          ? 'Password doesn’t meet all requirements yet.'
          : undefined,
    terms: !agreed ? 'Please accept the Terms and Privacy Policy.' : undefined,
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const handleSubmit = async () => {
    setSubmitted(true);
    setAuthError(null);
    if (hasErrors) return;

    setLoading(true);
    const res = await authService.signup(name.trim(), email.trim(), password);
    setLoading(false);
    if (res.ok) {
      reset('onboarding');
    } else {
      setAuthError(res.error);
    }
  };

  return (
    <Screen
      showBack={true}
      keyboardAvoiding={true}
      footer={
        <Button
          title={loading ? 'Creating account…' : 'Create account'}
          size="lg"
          fullWidth
          loading={loading}
          onPress={handleSubmit}
        />
      }
    >
      <View style={styles.content}>
        <AuthHeader
          title="Create your account"
          subtitle="Own your fitness. Your data stays yours — you choose what the coach can see."
        />

        {authError ? (
          <StatusBanner
            tone="error"
            title="Couldn’t create account"
            body={authError}
            style={{ marginTop: 16 }}
          />
        ) : null}

        <View style={styles.inputsSection}>
          <TextField
            ref={nameRef}
            label="First name"
            placeholder="Enter your name"
            value={name}
            onChangeText={setName}
            error={submitted ? errors.name : undefined}
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => emailRef.current?.focus()}
          />

          <TextField
            ref={emailRef}
            label="Email"
            placeholder="name@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
            error={submitted ? errors.email : undefined}
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => passwordRef.current?.focus()}
          />

          <View>
            <PasswordField
              ref={passwordRef}
              label="Password"
              placeholder="Enter password"
              value={password}
              onChange={setPassword}
              error={submitted ? errors.password : undefined}
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
            />
            <PasswordStrength password={password} />
          </View>
        </View>

        {/* Terms checkbox */}
        <TouchableOpacity
          activeOpacity={0.8}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: agreed }}
          onPress={() => setAgreed(!agreed)}
          style={[styles.termsRow, { backgroundColor: colors.surface2 }]}
        >
          <View
            style={[
              styles.checkbox,
              {
                borderColor: agreed ? colors.accent : colors.muted,
                backgroundColor: agreed ? colors.accent : 'transparent',
              },
            ]}
          >
            {agreed && <Check size={14} color={colors.accentInk} strokeWidth={3} />}
          </View>
          <Text style={[styles.termsText, { color: colors.muted }]}>
            I agree to OnusFit processing my health data to provide personalized
            coaching per the Terms & Privacy Policy.
          </Text>
        </TouchableOpacity>
        {submitted && errors.terms ? (
          <Text style={[styles.errorText, { color: colors.bad }]}>
            {errors.terms}
          </Text>
        ) : null}

        <AuthSwitchPrompt
          prompt="Already have an account?"
          action="Log in"
          onPress={() => navigate('login')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 8,
  },
  inputsSection: {
    marginTop: 24,
    gap: 10,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 16,
    gap: 12,
    padding: 14,
    borderRadius: 16,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  termsText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  errorText: {
    fontSize: 12.5,
    fontWeight: '500',
    marginTop: 6,
    marginLeft: 4,
  },
});
