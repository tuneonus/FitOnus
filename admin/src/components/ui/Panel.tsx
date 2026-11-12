import React from 'react';

interface PanelProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Remove body padding, e.g. for edge-to-edge tables. */
  flush?: boolean;
}

/** Standard card with an optional header row (title, description, actions). */
export function Panel({
  title,
  description,
  actions,
  icon,
  children,
  className = '',
  bodyClassName = '',
  flush = false,
}: PanelProps) {
  const hasHeader = Boolean(title || description || actions);

  return (
    <section className={`card flex min-w-0 flex-col ${className}`}>
      {hasHeader && (
        <div className="flex flex-col gap-3 border-b border-ink-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            {icon && (
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-ink-850 text-ink-300 ring-1 ring-ink-800 [&>svg]:h-4 [&>svg]:w-4">
                {icon}
              </span>
            )}
            <div className="min-w-0">
              {title && <h2 className="card-title">{title}</h2>}
              {description && <p className="card-subtitle">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={`min-w-0 flex-1 ${flush ? '' : 'px-5 py-5 sm:px-6'} ${bodyClassName}`}>{children}</div>
    </section>
  );
}
