export default {
  extends: ['stylelint-config-standard'],
  ignoreFiles: ['**/dist/**', '**/coverage/**', '**/node_modules/**', '**/.turbo/**'],
  rules: {
    'custom-property-pattern': ['^xt-[a-z0-9]+(?:-[a-z0-9]+)*$', { message: 'CSS 自定义属性必须使用 --xt- 前缀。' }],
    'at-rule-empty-line-before': null,
    'custom-property-empty-line-before': null,
    'declaration-block-single-line-max-declarations': null,
    'media-feature-range-notation': null,
    'no-descending-specificity': null,
    'rule-empty-line-before': null,
    'value-keyword-case': null,
  },
}
