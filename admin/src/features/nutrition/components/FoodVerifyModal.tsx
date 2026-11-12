'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { ShieldCheck, ShieldAlert, Lock, AlertTriangle } from 'lucide-react';
import type { AdminFood, VerificationStatus, VerifyFoodInput } from '../types';

interface FoodVerifyModalProps {
  isOpen: boolean;
  onClose: () => void;
  food: AdminFood | null;
  onSubmit: (id: string, data: VerifyFoodInput) => Promise<void>;
}

function FoodVerifyForm({
  food,
  onClose,
  onSubmit,
}: {
  food: AdminFood;
  onClose: () => void;
  onSubmit: (id: string, data: VerifyFoodInput) => Promise<void>;
}) {
  const isCustomFood = food.isCustom;

  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>(
    food.verificationStatus || 'unverified'
  );
  const [dataSource, setDataSource] = useState<
    'usda_fdc' | 'open_food_facts' | 'manufacturer_label'
  >(
    food.dataSource === 'manufacturer_label' || food.dataSource === 'open_food_facts'
      ? food.dataSource
      : 'usda_fdc'
  );
  const [sourceId, setSourceId] = useState(food.sourceId || '');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCustomFood) {
      setError(
        'Security Policy Violation: Private custom food cannot be promoted to global catalog without explicit user consent.'
      );
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit(food.id, {
        verificationStatus,
        dataSource: verificationStatus === 'verified' ? dataSource : undefined,
        sourceId: sourceId.trim() || null,
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to update food verification status.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-[13px]">
      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      {/* Security Alert: Private custom food restriction */}
      {isCustomFood ? (
        <div className="alert alert-warning flex-col gap-2">
          <div className="flex items-center gap-2 font-semibold text-amber-200">
            <Lock className="h-4 w-4 text-amber-400" />
            <span>User Custom Food Promotion Disabled</span>
          </div>
          <p className="text-xs leading-relaxed text-amber-200/80">
            This item was authored by user{' '}
            <span className="font-mono text-amber-200">{food.createdBy}</span> as a
            private custom food. Promoting custom foods to the global verified
            catalog is disabled because explicit user licensing consent and safe
            ownership cloning are not supported.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <p id="verification-status-label" className="field-label">
              Verification status
            </p>
            <div className="grid grid-cols-3 gap-2" role="group" aria-labelledby="verification-status-label">
              <button
                type="button"
                onClick={() => setVerificationStatus('verified')}
                aria-pressed={verificationStatus === 'verified'}
                className={`flex flex-col items-center justify-center rounded-lg border p-3 text-center text-xs transition-colors ${
                  verificationStatus === 'verified'
                    ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300 font-semibold'
                    : 'border-ink-700 bg-ink-950 text-ink-300 hover:border-ink-600 hover:bg-ink-850'
                }`}
              >
                <ShieldCheck className="h-5 w-5 mb-1 text-emerald-400" />
                <span>Verified</span>
              </button>

              <button
                type="button"
                onClick={() => setVerificationStatus('unverified')}
                aria-pressed={verificationStatus === 'unverified'}
                className={`flex flex-col items-center justify-center rounded-lg border p-3 text-center text-xs transition-colors ${
                  verificationStatus === 'unverified'
                    ? 'border-amber-500/60 bg-amber-500/10 text-amber-300 font-semibold'
                    : 'border-ink-700 bg-ink-950 text-ink-300 hover:border-ink-600 hover:bg-ink-850'
                }`}
              >
                <ShieldAlert className="h-5 w-5 mb-1 text-amber-400" />
                <span>Unverified</span>
              </button>

              <button
                type="button"
                onClick={() => setVerificationStatus('rejected')}
                aria-pressed={verificationStatus === 'rejected'}
                className={`flex flex-col items-center justify-center rounded-lg border p-3 text-center text-xs transition-colors ${
                  verificationStatus === 'rejected'
                    ? 'border-rose-500/60 bg-rose-500/10 text-rose-300 font-semibold'
                    : 'border-ink-700 bg-ink-950 text-ink-300 hover:border-ink-600 hover:bg-ink-850'
                }`}
              >
                <AlertTriangle className="h-5 w-5 mb-1 text-rose-400" />
                <span>Rejected</span>
              </button>
            </div>
          </div>

          {verificationStatus === 'verified' && (
            <>
              <div>
                <label htmlFor="foodverifymodal-field-1" className="field-label">
                  Authoritative Data Source
                </label>
                <select
            id="foodverifymodal-field-1"
                  value={dataSource}
                  onChange={(e) =>
                    setDataSource(
                      e.target.value as
                        | 'usda_fdc'
                        | 'open_food_facts'
                        | 'manufacturer_label'
                    )
                  }
                  className="input"
                >
                  <option value="usda_fdc">USDA FoodData Central</option>
                  <option value="manufacturer_label">
                    Manufacturer Nutrition Facts
                  </option>
                  <option value="open_food_facts">Open Food Facts</option>
                </select>
              </div>

              <div>
                <label htmlFor="foodverifymodal-field-2" className="field-label">
                  Source Identification (e.g. FDC ID)
                </label>
                <input
            id="foodverifymodal-field-2"
                  type="text"
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                  placeholder="e.g. 171265"
                  className="input font-mono"
                />
              </div>
            </>
          )}
        </div>
      )}

      <div className="form-actions">
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="btn btn-secondary"
        >
          Cancel
        </button>
        {!isCustomFood && (
          <button
            type="submit"
            disabled={isSubmitting}
            className="btn btn-primary"
          >
            {isSubmitting ? 'Saving…' : 'Update Status'}
          </button>
        )}
      </div>
    </form>
  );
}

export function FoodVerifyModal({
  isOpen,
  onClose,
  food,
  onSubmit,
}: FoodVerifyModalProps) {
  if (!food) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Manage Verification Status"
      description={`Update status and catalog provenance for "${food.name}"`}
      maxWidth="md"
    >
      <FoodVerifyForm food={food} onClose={onClose} onSubmit={onSubmit} />
    </Modal>
  );
}
