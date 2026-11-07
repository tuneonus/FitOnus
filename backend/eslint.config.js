// @ts-check
import fs from 'node:fs';
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Packages that only infrastructure/interface code may touch. */
const INFRASTRUCTURE_PACKAGES = [
  'express',
  'pg',
  'jose',
  'argon2',
  'pino',
  'pino-http',
  'helmet',
  'cors',
  'express-rate-limit',
];

/** Concrete adapters living in shared/ that inner layers must reach only through their ports. */
const SHARED_ADAPTERS = [/argon2-password-hasher/, /hmac-keyed-hasher/, /pg-idempotency-store/];

const modules = fs
  .readdirSync(new URL('./src/modules', import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

/** Another module may only be imported through its public index.ts. */
const crossModulePatterns = (self) =>
  modules
    .filter((other) => other !== self)
    .map((other) => ({
      regex: `^(\\.\\./)+(modules/)?${other}/(?!index\\.js$).+`,
      message: `Import the "${other}" module only through ${other}/index.js (its public API).`,
    }));

const pattern = (regex, message) => ({ regex, message });

const layerPatterns = {
  domain: [
    pattern('(^|/)(application|infrastructure|interface)/', 'Domain must not depend on outer layers.'),
    pattern('(^|/)(database|middleware|config)/', 'Domain must stay free of infrastructure.'),
    pattern('shared/(http|idempotency|security|logging)/', 'Domain may only use pure shared code.'),
  ],
  application: [
    pattern('(^|/)(infrastructure|interface)/', 'Application must depend on ports, not adapters.'),
    pattern('(^|/)(database|middleware|config)/', 'Application must not reach infrastructure directly.'),
    pattern('shared/http/', 'Application must not know about HTTP.'),
    ...SHARED_ADAPTERS.map((re) => pattern(re.source, 'Depend on the port interface, not the adapter.')),
  ],
  infrastructure: [
    pattern('(^|/)interface/', 'Infrastructure must not depend on the HTTP interface.'),
    pattern('(^|/)middleware/', 'Infrastructure must not depend on HTTP middleware.'),
  ],
  interface: [
    pattern('(^|/)infrastructure/', 'Interface code reaches infrastructure only via the module factory.'),
  ],
};

const restrict = (patterns, paths = []) => ({
  'no-restricted-imports': ['error', { patterns, paths }],
});

const boundaryConfigs = modules.flatMap((mod) => {
  const base = crossModulePatterns(mod);
  return [
    { files: [`src/modules/${mod}/**/*.ts`], rules: restrict(base) },
    {
      files: [`src/modules/${mod}/domain/**/*.ts`],
      rules: restrict(
        [...base, ...layerPatterns.domain],
        [...INFRASTRUCTURE_PACKAGES, 'zod'].map((name) => ({
          name,
          message: 'Domain must be framework-free.',
        })),
      ),
    },
    {
      files: [`src/modules/${mod}/application/**/*.ts`],
      rules: restrict(
        [...base, ...layerPatterns.application],
        INFRASTRUCTURE_PACKAGES.map((name) => ({ name, message: 'Application must be framework-free.' })),
      ),
    },
    {
      files: [`src/modules/${mod}/infrastructure/**/*.ts`],
      rules: restrict([...base, ...layerPatterns.infrastructure]),
    },
    {
      files: [`src/modules/${mod}/interface/**/*.ts`],
      rules: restrict([...base, ...layerPatterns.interface]),
    },
  ];
});

export default defineConfig(
  { ignores: ['dist/', 'coverage/', 'node_modules/'] },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      eqeqeq: ['error', 'always'],
      'no-console': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/only-throw-error': 'error',
    },
  },
  {
    // Shared kernel and plumbing must never depend on feature modules.
    files: ['src/shared/**/*.ts', 'src/database/**/*.ts', 'src/middleware/**/*.ts', 'src/config/**/*.ts'],
    rules: restrict([pattern('(^|/)modules/', 'Shared code must not import feature modules.')]),
  },
  ...boundaryConfigs,
  {
    // Scripts and tests: disable test-specific and mock-related false positives.
    // Production code in src/ retains the strictest type-checked rules.
    files: ['scripts/**/*.ts', 'tests/**/*.ts'],
    rules: {
      'no-console': 'off',
      'no-useless-assignment': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
