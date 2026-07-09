//frontend/app/pacientes/[id]/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase, type Paciente, type Cita } from '@/lib/supabase'
import { formatoValidoDPI } from '@/lib/dpi'

const sans = "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
const mono = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.78rem', fontWeight: 500,
  color: 'var(--text)', marginBottom: '0.4375rem',
}
const inputStyle: React.CSSProperties = {
  width: '100%', border: '1px solid var(--input-border)',
  borderRadius: '0.5rem', padding: '0.625rem 0.75rem',
  fontSize: '0.875rem', fontFamily: sans,
  backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', outline: 'none',
}
const seccionLabel: React.CSSProperties = {
  fontFamily: mono, fontSize: '10.5px', fontWeight: 600, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: 'var(--text-muted)',
}

function calcularEdad(fechaNac?: string | null): number | null {
  if (!fechaNac) return null
  const n = new Date(fechaNac), h = new Date()
  let e = h.getFullYear() - n.getFullYear()
  const m = h.getMonth() - n.getMonth()
  if (m < 0 || (m === 0 && h.getDate() < n.getDate())) e--
  return e
}

// Fila de historial de análisis — SOLO LECTURA. Esta vista es para ver
// evolución a lo largo del tiempo (ej. progresión de pterigión entre
// citas), no para editar, validar, ni reintentar nada. Esas acciones
// viven en diagnostico/cita/[citaId].
type AnalisisHistorial = {
  id: string
  cita_id: string | null
  ojo: 'OD' | 'OI' | null
  estado: string
  diagnostico: string | null
  confianza: number | null
  diagnostico_real: string | null
  grado: string | null
  validado: boolean | null
  imagen_path: string | null
  created_at: string | null
  completado_at: string | null
}

const ETIQUETA_OJO_HIST: Record<string, string> = { OD: 'OD', OI: 'OI' }
const COLOR_DIAG_HIST: Record<string, string> = {
  catarata: '#d97706',
  normal: '#16a34a',
  pterigion: '#dc2626',
}
// Tinte suave para la miniatura, derivado del diagnóstico.
const TINTE_DIAG_HIST: Record<string, string> = {
  catarata: 'rgba(217,119,6,0.10)',
  normal: 'rgba(22,163,74,0.10)',
  pterigion: 'rgba(220,38,38,0.10)',
}

