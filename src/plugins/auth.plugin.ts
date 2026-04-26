import fp from 'fastify-plugin'
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { UnauthorizedError, ForbiddenError } from '../lib/errors'
import { UserRole } from '@prisma/client'

// Extende os tipos do Fastify para o payload do JWT
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string
      role: UserRole
      companyId: string
      name: string
    }
    user: {
      sub: string
      id: string
      role: UserRole
      companyId: string
      name: string
    }
  }
}

// Hook que valida JWT e injeta user na request
export const authenticate: FastifyPluginAsync = fp(async (app) => {
  app.decorate('authenticate', async (request: FastifyRequest) => {
    try {
      await request.jwtVerify()
      // Normaliza sub → id para uso nos services
      ;(request.user as any).id = request.user.sub
    } catch {
      throw new UnauthorizedError('Token inválido ou expirado')
    }
  })

  // Decorator para verificar role mínima
  app.decorate(
    'requireRole',
    (minRole: UserRole) => async (request: FastifyRequest) => {
      await (app as any).authenticate(request)
      const roleOrder = [UserRole.DRIVER, UserRole.MANAGER, UserRole.ADMIN]
      const userLevel = roleOrder.indexOf(request.user.role)
      const requiredLevel = roleOrder.indexOf(minRole)
      if (userLevel < requiredLevel) {
        throw new ForbiddenError()
   