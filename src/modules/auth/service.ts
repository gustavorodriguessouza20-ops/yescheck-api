import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import { prisma } from '../../lib/prisma'
import { UnauthorizedError } from '../../lib/errors'
import type { FastifyInstance } from 'fastify'

export async function login(
  email: string,
  password: string,
  app: FastifyInstance
) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { company: { select: { id: true, name: true, active: true } } },
  })

  if (!user || !user.active) {
    throw new UnauthorizedError('Credenciais inválidas')
  }

  if (!user.company.active) {
    throw new UnauthorizedError('Empresa inativa. Entre em contato com o suporte.')
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash)
  if (!validPassword) {
    throw new UnauthorizedError('Credenciais inválidas')
  }

  // Access token — curto prazo (15min)
  const accessToken = app.jwt.sign(
    {
      sub: user.id,
      role: user.role,
      companyId: user.companyId,
      name: user.name,
    },
    { expiresIn: process.env.JWT_EXPIRES_IN ?? '15m' }
  )

  // Refresh token — longo prazo (7 dias), armazenado no banco
  const rawRefreshToken = randomUUID()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      token: rawRefreshToken,
      expiresAt,
    },
  })

  return {
    accessToken,
    refreshToken: rawRefreshToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      company: user.company,
    },
  }
}

export async function refresh(refreshToken: string, app: FastifyInstance) {
  const stored = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
    include: { user: true },
  })

  if (!stored || stored.revoked || stored.expiresAt < new Date()) {
    throw new UnauthorizedError('Refresh token inválido ou expirado')
  }

  // Rotaciona o token (invalida o antigo)
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revoked: true },
  })

  const newAccessToken = app.jwt.sign(
    {
      sub: stored.user.id,
      role: stored.user.role,
      companyId: stored.user.companyId,
      name: stored.user.name,
    },
    { expiresIn: process.env.JWT_EXPIRES_IN ?? '15m' }
  )

  // Novo refresh token
  const newRawRefresh = randomUUID()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)

  await prisma.refreshToken.create({
    data: {
      userId: stored.user.id,
      token: newRawRefresh,
      expiresAt,
    },
  })

  return { accessToken: newAccessToken, refreshToken: newRawRefresh }
}

export async function logout(refreshToken: string) {
  await prisma.refreshToken.updateMany({
    where: { token: refreshToken },
    data: { revoked: true },
  })
}
