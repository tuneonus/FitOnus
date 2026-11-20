import { networkState } from './helpers/native-network';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../src/services/api-client';
import { queryClient } from '../src/providers/query-provider';
import { useAuthStore } from '../src/features/auth/stores/auth-store';
import { useNutritionStore } from '../src/features/nutrition/store/nutritionStore';
import {
  formatRecordingClock,
  hasReachedRecordingLimit,
  judgeRecording,
  VOICE_MAX_SECONDS,
  VOICE_MIN_SECONDS,
  VOICE_TRANSCRIPT_MAX_LENGTH,
} from '../src/features/nutrition/utils/voice-recording-limit';
import {
  MEAL_PHOTO_MAX_BASE64_CHARS,
  MEAL_PHOTO_QUALITY,
  MEAL_PHOTO_TOO_LARGE_MESSAGE,
  MEAL_PHOTO_UNREADABLE_MESSAGE,
  MEAL_PHOTO_UNSUPPORTED_MESSAGE,
  prepareMealPhoto,
} from '../src/features/nutrition/utils/meal-photo-upload';
import { MAX_IMAGE_BASE64_CHARS } from '../../backend/src/shared/ai/body-limits';
import { AI_ESTIMATE_LIMITS } from '../../backend/src/modules/nutrition/domain/nutrition-limits';
import { Food } from '../../backend/src/modules/nutrition/domain/food';
import { toMealItemPayload } from '../src/features/nutrition/utils/meal-payload';
import { mapBackendFoodToFoodItem } from '../src/features/nutrition/utils/nutrition-calculator';
import type { BackendFoodView } from '../src/features/nutrition/types/nutrition';
import {
  createFakeNutritionBackend,
  fixtureId,
  type FakeNutritionBackend,
} from './helpers/nutrition-backend-adapter';

describe('voice meal recording limits', () => {
  it('allows a minute and ignores anything shorter than a second', () => {
    assert.equal(VOICE_MAX_SECONDS, 60);
    assert.equal(VOICE_MIN_SECONDS, 1);
    assert.equal(judgeRecording(0), 'too_short');
    assert.equal(judgeRecording(999), 'too_short');
    assert.equal(judgeRecording(1000), 'ok');
    assert.equal(judgeRecording(59_000), 'ok');
  });

  it('stops exactly at the limit, not before', () => {
    assert.equal(hasReachedRecordingLimit(59_999), false);
    assert.equal(hasReachedRecordingLimit(60_000), true);
    assert.equal(hasReachedRecordingLimit(75_000), true);
  });

  it('shows the clock, never past the limit', () => {
    assert.equal(formatRecordingClock(0), '0:00');
    assert.equal(formatRecordingClock(7_400), '0:07');
    assert.equal(formatRecordingClock(59_999), '0:59');
    assert.equal(formatRecordingClock(60_000), '1:00');
    assert.equal(formatRecordingClock(62_000), '1:00');
    assert.equal(formatRecordingClock(-5), '0:00');
  });

  it('keeps typed text within what the backend accepts', () => {
    assert.equal(VOICE_TRANSCRIPT_MAX_LENGTH, AI_ESTIMATE_LIMITS.transcriptLength);
  });

  it('the screen enforces the limit in the recorder and by timer, and refuses an accidental tap', () => {
    const source = readFileSync(
      resolve(__dirname, '../src/features/nutrition/screens/VoiceMealEntryScreen.tsx'),
      'utf8',
    );
    // The native recorder stops at the limit by itself ...
    assert.match(source, /recorder\.record\(\{ forDuration: VOICE_MAX_SECONDS \}\)/);
    // ... the app stops it when its own clock reaches the limit ...
    assert.match(source, /hasReachedRecordingLimit\(recorderState\.durationMillis\)/);
    // ... and a clip shorter than the minimum never reaches the AI.
    assert.match(source, /judgeRecording\(durationMs\) === 'too_short'/);
  });
});

