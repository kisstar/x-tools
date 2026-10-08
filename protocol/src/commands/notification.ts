/**
 * Notification channel command (§5.4). An OS primitive capability: available
 * on both clients (browser via Web Notifications, electron via OS), so no
 * desktop-only restriction here.
 */

import { z } from "zod"

import { defineCommand } from "../define-command"

export const NotificationShowArgs = z.object({
  title: z.string().min(1),
  body: z.string().optional(),
  icon: z.string().optional(),
  silent: z.boolean().optional(),
})
export type NotificationShowArgs = z.infer<typeof NotificationShowArgs>

export const NOTIFICATION_SHOW = defineCommand({
  channel: "notification",
  command: "show",
  args: NotificationShowArgs,
  result: z.void(),
  capability: "notification.show",
})

export const NOTIFICATION_COMMANDS = [NOTIFICATION_SHOW] as const
