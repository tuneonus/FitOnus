import { describe, expect, it } from 'vitest';
import { sniffImageFormat } from '../../../src/shared/images/image-format.js';
import {
  GIF_BYTES,
  HTML_BYTES,
  PDF_BYTES,
  heicSample,
  isoBmffHeader,
  realJpeg,
  realPng,
  realWebp,
} from '../../helpers/images.js';

const text = (value: string) => Buffer.from(value, 'utf8');

describe('sniffImageFormat: what the bytes say', () => {
  it('recognises the four accepted formats from real files', async () => {
    expect(sniffImageFormat(await realJpeg())).toEqual({ accepted: true, format: 'jpeg' });
    expect(sniffImageFormat(await realPng())).toEqual({ accepted: true, format: 'png' });
    expect(sniffImageFormat(await realWebp())).toEqual({ accepted: true, format: 'webp' });
    expect(sniffImageFormat(heicSample())).toEqual({ accepted: true, format: 'heic' });
  });

  describe('HEIC brands', () => {
    it.each([
      ['heic', []],
      ['heix', []],
      ['heim', []],
      ['heis', []],
      ['hevc', []],
      ['hevx', []],
      ['mif1', ['heic']], // what Windows and some Android phones write
      ['msf1', ['hevc']],
      ['isom', ['mif1', 'heic']],
    ])('accepts major brand %s with compatible brands %j', (major, compatible) => {
      expect(sniffImageFormat(isoBmffHeader(major, compatible))).toEqual({ accepted: true, format: 'heic' });
    });

    it.each([
      ['avif', []],
      ['avis', []],
      ['mif1', ['avif']],
      ['mif1', ['mif1', 'miaf', 'avif']],
    ])('refuses AVIF (major %s, compatible %j) even though it is also a HEIF file', (major, compatible) => {
      expect(sniffImageFormat(isoBmffHeader(major, compatible))).toEqual({ accepted: false, format: 'avif' });
    });

    it('refuses a bare HEIF with no HEVC brand, since it could hold any codec', () => {
      expect(sniffImageFormat(isoBmffHeader('mif1', ['miaf']))).toEqual({
        accepted: false,
        format: 'unknown',
      });
    });

    it('refuses video containers that share the ISO-BMFF header', () => {
      expect(sniffImageFormat(isoBmffHeader('isom', ['iso2', 'avc1', 'mp41']))).toEqual({
        accepted: false,
        format: 'unknown',
      });
      expect(sniffImageFormat(isoBmffHeader('qt  ', []))).toEqual({ accepted: false, format: 'unknown' });
    });

    it('does not read past the buffer when the box lies about its size', () => {
      const lying = isoBmffHeader('heic', ['mif1']);
      lying.writeUInt32BE(0xffffffff, 0);
      expect(() => sniffImageFormat(lying)).not.toThrow();
      expect(sniffImageFormat(lying.subarray(0, 14))).toEqual({ accepted: true, format: 'heic' });
    });
  });

  describe('formats that are named, then refused', () => {
    it.each([
      ['a GIF', GIF_BYTES, 'gif'],
      ['a TIFF (little endian)', Buffer.from([0x49, 0x49, 0x2a, 0x00, 0, 0, 0, 0]), 'tiff'],
      ['a TIFF (big endian)', Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 0]), 'tiff'],
      ['a BMP', Buffer.concat([Buffer.from('BM'), Buffer.alloc(20)]), 'bmp'],
      ['a PDF', PDF_BYTES, 'pdf'],
      ['an SVG', text('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'), 'svg'],
      [
        'an SVG after an XML prolog',
        text('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"/>'),
        'svg',
      ],
      ['an SVG after whitespace', text('\n\n  \t<svg viewBox="0 0 1 1"></svg>'), 'svg'],
      [
        'an SVG after a byte order mark',
        Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), text('<svg/>')]),
        'svg',
      ],
    ] as const)('names %s', (_name, bytes, format) => {
      expect(sniffImageFormat(bytes)).toEqual({ accepted: false, format });
    });
  });

  it.each([
    ['an HTML page', HTML_BYTES],
    ['a script', text('#!/bin/sh\necho hi')],
    ['plain text that says it is a png', text('definitely a png, trust me')],
    ['JSON', text('{"image":"data:image/png;base64,AAAA"}')],
    ['an empty file', Buffer.alloc(0)],
    ['one stray byte', Buffer.from([0xff])],
    ['two JPEG signature bytes only', Buffer.from([0xff, 0xd8])],
    ['a RIFF file that is not WebP', Buffer.concat([text('RIFF'), Buffer.alloc(4), text('WAVEfmt ')])],
    ['a ZIP archive', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0])],
    ['an executable', Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0])],
  ])('does not recognise %s', (_name, bytes) => {
    expect(sniffImageFormat(bytes)).toEqual({ accepted: false, format: 'unknown' });
  });

  it('decides from the content alone: a JPEG is a JPEG whatever it is called', async () => {
    // There is no file name or content type in the API of the function at all.
    expect(sniffImageFormat(await realJpeg())).toEqual({ accepted: true, format: 'jpeg' });
  });

  it('never throws, whatever it is given', () => {
    for (const length of [0, 1, 2, 3, 4, 7, 8, 11, 12, 15, 16, 17, 100]) {
      for (const fill of [0x00, 0xff, 0x66, 0x3c]) {
        expect(() => sniffImageFormat(Buffer.alloc(length, fill))).not.toThrow();
      }
    }
  });
});
