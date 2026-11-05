import React, { useState } from 'react';
import { CheckIcon } from 'lucide-react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { Button } from '../../../shared/components/ui/Button';
import { TextField } from '../../../shared/components/ui/TextField';
import { PasswordField } from '../components/PasswordField';
import { PasswordStrength } from '../components/PasswordStrength';
import { authService } from '../services/authService';
import { isValidEmail, passwordStrength } from '../utils/validation';

export function SignupScreen() {
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
    password: strength.score < 3 ? 'Password doesn’t meet all requirements yet.' : undefined,
    terms: !agreed ? 'Please accept the Terms and Privacy Policy.' : undefined
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (hasErrors) return;
    setLoading(true);
    await authService.signup();
    setLoading(false);
    reset('onboarding');
  };

  return (
    <Screen>
      <form onSubmit={submit} className="px-6 pt-4" noValidate>
        <h1 className="text-[30px] font-semibold tracking-[-0.03em] text-ink">Create your account</h1>
        <p className="mt-1.5 text-[15px] text-muted">Your health data stays yours. You choose what the coach can see.</p>
        <div className="mt-6 space-y-4">
          <TextField label="First name" autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} error={submitted ? errors.name : undefined} />
          <TextField label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={submitted ? errors.email : undefined} />
          <div>
            <PasswordField label="Password" autoComplete="new-password" value={password} onChange={setPassword} error={submitted ? errors.password : undefined} />
            <PasswordStrength password={password} />
          </div>
        </div>

        <button
          type="button"
          role="checkbox"
          aria-checked={agreed}
          onClick={() => setAgreed((a) => !a)}
          className="mt-5 flex items-start gap-3 text-left">
          
          <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${agreed ? 'border-ink bg-ink text-bg' : 'border-line'}`}>
            {agreed && <CheckIcon size={13} strokeWidth={3} aria-hidden="true" />}
          </span>
          <span className="text-[13.5px] leading-snug text-muted">
            I agree to the <span className="font-semibold text-ink underline">Terms</span> and{' '}
            <span className="font-semibold text-ink underline">Privacy Policy</span>, including how health data is processed.
          </span>
        </button>
        {submitted && errors.terms && <p role="alert" className="mt-1.5 pl-8 text-[12.5px] text-bad">{errors.terms}</p>}

        <Button type="submit" size="lg" fullWidth loading={loading} className="mt-6">
          {loading ? 'Creating account…' : 'Create account'}
        </Button>
        <p className="mt-6 text-center text-[14px] text-muted">
          Already have an account?{' '}
          <button type="button" onClick={() => navigate('login')} className="font-semibold text-ink underline-offset-4 hover:underline">
            Log in
          </button>
        </p>
      </form>
    </Screen>);

}