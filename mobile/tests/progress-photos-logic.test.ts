import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampDay,
  daysBetween,
  defaultComparisonPair,
  formatMonth,
  formatTakenOn,
  groupPhotosByMonth,
  limitState,
  localDayKey,
  orderPair,
  shiftDay,
  togglePick,
} from '../src/features/progress/utils/photo-gallery';
import { dayFromExifDate } from '../src/shared/media/exif-date';
import type { ProgressPhotoItem, ProgressPhotoTag } from '../src/features/progress/types/progress-photos';

let n = 0;
function photo(takenOn: string, tag: ProgressPhotoTag | null = null, createdAt = `${takenOn}T08:00:00.000Z`): ProgressPhotoItem {
  n += 1;
  return {
    id: `photo-${n}`,
    takenOn,
    tag,
    width: 600,
    height: 800,
    createdAt,
    version: 'a'.repeat(32),
    thumbnailUrl: 'https://example.test/t.webp',
    urlExpiresAt: '2026-11-20T12:15:00.000Z',
  };
}

describe('dates', () => {
  it('formats a day without any locale or time-zone dependence', () => {
    assert.equal(formatTakenOn('2026-11-18'), 'Nov 18, 2026');
    assert.equal(formatTakenOn('2026-01-05'), 'Jan 5, 2026');
    assert.equal(formatMonth('2026-03-31'), 'March 2026');
    assert.equal(formatTakenOn('garbage'), 'garbage');
    assert.equal(formatTakenOn('2026-13-01'), '2026-13-01');
  });

  it('builds the member\'s local day key', () => {
    assert.equal(localDayKey(new Date(2026, 10, 5, 23, 59)), '2026-11-05');
    assert.equal(localDayKey(new Date(2026, 0, 1, 0, 0)), '2026-01-01');
  });

  it('counts calendar days across month ends, leap years and daylight saving', () => {
    assert.equal(daysBetween('2026-11-20', '2026-11-20'), 0);
    assert.equal(daysBetween('2026-01-31', '2026-03-01'), 29);
    assert.equal(daysBetween('2024-02-28', '2024-03-01'), 2);
    assert.equal(daysBetween('2026-03-07', '2026-03-09'), 2);
    assert.equal(daysBetween('2026-11-20', '2026-11-10'), -10);
    assert.equal(daysBetween('x', '2026-11-10'), 0);
  });
});

describe('groupPhotosByMonth', () => {
  it('keeps the server order (newest first) between and inside months', () => {
    const photos = [photo('2026-11-18'), photo('2026-11-02'), photo('2026-10-30'), photo('2026-08-01')];
    const groups = groupPhotosByMonth(photos);
    assert.deepEqual(groups.map((g) => [g.key, g.label, g.photos.length]), [
      ['2026-11', 'November 2026', 2],
      ['2026-10', 'October 2026', 1],
      ['2026-08', 'August 2026', 1],
    ]);
    assert.deepEqual(groups[0]!.photos.map((p) => p.takenOn), ['2026-11-18', '2026-11-02']);
  });

  it('separates the same month of different years and handles nothing', () => {
    assert.equal(groupPhotosByMonth([photo('2026-03-01'), photo('2025-03-01')]).length, 2);
    assert.deepEqual(groupPhotosByMonth([]), []);
  });
});

describe('limitState', () => {
  it('says nothing until the server says it is near the limit', () => {
    assert.deepEqual(limitState(10, 50, false), { canAdd: true, remaining: 40, banner: null });
  });

  it('warns when near the limit and still allows adding', () => {
    const state = limitState(47, 50, true);
    assert.equal(state.canAdd, true);
    assert.equal(state.remaining, 3);
    assert.equal(state.banner?.tone, 'warning');
    assert.match(state.banner!.title, /47 of 50/);
  });

  it('blocks adding at the limit and says what to do', () => {
    const state = limitState(50, 50, true);
    assert.equal(state.canAdd, false);
    assert.equal(state.remaining, 0);
    assert.equal(state.banner?.tone, 'error');
    assert.match(state.banner!.body, /Delete/);
  });

  it('never reports negative room', () => {
    assert.equal(limitState(55, 50, true).remaining, 0);
  });
});

describe('comparison', () => {
  it('orders two photos by day, then by upload time', () => {
    const early = photo('2026-01-01');
    const late = photo('2026-06-01');
    assert.equal(orderPair(late, early).before, early);
    assert.equal(orderPair(early, late).after, late);
    const morning = photo('2026-05-05', null, '2026-05-05T07:00:00.000Z');
    const evening = photo('2026-05-05', null, '2026-05-05T19:00:00.000Z');
    assert.equal(orderPair(evening, morning).before, morning);
  });

  it('offers the oldest against the newest by default', () => {
    const photos = [photo('2026-06-01'), photo('2026-01-01'), photo('2026-09-01')];
    const pair = defaultComparisonPair(photos)!;
    assert.equal(pair.before.takenOn, '2026-01-01');
    assert.equal(pair.after.takenOn, '2026-09-01');
  });

  it('prefers the newest photo with the same tag as the oldest, for a fair comparison', () => {
    const photos = [photo('2026-09-01', 'back'), photo('2026-08-01', 'front'), photo('2026-01-01', 'front'), photo('2026-07-01', 'side')];
    const pair = defaultComparisonPair(photos)!;
    assert.equal(pair.before.takenOn, '2026-01-01');
    assert.equal(pair.after.takenOn, '2026-08-01');
    assert.equal(pair.after.tag, 'front');
  });

  it('needs at least two photos', () => {
    assert.equal(defaultComparisonPair([]), null);
    assert.equal(defaultComparisonPair([photo('2026-01-01')]), null);
  });

  it('selects at most two: a third pick replaces the first, picking again unpicks', () => {
    assert.deepEqual(togglePick([], 'a'), ['a']);
    assert.deepEqual(togglePick(['a'], 'b'), ['a', 'b']);
    assert.deepEqual(togglePick(['a', 'b'], 'c'), ['b', 'c']);
    assert.deepEqual(togglePick(['a', 'b'], 'a'), ['b']);
  });
});

describe('suggesting the day from the picture', () => {
  it('reads the camera date', () => {
    assert.equal(dayFromExifDate('2026:11:18 08:30:00'), '2026-11-18');
    assert.equal(dayFromExifDate('2026-11-18T08:30:00'), '2026-11-18');
    assert.equal(dayFromExifDate(' 2026:01:05'), '2026-01-05');
  });

  it('ignores anything that is not a real, plausible date', () => {
    for (const bad of [undefined, null, 42, '', 'yesterday', '2026:02:30 10:00:00', '1999:12:31 10:00:00', '0000:00:00 00:00:00', '2026:13:01 00:00:00']) {
      assert.equal(dayFromExifDate(bad), null, String(bad));
    }
  });

  it('moves a day across month and year ends, and keeps it between 2000 and today', () => {
    assert.equal(shiftDay('2026-03-01', -1), '2026-02-28');
    assert.equal(shiftDay('2026-12-31', 1), '2027-01-01');
    assert.equal(shiftDay('2024-03-01', -1), '2024-02-29');
    assert.equal(shiftDay('2026-11-20', -7), '2026-11-13');
    assert.equal(clampDay('2027-05-01', '2026-11-20'), '2026-11-20');
    assert.equal(clampDay('1990-01-01', '2026-11-20'), '2000-01-01');
    assert.equal(clampDay('2026-06-01', '2026-11-20'), '2026-06-01');
  });
});
