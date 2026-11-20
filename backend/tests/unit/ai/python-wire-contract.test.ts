import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { UserFitnessContext } from '../../../src/modules/coach/domain/coach.types.js';
import { PythonCoachChatService } from '../../../src/modules/coach/infrastructure/python-coach-chat-service.js';
import { PythonCoachInsightsService } from '../../../src/modules/coach/infrastructure/python-coach-insights-service.js';
import { PythonSpeechTranscriber } from '../../../src/modules/coach/infrastructure/python-speech-transcriber.js';
import { PythonMealPhotoService } from '../../../src/modules/nutrition/infrastructure/python-meal-photo-service.js';
import { PythonVoiceMealService } from '../../../src/modules/nutrition/infrastructure/python-voice-meal-service.js';
import { runWithAiRequestContext } from '../../../src/shared/ai/ai-usage.js';
import { PythonAiClient } from '../../../src/shared/ai/python-ai-client.js';
import {
  json,
  okCoachReply,
  okInsightsReply,
  okMealPhotoReply,
  okTranscribeReply,
  okVoiceReply,
  startFakePythonServer,
  type FakePythonServer,
} from '../../helpers/fake-python-ai-server.js';

/**
 * The Node <-> Python wire contract (audit M7).
 *
 * Node mirrors Python's request and reply models by hand, and Python rejects unknown request fields, so a
 * field added on one side only breaks the feature. ai-backend/tests/fixtures/contracts/wire_fields.json is
 * generated from the Pydantic models (ai-backend/tests/test_wire_contract.py keeps it current). Here the
 * REAL adapters send their requests to a fake server, and both what they send and what the fakes reply
 * with are checked against that file:
 *   - nothing may be sent or replied that the Python model does not know (Python would answer 422),
 *   - everything the Python model requires must be there.
 */

const SECRET = 'unit-test-secret-unit-test-secret-1234';
const USER = '11111111-1111-4111-8111-111111111111';

// --- the snapshot -----------------------------------------------------------------------------------------------

interface Spec {
  /** path -> required inside its parent object. `a.b` is an object field, `a[]` is an array element. */
  fields: Record<string, boolean>;
  /** Free-form objects (`dict[str, Any]`): their inside is not part of the contract. */
  open: string[];
}
const snapshot = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../../../ai-backend/tests/fixtures/contracts/wire_fields.json'),
    'utf8',
  ),
) as Record<string, { request: Spec; response: Spec }>;

interface Walked {
  /** Every path that appears, including null leaves. */
  seen: Set<string>;
  /** Paths whose value is an object, so their required children must exist ('' is the body itself). */
  objects: Set<string>;
}

function walk(value: unknown, prefix: string, open: ReadonlySet<string>, out: Walked): void {
  if (Array.isArray(value)) {
    const element = `${prefix}[]`;
    for (const item of value) {
      out.seen.add(element);
      walk(item, element, open, out);
    }
    return;
  }
  if (value !== null && typeof value === 'object') {
    out.objects.add(prefix);
    if (open.has(prefix)) return;
    for (const [key, child] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      out.seen.add(path);
      walk(child, path, open, out);
    }
  }
}

const parentOf = (path: string): string => {
  if (path.endsWith('[]')) return path.slice(0, -2);
  const dot = path.lastIndexOf('.');
  return dot < 0 ? '' : path.slice(0, dot);
};

/** What is wrong with `value` as seen by the Python model: unknown paths, and required paths that are missing. */
function violations(value: unknown, spec: Spec): { unknown: string[]; missing: string[] } {
  const walked: Walked = { seen: new Set(), objects: new Set() };
  walk(value, '', new Set(spec.open), walked);
  const unknown = [...walked.seen].filter((path) => !(path in spec.fields)).sort();
  const missing = Object.entries(spec.fields)
    .filter(([path, required]) => required && walked.objects.has(parentOf(path)) && !walked.seen.has(path))
    .map(([path]) => path)
    .sort();
  return { unknown, missing };
}

// --- inputs shaped by Node's own types (a new field in these types fails to compile until it is added) -----------

