import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { UserRole, InspectionStatus } from '@prisma/client'

const filterSchema = z.object({
  from:      z.string().optional(), // ISO date string
  to:        z.string().optional(),
  vehicleId: z.string().uuid().optional(),
  driverId:  z.string().uuid().optional(),
  status:    z.nativeEnum(InspectionStatus).optional(),
  page:      z.coerce.number().int().min(1).default(1),
  limit:     z.coerce.number().int().min(1).max(100).default(20),
})

export const reportRoutes: FastifyPluginAsync = async (app) => {
  const requireManager = (app as any).requireRole(UserRole.MANAGER)

  // GET /reports/inspections — histórico paginado com filtros
  app.get('/inspections', { preHandler: [requireManager] }, async (request) => {
    const { companyId } = request.user as any
    const q = filterSchema.parse(request.query)

    const where = {
      vehicle: { companyId },
      ...(q.vehicleId && { vehicleId: q.vehicleId }),
      ...(q.driverId  && { driverId: q.driverId }),
      ...(q.status    && { status: q.status }),
      ...(q.from || q.to
        ? {
            startedAt: {
              ...(q.from && { gte: new Date(q.from) }),
              ...(q.to   && { lte: new Date(q.to) }),
            },
          }
        : {}),
    }

    const [total, data] = await Promise.all([
      prisma.inspection.count({ where }),
      prisma.inspection.findMany({
        where,
        include: {
          vehicle: { select: { plate: true, model: true } },
          driver:  { select: { name: true } },
          items:   { include: { checklistItem: { select: { name: true } } } },
        },
        orderBy: { startedAt: 'desc' },
        skip:  (q.page - 1) * q.limit,
        take:  q.limit,
      }),
    ])

    return {
      data,
      pagination: {
        total,
        page: q.page,
        limit: q.limit,
        pages: Math.ceil(total / q.limit),
      },
    }
  })

  // GET /reports/summary — métricas agrupadas por período
  app.get('/summary', { preHandler: [requireManager] }, async (request) => {
    const { companyId } = request.user as any
    const { from, to } = z.object({
      from: z.string().optional(),
      to:   z.string().optional(),
    }).parse(request.query)

    const dateFilter = {
      ...(from && { gte: new Date(from) }),
      ...(to   && { lte: new Date(to) }),
    }

    const [total, approved, rejected, byVehicle, byDriver] = await Promise.all([
      prisma.inspection.count({
        where: { vehicle: { companyId }, startedAt: dateFilter },
      }),
      prisma.inspection.count({
        where: { vehicle: { companyId }, status: InspectionStatus.APPROVED, startedAt: dateFilter },
      }),
      prisma.inspection.count({
        where: { vehicle: { companyId }, status: InspectionStatus.REJECTED, startedAt: dateFilter },
      }),
      // Top veículos com mais não-conformidades
      prisma.inspection.groupBy({
        by: ['vehicleId'],
        where: { vehicle: { companyId }, status: InspectionStatus.REJECTED, startedAt: dateFilter },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }),
      // Top motoristas por inspeções realizadas
      prisma.inspection.groupBy({
        by: ['driverId'],
        where: { vehicle: { companyId }, startedAt: dateFilter },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }),
    ])

    return {
      total,
      approved,
      rejected,
      inProgress: total - approved - rejected,
      complianceRate: total > 0 ? Math.round((approved / total) * 100) : 0,
      topRejectedVehicles: byVehicle,
      topActiveDrivers: byDriver,
    }
  })

  // GET /reports/export — CSV para download
  app.get('/export', { preHandler: [requireManager] }, async (request, reply) => {
    const { companyId } = request.user as any
    const { from, to } = z.object({
      from: z.string().optional(),
      to:   z.string().optional(),
    }).parse(request.query)

    const inspections = await prisma.inspection.findMany({
      where: {
        vehicle: { companyId },
        ...(from || to
          ? { startedAt: {
              ...(from && { gte: new Date(from) }),
              ...(to   && { lte: new Date(to) }),
            }}
          : {}),
      },
      include: {
        vehicle: { select: { plate: true, model: true, brand: true } },
        driver:  { select: { name: true, cnh: true } },
      },
      orderBy: { startedAt: 'desc' },
    })

    const header = 'ID,Placa,Veículo,Motorista,CNH,Status,Latitude,Longitude,Início,Conclusão\n'
    const rows = inspections.map(i =>
      [
        i.id,
        i.vehicle.plate,
        `${i.vehicle.brand} ${i.vehicle.model}`,
        i.driver.name,
        i.driver.cnh ?? '',
        i.status,
        i.latitude ?? '',
        i.longitude ?? '',
        i.startedAt.toISOString(),
        i.completedAt?.toISOString() ?? '',
      ].join(',')
    ).join('\n')

    reply.header('Content-Type', 'text/csv; charset=utf-8')
    reply.header('Content-Disposition', `attachment; filename="yescheck-report-${Date.now()}.csv"`)
    return reply.send(header + rows)
  })
}
