import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/prisma'
import { NotFoundError, ConflictError } from '../../lib/errors'
import { UserRole } from '@prisma/client'

const createUserSchema = z.object({
  name: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.nativeEnum(UserRole).default(UserRole.DRIVER),
  cnh: z.string().optional(),
  phone: z.string().optional(),
})

const updateUserSchema = createUserSchema.partial().omit({ password: true })

export const userRoutes: FastifyPluginAsync = async (app) => {
  const requireManager = (app as any).requireRole(UserRole.MANAGER)
  const requireAdmin   = (app as any).requireRole(UserRole.ADMIN)
  const auth           = (app as any).authenticate

  // GET /users — lista usuários da empresa
  app.get('/', { preHandler: [requireManager] }, async (request) => {
    const { companyId } = request.user as any
    return prisma.user.findMany({
      where: { companyId, active: true },
      select: {
        id: true, name: true, email: true,
        role: true, cnh: true, phone: true,
        createdAt: true,
      },
      orderBy: { name: 'asc' },
    })
  })

  // GET /users/me — perfil do usuário autenticado
  app.get('/me', { preHandler: [auth] }, async (request) => {
    const { id } = request.user as any
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, email: true,
        role: true, cnh: true, phone: true,
        company: { select: { id: true, name: true, plan: true } },
      },
    })
    if (!user) throw new NotFoundError('Usuário')
    return user
  })

  // POST /users — cria motorista ou gestor
  app.post('/', { preHandler: [requireAdmin] }, async (request, reply) => {
    const { companyId } = request.user as any
    const data = createUserSchema.parse(request.body)

    const exists = await prisma.user.findUnique({ where: { email: data.email } })
    if (exists) throw new ConflictError('Email já cadastrado')

    const passwordHash = await bcrypt.hash(data.password, 10)
    const user = await prisma.user.create({
      data: { ...data, passwordHash, companyId },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    })

    return reply.status(201).send(user)
  })

  // PUT /users/:id
  app.put('/:id', { preHandler: [requireAdmin] }, async (request) => {
    const { id } = request.params as { id: string }
    const { companyId } = request.user as any
    const data = updateUserSchema.parse(request.body)

    const user = await prisma.user.findFirst({ where: { id, companyId } })
    if (!user) throw new NotFoundError('Usuário')

    return prisma.user.update({
      where: { id },
      data,
      select: { id: true, name: true, email: true, role: true, cnh: true },
    })
  })

  // DELETE /users/:id (soft delete)
  app.delete('/:id', { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { companyId } = request.user as any

    const user = await prisma.user.findFirst({ where: { id, companyId } })
    if (!user) throw new NotFoundError('Usuário')

    await prisma.user.update({ where: { id }, data: { active: false } })
    return reply.status(204).send()
  })
}
