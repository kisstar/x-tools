import type { UiModule } from '@xtools/web-runtime'
import { recentTools } from '@xtools/module-recent-tools'
import { workbenchHome } from '@xtools/module-workbench-home'
import { workbenchSettings } from '@xtools/module-workbench-settings'
import { workbenchShell } from '@xtools/module-workbench-shell'

export const productionModules: readonly UiModule[] = [
  workbenchShell,
  workbenchHome,
  workbenchSettings,
  recentTools,
]
