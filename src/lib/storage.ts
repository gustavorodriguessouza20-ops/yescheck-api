import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'crypto'

// Cloudflare R2 é 100% compatível com S3 SDK
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

const BUCKET = process.env.R2_BUCKET_NAME!

/**
 * Faz upload de uma foto de inspeção e retorna a URL pública
 */
export async function uploadInspectionPhoto(
  buffer: Buffer,
  mimeType: string,
  inspectionId: string
): Promise<string> {
  const ext = mimeType.split('/')[1] ?? 'jpg'
  const key = `inspections/${inspectionId}/${randomUUID()}.${ext}`

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      // Metadado para auditoria
      Metadata: { inspectionId },
    })
  )

  return `${process.env.R2_PUBLIC_URL}/${key}`
}

/**
 * Gera URL assinada para acesso temporário (relatórios, auditorias)
 * Expiração padrão: 1 hora
 */
export async function getSignedPhotoUrl(
  key: string,
  expiresIn = 3600
): Promise<string> {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key })
  return getSignedUrl(s3, command, { expiresIn })
}
