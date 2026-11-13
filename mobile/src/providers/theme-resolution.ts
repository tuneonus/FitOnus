export type ThemePreferenceMode = 'system' | 'light' | 'dark';

/**
 * Whether the dark palette applies. The device appearance is consulted only
 * when the user picked "system"; an explicit Light or Dark always wins.
 */
export function resolveIsDark(
  mode: ThemePreferenceMode,
  deviceScheme: 'light' | 'dark' | null | undefined,
): boolean {
  return mode === 'system' ? deviceScheme === 'dark' : mode === 'dark';
}
