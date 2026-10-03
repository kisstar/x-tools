import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function text(path) {
  return readFile(new URL(`../../${path}`, import.meta.url), 'utf8')
}

test('根命令区分只读检查与显式修复', async () => {
  const manifest = JSON.parse(await text('package.json'))
  for (const name of ['format', 'format:check', 'lint', 'lint:fix', 'typecheck', 'test', 'test:race', 'security', 'verify']) {
    assert.equal(typeof manifest.scripts[name], 'string', `缺少根命令 ${name}`)
  }
  assert.doesNotMatch(manifest.scripts.lint, /--fix/)
  assert.doesNotMatch(manifest.scripts['format:check'], /--fix/)
  assert.doesNotMatch(manifest.scripts.verify, /--fix/)
  assert.match(manifest.scripts.lint, /--max-warnings=0/)
})

test('ESLint 将普通代码行限制为 120 字符并忽略不可拆分字面量', async () => {
  const eslint = await text('eslint.config.js')
  assert.match(eslint, /'style\/max-len': \['error', \{/)
  assert.match(eslint, /code: 120/)
  for (const option of ['ignoreUrls', 'ignoreStrings', 'ignoreTemplateLiterals', 'ignoreRegExpLiterals'])
    assert.match(eslint, new RegExp(`${option}: true`), `max-len 缺少 ${option}`)
})

test('质量工具固定版本并统一放在 catalog', async () => {
  const workspace = await text('pnpm-workspace.yaml')
  for (const name of ['@antfu/eslint-config', 'stylelint', 'stylelint-config-standard', 'lefthook']) {
    assert.match(workspace, new RegExp(`^  ['\"]?${name.replace('/', '\\/')}['\"]?: \\d`, 'm'), `${name} 必须固定在 catalog`)
  }
  const catalog = workspace.slice(workspace.indexOf('catalog:'))
  assert.doesNotMatch(catalog, /^ {2}[^\n:]+:\s*[~^*]/m, 'catalog 不得使用开放版本范围')
})

test('Lefthook 的提交门禁只检查暂存文件', async () => {
  const config = await text('lefthook.yml')
  assert.match(config, /pre-commit:/)
  assert.match(config, /\{staged_files\}/)
  const preCommit = config.match(/pre-commit:[\s\S]*?(?=\npre-push:)/)?.[0] ?? ''
  assert.doesNotMatch(preCommit, /(?:test|build|race|govuln|codegen|ShellCheck|check-shell)/)
})

test('VS Code 保存链不会格式化受保护文件', async () => {
  const settings = JSON.parse(await text('.vscode/settings.json'))
  assert.equal(settings['editor.formatOnSave'], false)
  assert.equal(settings['prettier.enable'], false)
  assert.equal(settings['editor.codeActionsOnSave']['source.fixAll.eslint'], 'explicit')
  assert.equal(settings['editor.codeActionsOnSave']['source.organizeImports'], 'never')
  assert.equal(settings['eslint.workingDirectories'] !== undefined, true)
  const eslint = await text('eslint.config.js')
  for (const pattern of ['pnpm-lock.yaml', '**/*.sum', 'contracts/schema/**', 'packages/contracts/src/generated.ts', '**/*.mmd', 'design/**/*.pen']) assert.match(eslint, new RegExp(pattern.replaceAll('*', '\\*').replaceAll('/', '\\/')))
})

test('本地完整验证不要求 ShellCheck，CI 安全验证保留 ShellCheck', async () => {
  const script = await text('scripts/verify.sh')
  for (const token of ['--frozen-lockfile', 'turbo run', 'format:check', 'lint', 'typecheck', 'test', 'build', 'codegen:check', 'verify-go-modules.sh', 'mermaid', 'security', 'test:race', 'e2e']) {
    assert.match(script, new RegExp(token.replaceAll('/', '\\/')), `verify 缺少 ${token}`)
  }
  assert.doesNotMatch(script, /check-shell/)
  const manifest = JSON.parse(await text('package.json'))
  assert.doesNotMatch(manifest.scripts.lint, /check-shell/)
  assert.match(manifest.scripts['lint:shell'], /check-shell/)
  assert.match(manifest.scripts['verify:ci'], /verify-ci/)
  const ci = await text('scripts/verify-ci.sh')
  assert.ok(ci.indexOf('pnpm lint:shell') < ci.indexOf('pnpm verify'), 'CI 应先执行 ShellCheck，避免被其他门禁提前遮住')
  const extensions = JSON.parse(await text('.vscode/extensions.json'))
  assert.ok(!extensions.recommendations.includes('timonwong.shellcheck'), 'ShellCheck 不应成为本地推荐依赖')
})

test('Shell 门禁显式区分工具不可用与检查通过', async () => {
  const script = await text('scripts/check-shell.sh')
  assert.match(script, /command -v/)
  assert.match(script, /ShellCheck 0\.11\.0 不可用/)
  assert.match(script, /--shell=sh/)
})
