import React, { useState } from 'react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { Button } from '../../../shared/components/ui/Button';
import { TextField } from '../../../shared/components/ui/TextField';
import { StatusBanner } from '../../../shared/components/ui/StatusBanner';
import { PasswordField } from '../components/PasswordField';
import { authService } from '../services/authService';
import { isValidEmail } from '../utils/validation';

export function LoginScreen() {
  const { navigate, reset } = useNavigation();
  const [email, setEmail] = useState('aarav.mehta@gmail.com');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{email?: string;password?: string;}>({});
  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failures, setFailures] = useState(0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!isValidEmail(email)) next.email = 'Enter a valid email address.';
    if (!password) next.password = 'Enter your password.';
    setErrors(next);
    setAuthError(null);
    if (Object.keys(next).length) return;
    setLoading(true);
    const res = await authService.login(email, password);
    setLoading(false);
    if (res.ok) return reset('onboarding');
    if (failures + 1 >= 3) {
      setFailures(0);
      return navigate('authError', { reason: 'locked' });
    }
    setFailures(failures + 1);
    setAuthError(`${res.error} ${2 - failures} attempt${2 - failures === 1 ? '' : 's'} left.`);
  };

  return (
    <Screen>
      <form onSubmit={submit} className="flex min-h-full flex-col px-6 pt-4" noValidate>
        <h1 className="text-[30px] font-semibold tracking-[-0.03em] text-ink">Welcome back</h1>
        <p className="mt-1.5 text-[15px] text-muted">Log in to pick up where your coach left off.</p>

        {authError && <StatusBanner tone="error" title="Couldn’t log you in" body={authError} className="mt-5" />}

        <div className="mt-6 space-y-4">
          <TextField label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
          <PasswordField label="Password" value={password} onChange={setPassword} error={errors.password} />
        </div>
        <button type="button" onClick={() => navigate('forgotPassword')} className="mt-3 self-end text-[14px] font-semibold text-ink underline-offset-4 hover:underline">
          Forgot password?
        </button>

        <Button type="submit" size="lg" fullWidth loading={loading} className="mt-6">
          {loading ? 'Logging in…' : 'Log in'}
        </Button>

        <div className="my-6 flex items-center gap-3 text-[12px] text-muted">
          <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
        </div>
        <div className="space-y-2.5">
          <Button variant="outline" size="lg" fullWidth onClick={() => reset('onboarding')}>Continue with Apple</Button>
          <Button variant="outline" size="lg" fullWidth onClick={() => reset('onboarding')}>Continue with Google</Button>
        </div>

        <p className="mt-auto pb-2 pt-8 text-center text-[14px] text-muted">
          New to OnusFit?{' '}
          <button type="button" onClick={() => navigate('signup')} className="font-semibold text-ink underline-offset-4 hover:underline">
            Create an account
          </button>
        </p>
      </form>
    </Screen>);

}