describe('meal photo preparation', () => {
  const jpeg = 'A'.repeat(1000);

  it('compresses harder than before and mirrors the server size limit', () => {
    assert.ok(MEAL_PHOTO_QUALITY < 0.7, 'was 0.7');
    assert.equal(MEAL_PHOTO_MAX_BASE64_CHARS, MAX_IMAGE_BASE64_CHARS);
  });

  it('passes a normal photo through with its type', () => {
    assert.deepEqual(prepareMealPhoto({ base64: jpeg, mimeType: 'image/jpeg' }), {
      ok: true,
      base64: jpeg,
      mimeType: 'image/jpeg',
    });
  });

  it('fixes the type labels some phones attach, which the server would refuse', () => {
    assert.equal((prepareMealPhoto({ base64: jpeg, mimeType: 'image/jpg' }) as { mimeType: string }).mimeType, 'image/jpeg');
    assert.equal((prepareMealPhoto({ base64: jpeg, mimeType: 'IMAGE/JPEG' }) as { mimeType: string }).mimeType, 'image/jpeg');
    assert.equal((prepareMealPhoto({ base64: jpeg, mimeType: 'image/heif' }) as { mimeType: string }).mimeType, 'image/heic');
  });

  it('falls back to the file extension, then to JPEG, when the picker does not say', () => {
    const type = (photo: Parameters<typeof prepareMealPhoto>[0]) =>
      (prepareMealPhoto(photo) as { mimeType: string }).mimeType;
    assert.equal(type({ base64: jpeg, uri: 'file:///cache/IMG_1.PNG?x=1' }), 'image/png');
    assert.equal(type({ base64: jpeg, uri: 'file:///cache/IMG_2.heic' }), 'image/heic');
    assert.equal(type({ base64: jpeg, uri: 'file:///cache/photo' }), 'image/jpeg');
  });

  it('refuses a photo that would be turned down after a long upload, before uploading it', () => {
    const tooBig = prepareMealPhoto({ base64: 'A'.repeat(MEAL_PHOTO_MAX_BASE64_CHARS + 1), mimeType: 'image/jpeg' });
    assert.deepEqual(tooBig, { ok: false, message: MEAL_PHOTO_TOO_LARGE_MESSAGE });
    assert.equal(
      prepareMealPhoto({ base64: 'A'.repeat(MEAL_PHOTO_MAX_BASE64_CHARS), mimeType: 'image/jpeg' }).ok,
      true,
      'exactly at the limit is fine',
    );
  });

  it('refuses a photo that could not be read, and types the AI cannot use', () => {
    assert.deepEqual(prepareMealPhoto({ base64: '', mimeType: 'image/jpeg' }), {
      ok: false,
      message: MEAL_PHOTO_UNREADABLE_MESSAGE,
    });
    assert.deepEqual(prepareMealPhoto({ base64: null }), { ok: false, message: MEAL_PHOTO_UNREADABLE_MESSAGE });
    assert.deepEqual(prepareMealPhoto({ base64: jpeg, mimeType: 'image/gif' }), {
      ok: false,
      message: MEAL_PHOTO_UNSUPPORTED_MESSAGE,
    });
  });

  it('both capture paths use it', () => {
    const source = readFileSync(
      resolve(__dirname, '../src/features/nutrition/screens/MealPhotoScreen.tsx'),
      'utf8',
    );
    assert.equal(source.match(/quality: MEAL_PHOTO_QUALITY/g)?.length, 2);
    assert.match(source, /prepareMealPhoto\(asset\)/);
    assert.equal(/quality: 0\.\d/.test(source), false, 'no hard-coded quality is left');
  });
});

// --- diary navigation -----------------------------------------------------------------------------------------

