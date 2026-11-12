'use client';

import React, { useState } from 'react';
import {
  KeyRound,
  ShieldCheck,
  Zap,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type { TestGeminiConnectionResponse } from '../types-ai';

interface GeminiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidateKey: string;
  setCandidateKey: (val: string) => void;
  candidateKeyTestResult: TestGeminiConnectionResponse | null;
  candidateKeyError: string | null;
  setCandidateKeyError: (err: string | null) => void;
  isTesting: boolean;
  isSaving: boolean;
  onTest: () => void;
  onSave: () => void;
  currentMask: string | null;
  expectedVersion: number;
}

export function GeminiKeyModal({
  isOpen,
  onClose,
  candidateKey,
  setCandidateKey,
  candidateKeyTestResult,
  candidateKeyError,
  setCandidateKeyError,
  isTesting,
  isSaving,
  onTest,
  onSave,
  currentMask,
  expectedVersion,
}: GeminiKeyModalProps) {
  const [showKey, setShowKey] = useState(false);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Update Gemini API Key"
      description="Rotate or configure the enterprise Google Gemini API key used by OnusFit backend."
      maxWidth="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="btn btn-ghost btn-sm"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onTest}
              disabled={isTesting || isSaving || !candidateKey.trim()}
              className="btn btn-secondary btn-sm"
            >
              {isTesting ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span>Validating Key...</span>
                </>
              ) : (
                <>
                  <Zap className="h-3.5 w-3.5" />
                  <span>Test Connection</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={isSaving || isTesting || !candidateKey.trim()}
              className="btn btn-primary btn-sm"
            >
              {isSaving ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span>Encrypting & Activating...</span>
                </>
              ) : (
                <>
                  <Lock className="h-3.5 w-3.5" />
                  <span>Encrypt & Activate</span>
                </>
              )}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 py-1">
        {/* Security Architecture Callout */}
        <div className="alert alert-info text-xs">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="h-4 w-4 shrink-0 text-brand-400 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-ink-200">Zero-Leakage Security Protocol</p>
              <p className="text-ink-400 leading-relaxed text-[11px]">
                API keys are encrypted in-memory with authenticated <strong className="text-brand-400">AES-256-GCM</strong> before PostgreSQL persistence. The master decryption key resides strictly outside the database in host environment config. Mobile clients never receive or call Gemini keys directly.
              </p>
            </div>
          </div>
        </div>

        {/* Current Active Mask */}
        <div className="card-inset space-y-1 p-3 text-xs">
          <div className="flex items-center justify-between text-ink-400">
            <span>Currently Active Key:</span>
            <span className="font-mono font-medium text-ink-200">
              {currentMask ?? 'No database key (using env fallback)'}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-ink-500">
            <span>Concurrency Lock:</span>
            <span>Version {expectedVersion}</span>
          </div>
        </div>

        {/* New API Key Input */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-ink-300 flex items-center justify-between">
            <span>New Gemini API Key</span>
            <span className="text-[11px] text-ink-500">Starts with AIzaSy...</span>
          </label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={candidateKey}
              onChange={(e) => {
                setCandidateKey(e.target.value);
                if (candidateKeyError) setCandidateKeyError(null);
              }}
              placeholder="Enter valid Google Gemini API key..."
              className="input font-mono"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-200"
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-[11px] text-ink-500">
            The previous active key will be archived as a rollback candidate if activation succeeds.
          </p>
        </div>

        {/* Test Connection Feedback */}
        {candidateKeyTestResult && (
          <div className="alert alert-success flex-col gap-1">
            <div className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>Key Validation Succeeded ({candidateKeyTestResult.latencyMs}ms)</span>
            </div>
            <p className="text-[11px] text-emerald-400/80">
              Verified against Google Gemini API with model <code className="font-mono text-white">{candidateKeyTestResult.model}</code>. Ready to activate.
            </p>
          </div>
        )}

        {candidateKeyError && (
          <div className="alert alert-error flex-col gap-1">
            <div className="flex items-center gap-2 font-medium">
              <AlertCircle className="h-4 w-4 text-rose-400" />
              <span>Validation Failed</span>
            </div>
            <p className="text-[11px] text-rose-400/80 leading-relaxed font-mono">
              {candidateKeyError}
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
