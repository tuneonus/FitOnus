import { createRequire } from 'node:module';
import { ImageRejectedError } from './image-errors.js';
import { IMAGE_MAX_DIMENSION } from './image-policy.js';
import type { HeicDecoder, DecodedRaster } from './image-processor.js';

/**
 * HEIC decoding with libheif compiled to WebAssembly (`libheif-js`).
 *
 * Why this exists: Sharp's prebuilt binaries leave out the HEVC decoder (it is patent-encumbered), so Sharp reports
 * a HEIC from an iPhone as "heif / hevc" and then cannot decode it. This decodes the pixels; Sharp does everything
 * after that. libheif-js is LGPL-3.0 and decoding HEVC may carry patent-licensing obligations for a commercial
 * service: `IMAGE_HEIC_ENABLED=false` switches the decoder off entirely.
 *
 * Measured on a 12 MP photo-like HEIC: about 4 s and 180 MB, with the event loop never blocked for more than tens of
 * milliseconds (the library works in slices). Memory is the constraint, so decodes run one at a time.
 */

interface HeifImage {
  get_width(): number;
  get_height(): number;
  display(
    target: { data: Uint8ClampedArray; width: number; height: number },
    done: (result: unknown) => void,
  ): void;
  free(): void;
}
interface Libheif {
  HeifDecoder: new () => { decode(data: Uint8Array): HeifImage[] };
}

export class LibheifDecoder implements HeicDecoder {
  private libheif: Libheif | null = null;
  /** Tail of the chain of decodes, so only one runs at a time. */
  private queue: Promise<unknown> = Promise.resolve();

  decode(bytes: Uint8Array, maxPixels: number): Promise<DecodedRaster> {
    const result = this.queue.then(() => this.decodeNow(bytes, maxPixels));
    this.queue = result.catch(() => undefined);
    return result;
  }

  private load(): Libheif {
    // CommonJS package with no type declarations: required once, then used through the narrow interface above.
    this.libheif ??= createRequire(import.meta.url)('libheif-js/wasm-bundle') as Libheif;
    return this.libheif;
  }

  private async decodeNow(bytes: Uint8Array, maxPixels: number): Promise<DecodedRaster> {
    let images: HeifImage[];
    try {
      images = new (this.load().HeifDecoder)().decode(bytes);
    } catch {
      throw new ImageRejectedError('corrupt');
    }
    // A HEIC can hold several images (bursts, Live Photo stills); the first is the primary one.
    const [image, ...rest] = images;
    for (const extra of rest) extra.free();
    if (!image) throw new ImageRejectedError('corrupt');
    try {
      const width = image.get_width();
      const height = image.get_height();
      // Checked before the pixel buffer is allocated: this is what keeps a huge image from exhausting memory.
      if (!(width >= 1 && height >= 1)) throw new ImageRejectedError('corrupt');
      if (width > IMAGE_MAX_DIMENSION || height > IMAGE_MAX_DIMENSION || width * height > maxPixels) {
        throw new ImageRejectedError('dimensions');
      }
      const target = new Uint8ClampedArray(width * height * 4);
      const done = await new Promise<boolean>((resolve) => {
        try {
          image.display({ data: target, width, height }, (out) => resolve(Boolean(out)));
        } catch {
          resolve(false);
        }
      });
      if (!done) throw new ImageRejectedError('corrupt');
      return { width, height, rgba: new Uint8Array(target.buffer, target.byteOffset, target.byteLength) };
    } finally {
      image.free();
    }
  }
}
