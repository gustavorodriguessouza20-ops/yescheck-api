import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { NotFoundError } from '../../lib/errors'
import { UserRole } from '@prisma/client'

const vehicleSchema = z.object({
  plate: z.string().min(7).max(8).toUpperCase(),
  model: z.string().min(2),
  brand: z.string().min(2),
  year: z.number().int().min(1990).max(new Date().getFullYear() + 1),
  kmCurrent: z.number().int().min(0).optional(),
})

export const vehicleRoutes: FastifyPluginAsync = async (app) => {
  const auth = (app as any).authenticate
  const requireManager = (app as any).requireRole(UserRole.MANAGER)

  // GET /vehicles
  app.get('/', { preHandler: [auth] }, async (request) => {
    const { companyId } = request.user as any
    return prisma.vehicle.findMany({
      where: { companyId, active: true },
      orderBy: { plate: 'asc' },
    })
  })

  // GET /vehicles/:id
  app.get('/:id', { preHandler: [auth] }, async (request) => {
    const { id } = request.params as { id: string }
    const { companyId } = request.user as any

    const vehicle = await prisma.vehicle.findFirst({
      where: { id, companyId },
    })
    if (!vehicle) throw new NotFoundError('Veículo')
    return vehicle
  })

  // POST /vehicles — somente manager/admin
  app.post('/', { preHandler: [requireManager] }, async (request, reply) => {
    const { companyId } = request.user as any
    const data = vehicleSchema.parse(request.body)

    const vehicle = await prisma.vehicle.create({
      data: { ...data, companyId },
    })
    return reply.status(201).send(vehicle)
  })

  // PUT /vehicles/:id
  app.put('/:id', { preHandler: [requireManager] }, async (request) => {
    const { id } = request.params as { id: string }
    const { companyId } = request.user as any
    const data = vehicleSchema.partial().parse(request.body)

    const vehicle = await prisma.vehicle.findFirst({ where: { id, companyId } })
    if (!vehicle) throw new NotFoundError('Veículo')

    return prisma.vehicle.update({ where: { id }, data })
  })

  // DELETE /vehicles/:id (soft delete)
  app.delete('/:id', { preHandler: [requireManager] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { companyId } = request.user as any

    const vehicle = await prisma.vehicle.findFirst({ where: { id, companyId } })
    if (!vehicle) throw new NotFoundError('Veículo')

    await prisma.vehicle.update({ where: { id }, data: { active: false } })
    return reply.status(204).send()
  })
}
