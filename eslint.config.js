import base from '@reliquary/eslint-config';
import react from '@reliquary/eslint-config-react';

const STORAGE_MESSAGE = 'Browser storage is reached only in web/preferences/PreferenceStore.ts.';

const SOURCE_FILES = ['**/*.ts', '**/*.tsx'];

/** Each process or browser reach CLAUDE.md confines, with the exact files allowed to make it. */
const CONFINED_REACHES = [
  { allowedIn: ['src/shared/Environment.ts'], property: { object: 'process', property: 'env', message: 'Read the environment through src/shared/Environment.ts.' } },
  { allowedIn: ['agent-dashboard.ts'], property: { object: 'process', property: 'exit', message: 'Only agent-dashboard.ts exits; return an exit code.' } },
  { allowedIn: [], property: { object: 'process', property: 'chdir', message: 'Never change the working directory; pass a directory instead.' } },
  { allowedIn: ['cli/CommandContext.ts'], property: { object: 'process', property: 'cwd', message: 'Take the directory from the CommandContext.' } },
  {
    allowedIn:  ['cli/CommandContext.ts'],
    importName: { name: 'node:os', importNames: ['homedir'], message: 'Take the home directory from the CommandContext.' },
  },
  ...['localStorage', 'sessionStorage'].flatMap((storageName) => [
    { allowedIn: ['web/preferences/PreferenceStore.ts'], property: { object: 'window', property: storageName, message: STORAGE_MESSAGE } },
    { allowedIn: ['web/preferences/PreferenceStore.ts'], global: { name: storageName, message: STORAGE_MESSAGE } },
  ]),
];

/** A rule given only its severity keeps the options an earlier config set, so an empty list turns the rule off instead. */
function restrictionRule(restrictions) {
  return restrictions.length === 0 ? 'off' : ['error', ...restrictions];
}

function confinedReachRules(exemptFile) {
  const binding = CONFINED_REACHES.filter((reach) => !reach.allowedIn.includes(exemptFile));
  const restrictedImportPaths = binding.filter((reach) => reach.importName).map((reach) => reach.importName);
  return {
    'no-restricted-properties': restrictionRule(binding.filter((reach) => reach.property).map((reach) => reach.property)),
    'no-restricted-globals':    restrictionRule(binding.filter((reach) => reach.global).map((reach) => reach.global)),
    'no-restricted-imports':    restrictionRule(restrictedImportPaths.length === 0 ? [] : [{ paths: restrictedImportPaths }]),
  };
}

const CONFINED_REACH_SITES = [...new Set(CONFINED_REACHES.flatMap((reach) => reach.allowedIn))];

const CLOCK_MESSAGE = 'Take the clock from the CommandContext.';

const SPECS_AND_TESTING_FOLDERS = ['**/*.spec.ts', '**/*.spec.tsx', '**/testing/**/*.ts', '**/testing/**/*.tsx'];

export default [
  ...base,
  ...react.map((layer) => ({ ...layer, files: ['web/**/*.tsx'] })),
  { ignores: ['**/*.js', 'node_modules/**', '.claude/**'] },
  {
    // Test-only helpers may import devDependencies; nothing that ships may import these folders.
    files: ['**/testing/**/*.ts', '**/testing/**/*.tsx'],
    rules: { 'import/no-extraneous-dependencies': ['error', { devDependencies: true }] },
  },
  { files: SOURCE_FILES, rules: { 'import/enforce-node-protocol-usage': ['error', 'always'] } },
  // The shared config's object-curly-newline fix leaves a trailing space where it breaks a line of properties, which then want one per line.
  { files: SOURCE_FILES, rules: { '@stylistic/no-trailing-spaces': 'error' } },
  {
    // One style for local specifiers, the file name with its extension; the resolver knows both, so an extensionless specifier is found and reported.
    files:    SOURCE_FILES,
    settings: { 'import/resolver': { node: { extensions: ['.ts', '.tsx'] } } },
    rules:    { 'import/extensions': ['error', 'always', { ignorePackages: true }] },
  },
  { files: SOURCE_FILES, rules: confinedReachRules(null) },
  ...CONFINED_REACH_SITES.map((site) => ({ files: [site], rules: confinedReachRules(site) })),
  {
    // The web may read the clock: it only shows elapsed time.
    files:   ['src/**/*.ts', 'cli/**/*.ts', 'agent-dashboard.ts'],
    ignores: [...SPECS_AND_TESTING_FOLDERS, 'cli/CommandContext.ts'],
    rules:   {
      'no-restricted-syntax': [
        'error',
        { selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']", message: CLOCK_MESSAGE },
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: CLOCK_MESSAGE },
      ],
    },
  },
  {
    files: SOURCE_FILES,
    rules: {
      '@typescript-eslint/no-non-null-assertion':  'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'no-warning-comments':                       ['error', { terms: ['todo', 'fixme', 'xxx', 'hack'], location: 'anywhere' }],
      'id-length':                                 ['error', { min: 2, exceptions: ['i', 'a', 'b'], properties: 'never' }],
    },
  },
  {
    files:   SOURCE_FILES,
    ignores: [...SPECS_AND_TESTING_FOLDERS, '**/constants/**/*.ts', '**/constants/**/*.tsx'],
    rules:   {
      '@typescript-eslint/no-magic-numbers': ['error', {
        // Arithmetic identities stay inline: a step, a halving, the hexadecimal radix, a percent.
        ignore:                        [-1, 0, 1, 2, 16, 100],
        ignoreArrayIndexes:            true,
        ignoreDefaultValues:           true,
        ignoreEnums:                   true,
        ignoreNumericLiteralTypes:     true,
        ignoreReadonlyClassProperties: true,
        ignoreTypeIndexes:             true,
      }],
    },
  },
];
