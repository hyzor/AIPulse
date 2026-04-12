import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import importPlugin from 'eslint-plugin-import';
import stylistic from '@stylistic/eslint-plugin';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * AIPulse ESLint Configuration
 * Modern flat config format for ESLint 9.x
 */
export default [
  // Base ignores
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/build/**',
      '**/.git/**',
      '**/coverage/**',
      '**/*.d.ts',
      'eslint.config.js',
    ],
  },

  // JavaScript/TypeScript base rules
  js.configs.recommended,

  // TypeScript configuration
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.strictTypeChecked,

  // TypeScript parser settings
  {
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: ['./backend/tsconfig.json', './frontend/tsconfig.json'],
        tsconfigRootDir: __dirname,
        ecmaVersion: 2024,
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
  },

  // Stylistic rules (formatting)
  stylistic.configs.customize({
    indent: 2,
    quotes: 'single',
    semi: true,
    jsx: true,
    braceStyle: '1tbs',
    arrowParens: true,
  }),

  // Import plugin
  {
    plugins: {
      import: importPlugin,
    },
    rules: {
      'import/no-unresolved': 'error',
      'import/named': 'error',
      'import/default': 'error',
      'import/namespace': 'error',
      'import/no-named-as-default': 'warn',
      'import/no-named-as-default-member': 'warn',
      'import/no-duplicates': 'warn',
      'import/order': [
        'warn',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            ['parent', 'sibling', 'index'],
            'object',
            'type',
          ],
          'newlines-between': 'always',
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
        },
      ],
    },
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: ['./backend/tsconfig.json', './frontend/tsconfig.json'],
        },
      },
    },
  },

  // React-specific configuration (frontend files only)
  {
    files: ['frontend/**/*.{js,jsx,ts,tsx}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      globals: {
        React: 'readonly',
      },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,

      // React-specific rules
      'react/react-in-jsx-scope': 'off', // Not needed in React 18+
      'react/jsx-uses-react': 'off', // Not needed in React 18+
      'react/prop-types': 'off', // Using TypeScript instead
      'react/display-name': 'off',
      'react/no-unescaped-entities': 'warn',
      'react/jsx-no-target-blank': 'error',
      'react/jsx-curly-brace-presence': ['warn', { props: 'never', children: 'never' }],

      // React Hooks
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // JSX formatting
      'react/jsx-max-props-per-line': ['warn', { maximum: 3, when: 'multiline' }],
      'react/jsx-first-prop-new-line': ['warn', 'multiline'],
      'react/jsx-closing-bracket-location': ['warn', 'line-aligned'],
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },

  // Node.js backend files
  {
    files: ['backend/**/*.ts'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        exports: 'writable',
        module: 'writable',
        require: 'readonly',
      },
    },
  },

  // Custom project rules
  {
    rules: {
      // TypeScript - relax some strict rules
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/prefer-optional-chain': 'warn',
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      // Best practices
      'no-console': ['warn', { allow: ['warn', 'error', 'info', 'log'] }],
      'no-debugger': 'error',
      'no-alert': 'warn',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-unused-expressions': 'off',
      '@typescript-eslint/no-unused-expressions': 'error',

      // Code style
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'curly': ['error', 'all'],
      'no-throw-literal': 'error',
      'prefer-promise-reject-errors': 'error',
      'no-return-await': 'off',
      '@typescript-eslint/return-await': ['error', 'in-try-catch'],

      // Modern JavaScript
      'object-shorthand': 'error',
      'prefer-template': 'error',
      'template-curly-spacing': 'error',
      'prefer-destructuring': ['warn', { object: true, array: false }],
      'prefer-rest-params': 'error',
      'prefer-spread': 'error',
      'no-useless-rename': 'error',
      'no-useless-constructor': 'off',
      '@typescript-eslint/no-useless-constructor': 'error',

      // Import organization
      'import/first': 'error',
      'import/newline-after-import': 'error',
      'import/no-mutable-exports': 'error',
    },
  },

  // Test files (relaxed rules)
  {
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/test/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },

  // Config files (relaxed rules)
  {
    files: ['*.config.{ts,js,mjs}', 'vite.config.ts', 'postcss.config.js', 'tailwind.config.js'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },
];
