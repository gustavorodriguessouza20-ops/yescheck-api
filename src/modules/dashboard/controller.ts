import type { FastifyPluginAsync } from 'fastify'
import * as dashboardService from './service'
import { UserRole } from '@prisma/client'

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  const requireManager = (app as any).requireRole(UserRole.MANAGER)

  // GET /dashboard/summary — resumo geral da frota
  app.get('/summary', { preHandler: [requireManager] }, async (request) => {
    const { companyId } = request.user as any
    return dashboardService.getFleetSummary(companyId)
  })

  // GET /dashboard/fleet-status — status individual de cada veículo hoje
  app.get('/fleet-status', { preHandler: [requireManager] }, async (request) => {
    const { companyId } = request.user as any
    return dashboardService.getFleetStatus(companyId)
  })
}
