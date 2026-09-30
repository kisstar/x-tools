import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'
import test from 'node:test'
import ts from 'typescript'

async function filesUnder(directory) {
  const output = []
  async function visit(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const next = join(path, entry.name)
      if (entry.isDirectory()) await visit(next)
      else if (['.ts', '.tsx'].includes(extname(entry.name))) output.push(next)
    }
  }
  try { await visit(new URL(`../../${directory}/`, import.meta.url)) } catch {}
  return output
}

function importsOf(text, file) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  const imports = []
  source.forEachChild(node => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text)
  })
  return imports
}

test('Web runtime 不依赖界面、宿主协议或具体区域', async () => {
  const forbiddenImports = new Set(['react', 'react-dom', '@tanstack/react-router'])
  for (const file of await filesUnder('packages/web-runtime')) {
    const text = await readFile(file, 'utf8')
    for (const specifier of importsOf(text, file)) assert.ok(!forbiddenImports.has(specifier) && !specifier.startsWith('@xtools/module-'), `${relative('.', file)} 禁止依赖 ${specifier}`)
    assert.doesNotMatch(text, /\b(?:WebSocket|localStorage)\b|['"](?:top-navigation|primary-navigation|secondary-navigation|detail)['"]/u)
  }
})

test('UI 模块之间没有实现依赖', async () => {
  for (const file of await filesUnder('packages/modules')) {
    const text = await readFile(file, 'utf8')
    for (const specifier of importsOf(text, file)) assert.ok(!specifier.startsWith('@xtools/module-'), `${relative('.', file)} 禁止横向依赖 ${specifier}`)
  }
})

test('生产入口不引用测试插件 fixture', async () => {
  for (const file of await filesUnder('apps/web')) {
    if (file.endsWith('.test.ts') || file.endsWith('.test.tsx') || file.includes('/test/')) continue
    const text = await readFile(file, 'utf8')
    assert.doesNotMatch(text, /test-plugins|test\/fixtures/u, relative('.', file))
  }
})

test('package 依赖图遵循 runtime、adapter、module、app 方向', async () => {
  const manifests = ['packages/web-runtime/package.json', 'packages/adapter-ws/package.json', 'packages/modules/workbench-shell/package.json', 'apps/web/package.json']
  for (const path of manifests) {
    const manifest = JSON.parse(await readFile(new URL(`../../${path}`, import.meta.url), 'utf8'))
    const dependencies = Object.keys(manifest.dependencies ?? {})
    if (manifest.name === '@xtools/web-runtime') assert.ok(dependencies.every(name => !name.startsWith('@xtools/module-') && name !== '@xtools/web'))
    if (manifest.name.startsWith('@xtools/adapter-')) assert.ok(dependencies.every(name => !name.startsWith('@xtools/module-') && name !== '@xtools/web'))
    if (manifest.name.startsWith('@xtools/module-')) assert.ok(dependencies.every(name => !name.startsWith('@xtools/module-') && name !== '@xtools/web'))
  }
})
