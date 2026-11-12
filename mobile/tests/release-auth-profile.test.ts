import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Module, { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
function stub(request: string, exports: unknown) {
  const path = require.resolve(request);
  const entry = new Module(path);
  entry.exports = exports;
  require.cache[path] = entry;
}

// Exercise the actual screen composition with only native/context boundaries stubbed.
const host = (tag: string) => ({ children }: any) => React.createElement(tag, null, children);
const button = ({ children, title, onPress }: any) => {
  if (onPress) actions.set(title ?? children, onPress);
  return React.createElement('button', null, title ?? children);
};
const actions = new Map<string, () => unknown>();
stub('react-native', {
  View: host('div'), Text: host('span'), ScrollView: host('section'), Image: host('img'),
  TouchableOpacity: button, Pressable: button,
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
});
stub('expo-router', {
  Stack: { Screen: () => null },
  Redirect: ({ href }: any) => React.createElement('a', { href }, 'Sign in'),
});
stub('lucide-react-native', Object.fromEntries(
  ['User', 'Activity', 'Target', 'Settings', 'Moon', 'Bell', 'Shield', 'LogOut', 'ChevronRight']
    .map((name) => [name, () => null]),
));
stub('../src/hooks/use-theme', { useTheme: () => ({ colors: {}, isDark: false }) });
stub('../src/components/shared/screen-container', { ScreenContainer: host('main') });
stub('../src/shared/components/ui/Screen', { Screen: host('main') });
stub('../src/shared/components/ui/Button', { Button: button });
stub('../src/shared/components/ui/TextField', {
  TextField: ({ label }: any) => React.createElement('label', null, label),
});
stub('../src/features/auth/components/PasswordField', {
  PasswordField: ({ label }: any) => React.createElement('label', null, label),
});
stub('../src/shared/components/ui/StatusBanner', {
  StatusBanner: ({ title, body, actionLabel, onAction }: any) => {
    if (onAction) actions.set(actionLabel, onAction);
    return React.createElement('aside', null, title, body);
  },
});
stub('../src/app/navigation/NavigationContext', {
  useNavigation: () => ({ navigate: () => {}, reset: () => {} }),
});
stub('../src/features/auth/services/authService', {
  authService: { login: () => { throw new Error('Unexpected authentication during rendering'); } },
});
stub('../src/features/profile/api/profile-api', { profileApi: {} });

let auth: any;
let query: any;
let retryCount = 0;
stub('../src/features/auth/stores/auth-store', { useAuthStore: (select: any) => select(auth) });
stub('../src/features/profile/hooks/use-profile', { useProfile: () => query });

const Profile = require('../src/app/(tabs)/profile/index').default;
const { LoginScreen } = require('../src/features/auth/screens/LoginScreen');
const renderProfile = () => renderToStaticMarkup(React.createElement(Profile));

beforeEach(() => {
  auth = { isAuthenticated: true, user: { id: 'current', name: 'Account name', email: 'member@example.test' } };
  retryCount = 0;
  query = { data: undefined, isPending: false, isError: false, refetch: () => { retryCount++; } };
  actions.clear();
});

describe('Release profile renders account data without fabricated metrics', () => {
  it('renders authenticated profile weights while preserving the existing two-card layout', () => {
    query.data = { userId: 'current', name: 'Profile name', currentWeightKg: 83.25, targetWeightKg: 77.5 };
    const html = renderProfile();
    assert.match(html, /Profile name/);
    assert.match(html, /member@example\.test/);
    assert.match(html, /Current Weight/);
    assert.match(html, /Target Goal/);
    assert.match(html, /83\.25 kg/);
    assert.match(html, /77\.5 kg/);
    assert.doesNotMatch(html, /this month|Hypertrophy|Alex Fitness|alex@tuneonus\.com/);
  });

  it('shows loading and missing-data states without guessing a weight or goal', () => {
    query.isPending = true;
    assert.match(renderProfile(), /Loading profile/);
    query.isPending = false;
    query.data = { userId: 'current', currentWeightKg: null, targetWeightKg: null };
    const html = renderProfile();
    assert.match(html, /Not recorded/);
    assert.doesNotMatch(html, /\d+(?:\.\d+)? kg|this month/);
  });

  it('shows a retryable error without displaying invented values', () => {
    query.isError = true;
    const html = renderProfile();
    assert.match(html, /Couldn’t load profile/);
    assert.match(html, /Profile unavailable/);
    actions.get('Retry')!();
    assert.equal(retryCount, 1);
    assert.doesNotMatch(html, /\d+(?:\.\d+)? kg/);
  });

  it('never presents the previous account’s cached identity or measurements', () => {
    query.data = { userId: 'previous', name: 'Previous member', currentWeightKg: 91, targetWeightKg: 85 };
    const html = renderProfile();
    assert.match(html, /Account name/);
    assert.doesNotMatch(html, /Previous member|91 kg|85 kg/);
  });

  it('does not present invalid weights or a profile to a signed-out user', () => {
    query.data = { userId: 'current', currentWeightKg: Number.NaN, targetWeightKg: -1 };
    assert.doesNotMatch(renderProfile(), /NaN|\-1 kg/);
    auth = { isAuthenticated: false, user: null };
    const html = renderProfile();
    assert.match(html, /href="\/"/);
    assert.doesNotMatch(html, /Current Weight|Target Goal|Account name/);
  });
});

describe('Release login exposes only implemented authentication', () => {
  it('retains email/password and account creation without provider buttons or their divider', () => {
    const html = renderToStaticMarkup(React.createElement(LoginScreen));
    assert.match(html, /Email/);
    assert.match(html, /Password/);
    assert.match(html, /Log in/);
    assert.match(html, /Create one/);
    assert.match(html, /Forgot password/);
    assert.doesNotMatch(html, /Apple|Google|or continue with/);
  });
});
