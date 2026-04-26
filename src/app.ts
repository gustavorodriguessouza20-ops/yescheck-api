import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import { authenticate } from './plugins/auth.plugin'
import { AppError } from './lib/errors'
import { ZodError } from 'zod'

import { authRoutes }       from './modules/auth/controller'
import { vehicleRoutes }    from './modules/vehicles/controller'
import { inspectionRoutes } from './modules/inspections/controller'
import { checklistRoutes }  from './modules/checklists/controller'
import { dashboardRoutes }  from './modules/dashboard/controller'
import { userRoutes }       from './modules/users/controller'
import { reportRoutes }     from './modules/reports/controller'

export async function buildApp() {
  const app = Fastify({
    logger: { level: process.env.NODE_ENV === 'production' ? 'warn' : 'info' },
  })

  // CORS — suporta múltiplas origens via variável separada por vírgula
  const allowedOrigins = (process.env.FRONTEND_URL ?? 'http://localhost:5173')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean)

  await app.register(cors, {
    origin: (origin, cb) => {
      // Permite requests sem origin (mobile, Postman, server-to-server)
      if (!origin) return cb(null, true)
      if (allowedOrigins.includes(origin)) return cb(null, true)
      // Permite qualquer subdomínio *.vercel.app para preview deploys
      if (origin.endsWith('.vercel.app')) return cb(null, true)
      cb(new Error('Not allowed by CORS'), false)
    },
    credentials: true,
  })

  // JWT
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET não definido')
  await app.register(jwt, { secret: process.env.JWT_SECRET })

  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  })

  await app.register(authenticate)

  // Rotas
  await app.register(authRoutes,       { prefix: '/auth' })
  await app.register(userRoutes,       { prefix: '/users' })
  await app.register(vehicleRoutes,    { prefix: '/vehicles' })
  await app.register(inspectionRoutes, { prefix: '/inspections' })
  await app.register(checklistRoutes,  { prefix: '/checklists' })
  await app.register(dashboardRoutes,  { prefix: '/dashboard' })
  await app.register(reportRoutes,     { prefix: '/reports' })

  app.get('/health', async () => ({ status: 'ok', service: 'yescheck-api', ts: new Date() }))

  // Error handler global
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ZodError) {
      return reply.status(422).send({
        error: 'VALIDATION_ERROR',
        message: 'Dados inválidos',
        details: error.flatten().fieldErrors,
      })
    }
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: error.code,
        message: error.message,
      })
    }
    app.log.error(error)
    return reply.status(500).send({
      error: 'INTERNAL_ERROR',
      message: 'Erro interno. Tente novamente.',
    })
  })

  return app
}
