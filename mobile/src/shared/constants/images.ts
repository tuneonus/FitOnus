let d6: any;
let dd: any;
let e3: any;
let pushUpWebp: any;
let brandIcon: any;

try {
  d6 = require('../../../assets/images/d6b8b139-b2f7-47d7-9235-df35a579991c.jpg');
  dd = require('../../../assets/images/dd64297a-6168-4360-b842-2d92ca0c7c81.jpg');
  e3 = require('../../../assets/images/e3c73404-ef34-4b1e-b1ec-3d1b35e87617.jpg');
  try {
    pushUpWebp = require('../../../assets/images/push-up.webp');
  } catch {
    pushUpWebp = e3;
  }
  // Approved OnusFit app icon — the same artwork shipped as the launcher icon.
  brandIcon = require('../../../assets/images/icon.png');
} catch {
  d6 = { uri: 'asset://d6' };
  dd = { uri: 'asset://dd' };
  e3 = { uri: 'asset://e3' };
  pushUpWebp = { uri: 'asset://push-up' };
  brandIcon = { uri: 'asset://brand-icon' };
}

export const images = {
  welcomeHero: d6,
  mealPhoto: dd,
  /**
   * Push-Up infographic asset (1200x896 / 5:4 WebP/JPEG).
   * Note: Previously misattributed to benchPress in legacy prototypes.
   */
  pushUp: pushUpWebp || e3,
  /**
   * Barbell Bench Press has no bundled asset; uses backend upload or safe fallback.
   */
  benchPress: null,
  brandIcon,
};