const context: UserFitnessContext = {
  profile: {
    displayName: 'Arun',
    sex: 'male',
    age: 29,
    heightCm: 178,
    currentWeightKg: 74,
    targetWeightKg: 70,
    primaryGoal: 'Lose fat',
    experienceLevel: 'Intermediate',
    preferredWorkoutPlace: 'Gym',
    workoutDaysPerWeek: 4,
    dietType: 'Vegetarian',
    dailyCalorieTarget: 2200,
    dailyProteinGrams: 130,
  },
  todayNutrition: {
    caloriesConsumed: 1200,
    proteinGrams: 60,
    carbsGrams: 150,
    fatGrams: 40,
    waterIntakeMl: 1500,
    calorieTarget: 2200,
    proteinTarget: 130,
  },
  recentWorkouts: [
    {
      name: 'Push Day',
      durationMinutes: 55,
      volumeKg: 4200,
      totalSets: 18,
      caloriesBurned: 320,
      completedAt: '2026-11-20T10:00:00.000Z',
    },
  ],
  todayPlannedWorkout: { name: 'Pull Day', durationMinutes: 50, exercisesCount: 6 },
  activeGoals: [
    { title: 'Bench 80 kg', category: 'strength', targetValue: 80, currentValue: 70, unit: 'kg' },
  ],
  latestWeightKg: 73.6,
};

describe('Node <-> Python wire contract (ai-backend/tests/fixtures/contracts/wire_fields.json)', () => {
  let server: FakePythonServer;

  const client = () => new PythonAiClient({ baseUrl: server.url, serviceSecret: SECRET });
  const deps = () => ({
    client: client(),
    resolveModels: () => Promise.resolve({ primary: 'primary-model', fallback: 'fallback-model' }),
    pythonTimeoutMs: 5_000,
  });
  const asUser = <T>(work: () => Promise<T>) =>
    runWithAiRequestContext({ userId: USER, action: 'coach_chat', dispatched: false }, work);
  const sent = () => {
    expect(server.requests).toHaveLength(1);
    return server.requests[0]!.body;
  };

  beforeEach(async () => {
    server = await startFakePythonServer();
  });
  afterEach(async () => {
    await server.close();
  });

  const cases: Array<{
    name: keyof typeof snapshot;
    reply: () => Record<string, unknown>;
    call: () => Promise<unknown>;
  }> = [
    {
      name: 'coach_chat',
      reply: okCoachReply,
      call: () =>
        asUser(() =>
          new PythonCoachChatService(deps()).generateCoachResponse(
            'How much protein?',
            context,
            [
              { role: 'user', text: 'Hi' },
              { role: 'assistant', text: 'Hello!' },
            ],
            ['Prefers vegetarian food'],
          ),
        ),
    },
    {
      name: 'coach_insights',
      reply: okInsightsReply,
      call: () => asUser(() => new PythonCoachInsightsService(deps()).generateInsights(context, 'ta')),
    },
    {
      name: 'voice_meal',
      reply: okVoiceReply,
      call: () =>
        asUser(() =>
          new PythonVoiceMealService(deps()).parseVoiceMeal({
            transcript: 'two dosa and sambar',
            audio: { mimeType: 'audio/m4a', base64: 'AAECAw==' },
            lang: 'tanglish',
            mealType: 'breakfast',
          }),
        ),
    },
    {
      name: 'meal_photo',
      reply: okMealPhotoReply,
      call: () =>
        asUser(() =>
          new PythonMealPhotoService(deps()).analyzePhoto(
            { mimeType: 'image/jpeg', base64: '/9j/AAAA' },
            'lunch',
            'no sugar',
          ),
        ),
    },
    {
      name: 'transcribe',
      reply: okTranscribeReply,
      call: () =>
        new PythonSpeechTranscriber(deps()).transcribe(USER, { mimeType: 'audio/m4a', base64: 'AAECAw==' }),
    },
  ];

  for (const { name, reply, call } of cases) {
    describe(String(name), () => {
      it('sends a request body the Python model accepts (nothing unknown, nothing required missing)', async () => {
        server.respond((_request, response) => json(response, 200, reply()));
        await call();
        expect(violations(sent(), snapshot[name]!.request)).toEqual({ unknown: [], missing: [] });
      });

      it('has a fake reply (used by every other Node test) that matches what Python really returns', () => {
        expect(violations(reply(), snapshot[name]!.response)).toEqual({ unknown: [], missing: [] });
      });
    });
  }

  it('would notice a drifted request (the check is not vacuous)', () => {
    const request = snapshot.transcribe!.request;
    expect(
      violations({ audio: { mimeType: 'a', base64: 'b' }, model: { primary: 'm' }, deadlineMs: 1 }, request),
    ).toEqual({
      unknown: [],
      missing: [],
    });
    expect(
      violations(
        { audio: { mimeType: 'a', base64: 'b' }, model: { primary: 'm' }, deadlineMs: 1, extra: 1 },
        request,
      ).unknown,
    ).toEqual(['extra']);
    expect(violations({ audio: { mimeType: 'a' }, model: { primary: 'm' } }, request).missing).toEqual([
      'audio.base64',
      'deadlineMs',
    ]);
  });
});
