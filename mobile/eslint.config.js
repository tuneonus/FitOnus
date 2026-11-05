const expo = require('eslint-config-expo/flat');

module.exports = [
  ...expo,
  {
    rules: {
      'import/order': 'off',
      'react-compiler/react-compiler': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/set-state-in-effect': 'off',
      '@typescript-eslint/no-unused-vars': 'off'
    },
  },
];
