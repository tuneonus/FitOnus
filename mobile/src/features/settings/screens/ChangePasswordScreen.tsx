import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from '@/app/navigation/NavigationContext';
import { Screen } from '@/shared/components/ui/Screen';
import { Button } from '@/shared/components/ui/Button';
import { StatusBanner } from '@/shared/components/ui/StatusBanner';
import { PasswordField } from '@/features/auth/components/PasswordField';
import { PasswordStrength } from '@/features/auth/components/PasswordStrength';
import { AuthService } from '@/features/auth/services/auth-service';
import { showToast } from '@/shared/stores/toastStore';
import { useTheme } from '@/hooks/use-theme';

export function ChangePasswordScreen() {
  const { colors } = useTheme();
  const { goBack } = useNavigation();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [errors, setErrors] = useState<{
    current?: string | undefined;
    new?: string | undefined;
    confirm?: string | undefined;
  }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const nextErrors: typeof errors = {};

    if (!currentPassword) {
      nextErrors.current = 'Enter your current password.';
    }

    if (!newPassword) {
      nextErrors.new = 'Enter a new password.';
    } else if (newPassword.length < 12) {
      nextErrors.new = 'Password must be at least 12 characters.';
    } else if (newPassword.length > 128) {
      nextErrors.new = 'Password must be no more than 128 characters.';
    } else if (currentPassword && newPassword === currentPassword) {
      nextErrors.new = 'New password must be different from current password.';
    }

    if (!confirmPassword) {
      nextErrors.confirm = 'Confirm your new password.';
    } else if (newPassword && confirmPassword !== newPassword) {
      nextErrors.confirm = 'Passwords do not match.';
    }

    setErrors(nextErrors);
    setServerError(null);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setLoading(true);
    try {
      await AuthService.changePassword(currentPassword, newPassword);
      showToast({ message: 'Password changed successfully.' });
      goBack();
    } catch (err: any) {
      setServerError(err.message || 'Failed to change password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen
      title="Change Password"
      showBack={true}
      keyboardAvoiding
      contentContainerStyle={styles.container}
    >
      <Text style={[styles.description, { color: colors.muted }]}>
        Choose a secure password of at least 12 characters. For your security, other active sessions will be signed out.
      </Text>

      {serverError ? (
        <StatusBanner
          tone="error"
          title="Could not update password"
          body={serverError}
          style={styles.banner}
        />
      ) : null}

      <View style={styles.formGroup}>
        <PasswordField
          label="Current password"
          value={currentPassword}
          onChange={(val) => {
            setCurrentPassword(val);
            if (errors.current) setErrors((prev) => ({ ...prev, current: undefined }));
            if (serverError) setServerError(null);
          }}
          placeholder="Enter current password"
          error={errors.current}
        />

        <View>
          <PasswordField
            label="New password"
            value={newPassword}
            onChange={(val) => {
              setNewPassword(val);
              if (errors.new) setErrors((prev) => ({ ...prev, new: undefined }));
              if (serverError) setServerError(null);
            }}
            placeholder="At least 12 characters"
            error={errors.new}
          />
          <PasswordStrength password={newPassword} />
        </View>

        <PasswordField
          label="Confirm new password"
          value={confirmPassword}
          onChange={(val) => {
            setConfirmPassword(val);
            if (errors.confirm) setErrors((prev) => ({ ...prev, confirm: undefined }));
            if (serverError) setServerError(null);
          }}
          placeholder="Re-enter new password"
          error={errors.confirm}
        />
      </View>

      <View style={styles.actions}>
        <Button
          fullWidth
          loading={loading}
          disabled={loading}
          onPress={handleSubmit}
        >
          Update password
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 32,
    gap: 16,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
  banner: {
    marginBottom: 4,
  },
  formGroup: {
    gap: 16,
  },
  actions: {
    marginTop: 8,
  },
});
