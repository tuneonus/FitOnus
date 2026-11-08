import type { AdminUserListItem } from '../types';

/**
 * Sanitizes and escapes a single field for RFC 4180 compliant CSV output.
 * Guarantees zero script injection or malformed CSV formatting.
 * Implements CWE-1236 defenses against spreadsheet formula injection (=, +, -, @, \t, \r).
 */
export function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return '""';
  let str = String(val);

  // Prevent CSV Formula Injection (CWE-1236)
  if (typeof val === 'string' && /^[=+\-@\t\r]/.test(str)) {
    const isPureNumber = /^[+\-]?\d+(\.\d+)?$/.test(str.trim());
    if (!isPureNumber) {
      str = `'${str}`;
    }
  }

  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

/**
 * Converts user list items into a sanitized, authorized CSV string.
 * Strictly excludes any private credentials, tokens, or health records.
 */
export function formatUsersCsv(users: AdminUserListItem[]): string {
  const headers = [
    'User ID',
    'Display Name',
    'Email Address',
    'Role',
    'Account Status',
    'Onboarding Completed',
    'Current Onboarding Step',
    'Registered At',
    'Suspended At',
  ];

  const headerLine = headers.map(escapeCsvField).join(',');

  const rows = users.map((u) => {
    return [
      escapeCsvField(u.id),
      escapeCsvField(u.displayName),
      escapeCsvField(u.email),
      escapeCsvField(u.role),
      escapeCsvField(u.status),
      escapeCsvField(u.onboardingCompleted ? 'Yes' : 'No'),
      escapeCsvField(u.currentOnboardingStep || 'None'),
      escapeCsvField(u.createdAt),
      escapeCsvField(u.disabledAt || 'N/A'),
    ].join(',');
  });

  return [headerLine, ...rows].join('\r\n');
}

/**
 * Triggers a secure client-side CSV download in browser environments.
 */
export function downloadUsersCsv(
  users: AdminUserListItem[],
  filenamePrefix: string = 'fitonus-users-directory',
): { filename: string; rowCount: number } {
  const csvContent = formatUsersCsv(users);
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `${filenamePrefix}-${dateStr}.csv`;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return { filename, rowCount: users.length };
}
