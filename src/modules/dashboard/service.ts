import { prisma } from '../../lib/prisma'
import { InspectionStatus } from '@prisma/client'

export async function getFleetSummary(companyId: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [
    totalVehicles,
    approvedToday,
    rejectedToday,
    pendingToday,
    recentInspections,
  ] = await Promise.all([
    // Total de veículos ativos
    prisma.vehicle.count({ where: { companyId, active: true } }),

    // Aprovados hoje (YesCheck ✓)
    prisma.inspection.count({
      where: {
        vehicle: { companyId },
        status: InspectionStatus.APPROVED,
        completedAt: { gte: today },
      },
    }),

    // Reprovados hoje (Não conforme)
    prisma.inspection.count({
      where: {
        vehicle: { companyId },
        status: InspectionStatus.REJECTED,
        completedAt: { gte: today },
      },
    }),

    // Veículos sem inspeção hoje (pendentes)
    prisma.vehicle.count({
      where: {
        companyId,
        active: true,
        inspections: {
          none: {
            startedAt: { gte: today },
            status: { in: [InspectionStatus.APPROVED, InspectionStatus.REJECTED] },
          },
        },
      },
    }),

    // Últimas 10 inspeções
    prisma.inspection.findMany({
      where: { vehicle: { companyId } },
      include: {
        vehicle: { select: { plate: true, model: true } },
        driver: { select: { name: true } },
      },
      orderBy: { startedAt: 'desc' },
      take: 10,
    }),
  ])

  return {
    summary: {
      totalVehicles,
      approvedToday,
      rejectedToday,
      pendingToday,
      complianceRate:
        totalVehicles > 0
          ? Math.round((approvedToday / totalVehicles) * 100)
          : 0,
    },
    recentInspections,
  }
}

export async function getFleetStatus(companyId: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const vehicles = await prisma.vehicle.findMany({
    where: { companyId, active: true },
    include: {
      inspections: {
        where: { startedAt: { gte: today } },
        orderBy: { startedAt: 'desc' },
        take: 1,
        include: {
          driver: { select: { name: true } },
        },
      },
    },
    orderBy: { plate: 'asc' },
  })

  return vehicles.map((v) => {
    const lastInspection = v.inspections[0]
    return {
      id: v.id,
      plate: v.plate,
      model: v.model,
      brand: v.brand,
      status: lastInspection?.status ?? 'PENDING',
      lastInspection: lastInspection
        ? {
            id: lastInspection.id,
            status: lastInspection.status,
            completedAt: lastInspection.completedAt,
            driver: lastInspection.driver?.name,
          }
        : null,
    }
  })
}
