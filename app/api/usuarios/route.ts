// frontend/app/api/usuarios/route.ts
//
// API Route del lado SERVIDOR. Usa la service_role key de Supabase,
// que NUNCA debe llegar al navegador — por eso esto vive en una ruta
// /api/ (Next.js la ejecuta en el servidor, no en el cliente) y la key
// se lee de una variable de entorno SIN el prefijo NEXT_PUBLIC_.
//
// Esta ruta crea usuarios nuevos en Supabase Auth + su fila en
// 'personal'. Solo debe ser invocada por un administrador ya
// autenticado — la verificación de quién llama se hace adentro,
// usando el token de sesión que el cliente envía en el header
// Authorization.

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Cliente con privilegios de administrador — SOLO se usa en este
// archivo de servidor, nunca se importa desde código de cliente.
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Cliente normal (anon), usado únicamente para verificar el token del
// solicitante con getUser() antes de hacer nada con privilegios.
const supabaseVerificador = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

/** Verifica que quien llama esté autenticado y sea administrador. */
async function verificarAdministrador(req: NextRequest): Promise<{ ok: boolean; error?: string }> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, error: 'Falta el token de sesión.' }
  }
  const token = authHeader.replace('Bearer ', '')

  const { data: { user }, error: errUser } = await supabaseVerificador.auth.getUser(token)
  if (errUser || !user) {
    return { ok: false, error: 'Sesión inválida o expirada.' }
  }

  const { data: persona, error: errPersona } = await supabaseAdmin
    .from('personal')
    .select('rol, activo')
    .eq('auth_id', user.id)
    .maybeSingle()

  if (errPersona || !persona || persona.rol !== 'administrador' || persona.activo === false) {
    return { ok: false, error: 'No tienes permisos de administrador.' }
  }

  return { ok: true }
}

// POST /api/usuarios — crear un nuevo usuario (examinador o administrador)
export async function POST(req: NextRequest) {
  const verificacion = await verificarAdministrador(req)
  if (!verificacion.ok) {
    return NextResponse.json({ error: verificacion.error }, { status: 403 })
  }

  const body = await req.json()
  const { email, password, nombre, rol } = body as {
    email?: string; password?: string; nombre?: string; rol?: string
  }

  if (!email || !password || !nombre || !rol) {
    return NextResponse.json({ error: 'Faltan campos requeridos (email, password, nombre, rol).' }, { status: 400 })
  }
  if (rol !== 'examinador' && rol !== 'administrador') {
    return NextResponse.json({ error: 'Rol inválido.' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres.' }, { status: 400 })
  }

  // 1. Crear el usuario en Supabase Auth.
  const { data: nuevoUsuario, error: errCrear } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // se confirma automáticamente: no hay servidor de correo configurado
  })

  if (errCrear || !nuevoUsuario?.user) {
    return NextResponse.json({ error: errCrear?.message ?? 'No se pudo crear el usuario.' }, { status: 400 })
  }

  // 2. Crear su fila en 'personal', vinculada por auth_id.
  const { error: errPersonal } = await supabaseAdmin
    .from('personal')
    .insert({ auth_id: nuevoUsuario.user.id, nombre, rol, activo: true })

  if (errPersonal) {
    // Si falla la segunda parte, se revierte la primera para no dejar
    // un usuario de Auth "huérfano" sin fila de personal.
    await supabaseAdmin.auth.admin.deleteUser(nuevoUsuario.user.id)
    return NextResponse.json({ error: 'No se pudo crear el perfil: ' + errPersonal.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, authId: nuevoUsuario.user.id })
}

// PATCH /api/usuarios — cambiar contraseña de un usuario existente, o
// activar/desactivar su cuenta.
export async function PATCH(req: NextRequest) {
  const verificacion = await verificarAdministrador(req)
  if (!verificacion.ok) {
    return NextResponse.json({ error: verificacion.error }, { status: 403 })
  }

  const body = await req.json()
  const { authId, nuevaPassword, activo } = body as {
    authId?: string; nuevaPassword?: string; activo?: boolean
  }

  if (!authId) {
    return NextResponse.json({ error: 'Falta authId.' }, { status: 400 })
  }

  if (nuevaPassword) {
    if (nuevaPassword.length < 8) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres.' }, { status: 400 })
    }
    const { error } = await supabaseAdmin.auth.admin.updateUserById(authId, { password: nuevaPassword })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  if (typeof activo === 'boolean') {
    const { error } = await supabaseAdmin.from('personal').update({ activo }).eq('auth_id', authId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}