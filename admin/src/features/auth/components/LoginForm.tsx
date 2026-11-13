'use client';

import React, { useState } from 'react';
import { ShieldAlert, Lock, Mail, ArrowRight, Loader2, Users, Dumbbell, Utensils, Trophy, Sliders } from 'lucide-react';
import { BrandMark } from '@/components/ui/BrandMark';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '@/lib/api-client';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please provide both email and password.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await login({ email: email.trim(), password });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403) {
          setError('Access Denied: Your account does not have Administrator privileges.');
        } else if (err.status === 401) {
          setError('Invalid email or password. Please verify your credentials.');
        } else if (err.status === 429) {
          setError('Too many login attempts. Please wait a few minutes before trying again.');
        } else {
          setError(err.message || 'Login failed. Please try again.');
        }
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred during authentication.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const capabilities = [
    { icon: Users, label: 'Member accounts & onboarding' },
    { icon: Dumbbell, label: 'Exercise library & starter routines' },
    { icon: Utensils, label: 'Verified food catalog' },
    { icon: Trophy, label: 'Challenges, badges & rewards' },
    { icon: Sliders, label: 'Remote configuration & AI quotas' },
  ];

  return (
    <div className="grid min-h-screen bg-ink-950 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* Brand panel */}
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-ink-800 bg-ink-900 p-10 lg:flex xl:p-14">
        <div className="flex items-center gap-3">
          <BrandMark size={36} />
          <div className="leading-tight">
            <p className="text-[15px] font-semibold text-white">OnusFit</p>
            <p className="text-xs text-ink-400">Admin console</p>
          </div>
        </div>

        <div className="max-w-md">
          <p className="eyebrow text-brand-300">Own your fitness.</p>
          <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-white">
            Run the OnusFit platform from one place.
          </h2>
          <ul className="mt-8 space-y-3">
            {capabilities.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3 text-[13px] text-ink-300">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-ink-850 text-ink-300 ring-1 ring-ink-800">
                  <Icon className="h-4 w-4" />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-[11px] text-ink-500">
          Access is limited to administrator accounts. Rate limiting and server-side RBAC apply.
        </p>
      </aside>

      {/* Sign-in form */}
      <main className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <div className="mb-6 flex items-center gap-3 lg:hidden">
              <BrandMark size={36} />
              <div className="leading-tight">
                <p className="text-[15px] font-semibold text-white">OnusFit</p>
                <p className="text-xs text-ink-400">Admin console</p>
              </div>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Sign in</h1>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-400">
              Use an authorized administrator account to continue.
            </p>
          </div>

          {error && (
            <div role="alert" className="alert alert-error mb-5">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1 font-medium">{error}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="field-label">
                Email
              </label>
              <div className="relative">
                <Mail aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                <input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@fitonus.com"
                  className="input h-10 pl-9"
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="field-label">
                Password
              </label>
              <div className="relative">
                <Lock aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                <input
                  id="login-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="input h-10 pl-9"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn btn-primary btn-lg mt-2 w-full"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-[11px] text-ink-500 lg:hidden">
            Protected by rate limiting and server-side RBAC.
          </p>
        </div>
      </main>
    </div>
  );
}
