import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  useSettingsStore,
  THEME_STORAGE_KEY,
  getSettingsStorageKey,
  setSettingsStorageEngine,
} from '../src/shared/stores/settingsStore';
import { resolveIsDark } from '../src/providers/theme-resolution';

const disk = new Map<string, string>();

/** Simulates a cold app start: fresh in-memory store, same persisted disk. */
function coldStart() {
  useSettingsStore.setState({ theme: 'system', userId: null, isHydrated: false });
}

const tick = () => new Promise((r) => setTimeout(r, 20));

describe('Theme hydration at app root', () => {
  beforeEach(() => {
    disk.clear();
    setSettingsStorageEngine({
      getItem: (key) => Promise.resolve(disk.get(key) ?? null),
      setItem: (key, val) => {
        disk.set(key, val);
        return Promise.resolve();
      },
      removeItem: (key) => {
        disk.delete(key);
        return Promise.resolve();
      },
    });
    coldStart();
  });

  // Must stay first: it relies on no theme having been loaded yet in this process.
  it('an early unrelated setting write cannot overwrite the saved theme before it is read', async () => {
    disk.set(THEME_STORAGE_KEY, 'light');
    useSettingsStore.getState().setUnits('imperial'); // fires before hydrateTheme
    await tick();
    assert.equal(disk.get(THEME_STORAGE_KEY), 'light');
    assert.equal(await useSettingsStore.getState().hydrateTheme(), 'light');
  });

  it('A. saved Light launches Light, regardless of a dark device', async () => {
    disk.set(THEME_STORAGE_KEY, 'light');
    assert.equal(await useSettingsStore.getState().hydrateTheme(), 'light');
    assert.equal(resolveIsDark(useSettingsStore.getState().theme, 'dark'), false);
  });

  it('B. saved Dark launches Dark, regardless of a light device', async () => {
    disk.set(THEME_STORAGE_KEY, 'dark');
    assert.equal(await useSettingsStore.getState().hydrateTheme(), 'dark');
    assert.equal(resolveIsDark(useSettingsStore.getState().theme, 'light'), true);
  });

  it('C. saved System follows the device appearance, live', async () => {
    disk.set(THEME_STORAGE_KEY, 'system');
    assert.equal(await useSettingsStore.getState().hydrateTheme(), 'system');
    assert.equal(resolveIsDark('system', 'dark'), true);
    assert.equal(resolveIsDark('system', 'light'), false);
    assert.equal(resolveIsDark('system', null), false);
  });

  it('D. nothing saved defaults to System; garbage values are ignored', async () => {
    assert.equal(await useSettingsStore.getState().hydrateTheme(), 'system');
    coldStart();
    disk.set(THEME_STORAGE_KEY, 'purple');
    assert.equal(await useSettingsStore.getState().hydrateTheme(), 'system');
  });

  it('explicit Light/Dark ignore the device appearance entirely', () => {
    assert.equal(resolveIsDark('light', 'dark'), false);
    assert.equal(resolveIsDark('dark', 'light'), true);
    assert.equal(resolveIsDark('dark', null), true);
  });

  it('E. auth hydration for a user with no record keeps the saved theme (no dark flash after login)', async () => {
    disk.set(THEME_STORAGE_KEY, 'light');
    await useSettingsStore.getState().hydrateTheme();
    await useSettingsStore.getState().hydrateForUser('user-1');
    assert.equal(useSettingsStore.getState().theme, 'light');
  });

  it('F. a stale per-user record cannot override the device theme', async () => {
    disk.set(getSettingsStorageKey('user-1'), JSON.stringify({ theme: 'system' }));
    disk.set(THEME_STORAGE_KEY, 'light');
    await useSettingsStore.getState().hydrateTheme();
    await useSettingsStore.getState().hydrateForUser('user-1');
    assert.equal(useSettingsStore.getState().theme, 'light');
  });

  it('G. logout / auth reset keeps the selected theme', async () => {
    disk.set(THEME_STORAGE_KEY, 'light');
    await useSettingsStore.getState().hydrateTheme();
    useSettingsStore.getState().resetSettings();
    assert.equal(useSettingsStore.getState().theme, 'light');
    assert.equal(disk.get(THEME_STORAGE_KEY), 'light');
  });

  it('H. changing the theme applies immediately and survives a restart', async () => {
    await useSettingsStore.getState().hydrateTheme();
    useSettingsStore.getState().setTheme('dark');
    assert.equal(useSettingsStore.getState().theme, 'dark'); // immediate
    await tick();
    assert.equal(disk.get(THEME_STORAGE_KEY), 'dark');

    coldStart();
    assert.equal(await useSettingsStore.getState().hydrateTheme(), 'dark');

    useSettingsStore.getState().setTheme('system');
    await tick();
    coldStart();
    assert.equal(await useSettingsStore.getState().hydrateTheme(), 'system');
  });

  it('a storage failure falls back to System without throwing', async () => {
    setSettingsStorageEngine({
      getItem: () => Promise.reject(new Error('disk unavailable')),
      setItem: () => Promise.resolve(),
      removeItem: () => Promise.resolve(),
    });
    assert.equal(await useSettingsStore.getState().hydrateTheme(), 'system');
  });
});
