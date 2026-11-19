'use client';

import React from 'react';
import { CATEGORY_LABELS, DESTINATION_LABELS } from '../logic';
import type { NotificationTemplate } from '../templates';

interface TemplatePickerProps {
  templates: readonly NotificationTemplate[];
  onSelect: (template: NotificationTemplate) => void;
}

/**
 * Entry point of the template flow. Choosing a card only opens the composer with that content prefilled:
 * nothing is saved or sent from here, and no recipients are chosen for the admin.
 */
export function NotificationTemplatePicker({ templates, onSelect }: TemplatePickerProps) {
  return (
    <section aria-labelledby="notification-templates-heading" className="card card-pad">
      <h2 id="notification-templates-heading" className="card-title">Start from a template</h2>
      <p className="card-subtitle">
        Prefills the title and message. You still choose who receives it and review everything before anything is sent.
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => (
          <li key={template.id}>
            <button
              type="button"
              onClick={() => onSelect(template)}
              className="card-inset block h-full w-full p-3.5 text-left transition-colors hover:border-ink-600 hover:bg-ink-900"
            >
              <span className="block text-sm font-medium text-white">{template.name}</span>
              <span className="mt-0.5 block text-xs text-ink-400">{template.description}</span>
              <span className="mt-2 block text-[11px] text-ink-500">
                {CATEGORY_LABELS[template.category]}
                {' · '}
                {template.destination ? `Opens ${DESTINATION_LABELS[template.destination]}` : 'Opens the app'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
