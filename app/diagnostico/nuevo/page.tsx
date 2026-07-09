//frontend/app/diagnostico/nuevo/page.tsx
'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import QRCode from 'react-qr-code'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"

const eyebrow: React.CSSProperties = {
  fontFamily: MONO, fontSize: '0.7rem', fontWeight: 600,
  letterSpacing: '0.13em', textTransform: 'uppercase', color: '#0d9488',
  marginBottom: '0.5rem',
}

function generarCodigoSesion(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let codigo = ''
  for (let i = 0; i < 6; i++) {
    codigo += chars[Math.floor(Math.random() * chars.length)]
  }
  return codigo
}

function formatearFechaHora(iso: string | null): string {
  if (!iso) return 'sin fecha'
  return new Date(iso).toLocaleString('es-GT', { dateStyle: 'medium', timeStyle: 'short' })
}

type CitaConPaciente = {
  id: string
  fecha_hora: string | null
  paciente_id: string
  paciente_nombre: string
}

function NuevoDiagnosticoInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const citaIdParam = searchParams.get('cita')
  const { esAdministrador, cargando: cargandoAuth } = useAuth()

  const [citas, setCitas] = useState<CitaConPaciente[]>([])
  const [citaSeleccionada, setCitaSeleccionada] = useState('')
  const [cargando, setCargando] = useState(true)
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [sesionCreada, setSesionCreada] = useState(false)
  const [citaIdSesion, setCitaIdSesion] = useState<string | null>(null)
  const [codigoSesion, setCodigoSesion] = useState<string | null>(null)
  const [urlCaptura, setUrlCaptura] = useState('')

  // Verificación previa: si la cita seleccionada ya tiene análisis,
  // mostramos opciones en vez de insertar directo.
  const [verificando, setVerificando] = useState(false)
  const [conflicto, setConflicto] = useState<{ citaId: string; cantidad: number } | null>(null)
  const [borrando, setBorrando] = useState(false)

  useEffect(() => {
    async function cargarCitas() {
      setCargando(true)

      const { data: citasData, error: errCitas } = await supabase
        .from('citas')
        .select('id, fecha_hora, paciente_id, acepta_ia')
        .eq('acepta_ia', true)
        .order('fecha_hora', { ascending: false })

      if (errCitas) {
        setError('Error al cargar citas: ' + errCitas.message)
        setCargando(false)
        return
      }

      const { data: pacientesData, error: errPac } = await supabase
        .from('pacientes')
        .select('id, nombres, apellidos')

      if (errPac) {
        setError('Error al cargar pacientes: ' + errPac.message)
        setCargando(false)
        return
      }

      const mapaPacientes = new Map(
        (pacientesData ?? []).map((p: any) => [
          p.id,
          `${p.nombres ?? ''} ${p.apellidos ?? ''}`.trim(),
        ])
      )

      const lista: CitaConPaciente[] = (citasData ?? []).map((c: any) => ({
        id: c.id,
        fecha_hora: c.fecha_hora,
        paciente_id: c.paciente_id,
        paciente_nombre: mapaPacientes.get(c.paciente_id) ?? 'Paciente sin nombre',
      }))

      setCitas(lista)
      if (citaIdParam && lista.some((c) => c.id === citaIdParam)) {
        setCitaSeleccionada(citaIdParam)
      }
      setCargando(false)
    }

    cargarCitas()
  }, [citaIdParam])

  // Cada vez que cambia la cita seleccionada, se limpia cualquier
  // conflicto que estuviera mostrándose de una selección anterior.
  useEffect(() => {
    setConflicto(null)
    setError(null)
  }, [citaSeleccionada])

  async function crearFilas(cita: CitaConPaciente) {
    const codigo = generarCodigoSesion()
    const { data, error: errInsert } = await supabase
      .from('analisis')
      .insert([
        { paciente_id: cita.paciente_id, cita_id: cita.id, codigo_sesion: codigo, estado: 'esperando_imagen', ojo: 'OD' },
        { paciente_id: cita.paciente_id, cita_id: cita.id, codigo_sesion: codigo, estado: 'esperando_imagen', ojo: 'OI' },
      ])
      .select('id, codigo_sesion, ojo')

    if (errInsert || !data || data.length !== 2) {
      setError('No se pudo crear la sesión: ' + (errInsert?.message ?? 'desconocido'))
      return false
    }

    setCitaIdSesion(cita.id)
    setCodigoSesion(codigo)
    setUrlCaptura(`${window.location.origin}/captura?sesion=${codigo}`)
    setSesionCreada(true)
    return true
  }

  async function iniciarSesion() {
    setError(null)
    const cita = citas.find((c) => c.id === citaSeleccionada)
    if (!cita) {
      setError('Selecciona una cita antes de continuar.')
      return
    }

    setVerificando(true)
    const { count, error: errCheck } = await supabase
      .from('analisis')
      .select('id', { count: 'exact', head: true })
      .eq('cita_id', cita.id)
    setVerificando(false)

    if (errCheck) {
      setError('No se pudo verificar la cita: ' + errCheck.message)
      return
    }

    if (count && count > 0) {
      // Ya existe una sesión para esta cita: no insertamos nada todavía,
      // mostramos las opciones para que el usuario decida.
      setConflicto({ citaId: cita.id, cantidad: count })
      return
    }

    setCreando(true)
    await crearFilas(cita)
    setCreando(false)
  }

  async function borrarYCrearNueva() {
    const cita = citas.find((c) => c.id === citaSeleccionada)
    if (!cita) return
    setBorrando(true)
    setError(null)

    const { error: errDelete, count: borrados } = await supabase
      .from('analisis')
      .delete({ count: 'exact' })
      .eq('cita_id', cita.id)

    if (errDelete) {
      setError('No se pudo borrar la sesión anterior: ' + errDelete.message)
      setBorrando(false)
      return
    }

    // Verificación explícita: si RLS bloquea el delete sin lanzar error
    // (comportamiento típico de Supabase), 'borrados' queda en 0 aunque
    // sí existieran filas. Sin esto, seguiríamos insertando encima de
    // las filas viejas sin que el usuario se enterara del problema.
    if (!borrados || borrados === 0) {
      setError('No se pudo borrar la sesión anterior. Si tu cuenta es de administrador, esta acción requiere rol examinador. Si eres examinador y ves este mensaje, contacta soporte técnico — puede haber un problema de configuración de permisos.')
      setBorrando(false)
      return
    }

    setConflicto(null)
    const ok = await crearFilas(cita)
    setBorrando(false)
    if (!ok) return
  }

  // El administrador gestiona usuarios y consulta historial, pero no
  // diagnostica — esta pantalla (crear/borrar sesiones de diagnóstico
  // IA) es exclusiva del rol examinador. Se bloquea aquí, ANTES de
  // llegar al formulario, para no dejar que intente algo que las
  // políticas RLS rechazarían de todos modos con un mensaje técnico.
  if (!cargandoAuth && esAdministrador) {
    return (
      <main style={{ maxWidth: 560, margin: '0 auto', padding: '2.5rem 1rem' }}>
        <div style={eyebrow}>Diagnóstico IA · Acceso</div>
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14,
          padding: '1.75rem', display: 'flex', gap: '0.9rem', alignItems: 'flex-start',
        }}>
          <div style={{
            width: 38, height: 38, flexShrink: 0, borderRadius: 10, display: 'grid', placeItems: 'center',
            background: 'rgba(124,58,237,0.14)', color: '#7c3aed',
          }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <div>
            <p style={{ fontWeight: 600, color: 'var(--text)', margin: 0 }}>Acción no disponible para administrador</p>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: '0.5rem', lineHeight: 1.55 }}>
              Iniciar diagnósticos IA es una función del rol examinador. Tu cuenta de administrador
              puede gestionar usuarios y consultar el historial de análisis.
            </p>
          </div>
        </div>
      </main>
    )
  }

  // ====== VISTA: SESIÓN CREADA (QR) ======
  if (sesionCreada && codigoSesion && citaIdSesion) {
    return (
      <main style={{ maxWidth: 560, margin: '0 auto', padding: '2.5rem 1rem', textAlign: 'center' }}>
        <div style={{ ...eyebrow, color: '#0d9488' }}>Diagnóstico IA · Captura</div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, letterSpacing: '-0.015em', color: 'var(--text)', margin: '0 0 0.5rem' }}>
          Sesión de captura lista
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: '0 auto 1.6rem', maxWidth: 400, lineHeight: 1.55 }}>
          Escanea este código con el smartphone para fotografiar ambos ojos — primero{' '}
          <strong style={{ color: 'var(--text)' }}>OD</strong>, luego <strong style={{ color: 'var(--text)' }}>OI</strong>.
        </p>

        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16,
          padding: '1.75rem', display: 'inline-block', boxShadow: '0 10px 30px rgba(15,23,42,0.08)',
        }}>
          <div style={{ background: '#fff', padding: '1rem', borderRadius: 10, display: 'inline-block' }}>
            <QRCode value={urlCaptura} size={220} />
          </div>

          <div style={{ marginTop: '1.25rem' }}>
            <div style={{ fontFamily: MONO, fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Código de sesión
            </div>
            <div style={{ fontFamily: MONO, fontSize: '2rem', fontWeight: 600, letterSpacing: '0.22em', color: '#1d4ed8', marginTop: '0.3rem' }}>
              {codigoSesion}
            </div>
          </div>
        </div>

        <div style={{ marginTop: '1.15rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
          <a
            href={urlCaptura}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.5rem', maxWidth: '100%',
              padding: '0.65rem 1rem', border: '1px solid var(--border)', borderRadius: 9,
              background: 'var(--bg-card)', fontFamily: MONO, fontSize: '0.75rem', color: '#1d4ed8',
              textDecoration: 'none', wordBreak: 'break-all',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            <span>{urlCaptura}</span>
          </a>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.5, maxWidth: 360 }}>
            ¿Usas este mismo teléfono? Toca el enlace para abrir la captura sin escanear.
          </span>
        </div>

        <div style={{ marginTop: '1.75rem', display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button
            onClick={() => router.push(`/diagnostico/cita/${citaIdSesion}`)}
            style={{ padding: '0.7rem 1.25rem', borderRadius: 9, border: 'none', background: '#1d4ed8', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
          >
            Ir a pantalla en vivo
          </button>
          <button
            onClick={() => { setSesionCreada(false); setCitaIdSesion(null); setCodigoSesion(null) }}
            style={{ padding: '0.7rem 1.25rem', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontWeight: 500, cursor: 'pointer' }}
          >
            Nueva sesión
          </button>
        </div>
      </main>
    )
  }

  // ====== VISTA: SELECCIÓN ======
  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '2.5rem 1rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={eyebrow}>Diagnóstico IA · Nuevo</div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, letterSpacing: '-0.015em', color: 'var(--text)', margin: 0 }}>
          Iniciar diagnóstico IA
        </h1>
        <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: '0.45rem 0 0', lineHeight: 1.55 }}>
          Selecciona una cita con consentimiento de IA para generar el código de captura.
        </p>
      </div>

      {error && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.825rem',
          padding: '0.7rem 0.95rem', borderRadius: '0.55rem', marginBottom: '1rem', lineHeight: 1.5,
          background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', color: '#dc2626',
        }}>
          {error}
        </div>
      )}

      {cargando ? (
        <p style={{ color: 'var(--text-muted)' }}>Cargando citas…</p>
      ) : citas.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', lineHeight: 1.55 }}>
          No hay citas con consentimiento de IA. Crea una cita marcando “acepta IA”.
        </p>
      ) : (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.5rem 1.6rem' }}>
          <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 500, color: 'var(--text)', marginBottom: '0.5rem' }}>
            Selecciona la cita
          </label>
          <div style={{ position: 'relative' }}>
            <select
              value={citaSeleccionada}
              onChange={(e) => setCitaSeleccionada(e.target.value)}
              style={{
                width: '100%', appearance: 'none', border: '1px solid var(--input-border)',
                borderRadius: 9, padding: '0.7rem 2.4rem 0.7rem 0.9rem', fontSize: '0.875rem',
                background: 'var(--input-bg)', color: 'var(--input-text)', outline: 'none', cursor: 'pointer',
              }}
            >
              <option value="">— Selecciona —</option>
              {citas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.paciente_nombre} · {formatearFechaHora(c.fecha_hora)}
                </option>
              ))}
            </select>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
              strokeLinecap="round" strokeLinejoin="round"
              style={{ position: 'absolute', right: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>

          {conflicto ? (
            <div style={{
              border: '1px solid #fcd34d', borderRadius: 11, padding: '1rem 1.1rem',
              background: 'rgba(217,119,6,0.07)', marginTop: '1.1rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <div>
                  <p style={{ margin: '0 0 0.3rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>
                    Esta cita ya tiene una sesión de diagnóstico ({conflicto.cantidad} registro{conflicto.cantidad !== 1 ? 's' : ''}).
                  </p>
                  <p style={{ margin: 0, fontSize: '0.79rem', lineHeight: 1.55, color: 'var(--text-muted)' }}>
                    ¿Continuar con la sesión existente o borrarla y empezar una nueva?
                    Esto no afecta otras citas ni el historial general del paciente.
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap', marginTop: '0.9rem' }}>
                <button
                  onClick={() => router.push(`/diagnostico/cita/${conflicto.citaId}`)}
                  style={{ padding: '0.55rem 0.95rem', borderRadius: 8, border: 'none', background: '#1d4ed8', color: '#fff', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}
                >
                  Ir a la sesión existente
                </button>
                <button
                  onClick={borrarYCrearNueva}
                  disabled={borrando}
                  style={{ padding: '0.55rem 0.95rem', borderRadius: 8, border: '1px solid #dc2626', background: 'transparent', color: '#dc2626', fontWeight: 600, fontSize: '0.8rem', cursor: borrando ? 'not-allowed' : 'pointer' }}
                >
                  {borrando ? 'Borrando…' : 'Borrar y crear nueva'}
                </button>
                <button
                  onClick={() => setConflicto(null)}
                  style={{ padding: '0.55rem 0.95rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontWeight: 500, fontSize: '0.8rem', cursor: 'pointer' }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={iniciarSesion}
              disabled={creando || verificando || !citaSeleccionada}
              style={{
                width: '100%', marginTop: '1.1rem', padding: '0.8rem 1.5rem', borderRadius: 9, border: 'none',
                background: (creando || verificando || !citaSeleccionada) ? '#94a3b8' : '#1d4ed8',
                color: '#fff', fontWeight: 600, fontSize: '0.9rem',
                cursor: (creando || verificando || !citaSeleccionada) ? 'not-allowed' : 'pointer',
              }}
            >
              {verificando ? 'Verificando…' : creando ? 'Creando sesión…' : 'Generar código QR'}
            </button>
          )}

          <p style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.72rem', color: 'var(--text-muted)', margin: '1rem 0 0' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#0d9488' }} />
            Solo aparecen citas con consentimiento de IA activado.
          </p>
        </div>
      )}
    </main>
  )
}

export default function NuevoDiagnosticoPage() {
  return (
    <Suspense fallback={<p style={{ padding: '2rem', color: 'var(--text-muted)' }}>Cargando…</p>}>
      <NuevoDiagnosticoInner />
    </Suspense>
  )
}
