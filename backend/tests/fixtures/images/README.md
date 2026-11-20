# Image fixtures

`sample.heic` is a 96x64 HEIC (HEVC) made by `build-heic.py` (see its docstring). It is checked in because no HEIC
encoder is available where the tests run. Every other test image is generated in code with Sharp
(`tests/helpers/images.ts`), so nothing else is stored here.

The pixels are ffmpeg's `testsrc` pattern, which has no personal content.