const SRC = resolve(__dirname, '../src');
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('nutrition diary navigation (the screens the app actually registers)', () => {
  const registry = readFileSync(join(SRC, 'app/routes/screenRegistry.tsx'), 'utf8');
  const routeUnion = readFileSync(join(SRC, 'app/navigation/routes.ts'), 'utf8');
  const registered = new Set([...registry.matchAll(/^\s{2}([a-zA-Z]+): [A-Z]\w+,$/gm)].map((m) => m[1]!));
  const known = new Set([...routeUnion.matchAll(/\|\s*'([a-zA-Z]+)'/g)].map((m) => m[1]!));

  it('every nutrition screen is registered and a known route', () => {
    for (const route of [
      'nutrition',
      'foodSearch',
      'foodDetail',
      'barcodeScanner',
      'mealPhoto',
      'mealAnalysis',
      'mealDiary',
      'nutritionAnalytics',
      'voiceMealEntry',
    ]) {
      assert.ok(registered.has(route), `${route} is not in screenRegistry`);
      assert.ok(known.has(route), `${route} is not in the route union`);
    }
  });

  it('every route the nutrition screens navigate to exists', () => {
    const files = [
      ...sourceFiles(join(SRC, 'features/nutrition')),
      join(SRC, 'features/home/components/NutritionSummary.tsx'),
    ];
    const targets = new Set<string>();
    for (const file of files) {
      for (const match of readFileSync(file, 'utf8').matchAll(/\b(?:navigate|replace)\(\s*'([a-zA-Z]+)'/g)) {
        targets.add(match[1]!);
      }
    }
    assert.ok(targets.has('mealDiary'), 'the diary is linked from the nutrition screen');
    for (const target of targets) {
      assert.ok(registered.has(target), `navigate('${target}') has no screen in screenRegistry`);
    }
  });

  it('the diary is reachable from the nutrition screen, and every diary day leads back to that day', () => {
    const nutrition = readFileSync(join(SRC, 'features/nutrition/screens/NutritionScreen.tsx'), 'utf8');
    assert.equal(nutrition.match(/navigate\('mealDiary'\)/g)?.length, 2, 'summary card and list row');

    const diary = readFileSync(join(SRC, 'features/nutrition/screens/MealDiaryScreen.tsx'), 'utf8');
    // The tapped day is selected first, then the nutrition screen opens on it.
    assert.match(diary, /setSelectedDate\(day\.date\);\s*navigate\('nutrition'\);/);
    // The week ends on the device's own today, not on whatever "today" the server works out.
    assert.match(diary, /getNutritionAnalytics\('week', today\)/);
  });

  it('nothing the live nutrition screens render comes from the mock data files', () => {
    const live = sourceFiles(join(SRC, 'features/nutrition'))
      .filter((file) => !file.includes(`${join('features', 'nutrition', 'data')}`))
      .filter((file) => /(screens|components|store|api|services)/.test(file));
    for (const file of live) {
      assert.equal(/foodsMock|nutritionAnalyticsMock/.test(readFileSync(file, 'utf8')), false, file);
    }
  });
});

describe('opening a diary day shows that day (store flow behind the diary tap)', () => {
  const originals = {
    adapter: apiClient.defaults.adapter,
    getItem: AsyncStorage.getItem,
    setItem: AsyncStorage.setItem,
    removeItem: AsyncStorage.removeItem,
  };
  const storage = new Map<string, string>();
  let backend: FakeNutritionBackend;
  const USER = fixtureId(1);
  const EGG = fixtureId(2);
  const TODAY = '2026-11-06';
  const EARLIER = '2026-11-03';

  beforeEach(() => {
    networkState.isConnected = true;
    networkState.isInternetReachable = true;
    useAuthStore
      .getState()
      .setAuth({ id: USER, name: 'Tester', email: 'tester@example.test', isEmailVerified: true });
    storage.clear();
    AsyncStorage.getItem = async (key) => storage.get(key) ?? null;
    AsyncStorage.setItem = async (key, value) => {
      storage.set(key, value);
    };
    AsyncStorage.removeItem = async (key) => {
      storage.delete(key);
    };
    backend = createFakeNutritionBackend(USER);
    backend.addFood(
      new Food({
        id: EGG,
        name: 'Egg, whole, raw',
        brand: null,
        barcode: null,
        servingSize: 1,
        servingUnit: 'piece',
        servingWeightG: 50,
        servingBasis: '100g',
        calories: 143,
        proteinG: 12.56,
        carbohydratesG: 0.72,
        fatG: 9.51,
        fiberG: 0,
        dataSource: 'usda_fdc',
        sourceId: '171287',
        isCustom: false,
        isVerified: true,
        verificationStatus: 'verified',
        createdBy: null,
      }),
    );
    apiClient.defaults.adapter = backend.adapter as never;
    queryClient.clear();
  });

  afterEach(() => {
    apiClient.defaults.adapter = originals.adapter;
    AsyncStorage.getItem = originals.getItem;
    AsyncStorage.setItem = originals.setItem;
    AsyncStorage.removeItem = originals.removeItem;
  });

  it('selecting an earlier day, then opening the nutrition screen, loads that day\'s meals', async () => {
    const item = mapBackendFoodToFoodItem(backend.foodView(EGG) as BackendFoodView);
    // Logged straight to the backend, as it would have been on an earlier day.
    await apiClient.post('/nutrition/meals', {
      id: fixtureId(300),
      mealType: 'breakfast',
      date: EARLIER,
      items: [toMealItemPayload(item)],
    });

    useNutritionStore.getState().setSelectedDate(TODAY);
    await new Promise((resolve) => setTimeout(resolve, 15));
    assert.equal(useNutritionStore.getState().entries.length, 0);

    // The diary tap ...
    useNutritionStore.getState().setSelectedDate(EARLIER);
    // ... and the nutrition screen's own load on mount (no date given: it uses the selected one).
    await useNutritionStore.getState().fetchDailyNutrition();

    const state = useNutritionStore.getState();
    assert.equal(state.dailySummary?.date, EARLIER);
    assert.equal(state.entries.length, 1);
    assert.equal(state.entries[0]?.date, EARLIER);
  });
});
