import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PUBLIC_IMAGE_FEATURES } from '../../../src/shared/images/image-policy.js';
import { R2ObjectStore } from '../../../src/shared/storage/r2-object-store.js';
import { R2PrivateObjectStore } from '../../../src/shared/storage/r2-private-object-store.js';

/**
 * Member photos live in a PRIVATE bucket behind their own port, client and credentials; the PUBLIC bucket holds
 * admin-authored artwork and is never deleted from by this code base. These tests pin the wall between the two, so a
 * future change that blurs it (a private key written to the public bucket, or public media reachable from the private
 * deletion path) fails here instead of in production.
 */

const SRC = path.resolve(import.meta.dirname, '../../../src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? sourceFiles(full) : full.endsWith('.ts') ? [full] : [];
  });
}
const read = (file: string): string => readFileSync(file, 'utf8');
const rel = (file: string): string => path.relative(SRC, file);

/** Only real code, not the comments that explain the wall. */
const withoutComments = (code: string): string =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the public store cannot delete or sign', () => {
  it('has no delete and no signed URLs, so nothing can remove or share public media through it', () => {
    const methods = Object.getOwnPropertyNames(R2ObjectStore.prototype);
    expect(methods).not.toContain('delete');
    expect(methods).not.toContain('presignGet');
    expect(methods.filter((name) => !name.startsWith('_')).sort()).toEqual(
      ['constructor', 'exists', 'put', 'request'].sort(),
    );
  });

  it('is a different type from the private store', () => {
    expect(Object.getOwnPropertyNames(R2PrivateObjectStore.prototype)).toEqual(
      expect.arrayContaining(['put', 'exists', 'delete', 'presignGet']),
    );
    expect(R2PrivateObjectStore).not.toBe(R2ObjectStore);
  });
});

describe('public code never reaches private media', () => {
  const publicFiles = [
    ...sourceFiles(path.join(SRC, 'shared/images')),
    path.join(SRC, 'shared/storage/r2-object-store.ts'),
    path.join(SRC, 'shared/storage/object-store.ts'),
    ...sourceFiles(path.join(SRC, 'modules/notifications')),
    ...sourceFiles(path.join(SRC, 'modules/workouts')),
  ];

  it.each(publicFiles.map((file) => [rel(file), file] as const))('%s', (_name, file) => {
    const code = withoutComments(read(file));
    expect(code).not.toMatch(/private-media|PrivateObjectStore|r2-private-object-store|private-object-store/);
  });
});

describe('private code never reaches the public bucket', () => {
  const privateFiles = [
    ...sourceFiles(path.join(SRC, 'shared/private-media')),
    path.join(SRC, 'shared/storage/r2-private-object-store.ts'),
    path.join(SRC, 'shared/storage/private-object-store.ts'),
    path.join(SRC, 'shared/storage/sigv4-presign.ts'),
  ];

  it.each(privateFiles.map((file) => [rel(file), file] as const))('%s', (_name, file) => {
    const code = withoutComments(read(file));
    // None of the public bucket's types or address.
    expect(code).not.toMatch(
      /\bPublicObjectStore\b|\bR2ObjectStore\b|r2-object-store|R2_PUBLIC_BASE_URL|publicBaseUrl/,
    );
    // The config may NAME the public bucket's variable, only to refuse the two being the same; nothing else may.
    if (!file.endsWith('private-media-config.ts')) expect(code).not.toMatch(/R2_BUCKET\b/);
    // And no public key prefix is ever built here.
    expect(code).not.toMatch(/['"`]onusfit\//);
    for (const feature of PUBLIC_IMAGE_FEATURES) expect(code).not.toContain(`onusfit/${feature}`);
  });
});

describe('what may use the private store', () => {
  const importers = (needle: RegExp) =>
    sourceFiles(SRC)
      .filter((file) => needle.test(withoutComments(read(file))))
      .map(rel)
      .sort();

  it('is only the private-media code, the two member-photo modules and the container that wires them', () => {
    const users = importers(/shared\/private-media|private-object-store|r2-private-object-store/).filter(
      (file) =>
        !file.startsWith('shared/private-media/') &&
        !file.startsWith('shared/storage/') &&
        !file.startsWith('modules/profile/') &&
        !file.startsWith('modules/progress/'),
    );
    // Today nothing else; once the container wires it up it is the only addition (checked again at integration).
    expect(
      users.filter((file) => file !== 'container.ts' && file !== 'config/env.ts' && file !== 'server.ts'),
    ).toEqual([]);
  });
});
