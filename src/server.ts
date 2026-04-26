import { buildApp } from './app'
import { prisma } from './lib/prisma'

const PORT = Number(process.env.PORT) || 3333

async function main() {
  const app = await buildApp()

  try {
    await prisma.$connect()
    app.log.info('✓ PostgreSQL conectado')

    await app.listen({ port: PORT, host: '0.0.0.0' })
    app.log.info(`✓ YesCheck API rodando em http://localhost:${PORT}`)
  } catch (err) {
    app.log.error(err)
    await prisma.$disconnect()
    process.exit(1)
  }

  // Graceful shutdown
  const shutdown = async () => {
    app.log.info('Encerrando servidor...')
    await app.close()
    await prisma.$disconnect()
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main()
