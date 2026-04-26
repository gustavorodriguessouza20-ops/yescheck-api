import fp from 'fastify-plugin'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { UnauthorizedError, ForbiddenError } from '../lib/errors'

export enum UserRole {
  DRIVER  = 'DRIVER',
  MANAGER = 'MANAGER',
  ADMIN   = 'ADMIN',
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: {
      sub:       string
      id:        string
      role:      string
      companyId: string
      name:      string
    }
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>
    requireRole:  (role: UserRole) => (request: FastifyRequest) => Promise<void>
  }
}

export const authenticate = fp(async (app: FastifyInstance) => {
  app.decorate('authenticate', async (request: FastifyRequest) => {
    try {
      await request.jwtVerify()
      request.user.id = request.user.sub
    } catch {
      throw new UnauthorizedError('Token inválido ou expirado')
    }
  })

  app.decorate(
    'requireRole',
    (minRole: UserRole) => async (request: FastifyRequest) => {
      await app.authenticate(request)
      const roleOrder     = [UserRole.DRIVER, UserRole.MANAGER, UserRole.ADMIN]
      const userLevel     = roleOrder.indexOf(request.user.role as UserRole)
      const requiredLevel = roleOrder.indexOf(minRole)
      if (userLevel < requiredLevel) {
        throw new ForbiddenError()
      }
    }
  )
})
