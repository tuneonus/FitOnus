import React from 'react';
import { CheckIcon, CircleIcon } from 'lucide-react';
import { passwordStrength } from '../utils/validation';

const barColors = ['bg-bad', 'bg-bad', 'bg-warn', 'bg-good'];

export function PasswordStrength({ password }: {password: string;}) {
  const { checks, score, label } = passwordStrength(password);
  if (!password) return null;
  return (
    <div className="mt-2.5">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1" aria-hidden="true">
          {[0, 1, 2].map((i) =>
          <span key={i} className={`h-1 flex-1 rounded-full ${i < score ? barColors[score] : 'bg-ink/10'}`} />
          )}
        </div>
        <span className="text-[12px] font-medium text-muted">{label}</span>
      </div>
      <ul className="mt-2 space-y-1">
        {checks.map((c) =>
        <li key={c.label} className={`flex items-center gap-1.5 text-[12.5px] ${c.ok ? 'text-good' : 'text-muted'}`}>
            {c.ok ? <CheckIcon size={13} aria-hidden="true" /> : <CircleIcon size={11} aria-hidden="true" />}
            {c.label}
          </li>
        )}
      </ul>
    </div>);

}