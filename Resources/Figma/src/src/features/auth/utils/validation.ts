export const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

export function passwordStrength(password: string) {
  const checks = [
  { label: 'At least 8 characters', ok: password.length >= 8 },
  { label: 'One number', ok: /\d/.test(password) },
  { label: 'One uppercase letter', ok: /[A-Z]/.test(password) }];

  const score = checks.filter((c) => c.ok).length;
  return { checks, score, label: ['Too weak', 'Weak', 'Good', 'Strong'][score] };
}