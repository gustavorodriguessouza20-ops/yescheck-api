import { prisma } from '../../lib/prisma'
import { AppError, NotFoundError, ForbiddenError } from '../../lib/errors'
import { uploadInspectionPhoto } from '../../lib/storage'
import { InspectionStatus, InspectionItemStatus } from '@prisma/client'

// ─── Iniciar inspeção ─────────────────────────────────────────────────────────
export async function startInspection(params: {
  vehicleId: string
  driverId: string
  companyId: string
  checklistId?: string
  latitude?: number
  longitude?: number
}) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: params.vehicleId, companyId: params.companyId, active: true },
  })
  if (!vehicle) throw new NotFoundError('Veículo')

  // Busca o checklist ativo da empresa (ou o especificado)
  const checklist = params.checklistId
    ? await prisma.checklist.findFirst({
        where: { id: params.checklistId, companyId: params.companyId },
        include: { items: { orderBy: { order: 'asc' } } },
      })
    : await prisma.checklist.findFirst({
        where: { companyId: params.companyId, active: true },
        include: { items: { orderBy: { order: 'asc' } } },
      })

  if (!checklist) throw new NotFoundError('Checklist')

  // Cria a inspeção com todos os itens como pendentes
  const inspection = await prisma.inspection.create({
    data: {
      vehicleId: params.vehicleId,
      driverId: params.driverId,
      checklistId: checklist.id,
      latitude: params.latitude,
      longitude: params.longitude,
      status: InspectionStatus.IN_PROGRESS,
      items: {
        create: checklist.items.map((item) => ({
          checklistItemId: item.id,
          status: InspectionItemStatus.OK, // padrão — motorista confirma ou altera
        })),
      },
    },
    include: {
      vehicle: true,
      checklist: { include: { items: { orderBy: { order: 'asc' } } } },
      items: { include: { checklistItem: true } },
    },
  })

  return inspection
}

// ─── Responder item do checklist ──────────────────────────────────────────────
export async function answerItem(params: {
  inspectionId: string
  itemId: string
  driverId: string
  status: InspectionItemStatus
  observation?: string
  photoBuffer?: Buffer
  photoMimeType?: string
}) {
  const inspection = await prisma.inspection.findFirst({
    where: { id: params.inspectionId, driverId: params.driverId },
    include: { items: { include: { checklistItem: true } } },
  })

  if (!inspection) throw new NotFoundError('Inspeção')
  if (inspection.status !== InspectionStatus.IN_PROGRESS) {
    throw new AppError('Inspeção já finalizada', 400, 'INSPECTION_CLOSED')
  }

  const inspectionItem = inspection.items.find(
    (i) => i.checklistItemId === params.itemId
  )
  if (!inspectionItem) throw new NotFoundError('Item')

  // Upload de foto se enviada
  let photoUrl: string | undefined
  if (params.photoBuffer && params.photoMimeType) {
    photoUrl = await uploadInspectionPhoto(
      params.photoBuffer,
      params.photoMimeType,
      params.inspectionId
    )
  }

  // Valida foto obrigatória em itens críticos com issue
  if (
    inspectionItem.checklistItem.requiresPhoto &&
    params.status === InspectionItemStatus.ISSUE &&
    !photoUrl
  ) {
    throw new AppError(
      'Este item requer foto quando há problema identificado',
      400,
      'PHOTO_REQUIRED'
    )
  }

  return prisma.inspectionItem.update({
    where: { id: inspectionItem.id },
    data: {
      status: params.status,
      observation: params.observation,
      photoUrl,
      answeredAt: new Date(),
    },
  })
}

// ─── Finalizar inspeção (APROVADO) ────────────────────────────────────────────
export async function completeInspection(
  inspectionId: string,
  driverId: string,
  signatureUrl?: string
) {
  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, driverId },
    include: { items: { include: { checklistItem: true } } },
  })

  if (!inspection) throw new NotFoundError('Inspeção')
  if (inspection.status !== InspectionStatus.IN_PROGRESS) {
    throw new AppError('Inspeção já finalizada', 400, 'INSPECTION_CLOSED')
  }

  // Verifica itens obrigatórios sem resposta
  const unanswered = inspection.items.filter(
    (i) => i.checklistItem.required && !i.answeredAt
  )
  if (unanswered.length > 0) {
    throw new AppError(
      `${unanswered.length} item(s) obrigatório(s) sem resposta`,
      400,
      'INCOMPLETE_CHECKLIST'
    )
  }

  // Verifica se há itens com problema — força rejeição
  const hasIssues = inspection.items.some(
    (i) => i.status === InspectionItemStatus.ISSUE
  )
  if (hasIssues) {
    throw new AppError(
      'Há itens com problema. Use "Veículo não conforme" para registrar a reprovação.',
      400,
      'HAS_ISSUES'
    )
  }

  return prisma.inspection.update({
    where: { id: inspectionId },
    data: {
      status: InspectionStatus.APPROVED,
      completedAt: new Date(),
      signatureUrl,
    },
    include: {
      vehicle: true,
      driver: { select: { id: true, name: true, cnh: true } },
      items: { include: { checklistItem: true } },
    },
  })
}

// ─── Reprovar inspeção (NÃO CONFORME) ────────────────────────────────────────
export async function rejectInspection(
  inspectionId: string,
  driverId: string,
  notes: string
) {
  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, driverId },
  })

  if (!inspection) throw new NotFoundError('Inspeção')
  if (inspection.status !== InspectionStatus.IN_PROGRESS) {
    throw new AppError('Inspeção já finalizada', 400, 'INSPECTION_CLOSED')
  }

  return prisma.inspection.update({
    where: { id: inspectionId },
    data: {
      status: InspectionStatus.REJECTED,
      completedAt: new Date(),
      notes,
    },
  })
}

// ─── Buscar inspeção por ID ───────────────────────────────────────────────────
export async function getInspectionById(id: string, companyId: string) {
  const inspection = await prisma.inspection.findFirst({
    where: { id, vehicle: { companyId } },
    include: {
      vehicle: true,
      driver: { select: { id: true, name: true, cnh: true } },
      checklist: true,
      items: {
        include: { checklistItem: true },
        orderBy: { checklistItem: { order: 'asc' } },
      },
    },
  })

  if (!inspection) throw new NotFoundError('Inspeção')
  return inspection
}
