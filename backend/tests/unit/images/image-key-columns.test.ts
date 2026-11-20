import { describe, expect, it } from 'vitest';
import {
  IMAGE_KEY_COLUMNS,
  LOOKS_LIKE_IMAGE_KEY_COLUMN,
} from '../../../src/shared/images/image-key-columns.js';
import { PUBLIC_IMAGE_FEATURES } from '../../../src/shared/images/image-policy.js';

describe('the image-key registry (what the application still references in the public bucket)', () => {
  it('lists every column that holds a public image key today', () => {
    expect(IMAGE_KEY_COLUMNS.map((c) => `${c.table}.${c.column}`).sort()).toEqual([
      'exercises.image_key',
      'notification_campaigns.image_key',
      'workouts.cover_image_key',
    ]);
  });

  it('lists a column only once', () => {
    const names = IMAGE_KEY_COLUMNS.map((c) => `${c.table}.${c.column}`);
    expect(new Set(names).size).toBe(names.length);
  });

  it('has at least one column for every public image feature, so a new feature cannot be added without one', () => {
    for (const feature of PUBLIC_IMAGE_FEATURES) {
      expect(
        IMAGE_KEY_COLUMNS.some((c) => c.feature === feature),
        `no registered column stores ${feature} keys`,
      ).toBe(true);
    }
  });

  it('only names features that exist', () => {
    for (const column of IMAGE_KEY_COLUMNS) {
      expect((PUBLIC_IMAGE_FEATURES as readonly string[]).includes(column.feature)).toBe(true);
    }
  });

  it('records the push JPEG as the one derivative, and only for notifications', () => {
    for (const column of IMAGE_KEY_COLUMNS) {
      expect(column.derivatives).toEqual(column.feature === 'notifications' ? ['push'] : []);
    }
  });

  it('uses plain identifiers, so a future cleanup can put them in SQL without quoting surprises', () => {
    for (const { table, column } of IMAGE_KEY_COLUMNS) {
      expect(table).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(column).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('never lists a private member image column: avatars and progress photos are not in this bucket', () => {
    for (const { table, column } of IMAGE_KEY_COLUMNS) {
      expect(`${table}.${column}`).not.toMatch(/avatar|progress|meal|photo|profile|user/);
    }
  });
});

describe('LOOKS_LIKE_IMAGE_KEY_COLUMN (the rule the database consistency test uses)', () => {
  it.each(['image_key', 'cover_image_key', 'avatar_key', 'photo_key', 'banner_image_key', 'thumbnail_key'])(
    'matches %s',
    (name) => {
      expect(LOOKS_LIKE_IMAGE_KEY_COLUMN.test(name)).toBe(true);
    },
  );

  it.each(['image_url', 'video_url', 'name', 'idempotency_key', 'api_key', 'primary_key', 'cover_color'])(
    'does not match %s',
    (name) => {
      expect(LOOKS_LIKE_IMAGE_KEY_COLUMN.test(name)).toBe(false);
    },
  );

  it('matches every registered column, so the registry can never disagree with its own rule', () => {
    for (const { column } of IMAGE_KEY_COLUMNS) expect(LOOKS_LIKE_IMAGE_KEY_COLUMN.test(column)).toBe(true);
  });
});
