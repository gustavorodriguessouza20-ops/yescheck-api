/**
 * Seed — dados iniciais para desenvolvimento e demo
 * Rodar com: npm run db:seed
 */
import { PrismaClient, UserRole, CompanyPlan } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Iniciando seed...')

  // 1. Empresa de demonstração
  const company = await prisma.company.upsert({
    where: { cnpj: '12.345.678/0001-99' },
    update: {},
    create: {
      name: 'Transportadora Demo Ltda',
      cnpj: '12.345.678/0001-99',
      plan: CompanyPlan.STARTER,
    },
  })
  console.log('✓ Empresa criada:', company.name)

  const hash = (p: string) => bcrypt.hash(p, 10)

  // 2. Usuários
  const [admin, manager, driver1, driver2] = await Promise.all([
    prisma.user.upsert({
      where: { email: 'admin@demo.com' },
      update: {},
      create: {
        companyId: company.id,
        name: 'Admin Demo',
        email: 'admin@demo.com',
        passwordHash: await hash('demo1234'),
        role: UserRole.ADMIN,
      },
    }),
    prisma.user.upsert({
      where: { email: 'gestor@demo.com' },
      update: {},
      create: {
        companyId: company.id,
        name: 'Carlos Gestor',
        email: 'gestor@demo.com',
        passwordHash: await hash('demo1234'),
        role: UserRole.MANAGER,
      },
    }),
    prisma.user.upsert({
      where: { email: 'joao@demo.com' },
      update: {},
      create: {
        companyId: company.id,
        name: 'João Silva',
        email: 'joao@demo.com',
        passwordHash: await hash('demo1234'),
        role: UserRole.DRIVER,
        cnh: '12345678901',
        phone: '(11) 99999-0001',
      },
    }),
    prisma.user.upsert({
      where: { email: 'maria@demo.com' },
      update: {},
      create: {
        companyId: company.id,
        name: 'Maria Souza',
        email: 'maria@demo.com',
        passwordHash: await hash('demo1234'),
        role: UserRole.DRIVER,
        cnh: '98765432100',
        phone: '(11) 99999-0002',
      },
    }),
  ])
  console.log('✓ Usuários criados: admin, gestor, 2 motoristas')

  // 3. Veículos
  const [v1, v2, v3] = await Promise.all([
    prisma.vehicle.upsert({
      where: { plate: 'MBB-2841' },
      update: {},
      create: { companyId: company.id, plate: 'MBB-2841', model: 'Actros', brand: 'Mercedes-Benz', year: 2021, kmCurrent: 148230 },
    }),
    prisma.vehicle.upsert({
      where: { plate: 'VKT-9032' },
      update: {},
      create: { companyId: company.id, plate: 'VKT-9032', model: 'Sprinter', brand: 'Mercedes-Benz', year: 2022, kmCurrent: 62450 },
    }),
    prisma.vehicle.upsert({
      where: { plate: 'IVC-5540' },
      update: {},
      create: { companyId: company.id, plate: 'IVC-5540', model: 'Daily', brand: 'Iveco', year: 2020, kmCurrent: 215800 },
    }),
  ])
  console.log('✓ Veículos criados:', v1.plate, v2.plate, v3.plate)

  // 4. Checklist padrão
  const existingChecklist = await prisma.checklist.findFirst({
    where: { companyId: company.id, name: 'Inspeção Padrão Pré-Viagem' },
  })

  if (!existingChecklist) {
    const checklist = await prisma.checklist.create({
      data: {
        companyId: company.id,
        name: 'Inspeção Padrão Pré-Viagem',
        items: {
          create: [
            { name: 'Pneus — pressão e estado visual', order: 1, required: true,  requiresPhoto: false },
            { name: 'Freios — teste de pedal',         order: 2, required: true,  requiresPhoto: false },
            { name: 'Combustível / nível de óleo',     order: 3, required: true,  requiresPhoto: false },
            { name: 'Luzes — faróis e sinaleiros',     order: 4, required: true,  requiresPhoto: false },
            { name: 'Avarias externas — lataria/vidros', order: 5, required: true, requiresPhoto: true },
            { name: 'Documentação — CRLV e CNH',       order: 6, required: true,  requiresPhoto: false },
            { name: 'Extintor — validade e fixação',   order: 7, required: true,  requiresPhoto: true  },
          ],
        },
      },
    })
    console.log('✓ Checklist criado:', checklist.name)
  }

  console.log('\n🎉 Seed concluído!')
  console.log('─────────────────────────────────')
  console.log('Acesso de demonstração:')
  console.log('  Admin:   admin@demo.com   / demo1234')
  console.log('  Gestor:  gestor@demo.com  / demo1234')
  console.log('  Motorista: joao@demo.com  / demo1234')
  console.log('─────────────────────────────────')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
