import preferAlias from './rules/prefer-alias'

export default {
  configs: {
    recommended: {
      plugins: ['import-alias'],
      rules: {
        'import-alias/prefer-alias': 'error',
      },
    },
  },
  rules: {
    'prefer-alias': preferAlias,
  },
}
