# OnusFit Workout Image Display & Asset Standardization Specification

## 1. Overview & Purpose

This document establishes the official standard for all workout exercise infographics, character assets, and anatomical diagrams across the FitOnus platform (Mobile App, Admin Panel, and CDN/Storage). It eliminates exercise-to-asset mismatch issues, defines responsive rendering rules for cross-device mobile support, and codifies strict visual identity guidelines for generating future exercise media.

---

## 2. Technical Asset Specifications

### 2.1 Dimensions & Aspect Ratio
- **Preferred New Standard:** `1200 × 960 px` (Aspect Ratio: `5:4` / `1.25`).
  - Optimized for mobile viewports without letterboxing or vertical overflow.
  - Accommodates character pose, dual-view anatomy, title header, and bottom muscle labels with balanced margins.
- **Backward Compatibility:**
  - Existing `1024 × 1024 px` (Aspect Ratio: `1:1`) square assets remain fully supported and rendered without distortion.
  - Legacy `1200 × 896 px` assets remain supported.
  - **`1080 × 1350 px` (Aspect Ratio: `4:5` portrait)** workout infographics are supported and are shown whole at full width.
- **File Format:** Static WebP (`image/webp`) with lossless or high-quality (q=90) compression, stripping extraneous EXIF/XMP metadata.

### 2.2 Storage & CDN Delivery
- **Object Key Convention:** `onusfit/exercises/<32-hex-characters>.webp` in the public media bucket.
- **Database Column:** `exercises.image_key text` (checked by regex constraint `^onusfit/exercises/[0-9a-f]{32}\.webp$`).
- **Cache Policy:** `Cache-Control: public, max-age=31536000, immutable`.
- **Client Cache Busing:** Mobile apps track `imageKey` and `updatedAt` to bust local image caches immediately whenever an exercise image is updated.

---

## 3. Responsive Mobile Display Rules

1. **Available Container Width:**
   - The image component must utilize 100% of the available container width (`alignSelf: 'stretch'`, `width: '100%'`).
   - Eliminate unnecessary horizontal padding or artificial margins that squeeze the infographic.
2. **Preserve Aspect Ratio:**
   - Height must be dynamically computed from the image's own width / height (`aspectRatio`), so 5:4, 1:1 and 4:5 assets are all shown complete. Bundled assets are measured immediately; remote images are measured on load and remembered. The `4:5` ratio is only the placeholder until the real size is known.
   - The detail screen shows the infographic edge to edge: no side padding or margins, and no negative margins.
   - **Never hardcode fixed pixel heights** (e.g. `height: 240px`), as fixed heights crop infographics on varying device widths.
3. **Scaling Mode:**
   - **Enforce `resizeMode="contain"` (or `contentFit="contain"`)** for all workout infographics.
   - **Strictly prohibit `resizeMode="cover"`** for infographics, as uniform cropping removes top headers or bottom muscle labels.
4. **Error & Fallback Handling:**
   - Missing assets or loading errors must gracefully transition to the themed fallback container (`colors.surface2` with a `Dumbbell` icon).
   - Fallback containers must match the standard aspect ratio to prevent layout shifts or jumpy scrolling.

---

## 4. Visual Identity & Image Content Rules

All workout infographics must adhere to one consistent design template:

### 4.1 Character & Anatomy
- **Character Model:** Muscular, athletic male physique with realistic anatomical proportions.
- **Hairstyle & Face:** Signature Dark Man Bun hairstyle with neat beard/stubble. Identical facial appearance and bone structure across all exercise cards.
- **Dual Anatomy Figures:** Anterior (front) and posterior (back) anatomical figures displaying targeted muscle groups alongside the exercise demonstration character.
- **Attire & Decency:** Front and back anatomical figures must wear fitted black athletic briefs cleanly covering private areas.
- **Muscle Definition:** Crisp, sharp biomechanical muscle separation and striations.

### 4.2 Color Palette & Muscle Highlighting
- **Primary Target Muscles:** Vivid Red (`#E53935` / `#DC2626`).
- **Secondary / Stabilizer Muscles:** Vibrant Orange (`#FB8C00` / `#EA580C`).
- **Background Theme:** Compact dark navy-blue background (`#0A1128` / `#0F172A`).
- **Branding Accents:** OnusFit signature orange (`#FF5722`) and clean white typography.

### 4.3 Content Restrictions & Composition
- **Required Elements:**
  - Clear exercise title at the top header.
  - OnusFit branding mark in top corner.
  - Demonstration character performing the correct biomechanical movement.
  - Dual anterior/posterior anatomical silhouettes.
  - Bottom horizontal primary and secondary muscle label badges.
- **Strict Exclusions:**
  - **Do NOT include sets, reps, or rest timers inside the image.** (These are dynamic and managed by the mobile workout state).
  - **Do NOT include difficulty badges** (e.g. "Intermediate", "Advanced") inside the image.
  - **Do NOT include step-by-step How-to instructions** inside the image. (Instructions are rendered dynamically below the hero image).

---

## 5. Stable Exercise-to-Image Mapping

1. **Mapping by Stable ID Only:**
   - Every exercise is mapped to its asset using a unique, immutable identifier:
     - PostgreSQL Database UUID (e.g. `e0000000-0000-4000-8000-000000000001`).
     - Stable canonical slug (e.g. `'bench'`, `'push-up'`).
   - **Never map images by list index or fuzzy substring matching.**
2. **Push-Up vs. Barbell Bench Press Asset Separation:**
   - The Push-Up infographic asset (`e3c73404-ef34-4b1e-b1ec-3d1b35e87617.jpg` / `push-up.webp`) is mapped strictly to `'push-up'`.
   - Barbell Bench Press (`'bench'` / `e0000000-0000-4000-8000-000000000001`) does not share the Push-Up asset and displays its verified backend image or safe fallback.
