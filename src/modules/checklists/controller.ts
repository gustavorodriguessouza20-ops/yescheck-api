import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { NotFoundError } from '../../lib/errors'
import { UserRole } from '@prisma/client'

const itemSchema = z.object({
  name: z.string().min(3),
  order: z.number().int().min(0).optional(),
  required: z.boolean().default(true),
  requiresPhoto: z.boolean().default(false),
})

const checklistSchema = z.object({
  name: z.string().min(3),
  items: z.array(itemSchema).min(1),
})

export const checklistRoutes: FastifyPluginAsync = async (app) => {
  const requireManager = (app as any).requireRole(UserRole.MANAGER)
  const auth = (app as any).authenticate

  // GET /checklists — lista checklists da empresa
  app.get('/', { preHandler: [auth] }, async (request) => {
    const { companyId } = request.user as any
    return prisma.checklist.findMany({
      where: { companyId, active: true },
      include: { items: { orderBy: { order: 'asc' } } },
    })
  })

  // POST /checklists — cria novo checklist
  app.post('/', { preHandler: [requireManager] }, async (request, reply) => {
    const { companyId } = request.user as any
    const data = checklistSchema.parse(request.body)

    const checklist = await prisma.checklist.create({
      data: {
        name: data.name,
        companyId,
        items: {
          create: data.items.map((item, index) => ({
            ...item,
            order: item.order ?? index,
          })),
        },
      },
      include: { items: { orderBy: { order: 'asc' } } },
    })

    return reply.status(201).send(checklist)
  })

  // PUT /checklists/:id/items — atualiza itens
  app.put('/:id/items', { preHandler: [requireManager] }, async (request) => {
    const { id } = request.params as { id: string }
    const { companyId } = request.user as any
    const { items } = z.object({ items: z.array(itemSchema) }).parse(request.body)

    const checklist = await prisma.checklist.findFirst({ where: { id, companyId } })
    if (!checklist) throw new NotFoundError('Checklist')

    // Recria os itens (estratégia simples para MVP)
    await prisma.checklistItem.deleteMany({ where: { checklistId: id } })
    await prisma.checklistItem.createMany({
      data: items.map((item, index) => ({
        checklistId: id,
        ...item,
        order: item.order ?? index,
      })),
    })

    return prisma.checklist.findFirst({
      where: { id },
      include: { items: { orderBy: { order: 'asc' } } },
    })
  })
}
