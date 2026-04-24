import { NextRequest } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { apiSuccess, apiBadRequest, apiNotFound, withAuth } from '@/lib/api'

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'todos')
const MAX_SIZE = 20 * 1024 * 1024 // 20 MB

export const POST = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id: todoId } = await resolveParams(params)
  if (!todoId) return apiBadRequest('Invalid todo id')

  const todo = await prisma.todo.findUnique({ where: { id: todoId }, select: { id: true } })
  if (!todo) return apiNotFound('To-do not found')

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return apiBadRequest('No file provided')
  if (file.size > MAX_SIZE) return apiBadRequest('File exceeds 20 MB limit')

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  await mkdir(UPLOAD_DIR, { recursive: true })
  const ext = path.extname(file.name)
  const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`
  const filePath = path.join(UPLOAD_DIR, safeName)
  await writeFile(filePath, buffer)

  const url = `/uploads/todos/${safeName}`
  const attachment = await prisma.todoAttachment.create({
    data: {
      todoId,
      uploadedById: session.user.id,
      filename: file.name,
      url,
      mimeType: file.type,
      size: file.size,
    },
    include: { uploadedBy: { select: { id: true, name: true } } },
  })
  return apiSuccess(attachment, { status: 201 })
})
