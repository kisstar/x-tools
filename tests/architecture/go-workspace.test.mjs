import assert from 'node:assert/strict'
import { constants } from 'node:fs'
import { access, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

async function moduleFiles(directory = root) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name.startsWith('.turbo'))
      continue
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory())
      files.push(...await moduleFiles(fullPath))
    else if (entry.name === 'go.mod')
      files.push(fullPath)
  }
  return files.sort()
}

test('go.work 与 bootstrap 覆盖全部 Go module 和内部依赖边', async () => {
  const files = await moduleFiles()
  assert.ok(files.length > 0, '未找到 Go module')
  const work = await readFile(path.join(root, 'go.work'), 'utf8')
  const bootstrap = await readFile(path.join(root, 'go.work.bootstrap'), 'utf8')
  for (const file of files) {
    const content = await readFile(file, 'utf8')
    const directory = path.relative(root, path.dirname(file)).replaceAll(path.sep, '/')
    const ownModule = content.match(/^module\s+(\S+)/m)?.[1]
    assert.doesNotMatch(content, /^replace\s+/m, `${file} 不得包含 replace`)
    assert.ok(work.split(/\s+/).includes(`./${directory}`), `go.work 缺少 ${directory}`)
    for (const match of content.matchAll(/github\.com\/kisstar\/x-tools\/[^ \n)]+/g)) {
      if (match[0] === ownModule)
        continue
      assert.match(bootstrap, new RegExp(`^replace ${match[0].replaceAll('/', '\\/')} => `, 'm'), `bootstrap 缺少 ${match[0]}`)
    }
  }
})

test('独立 module 验证使用临时 modfile 且不改写正式 go.mod', async () => {
  const scriptPath = path.join(root, 'scripts/verify-go-modules.sh')
  await access(scriptPath, constants.X_OK)
  const script = await readFile(scriptPath, 'utf8')
  assert.match(script, /GOWORK=off/)
  assert.match(script, /-modfile/)
  assert.match(script, /go mod tidy/)
  assert.match(script, /go vet/)
  assert.match(script, /go test/)
  assert.match(script, /golangci-lint/)
  assert.match(script, /cmp .*official/, '必须检查正式 go.mod tidy 无漂移')
  assert.doesNotMatch(script, /go mod edit(?!.*-modfile)/)
})

test('workspace 验证脚本以 go.work 模式测试每个成员', async () => {
  const scriptPath = path.join(root, 'scripts/test-go-workspace.sh')
  await access(scriptPath, constants.X_OK)
  const script = await readFile(scriptPath, 'utf8')
  assert.match(script, /go work edit -json/)
  assert.match(script, /go test/)
  assert.doesNotMatch(script, /GOWORK=off/)
})

test('Go 质量脚本固定工具版本并逐 workspace module 运行', async () => {
  const lint = await readFile(path.join(root, 'scripts/lint-go.sh'), 'utf8')
  const security = await readFile(path.join(root, 'scripts/security-go.sh'), 'utf8')
  const format = await readFile(path.join(root, 'scripts/check-go-format.sh'), 'utf8')
  const formatter = await readFile(path.join(root, 'scripts/format-go.sh'), 'utf8')
  const config = await readFile(path.join(root, '.golangci.yml'), 'utf8')
  assert.match(lint, /go work edit -json/)
  assert.match(lint, /golangci-lint\/v2\/cmd\/golangci-lint@v2\.14\.0/)
  assert.match(security, /govulncheck@v1\.8\.0/)
  assert.match(format, /golangci-lint\/v2\/cmd\/golangci-lint@v2\.14\.0/)
  assert.match(format, /golangci_lint" fmt --diff/)
  assert.match(formatter, /golangci_lint" fmt/)
  assert.match(config, /- golines/)
  assert.match(config, /max-len: 120/)
  assert.match(config, /tab-len: 2/)
})
