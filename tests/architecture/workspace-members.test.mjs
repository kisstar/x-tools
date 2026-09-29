import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import test from 'node:test'

const expectedPatterns = ['apps/*', 'packages/*', 'packages/modules/*']

async function packageFiles() {
  const paths = ['package.json']
  for (const parent of ['apps', 'packages']) {
    for (const entry of await readdir(new URL(`../../${parent}/`, import.meta.url), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const path = `${parent}/${entry.name}/package.json`
      try { await readFile(new URL(`../../${path}`, import.meta.url)); paths.push(path) } catch {}
      if (parent === 'packages' && entry.name === 'modules') {
        for (const module of await readdir(new URL('../../packages/modules/', import.meta.url), { withFileTypes: true })) {
          if (module.isDirectory()) paths.push(`packages/modules/${module.name}/package.json`)
        }
      }
    }
  }
  return paths
}

test('workspace 只声明批准的成员模式', async () => {
  const yaml = await readFile(new URL('../../pnpm-workspace.yaml', import.meta.url), 'utf8')
  const patterns = [...yaml.matchAll(/^  - '([^']+)'$/gm)].map(match => match[1])
  assert.deepEqual(patterns, expectedPatterns)
})

test('所有 workspace 都是私有包且内部依赖使用 workspace:*', async () => {
  for (const path of await packageFiles()) {
    const manifest = JSON.parse(await readFile(new URL(`../../${path}`, import.meta.url), 'utf8'))
    assert.equal(manifest.private, true, `${path} 必须 private: true`)
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      for (const [name, version] of Object.entries(manifest[field] ?? {})) {
        if (name.startsWith('@xtools/')) assert.match(version, /^workspace:*/, `${path} 的 ${name} 必须使用 workspace:*`)
      }
    }
  }
})
