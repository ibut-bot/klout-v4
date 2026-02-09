import { prisma } from './db'
import { NotificationType } from '@/app/generated/prisma/client'

export async function createNotification(params: {
  userId: string
  type: NotificationType
  title: string
  body: string
  linkUrl: string
}) {
  try {
    await prisma.notification.create({ data: params })
  } catch (e) {
    // Log but don't throw — notifications should never break the main flow
    console.error('Failed to create notification:', e)
  }
}
