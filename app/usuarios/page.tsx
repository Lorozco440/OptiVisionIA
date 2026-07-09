//frontend/app/usuarios/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { supabase, type Personal } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"

const inputStyle: React.CSSProperties = {
  width: '100%', border: '1px solid var(--input-border)',
  borderRadius: '0.5rem', padding: '0.625rem 0.75rem',
  fontSize: '0.875rem', backgroundColor: 'var(--input-bg)',
  color: 'var(--input-text)', outline: 'none',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.78rem', fontWeight: 500,
  color: 'var(--text)', marginBottom: '0.4rem',
}
const eyebrowStyle: React.CSSProperties = {
  fontFamily: MONO, fontSize: '0.66rem', fontWeight: 600,
  letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)',
}

/** Iniciales para el avatar (descarta el prefijo Dr./Dra.). */
function iniciales(nombre: string) {
  return nombre
    .replace(/^Dr[a]?\.\s*/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
}

/** Llama a la API /api/usuarios adjuntando el token de sesión actual. */
async function llamarApiUsuarios(metodo: 'POST' | 'PATCH', body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { ok: false, error: 'Sesión no disponible.' }

  const res = await fetch('/api/usuarios', {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) return { ok: false, error: json.error ?? 'Error desconocido.' }
  return { ok: true, data: json }
}

export default function UsuariosPage() {
  const { esAdministrador, cargando: cargandoAuth } = useAuth()

  const [personal, setPersonal] = useState<Personal[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)

  // Formulario de creación
  const [mostrarForm, setMostrarForm] = useState(false)
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rol, setRol] = useState<'examinador' | 'administrador'>('examinador')
  const [creando, setCreando] = useState(false)

  // Cambio de contraseña por fila
  const [editandoPasswordId, setEditandoPasswordId] = useState<string | null>(null)
  const [nuevaPassword, setNuevaPassword] = useState('')
  const [guardandoPassword, setGuardandoPassword] = useState(false)

  useEffect(() => { if (esAdministrador) cargarPersonal() }, [esAdministrador])

  async function cargarPersonal() {
    setCargando(true)
    const { data, error: err } = await supabase
      .from('personal')
      .select('*')
      .order('created_at', { ascending: false })
    if (err) setError(err.message)
    if (data) setPersonal(data as Personal[])
    setCargando(false)
  }

  async function crearUsuario(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setMensaje(null)
    setCreando(true)

    const resultado = await llamarApiUsuarios('POST', { email, password, nombre, rol })

    if (!resultado.ok) {
      setError(resultado.error as string)
    } else {
      setMensaje(`Usuario "${nombre}" creado correctamente.`)
      setNombre(''); setEmail(''); setPassword(''); setRol('examinador')
      setMostrarForm(false)
      await cargarPersonal()
    }
    setCreando(false)
  }

  async function alternarActivo(persona: Personal) {
    setError(null)
    setMensaje(null)
    if (!persona.auth_id) return
    const resultado = await llamarApiUsuarios('PATCH', { authId: persona.auth_id, activo: !persona.activo })
    if (!resultado.ok) {
      setError(resultado.error as string)
    } else {
      setMensaje(`${persona.nombre} ahora está ${!persona.activo ? 'activo' : 'inactivo'}.`)
      await cargarPersonal()
    }
  }

  async function guardarNuevaPassword(persona: Personal) {
    if (!persona.auth_id) return
    if (nuevaPassword.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    setGuardandoPassword(true)
    setError(null)
    setMensaje(null)

    const resultado = await llamarApiUsuarios('PATCH', { authId: persona.auth_id, nuevaPassword })

    if (!resultado.ok) {
      setError(resultado.error as string)
    } else {
      setMensaje(`Contraseña de ${persona.nombre} actualizada.`)
      setEditandoPasswordId(null)
      setNuevaPassword('')
    }
    setGuardandoPassword(false)
  }

  if (cargandoAuth) {
    return <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Cargando…</p>
  }

  // Segunda capa de protección: aunque GuardiaSesion ya exige sesión,
  // esta pantalla es exclusiva de administrador, no de examinador.
  if (!esAdministrador) {
    return (
      <div className="card p-6" style={{ maxWidth: 480 }}>
        <p style={{ fontWeight: 600, color: 'var(--text)' }}>Acceso restringido</p>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
          Esta sección solo está disponible para cuentas con rol de administrador.
        </p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 760 }}>
      {/* Cabecera */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <div style={{ ...eyebrowStyle, color: '#0d9488', letterSpacing: '0.13em', marginBottom: '0.5rem' }}>
            Personal · Administración
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, letterSpacing: '-0.015em', color: 'var(--text)', margin: 0 }}>
            Usuarios
          </h1>
        </div>
        <button
          onClick={() => setMostrarForm((v) => !v)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
            background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: '0.55rem',
            padding: '0.7rem 1.1rem', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: '1.05rem', lineHeight: 1, fontWeight: 400 }}>{mostrarForm ? '×' : '+'}</span>
          {mostrarForm ? 'Cancelar' : 'Nuevo usuario'}
        </button>
      </div>

      {/* Mensajes */}
      {error && <div className="alerta-error mb-4">{error}</div>}
      {mensaje && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.55rem',
          fontSize: '0.825rem', padding: '0.7rem 0.95rem', borderRadius: '0.55rem',
          background: 'rgba(22,163,74,0.10)', border: '1px solid rgba(22,163,74,0.28)',
          color: '#16a34a', marginBottom: '1.15rem',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a', flexShrink: 0 }} />
          {mensaje}
        </div>
      )}

      {/* Formulario de creación */}
      {mostrarForm && (
        <form onSubmit={crearUsuario} className="card" style={{ padding: '1.4rem 1.6rem', marginBottom: '1.5rem' }}>
          <h2 style={{ ...eyebrowStyle, marginBottom: '1rem' }}>Crear nuevo usuario</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={labelStyle}>Nombre completo</label>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} required style={inputStyle} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label style={labelStyle}>Correo electrónico</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Contraseña inicial</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  required minLength={8} style={{ ...inputStyle, fontFamily: MONO }} />
              </div>
            </div>
            <div style={{ maxWidth: '50%', paddingRight: '0.5rem' }}>
              <label style={labelStyle}>Rol</label>
              <select value={rol} onChange={(e) => setRol(e.target.value as 'examinador' | 'administrador')} style={inputStyle}>
                <option value="examinador">Examinador</option>
                <option value="administrador">Administrador</option>
              </select>
            </div>
            <button type="submit" disabled={creando} className="btn-primary" style={{ alignSelf: 'flex-start' }}>
              {creando ? 'Creando…' : 'Crear usuario'}
            </button>
          </div>
        </form>
      )}

      {/* Listado de personal */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '1rem 1.4rem', borderBottom: '1px solid var(--border)',
        }}>
          <span style={eyebrowStyle}>Personal del sistema</span>
          <span style={{ fontFamily: MONO, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            {personal.length} cuentas
          </span>
        </div>

        {cargando ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', padding: '1.4rem' }}>Cargando…</p>
        ) : personal.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', padding: '1.4rem' }}>Sin usuarios registrados.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {personal.map((p) => {
              const esAdmin = p.rol === 'administrador'
              return (
                <div key={p.id} style={{ padding: '1rem 1.4rem', borderTop: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', minWidth: 0 }}>
                      <div style={{
                        width: 38, height: 38, flexShrink: 0, borderRadius: 10,
                        display: 'grid', placeItems: 'center', fontFamily: MONO,
                        fontSize: '0.8rem', fontWeight: 600,
                        background: esAdmin ? 'rgba(124,58,237,0.15)' : 'rgba(37,99,235,0.15)',
                        color: esAdmin ? '#7c3aed' : '#2563eb',
                      }}>
                        {iniciales(p.nombre)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)' }}>{p.nombre}</span>
                          <span style={{
                            fontSize: '0.66rem', fontWeight: 600, padding: '0.12rem 0.55rem', borderRadius: 999,
                            background: esAdmin ? 'rgba(124,58,237,0.15)' : 'rgba(37,99,235,0.13)',
                            color: esAdmin ? '#7c3aed' : '#2563eb',
                          }}>
                            {esAdmin ? 'Administrador' : 'Examinador'}
                          </span>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                            fontSize: '0.66rem', fontWeight: 600, padding: '0.12rem 0.55rem', borderRadius: 999,
                            background: p.activo ? 'rgba(22,163,74,0.13)' : 'rgba(148,163,184,0.16)',
                            color: p.activo ? '#16a34a' : '#94a3b8',
                          }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: p.activo ? '#16a34a' : '#94a3b8' }} />
                            {p.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                      <button
                        onClick={() => { setEditandoPasswordId(editandoPasswordId === p.id ? null : p.id); setNuevaPassword('') }}
                        style={{
                          background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)',
                          borderRadius: '0.5rem', padding: '0.45rem 0.8rem', fontSize: '0.78rem', fontWeight: 500, cursor: 'pointer',
                        }}
                      >
                        {editandoPasswordId === p.id ? 'Cancelar' : 'Cambiar contraseña'}
                      </button>
                      <button
                        onClick={() => alternarActivo(p)}
                        style={{
                          background: 'transparent', color: p.activo ? 'var(--text)' : '#16a34a',
                          border: '1px solid var(--border)', borderRadius: '0.5rem',
                          padding: '0.45rem 0.8rem', fontSize: '0.78rem', fontWeight: 500, cursor: 'pointer',
                        }}
                      >
                        {p.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    </div>
                  </div>

                  {editandoPasswordId === p.id && (
                    <div style={{
                      display: 'flex', gap: '0.6rem', alignItems: 'flex-end',
                      marginTop: '0.9rem', paddingTop: '0.9rem', borderTop: '1px dashed var(--input-border)',
                    }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ ...labelStyle, fontSize: '0.72rem', color: 'var(--text-muted)' }}>Nueva contraseña</label>
                        <input
                          type="password"
                          value={nuevaPassword}
                          onChange={(e) => setNuevaPassword(e.target.value)}
                          minLength={8}
                          style={{ ...inputStyle, fontFamily: MONO }}
                        />
                      </div>
                      <button
                        onClick={() => guardarNuevaPassword(p)}
                        disabled={guardandoPassword}
                        style={{
                          background: '#0d9488', color: '#fff', border: 'none', borderRadius: '0.5rem',
                          padding: '0.6rem 1.1rem', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                        }}
                      >
                        {guardandoPassword ? 'Guardando…' : 'Guardar'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
