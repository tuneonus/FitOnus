import React, { useState } from 'react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { Button } from '../../../shared/components/ui/Button';
import { PasswordField } from '../components/PasswordField';
import { PasswordStrength } from '../components/PasswordStrength';
import { authService } from '../services/authService';
import { passwordStrength } from '../utils/validation';

export function ResetPasswordScreen() {
  const { reset } = useNavigation();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const weak = passwordStrength(password).score < 3;
  const mismatch = confirm !== password;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (weak || mismatch) return;
    setLoading(true);
    await authService.resetPassword();
    setLoading(false);
    reset('authSuccess');
  };

  return (
    <Screen>
      <form onSubmit={submit} className="px-6 pt-4" noValidate>
        <h1 className="text-[30px] font-semibold tracking-[-0.03em] text-ink">Choose a new password</h1>
        <p className="mt-1.5 text-[15px] text-muted">You’ll use it to log in on all your devices.</p>
        <div className="mt-6 space-y-4">
          <div>
            <PasswordField label="New password" autoComplete="new-password" value={password} onChange={setPassword} error={submitted && weak ? 'Meet all requirements below.' : undefined} />
            <PasswordStrength password={password} />
          </div>
          <PasswordField label="Confirm password" autoComplete="new-password" value={confirm} onChange={setConfirm} error={submitted && mismatch ? 'Passwords don’t match.' : undefined} />
        </div>
        <Button type="submit" size="lg" fullWidth loading={loading} className="mt-6">
          {loading ? 'Updating…' : 'Update password'}
        </Button>
      </form>
    </Screen>);

}