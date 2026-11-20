import { isCanonicalImageKey, type PublicImageFeature } from './image-policy.js';

/** Maps a stored key to a public URL, or null when there is no key or the media domain is not configured. */
export type PublicImageUrlResolver = (key: string | null) => string | null;

/**
 * Builds the public URL of a stored image of one feature. The only way such a URL is made: a value that is not a
 * canonical key of exactly that feature (a URL, a path, another feature's key, a hand-edited row) resolves to nothing
 * rather than to a URL, so an arbitrary address can never be produced from stored data.
 */
export function createFeatureImageUrlResolver(
  publicBaseUrl: string | null,
  feature: PublicImageFeature,
): PublicImageUrlResolver {
  const base = publicBaseUrl ? publicBaseUrl.replace(/\/+$/, '') : null;
  return (key) => (base && isCanonicalImageKey(key, feature) ? `${base}/${key}` : null);
}
