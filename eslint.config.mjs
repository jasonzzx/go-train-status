import coreWebVitals from 'eslint-config-next/core-web-vitals';

export default [
  { ignores: ['.next/**', 'node_modules/**', 'public/**'] },
  ...coreWebVitals,
  {
    // The React Compiler-era hooks rules (new in eslint-config-next 16) flag
    // patterns this app uses deliberately — post-mount setState to restore
    // localStorage prefs without a hydration mismatch (see the comments in
    // page.tsx/i18n). Keep them visible as warnings, not CI-breaking errors.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
];
