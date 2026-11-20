import { describe, expect, it } from 'vitest';
import {
  createExerciseAdminRequest,
  exerciseViewSchema,
  updateExerciseAdminRequest,
  uploadedExerciseImageSchema,
} from '../../../src/modules/workouts/interface/workouts.schemas.js';

const HEX = '0123456789abcdef0123456789abcdef';
const KEY = `onusfit/exercises/${HEX}.webp`;

const create = {
  name: 'Squat',
  instructions: ['Stand up'],
  primaryMuscles: ['quads'],
  equipment: 'barbell',
  category: 'strength',
  difficulty: 'beginner',
};

const parseCreate = (extra: Record<string, unknown>) =>
  createExerciseAdminRequest.body.safeParse({ ...create, ...extra });
const parseUpdate = (extra: Record<string, unknown>) => updateExerciseAdminRequest.body.safeParse(extra);

describe('exercise request schemas: external addresses', () => {
  it.each(['imageUrl', 'videoUrl'])('%s accepts http and https', (field) => {
    expect(parseCreate({ [field]: 'https://cdn.example.com/a' }).success).toBe(true);
    expect(parseCreate({ [field]: 'http://cdn.example.com/a' }).success).toBe(true);
    expect(parseUpdate({ [field]: 'https://cdn.example.com/a' }).success).toBe(true);
  });

  it.each(['imageUrl', 'videoUrl'])('%s accepts null (clearing it) and may be left out', (field) => {
    expect(parseCreate({ [field]: null }).success).toBe(true);
    expect(parseCreate({}).success).toBe(true);
    expect(parseUpdate({ [field]: null }).success).toBe(true);
    expect(parseUpdate({}).success).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    'file:///etc/passwd',
    'ftp://x.example/a.png',
    'blob:https://x.example/uuid',
    '//cdn.example.com/a.jpg',
    '/images/a.jpg',
    'cdn.example.com/a.jpg',
    'not a url',
    '',
    '   ',
  ])('refuses %j for both fields, on create and on update', (value) => {
    for (const field of ['imageUrl', 'videoUrl']) {
      expect(parseCreate({ [field]: value }).success, `create ${field}`).toBe(false);
      expect(parseUpdate({ [field]: value }).success, `update ${field}`).toBe(false);
    }
  });

  it('refuses an address over 2048 characters', () => {
    expect(parseCreate({ imageUrl: `https://cdn.example.com/${'a'.repeat(2048)}` }).success).toBe(false);
  });

  it('trims surrounding whitespace before checking', () => {
    const parsed = parseCreate({ imageUrl: '  https://cdn.example.com/a.jpg  ' });
    expect(parsed.success && parsed.data.imageUrl).toBe('https://cdn.example.com/a.jpg');
  });
});

describe('exercise request schemas: imageKey', () => {
  it('accepts the key the upload endpoint returns, and null to remove it, on create and update', () => {
    expect(parseCreate({ imageKey: KEY }).success).toBe(true);
    expect(parseUpdate({ imageKey: KEY }).success).toBe(true);
    expect(parseCreate({ imageKey: null }).success).toBe(true);
    expect(parseUpdate({ imageKey: null }).success).toBe(true);
  });

  it('distinguishes "left out" (unchanged) from null (remove) on update', () => {
    const left = parseUpdate({ name: 'x' });
    const removed = parseUpdate({ imageKey: null });
    expect(left.success && 'imageKey' in left.data).toBe(false);
    expect(removed.success && removed.data.imageKey).toBeNull();
  });

  it.each([
    `onusfit/notifications/${HEX}.webp`,
    `notifications/${HEX}.png`,
    `onusfit/exercises/${HEX}.push.jpg`,
    `onusfit/exercises/${HEX}.png`,
    `https://media.example.test/${KEY}`,
    `onusfit/exercises/../exercises/${HEX}.webp`,
    `onusfit/exercises/${HEX.toUpperCase()}.webp`,
    'onusfit/exercises/short.webp',
    '',
    42,
  ])('refuses %j', (value) => {
    expect(parseCreate({ imageKey: value }).success).toBe(false);
    expect(parseUpdate({ imageKey: value }).success).toBe(false);
  });

  it('has no field through which an external address can become an uploaded image: imageUrl never reaches imageKey', () => {
    const parsed = parseCreate({ imageUrl: 'https://cdn.example.com/a.jpg' });
    expect(parsed.success && parsed.data.imageKey).toBeUndefined();
  });
});

describe('exercise response schemas', () => {
  const view = {
    id: '8f4b3a64-1d1c-4c3e-8e69-5d3d2f9c7a01',
    name: 'Squat',
    description: null,
    instructions: [],
    tips: [],
    commonMistakes: [],
    primaryMuscles: [],
    secondaryMuscles: [],
    equipment: 'barbell',
    category: 'strength',
    difficulty: 'beginner',
    isCompound: true,
    imageUrl: null,
    imageKey: null,
    externalImageUrl: null,
    videoUrl: null,
    isSystem: true,
    createdAt: '2026-11-20T00:00:00.000Z',
    updatedAt: '2026-11-20T00:00:00.000Z',
  };

  it('carries the three image fields, all nullable', () => {
    expect(exerciseViewSchema.parse(view)).toMatchObject({
      imageUrl: null,
      imageKey: null,
      externalImageUrl: null,
    });
    expect(
      exerciseViewSchema.parse({
        ...view,
        imageUrl: 'https://m.example/a.webp',
        imageKey: KEY,
        externalImageUrl: 'https://x.example/a.jpg',
      }),
    ).toMatchObject({ imageKey: KEY });
  });

  it('keeps the fields the mobile app already reads, with the same types', () => {
    const parsed = exerciseViewSchema.parse(view);
    for (const field of [
      'id',
      'name',
      'description',
      'instructions',
      'tips',
      'primaryMuscles',
      'secondaryMuscles',
      'equipment',
      'category',
      'difficulty',
      'imageUrl',
      'videoUrl',
    ]) {
      expect(parsed).toHaveProperty(field);
    }
  });

  it('the upload response is the same shape every public image upload answers with', () => {
    const uploaded = {
      imageKey: KEY,
      imageUrl: `https://m.example/${KEY}`,
      contentType: 'image/webp',
      sizeBytes: 10,
      width: 2,
      height: 2,
      source: { format: 'heic', bytes: 100, width: 4032, height: 3024 },
    };
    expect(uploadedExerciseImageSchema.parse(uploaded)).toEqual(uploaded);
  });
});
