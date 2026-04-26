import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import * as inspectionService from './service'
import { InspectionItemStatus } from '@prisma/client'

const startSchema = z.object({
  vehicleId: z.string().uuid(),
  checklistId: z.string().uuid().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
})

const answerItemSchema = z.object({
  status: z.nativeEnum(InspectionItemStatus),
  observation: z.string().optional(),
})

const rejectSchema = z.object({
  notes: z.string().min(10, 'Descreva o problema com ao menos 10 caracteres'),
})

export const inspectionRoutes: FastifyPluginAsync = async (app) => {
  const auth = (app as any).authenticate

  // POST /inspections — inicia nova inspeção
  app.post('/', { preHandler: [auth] }, async (request, reply) => {
    const body = startSchema.parse(request.body)
    const { id: driverId, companyId } = request.user as any

    const inspection = await inspectionService.startInspection({
      ...body,
      driverId,
      companyId,
    })

    return reply.status(201).send(inspection)
  })

  // GET /inspections/:id
  app.get('/:id', { preHandler: [auth] }, async (request) => {
    const { id } = request.params as { id: string }
    const { companyId } = request.user as any
    return inspectionService.getInspectionById(id, companyId)
  })

  // PUT /inspections/:id/items/:itemId — responde item do checklist
  app.put('/:id/items/:itemId', { preHandler: [auth] }, async (request, reply) => {
    const { id, itemId } = request.params as { id: string; itemId: string }
    const { id: driverId } = request.user as any

    // Suporte a multipart (com foto) ou JSON simples
    let status: InspectionItemStatus
    let observation: string | undefined
    let photoBuffer: Buffer | undefined
    let photoMimeType: string | undefined

    const contentType = request.headers['content-type'] ?? ''

    if (contentType.includes('multipart')) {
      const parts = request.parts()
      const fields: Record<string, string> = {}

      for await (const part of parts) {
        if (part.type === 'file' && part.fieldname === 'photo') {
          photoBuffer = await part.toBuffer()
          photoMimeType = part.mimetype
        } else if (part.type === 'field') {
          fields[part.fieldname] = part.value as string
        }
      }

      const parsed = answerItemSchema.parse(fields)
      status = parsed.status
      observation = parsed.observation
    } else {
      const parsed = answerItemSchema.parse(request.body)
      status = parsed.status
      observation = parsed.observation
    }

    const item = await inspectionService.answerItem({
      inspectionId: id,
      itemId,
      driverId,
      status,
      observation,
      photoBuffer,
      photoMimeType,
    })

    return reply.status(200).send(item)
  })

  // POST /inspections/:id/complete — finaliza como APROVADO
  app.post('/:id/complete', { preHandler: [auth] }, async (request) => {
    const { id } = request.params as { id: string }
    const { id: driverId } = request.user as any
    const body = z.object({ signatureUrl: z.string().url().optional() })
      .parse(request.body)

    return inspectionService.completeInspection(id, driverId, body.signatureUrl)
  })

  // POST /inspections/:id/reject — registra NÃO CONFORME
  app.post('/:id/reject', { preHandler: [auth] }, async (request) => {
    const { id } = request.params as { id: string }
    const { id: driverId } = request.user as any
    const { notes } = rejectSchema.parse(request.body)

    return inspectionService.rejectInspection(id, driverId, notes)
  })
}
