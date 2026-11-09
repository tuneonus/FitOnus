let d6: any;
let dd: any;
let e3: any;

try {
  d6 = require('../../../assets/images/d6b8b139-b2f7-47d7-9235-df35a579991c.jpg');
  dd = require('../../../assets/images/dd64297a-6168-4360-b842-2d92ca0c7c81.jpg');
  e3 = require('../../../assets/images/e3c73404-ef34-4b1e-b1ec-3d1b35e87617.jpg');
} catch {
  d6 = { uri: 'asset://d6' };
  dd = { uri: 'asset://dd' };
  e3 = { uri: 'asset://e3' };
}

export const images = {
  welcomeHero: d6,
  mealPhoto: dd,
  benchPress: e3,
};
