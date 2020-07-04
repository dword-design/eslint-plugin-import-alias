import preferAlias from './rules/prefer-alias'

export default {
  configs: {
    recommended: {
      plugins: ['@dword-design/import-alias'],
      rules: {
        '@dword-design/import-alias/prefer-alias': 'error',
      },
    },
  },
  rules: {
    'prefer-alias': preferAlias,
  },
}
