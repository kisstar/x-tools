import { expect, test } from '@playwright/test'

interface PreferenceState { global: Record<string, unknown>, workspaces: Record<string, unknown> }
interface RpcResponse { id?: number, result?: unknown, error?: { code: string, message: string } }

async function updatePreferences(page: import('@playwright/test').Page, replacement: PreferenceState) {
  await page.evaluate(async (nextPreferences) => {
    const token = document.querySelector<HTMLMetaElement>('meta[name="xtools-session-token"]')?.content
    if (token === undefined || token === '')
      throw new Error('missing session token')
    const socket = new WebSocket(`ws://${location.host}/ws`, ['xtools', `xtools-token.${token}`])
    const call = async (id: number, method: string, params: unknown) => new Promise<unknown>((resolve, reject) => {
      const receive = (event: MessageEvent) => {
        const response = JSON.parse(String(event.data)) as RpcResponse
        if (response.id !== id)
          return
        socket.removeEventListener('message', receive)
        if (response.error !== undefined)
          reject(new Error(`${response.error.code}: ${response.error.message}`))
        else resolve(response.result)
      }
      socket.addEventListener('message', receive)
      socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
    })
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => resolve(), { once: true })
      socket.addEventListener('error', () => reject(new Error('websocket failed')), { once: true })
    })
    const current = await call(1, 'workbench.preferences.get@1', {}) as { preferences: { revision: string, global: Record<string, unknown>, workspaces: Record<string, unknown> } }
    await call(2, 'workbench.preferences.update@1', { expectedRevision: current.preferences.revision, preferences: nextPreferences })
    socket.close()
  }, replacement)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/#/home/home.overview')
  await updatePreferences(page, { global: {}, workspaces: {} })
  await page.reload()
})

test('默认工作台通过真实服务、WS 和偏好 capability 启动', async ({ page }) => {
  await expect(page.getByRole('heading', { name: '你的本地工具工作台' })).toBeVisible()
  await expect(page.getByRole('button', { name: '最近工具' })).toBeVisible()
  await page.getByRole('button', { name: '最近工具' }).click()
  await expect(page).toHaveURL(/#\/home\/recent-tools\.catalog$/)
  await expect(page.getByRole('heading', { name: '最近工具' })).toBeVisible()
  await page.getByRole('button', { name: '设置' }).first().click()
  await expect(page).toHaveURL(/#\/settings\/settings\.general$/)
  await expect(page.getByRole('heading', { name: '工作台设置' })).toBeVisible()
})

test('命令面板可由快捷键打开且 Escape 关闭', async ({ page }) => {
  await page.getByRole('button', { name: '搜索工具或运行命令' }).click()
  await expect(page.getByRole('dialog', { name: '命令面板' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: '命令面板' })).toBeHidden()
})

test('全局与工作区偏好经真实 capability 更新 revision', async ({ page }) => {
  await page.getByRole('button', { name: '设置' }).first().click()
  const revision = page.getByText(/当前 revision：\d+/)
  const revisionText = await revision.textContent()
  const initial = Number(revisionText?.match(/\d+/)?.[0] ?? 0)
  await page.getByRole('checkbox', { name: '显示详情面板' }).uncheck()
  await expect(revision).toHaveText(`当前 revision：${initial + 1}`)
  await page.getByRole('tab', { name: '当前工作区' }).click()
  await page.getByRole('checkbox', { name: '显示详情面板' }).check()
  await expect(revision).toHaveText(`当前 revision：${initial + 2}`)
})

test('已保存但卸载的 renderer 显示不可用诊断且不静默回退', async ({ page }) => {
  await updatePreferences(page, { global: { containers: { home: { regions: { content: { rendererId: 'plugin.removed.content' } } } } }, workspaces: {} })
  await page.reload()
  await expect(page.getByText('renderer plugin.removed.content is unavailable for content')).toBeVisible()
})

test('可选插件激活失败只隔离自身并保留诊断', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/tests/e2e/fixture.html?scenario=optional-failure')
  await expect(page.getByRole('heading', { name: '你的本地工具工作台' })).toBeVisible()
  await expect(page.getByText(/fixture.optional.*optional failed/)).toBeVisible()
})

test('必需 Shell 激活失败时浏览器只显示启动诊断', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/tests/e2e/fixture.html?scenario=shell-failure')
  await expect(page.getByRole('alert')).toContainText('workbench.shell: shell failed')
  await expect(page.getByRole('heading', { name: '你的本地工具工作台' })).toHaveCount(0)
})
