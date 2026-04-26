import type { FastifyPluginAsync } from 'fastify'
import { loginSchema, refreshSchema } from './schema'
import * as authService from './service'

export const authRoutes: FastifyPluginAsync = async (app) => {
  // POST /auth/login
  app.post('/login', async (request, reply) => {
    const body = loginSchema.parse(request.body)
    const result = await authService.login(body.email, body.password, app)
    return reply.status(200).send(result)
  })

  // POST /auth/refresh
  app.post('/refresh', async (request, reply) => {
    const body = refreshSchema.parse(request.body)
    const result = await authService.refresh(body.refreshToken, app)
    return reply.status(200).send(result)
  })

  // POST /auth/logout
  app.post('/logout', {
    preHandler: [(app as any).authenticate],
  }, async (request, reply) => {
    const body = refreshSchema.parse(request.body)
    await authService.logout(body.refreshToken)
    return reply.status(204).send()
  })
}
