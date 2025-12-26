import preferAlias from './rules/prefer-alias';

const plugin = { rules: { 'prefer-alias': preferAlias } };

export default {
  configs: {
    recommended: {
      plugins: { '@dword-design/import-alias': plugin },
      rules: { '@dword-design/import-alias/prefer-alias': 'error' },
    },
  },
};
