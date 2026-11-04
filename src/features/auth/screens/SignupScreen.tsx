import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Check } from 'lucide-react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { Button } from '../../../shared/components/ui/Button';
import { TextField } from '../../../shared/components/ui/TextField';
import { PasswordField } from '../components/PasswordField';
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

  const strength = passwordStrength(password);
  const errors = {
    name: !name.trim() ? 'Tell us what to call you.' : undefined,
    email: !isValidEmail(email) ? 'Enter a valid email address.' : undefined,
    password:
      strength.score < 3
        ? 'Password doesn’t meet all requirements yet.'
        : undefined,
    terms: !agreed ? 'Please accept the Terms and Privacy Policy.' : undefined,
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const handleSubmit = async () => {
    setSubmitted(true);
    if (hasErrors) return;

    setLoading(true);
    await authService.signup();
    setLoading(false);
    reset('onboarding');
  };

  return (
    <Screen showBack={true}>
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.ink }]}>
          Create your account
        </Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          Your health data stays yours. You choose what the coach can see.
        </Text>

        <View style={styles.inputsSection}>
          <TextField
            label="First name"
            value={name}
            onChangeText={setName}
            error={submitted ? errors.name : undefined}
          />

          <TextField
            label="Email"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
            error={submitted ? errors.email : undefined}
          />

          <View>
            <PasswordField
              label="Password"
              value={password}
              onChange={setPassword}
              error={submitted ? errors.password : undefined}
            />
            <PasswordStrength password={password} />
          </View>
        </View>

        {/* Terms checkbox */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setAgreed(!agreed)}
          style={styles.termsRow}
        >
          <View
            style={[
              styles.checkbox,
              {
                borderColor: agreed ? colors.ink : colors.line,
                backgroundColor: agreed ? colors.ink : 'transparent',
              },
            ]}
          >
            {agreed && <Check size={14} color={colors.bg} strokeWidth={3} />}
          </View>
          <Text style={[styles.termsText, { color: colors.muted }]}>
            I agree to FitOnus processing my health data to provide personalized
            coaching per the Terms & Privacy Policy.
          </Text>
        </TouchableOpacity>
        {submitted && errors.terms ? (
          <Text style={[styles.errorText, { color: colors.bad }]}>
            {errors.terms}
          </Text>
        ) : null}

        <Button
          title={loading ? 'Creating account…' : 'Create account'}
          size="lg"
          fullWidth
          loading={loading}
          onPress={handleSubmit}
          style={styles.signupButton}
        />

        {/* Log in prompt */}
        <View style={styles.loginPrompt}>
          <Text style={{ color: colors.muted }}>Already have an account? </Text>
          <TouchableOpacity onPress={() => navigate('login')}>
            <Text style={[styles.loginLink, { color: colors.ink }]}>Log in</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    marginTop: 6,
  },
  inputsSection: {
    marginTop: 20,
    gap: 12,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 20,
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  termsText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
  },
  errorText: {
    fontSize: 12,
    marginTop: 6,
    marginLeft: 32,
  },
  signupButton: {
    marginTop: 24,
  },
  loginPrompt: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 28,
    marginBottom: 16,
  },
  loginLink: {
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});

