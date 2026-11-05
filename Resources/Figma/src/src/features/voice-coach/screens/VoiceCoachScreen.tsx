import React, { useEffect, useRef, useState } from 'react';
import { Loader2Icon, MicIcon, MicOffIcon, SquareIcon, XIcon } from 'lucide-react';
import { useNavigation, useRouteParams } from '../../../app/navigation/NavigationContext';
import { Button } from '../../../shared/components/ui/Button';
import { buildCoachResponse } from '../../ai-coach/services/mockCoachEngine';
import { ActionBlock } from '../../ai-coach/components/blocks/ActionBlock';
import { MetricsBlock } from '../../ai-coach/components/blocks/MetricsBlock';
import type { Block, CoachResponse } from '../../ai-coach/types/coach';
import { useVoiceStore } from '../store/voiceStore';
import { voiceCommands } from '../constants/commands';
import { VoiceWaveform } from '../components/VoiceWaveform';

type Phase = 'idle' | 'listening' | 'processing' | 'response' | 'error';

export function VoiceCoachScreen() {
  const { goBack } = useNavigation();
  const params = useRouteParams();
  const { micPermission, setMicPermission } = useVoiceStore();
  const [phase, setPhase] = useState<Phase>('idle');
  const [command, setCommand] = useState(params.cmd ?? voiceCommands[0]);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState<CoachResponse | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  const listen = () => {
    clearTimers();
    setResponse(null);
    setTranscript('');
    setPhase('listening');
    const words = command.split(' ');
    words.forEach((_, i) => {
      timers.current.push(setTimeout(() => setTranscript(words.slice(0, i + 1).join(' ')), 500 + i * 260));
    });
    const doneAt = 500 + words.length * 260 + 500;
    timers.current.push(
      setTimeout(() => setPhase('processing'), doneAt),
      setTimeout(() => {
        setResponse(buildCoachResponse(command));
        setPhase('response');
      }, doneAt + 1300)
    );
  };

  const stop = () => {
    const complete = transcript === command;
    clearTimers();
    if (!complete) setPhase('error');
  };

  const updateBlock = (id: string, status: Extract<Block, {type: 'action';}>['status'], resultText?: string) =>
  setResponse((r) => r && { ...r, blocks: r.blocks?.map((b) => b.type === 'action' && b.id === id ? { ...b, status, resultText } : b) });

  const statusText: Record<Phase, string> = {
    idle: 'Tap the mic and speak',
    listening: 'Listening…',
    processing: 'Thinking…',
    response: 'Coach',
    error: 'I didn’t catch that'
  };

  return (
    <div className="flex h-full flex-col bg-hero text-heroInk">
      <header className="flex items-center justify-between px-4 pt-14">
        <p className="text-[14px] font-medium text-heroMuted">Voice coach</p>
        <button type="button" onClick={goBack} aria-label="Close voice coach" className="flex h-11 w-11 items-center justify-center rounded-full bg-heroInk/10">
          <XIcon size={20} aria-hidden="true" />
        </button>
      </header>

      {micPermission !== 'granted' ?
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-heroInk/10">
            {micPermission === 'denied' ? <MicOffIcon size={32} aria-hidden="true" /> : <MicIcon size={32} aria-hidden="true" />}
          </span>
          <h1 className="mt-6 text-[24px] font-semibold tracking-[-0.02em]">
            {micPermission === 'denied' ? 'Microphone is off' : 'Talk to your coach'}
          </h1>
          <p className="mt-2 text-[14.5px] leading-relaxed text-heroMuted">
            {micPermission === 'denied' ?
          'Voice needs microphone access. You can turn it on in iOS Settings → FitOnus → Microphone.' :
          'Log sets mid-workout, add meals hands-free, or ask how you’re doing. Audio is processed for your request only and not stored.'}
          </p>
          <div className="mt-8 w-full space-y-2.5">
            <Button size="lg" fullWidth onClick={() => setMicPermission('granted')}>
              {micPermission === 'denied' ? 'Open Settings' : 'Allow microphone'}
            </Button>
            {micPermission === 'unknown' &&
          <button type="button" onClick={() => setMicPermission('denied')} className="h-11 w-full text-[15px] font-semibold text-heroMuted">
                Not now
              </button>
          }
          </div>
        </div> :

      <>
          <div className="no-scrollbar flex-1 overflow-y-auto px-5 pt-6">
            <p className="text-center text-[13px] font-medium text-heroMuted" aria-live="polite">{statusText[phase]}</p>
            {(phase === 'listening' || phase === 'idle' || phase === 'processing') &&
          <div className="mt-6">
                <VoiceWaveform active={phase === 'listening'} />
                {phase === 'processing' &&
            <p className="mt-2 flex items-center justify-center gap-2 text-[13px] text-heroMuted">
                    <Loader2Icon size={14} className="animate-spin" aria-hidden="true" /> Understanding your request
                  </p>
            }
              </div>
          }
            {transcript && phase !== 'idle' &&
          <p className="mt-6 text-center text-[24px] font-semibold leading-snug tracking-[-0.02em]">“{transcript}”</p>
          }
            {phase === 'error' &&
          <div className="mt-10 text-center">
                <p className="text-[15px] text-heroMuted">The recording ended before I understood a full request. Try again in a quieter spot.</p>
                <Button className="mt-5" onClick={listen}>Try again</Button>
              </div>
          }
            {phase === 'response' && response &&
          <div className="mt-6 space-y-3">
                <p className="text-[16px] leading-relaxed text-heroInk">{response.text}</p>
                <div className="space-y-3 text-ink">
                  {response.blocks?.map((b, i) =>
              b.type === 'action' ?
              <ActionBlock key={b.id} block={b} onStatusChange={(s, t) => updateBlock(b.id, s, t)} /> :
              b.type === 'metrics' ?
              <MetricsBlock key={i} block={b} /> :
              null
              )}
                </div>
              </div>
          }
          </div>

          <div className="shrink-0 px-5 pb-10 pt-4">
            {(phase === 'idle' || phase === 'response' || phase === 'error') &&
          <div className="mb-4">
                <p className="mb-2 text-center text-[12px] text-heroMuted">Try saying</p>
                <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
                  {voiceCommands.map((c) =>
              <button
                key={c}
                type="button"
                onClick={() => setCommand(c)}
                aria-pressed={command === c}
                className={`h-9 shrink-0 whitespace-nowrap rounded-full border px-3.5 text-[13px] transition-colors duration-150 ${command === c ? 'border-accent bg-accent/15 text-accent' : 'border-heroInk/15 text-heroInk'}`}>
                
                      {c}
                    </button>
              )}
                </div>
              </div>
          }
            <div className="flex justify-center">
              {phase === 'listening' ?
            <button type="button" onClick={stop} aria-label="Stop listening" className="flex h-20 w-20 items-center justify-center rounded-full bg-heroInk text-hero transition-transform duration-150 active:scale-[0.95]">
                  <SquareIcon size={24} fill="currentColor" aria-hidden="true" />
                </button> :

            <button
              type="button"
              onClick={listen}
              disabled={phase === 'processing'}
              aria-label="Start listening"
              className="flex h-20 w-20 items-center justify-center rounded-full bg-accent text-accentInk shadow-[0_10px_30px_-10px_rgb(var(--accent)/0.8)] transition-transform duration-150 active:scale-[0.95] disabled:opacity-50">
              
                  <MicIcon size={30} aria-hidden="true" />
                </button>
            }
            </div>
          </div>
        </>
      }
    </div>);

}