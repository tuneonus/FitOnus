import React, { useState } from 'react';
import { MailCheckIcon } from 'lucide-react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { Button } from '../../../shared/components/ui/Button';
import { TextField } from '../../../shared/components/ui/TextField';
import { authService } from '../services/authService';
import { isValidEmail } from '../utils/validation';

export function ForgotPasswordScreen() {
  const { navigate } = useNavigation();
  const [email, setEmail] = useState('aarav.mehta@gmail.com');
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidEmail(email)) return setError('Enter the email you signed up with.');
    setError(undefined);
    setLoading(true);
    await authService.requestReset();
    setLoading(false);
    setSent(true);
  };

  if (sent) {
    return (
      <Screen>
        <div className="flex flex-col items-center px-8 pt-16 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/25">
            <MailCheckIcon size={28} className="text-accentStrong" aria-hidden="true" />
          </span>
          <h1 className="mt-5 text-[26px] font-semibold tracking-[-0.02em] text-ink">Check your inbox</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            We sent a reset link to <span className="font-medium text-ink">{email}</span>. It expires in 30 minutes.
          </p>
          <Button size="lg" fullWidth className="mt-8" onClick={() => navigate('resetPassword')}>
            Open reset link
          </Button>
          <Button variant="ghost" className="mt-2" onClick={() => setSent(false)}>
            Use a different email
          </Button>
        </div>
      </Screen>);

  }

  return (
    <Screen>
      <form onSubmit={submit} className="px-6 pt-4" noValidate>
        <h1 className="text-[30px] font-semibold tracking-[-0.03em] text-ink">Reset password</h1>
        <p className="mt-1.5 text-[15px] text-muted">Enter your email and we’ll send you a secure link.</p>
        <TextField className="mt-6" label="Email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={error} />
        <Button type="submit" size="lg" fullWidth loading={loading} className="mt-6">
          {loading ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>
    </Screen>);

}