export default function DetallePacientePage() {
  const { id }  = useParams<{ id: string }>()
  const router  = useRouter()

  const [paciente,  setPaciente]  = useState<Paciente | null>(null)
  const [citas,     setCitas]     = useState<Cita[]>([])
  const [editando,  setEditando]  = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [form,      setForm]      = useState<Partial<Paciente>>({})

  // Historial de análisis IA — solo lectura, para ver evolución.
  const [historialAnalisis, setHistorialAnalisis] = useState<AnalisisHistorial[]>([])
  const [miniaturas, setMiniaturas] = useState<Record<string, string>>({})

  useEffect(() => { cargarDatos() }, [id])

  async function cargarDatos() {
    const [{ data: p }, { data: c }, { data: a, error: errAnalisis }] = await Promise.all([
      supabase.from('pacientes').select('*').eq('id', id).single(),
      supabase.from('citas').select('*').eq('paciente_id', id).order('fecha_hora', { ascending: false }),
      supabase
        .from('analisis')
        .select('id, cita_id, ojo, estado, diagnostico, confianza, diagnostico_real, grado, validado, imagen_path, created_at, completado_at')
        .eq('paciente_id', id)
        .not('estado', 'in', `(esperando_imagen,pendiente,procesando)`)
        .order('created_at', { ascending: false }),
    ])
    if (p) { setPaciente(p); setForm(p) }
    if (c) setCitas(c)
    if (errAnalisis) {
      console.error('Error al cargar historial de análisis:', errAnalisis.message)
    }
    if (a) {
      setHistorialAnalisis(a as AnalisisHistorial[])
      // Firmar URLs de miniatura solo para los que tienen imagen.
      for (const fila of a as AnalisisHistorial[]) {
        if (fila.imagen_path) {
          supabase.storage.from('imagenes').createSignedUrl(fila.imagen_path, 3600).then(({ data }) => {
            if (data?.signedUrl) setMiniaturas((prev) => ({ ...prev, [fila.id]: data.signedUrl }))
          })
        }
      }
    }
  }

  function cambiar(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value || null }))
  }

  async function guardar() {
  if (form.dpi && !formatoValidoDPI(form.dpi)) {
    setError('El DPI debe tener exactamente 13 dígitos numéricos.')
    return
  }

  setGuardando(true)
  setError(null)
  const { error: err } = await supabase
    .from('pacientes')
    .update({ ...form, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (err) { setError(err.message); setGuardando(false); return }
  await cargarDatos()
  setEditando(false)
  setGuardando(false)
}

  if (!paciente) {
    return (
      <div className="card" style={{ maxWidth: 680, margin: '0 auto', padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
        Cargando…
      </div>
    )
  }

  const estadoColores: Record<string, string> = {
    programada: 'badge-programada',
    confirmada: 'badge-confirmada',
    atendida:   'badge-atendida',
    cancelada:  'badge-cancelada',
    no_asistio: 'badge-no_asistio',
  }

  const edad = calcularEdad(paciente.fecha_nacimiento)
  const fechaNacConEdad = paciente.fecha_nacimiento
    ? `${paciente.fecha_nacimiento}${edad !== null ? ` (${edad} años)` : ''}`
    : null

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', fontFamily: sans }}>

      {/* Encabezado */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.5625rem' }}>
            <span style={{ fontFamily: mono, fontSize: '0.75rem', color: 'var(--text-muted)', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.1875rem 0.5rem' }}>
              EXP-{String(paciente.expediente).padStart(6, '0')}
            </span>
            {edad !== null && (
              <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.1875rem 0.5625rem', borderRadius: 9999, background: 'rgba(13,148,136,0.14)', color: '#0d9488' }}>
                {edad} años
              </span>
            )}
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, letterSpacing: '-0.015em', color: 'var(--text)', margin: 0 }}>
            {paciente.apellidos}, {paciente.nombres}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: '0.625rem', flexShrink: 0 }}>
          {!editando && (
            <button onClick={() => setEditando(true)} className="btn-secondary">Editar</button>
          )}
          <Link href={`/citas/nueva?paciente=${id}`} className="btn-primary" style={{ textDecoration: 'none', fontWeight: 600 }}>Nueva cita</Link>
        </div>
      </div>

      {error && <div className="alerta-error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {/* Datos del paciente */}
      <div className="card" style={{ padding: '1.375rem 1.625rem', marginBottom: '1.25rem' }}>
        <h2 style={{ ...seccionLabel, margin: '0 0 1.125rem' }}>Datos personales</h2>

        {editando ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label style={labelStyle}>Nombres <span style={{ color: '#dc2626' }}>*</span></label>
                <input name="nombres" value={form.nombres ?? ''} onChange={cambiar} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Apellidos <span style={{ color: '#dc2626' }}>*</span></label>
                <input name="apellidos" value={form.apellidos ?? ''} onChange={cambiar} style={inputStyle} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label style={labelStyle}>DPI</label>
                <input name="dpi" value={form.dpi ?? ''} onChange={cambiar} style={{ ...inputStyle, fontFamily: mono }} />
              </div>
              <div>
                <label style={labelStyle}>
                  Fecha nacimiento
                  {form.fecha_nacimiento && calcularEdad(form.fecha_nacimiento) !== null && (
                    <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>
                      {' '}— {calcularEdad(form.fecha_nacimiento)} años
                    </span>
                  )}
                </label>
                <input type="date" name="fecha_nacimiento" value={form.fecha_nacimiento ?? ''} onChange={cambiar} style={inputStyle} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label style={labelStyle}>Sexo</label>
                <select name="sexo" value={form.sexo ?? ''} onChange={cambiar} style={inputStyle}>
                  <option value="">— Seleccionar —</option>
                  <option value="M">Masculino</option>
                  <option value="F">Femenino</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Teléfono</label>
                <input type="tel" name="telefono" value={form.telefono ?? ''} onChange={cambiar} style={inputStyle} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label style={labelStyle}>Email</label>
                <input type="email" name="email" value={form.email ?? ''} onChange={cambiar} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Dirección</label>
                <input name="direccion" value={form.direccion ?? ''} onChange={cambiar} style={inputStyle} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Antecedentes</label>
              <textarea name="antecedentes" value={form.antecedentes ?? ''} onChange={cambiar}
                rows={3} style={{ ...inputStyle, resize: 'none' }} />
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.25rem' }}>
              <button onClick={guardar} disabled={guardando} className="btn-primary" style={{ fontWeight: 600 }}>
                {guardando ? 'Guardando…' : 'Guardar cambios'}
              </button>
              <button onClick={() => { setEditando(false); setForm(paciente) }} className="btn-secondary">
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.125rem 1.5rem' }}>
            <Dato label="DPI"              valor={paciente.dpi} mono />
            <Dato label="Fecha nacimiento" valor={fechaNacConEdad} />
            <Dato label="Sexo"             valor={paciente.sexo === 'M' ? 'Masculino' : paciente.sexo === 'F' ? 'Femenino' : null} />
            <Dato label="Teléfono"         valor={paciente.telefono} />
            <Dato label="Email"            valor={paciente.email} />
            <Dato label="Dirección"        valor={paciente.direccion} />
            {paciente.antecedentes && (
              <div style={{ gridColumn: 'span 2', paddingTop: '0.25rem', borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', margin: '0.75rem 0 0.1875rem' }}>Antecedentes</span>
                <span style={{ color: 'var(--text)', fontSize: '0.84rem', lineHeight: 1.5 }}>{paciente.antecedentes}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Historial de citas */}
      <div className="card" style={{ padding: '1.375rem 1.625rem', marginBottom: '1.25rem' }}>
        <h2 style={{ ...seccionLabel, margin: '0 0 0.875rem' }}>Historial de citas</h2>
        {citas.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem', margin: 0 }}>Sin citas registradas.</p>
        ) : (
          <div>
            {citas.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: '0.75rem 0', borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5625rem', minWidth: 0 }}>
                  <span style={{ fontFamily: mono, fontSize: '0.72rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                    #{c.numero_cita}
                  </span>
                  <span style={{ fontSize: '0.84rem', color: 'var(--text)' }}>
                    {new Date(c.fecha_hora).toLocaleString('es-GT')}
                  </span>
                  {c.motivo && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      — {c.motivo}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                  <span className={`badge ${estadoColores[c.estado] ?? ''}`}>
                    {c.estado.replace('_', ' ')}
                  </span>
                  <Link href={`/citas/${c.id}/imprimir`}
                    style={{ fontSize: '0.75rem', color: 'var(--ring)', textDecoration: 'none' }} className="hover:underline">
                    Imprimir
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Historial de análisis IA — SOLO LECTURA, para ver evolución.
          No incluye ningún control de edición, validación o reintento;
          esas acciones viven en diagnostico/cita/[citaId]. */}
      <div className="card" style={{ padding: '1.375rem 1.625rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.625rem', marginBottom: '1rem' }}>
          <h2 style={{ ...seccionLabel, margin: 0 }}>Historial de análisis IA</h2>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>solo lectura · evolución</span>
        </div>
        {historialAnalisis.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem', margin: 0 }}>Sin análisis registrados.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {historialAnalisis.map((a) => {
              const colorDiag = a.diagnostico ? (COLOR_DIAG_HIST[a.diagnostico] ?? '#64748b') : '#64748b'
              const tinteDiag = a.diagnostico ? (TINTE_DIAG_HIST[a.diagnostico] ?? 'var(--bg)') : 'var(--bg)'
              const fecha = a.completado_at ?? a.created_at
              const esRechazoOError = ['rechazada_stage1', 'no_clasificable', 'error'].includes(a.estado)

              return (
                <div key={a.id} style={{
                  display: 'flex', alignItems: 'center', gap: '0.875rem',
                  padding: '0.75rem', borderRadius: '0.625rem',
                  border: '1px solid var(--border)',
                }}>
                  {/* Miniatura */}
                  <div style={{
                    width: 52, height: 52, borderRadius: 8, overflow: 'hidden',
                    background: miniaturas[a.id] ? 'var(--bg)' : tinteDiag, flexShrink: 0, display: 'grid', placeItems: 'center',
                  }}>
                    {miniaturas[a.id] ? (
                      <img src={miniaturas[a.id]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontFamily: mono, fontSize: '0.6875rem', fontWeight: 600, color: colorDiag }}>{a.ojo ?? '—'}</span>
                    )}
                  </div>

                  {/* Datos principales */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5625rem', marginBottom: '0.3125rem' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text)' }}>
                        {fecha ? new Date(fecha).toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      </span>
                      {a.ojo && (
                        <span style={{
                          fontFamily: mono, fontSize: '0.625rem', fontWeight: 600, padding: '0.125rem 0.4375rem',
                          borderRadius: 9999, background: 'rgba(148,163,184,0.18)', color: 'var(--text-muted)',
                        }}>
                          {ETIQUETA_OJO_HIST[a.ojo]}
                        </span>
                      )}
                    </div>

                    {esRechazoOError ? (
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                        {a.estado === 'rechazada_stage1' ? 'Imagen rechazada (filtro de calidad)' :
                         a.estado === 'no_clasificable' ? 'Sin diagnóstico concluyente' : 'Error en el procesamiento'}
                      </p>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5625rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: colorDiag, textTransform: 'capitalize' }}>
                          {a.diagnostico ?? '—'}
                        </span>
                        <span style={{ fontFamily: mono, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {a.confianza != null ? `${(a.confianza * 100).toFixed(1)}%` : ''}
                        </span>
                        {a.diagnostico_real && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            · Confirmado: <strong style={{ color: 'var(--text)' }}>{a.diagnostico_real}</strong>
                            {a.grado ? ` (${a.grado})` : ''}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Estado de validación + acceso al detalle */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.375rem', flexShrink: 0 }}>
                    <span style={{
                      fontSize: '0.6875rem', fontWeight: 600, padding: '0.1875rem 0.5625rem', borderRadius: 9999,
                      background: a.validado ? 'rgba(22,163,74,0.15)' : 'rgba(148,163,184,0.15)',
                      color: a.validado ? '#16a34a' : '#94a3b8',
                    }}>
                      {a.validado ? 'Validado' : 'Sin validar'}
                    </span>
                    {a.cita_id && (
                      <Link href={`/diagnostico/cita/${a.cita_id}`}
                        style={{ fontSize: '0.72rem', color: 'var(--ring)', textDecoration: 'none' }} className="hover:underline">
                        Ver detalle
                      </Link>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function Dato({ label, valor, mono: isMono = false }: { label: string; valor: string | null | undefined; mono?: boolean }) {
  return (
    <div>
      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.1875rem' }}>{label}</span>
      <span style={{ color: 'var(--text)', fontSize: '0.84rem', fontFamily: isMono ? mono : sans }}>{valor ?? '—'}</span>
    </div>
  )
}
