import { readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { format } from '@wasm-fmt/shfmt'

const [mode, ...files] = process.argv.slice(2)
if (!['--check', '--write'].includes(mode) || files.length === 0) {
  console.error('usage: node scripts/shfmt.mjs --check|--write <files...>')
  process.exit(2)
}

let failed = false
for (const file of files) {
  const source = await readFile(file, 'utf8')
  const formatted = format(source, file, { indent: 2, switchCaseIndent: true })
  if (source === formatted) {
    continue
  }
  if (mode === '--write') {
    await writeFile(file, formatted)
  }
  else {
    console.error(`${file}: 需要运行 shfmt`)
    failed = true
  }
}

if (failed) {
  process.exit(1)
}
