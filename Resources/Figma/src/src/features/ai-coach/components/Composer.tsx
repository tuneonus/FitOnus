import React, { useState } from 'react';
import { ArrowUpIcon, MicIcon } from 'lucide-react';

type ComposerProps = {
  onSend: (text: string) => void;
  onVoice: () => void;
  disabled?: boolean;
};

export function Composer({ onSend, onVoice, disabled }: ComposerProps) {
  const [value, setValue] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || disabled) return;
    onSend(value);
    setValue('');
  };

  return (
    <form onSubmit={submit} className="flex items-end gap-2">
      <div className="flex min-h-[52px] flex-1 items-center rounded-[26px] border border-line bg-surface pl-4 pr-1.5 focus-within:border-ink">
        <label htmlFor="coach-input" className="sr-only">Message your coach</label>
        <input
          id="coach-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ask about sleep, meals, training…"
          autoComplete="off"
          className="h-[50px] min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-muted/80" />
        
        <button
          type="button"
          onClick={onVoice}
          aria-label="Voice input"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink hover:bg-surface2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30">
          
          <MicIcon size={19} aria-hidden="true" />
        </button>
      </div>
      <button
        type="submit"
        aria-label="Send"
        disabled={!value.trim() || disabled}
        className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-accent text-accentInk transition-[transform,opacity] duration-150 active:scale-[0.94] disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40">
        
        <ArrowUpIcon size={21} strokeWidth={2.4} aria-hidden="true" />
      </button>
    </form>);

}