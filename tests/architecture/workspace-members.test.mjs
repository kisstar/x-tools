import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'

const expectedPatterns = ['apps/*', 'packages/*', 'packages/modules/*']

async function packageFiles() {
  const paths = ['package.json']
  for (const parent of ['apps', 'packages']) {
    for (const entry of await readdir(new URL(`../../${parent}/`, import.meta.url), { withFileTypes: true })) {
      if (!entry.isDirectory())
        continue
      const path = `${parent}/${entry.name}/package.json`
      try {
        await readFile(new URL(`../../${path}`, import.meta.url))
        paths.push(path)
      }
      catch {}
      if (parent === 'packages' && entry.name === 'modules') {
        for (const module of await readdir(new URL('../../packages/modules/', import.meta.url), { withFileTypes: true })) {
          if (!module.isDirectory())
            continue
          const modulePath = `packages/modules/${module.name}/package.json`
          try {
            await readFile(new URL(`../../${modulePath}`, import.meta.url))
            paths.push(modulePath)
          }
          catch {}
        }
      }
    }
  }
  return paths
}

test('workspace 只声明批准的成员模式', async () => {
  const yaml = await readFile(new URL('../../pnpm-workspace.yaml', import.meta.url), 'utf8')
  const patterns = [...yaml.matchAll(/^ {2}- '([^']+)'$/gm)].map(match => match[1])
  assert.deepEqual(patterns, expectedPatterns)
})

test('所有 workspace 都是私有包且内部依赖使用 workspace:*', async () => {
  for (const path of await packageFiles()) {
    const manifest = JSON.parse(await readFile(new URL(`../../${path}`, import.meta.url), 'utf8'))
    assert.equal(manifest.private, true, `${path} 必须 private: true`)
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      for (const [name, version] of Object.entries(manifest[field] ?? {})) {
        if (name.startsWith('@xtools/'))
          assert.match(version, /^workspace:*/, `${path} 的 ${name} 必须使用 workspace:*`)
      }
    }
  }
})

test('所有 workspace 成员都有源码入口和 TypeScript 配置', async () => {
  for (const path of (await packageFiles()).filter(path => path !== 'package.json')) {
    const directory = path.slice(0, -'/package.json'.length)
    const manifest = JSON.parse(await readFile(new URL(`../../${path}`, import.meta.url), 'utf8'))
    await assert.doesNotReject(readFile(new URL(`../../${directory}/tsconfig.json`, import.meta.url)), `${directory} 缺少 tsconfig.json`)
    const entry = manifest.exports?.['.'] ?? (manifest.name === '@xtools/web' ? './src/main.tsx' : './src/index.ts')
    const entryPath = entry.startsWith('./') ? entry.slice(2) : entry
    await assert.doesNotReject(readFile(new URL(`../../${directory}/${entryPath}`, import.meta.url)), `${directory} 缺少入口 ${entry}`)
  }
})

test('所有外部依赖版本统一使用 catalog:', async () => {
  for (const path of await packageFiles()) {
    const manifest = JSON.parse(await readFile(new URL(`../../${path}`, import.meta.url), 'utf8'))
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      for (const [name, version] of Object.entries(manifest[field] ?? {})) {
        if (!name.startsWith('@xtools/'))
          assert.equal(version, 'catalog:', `${path} 的 ${name} 必须使用 catalog:`)
      }
    }
  }
})
