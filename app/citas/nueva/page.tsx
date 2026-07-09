//frontend/app/citas/nueva/page.tsx
'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase, type Paciente } from '@/lib/supabase'

const sans = "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
const mono = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"

const inputStyle: React.CSSProperties = {
  width: '100%', border: '1px solid var(--input-border)',
  borderRadius: '0.5rem', padding: '0.625rem 0.75rem',
  fontSize: '0.875rem', fontFamily: sans,
  backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', outline: 'none',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.78rem', fontWeight: 500,
  color: 'var(--text)', marginBottom: '0.4375rem',
}
const seccionLabel: React.CSSProperties = {
  fontFamily: mono, fontSize: '10.5px', fontWeight: 600, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.875rem',
}

// Horas disponibles 7:00 a 19:00
const HORAS = Array.from({ length: 13 }, (_, i) => {
  const h = i + 7
  return `${String(h).padStart(2, '0')}:00`
})
// Minutos: 00, 15, 30, 45
const MINUTOS = ['00', '15', '30', '45']

function NuevaCitaForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const pacienteInit = searchParams.get('paciente') ?? ''

  const [pacientes, setPacientes] = useState<Paciente[]>([])
  const [busqueda,  setBusqueda]  = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  const hoyStr = new Date().toISOString().split('T')[0]

  const [form, setForm] = useState({
    paciente_id: pacienteInit,
    fecha:       hoyStr,
    hora:        '08',
    minuto:      '00',
    motivo:      '',
    acepta_ia:   false,
  })

  useEffect(() => { buscarPacientes('') }, [])

  async function buscarPacientes(texto: string) {
    setBusqueda(texto)
    const query = supabase
      .from('pacientes')
      .select('id, nombres, apellidos, expediente, dpi')
      .order('apellidos')
      .limit(20)
    if (texto.trim()) {
      query.or(`nombres.ilike.%${texto}%,apellidos.ilike.%${texto}%,dpi.ilike.%${texto}%`)
    }
    const { data } = await query
    if (data) setPacientes(data as Paciente[])
  }

  function cambiar(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value, type } = e.target
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }))
  }

  async function guardar() {
    if (!form.paciente_id) { setError('Seleccioná un paciente.'); return }
    if (!form.fecha)        { setError('La fecha es obligatoria.'); return }

    setGuardando(true)
    setError(null)

    const fechaHora = new Date(`${form.fecha}T${form.hora}:${form.minuto}:00`)

    const { error: err } = await supabase.from('citas').insert({
      paciente_id: form.paciente_id,
      fecha_hora:  fechaHora.toISOString(),
      motivo:      form.motivo.trim() || null,
      acepta_ia:   form.acepta_ia,
    })

    if (err) { setError(err.message); setGuardando(false); return }
    router.push('/citas')
  }

  const pacienteSeleccionado = pacientes.find(p => p.id === form.paciente_id)

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', fontFamily: sans }}>
      {/* Cabecera */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontFamily: mono, fontSize: '11px', fontWeight: 600, letterSpacing: '0.13em', textTransform: 'uppercase', color: '#0d9488', marginBottom: '0.5rem' }}>
          Agenda · Nueva
        </div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, letterSpacing: '-0.015em', color: 'var(--text)', margin: 0 }}>
          Nueva cita
        </h1>
      </div>

      {error && <div className="alerta-error" style={{ marginBottom: '1rem' }}>{error}</div>}

      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>

        {/* Paciente */}
        <div style={{ padding: '1.375rem 1.625rem' }}>
          <div style={seccionLabel}>Paciente <span style={{ color: '#dc2626' }}>*</span></div>
          <input
            type="text"
            placeholder="Buscar por nombre o DPI…"
            value={busqueda}
            onChange={e => buscarPacientes(e.target.value)}
            style={{ ...inputStyle, marginBottom: '0.625rem' }}
          />
          {pacienteSeleccionado && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5625rem', background: 'rgba(29,78,216,0.07)', border: '1px solid rgba(29,78,216,0.20)', borderRadius: '0.5rem', padding: '0.5625rem 0.8125rem', marginBottom: '0.625rem' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#1d4ed8', flexShrink: 0 }} />
              <span style={{ fontSize: '0.84rem', color: 'var(--text)', fontWeight: 500 }}>
                {pacienteSeleccionado.apellidos}, {pacienteSeleccionado.nombres}
              </span>
              <span style={{ fontFamily: mono, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                EXP-{String(pacienteSeleccionado.expediente).padStart(6, '0')}
              </span>
            </div>
          )}
          <select name="paciente_id" value={form.paciente_id} onChange={cambiar} size={4} style={{ ...inputStyle, padding: 0 }}>
            <option value="">— Seleccionar paciente —</option>
            {pacientes.map(p => (
              <option key={p.id} value={p.id} style={{ padding: '0.5rem 0.75rem' }}>
                {p.apellidos}, {p.nombres} — EXP-{String(p.expediente).padStart(6, '0')}
              </option>
            ))}
          </select>
        </div>

        <div style={{ height: 1, background: 'var(--border)' }} />

        {/* Programación */}
        <div style={{ padding: '1.375rem 1.625rem' }}>
          <div style={seccionLabel}>Programación</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Fecha */}
            <div>
              <label style={labelStyle}>Fecha <span style={{ color: '#dc2626' }}>*</span></label>
              <input type="date" name="fecha" value={form.fecha} onChange={cambiar} style={inputStyle} />
            </div>

            {/* Hora — selectores separados, más intuitivo */}
            <div>
              <label style={labelStyle}>Hora de la cita <span style={{ color: '#dc2626' }}>*</span></label>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.6875rem', color: 'var(--text-muted)', marginBottom: '0.3125rem' }}>Hora</label>
                  <select name="hora" value={form.hora} onChange={cambiar} style={inputStyle}>
                    {Array.from({ length: 13 }, (_, i) => {
                      const h = String(i + 7).padStart(2, '0')
                      return <option key={h} value={h}>{h}:00 hrs</option>
                    })}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.6875rem', color: 'var(--text-muted)', marginBottom: '0.3125rem' }}>Minutos</label>
                  <select name="minuto" value={form.minuto} onChange={cambiar} style={inputStyle}>
                    <option value="00">: 00</option>
                    <option value="15">: 15</option>
                    <option value="30">: 30</option>
                    <option value="45">: 45</option>
                  </select>
                </div>
                <div style={{ background: 'rgba(29,78,216,0.10)', borderRadius: '0.5rem', padding: '0.625rem 0.875rem', fontFamily: mono, fontSize: '1rem', fontWeight: 600, color: '#1d4ed8' }}>
                  {form.hora}:{form.minuto}
                </div>
              </div>
            </div>

            {/* Motivo */}
            <div>
              <label style={labelStyle}>Motivo de consulta</label>
              <input type="text" name="motivo" value={form.motivo} onChange={cambiar}
                placeholder="Revisión general, molestia ocular, control…" style={inputStyle} />
            </div>
          </div>
        </div>

        <div style={{ height: 1, background: 'var(--border)' }} />

        {/* Consentimiento */}
        <div style={{ padding: '1.375rem 1.625rem' }}>
          <div style={seccionLabel}>Consentimiento</div>

          {/* Consentimiento IA */}
          <label htmlFor="acepta_ia" style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', background: 'rgba(13,148,136,0.07)', border: '1px solid rgba(13,148,136,0.25)', borderRadius: '0.625rem', padding: '0.875rem 1rem', cursor: 'pointer' }}>
            <input type="checkbox" name="acepta_ia" id="acepta_ia"
              checked={form.acepta_ia} onChange={cambiar}
              style={{ marginTop: '0.125rem', width: 16, height: 16, accentColor: '#0d9488', flexShrink: 0 }} />
            <span>
              <span style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.1875rem' }}>
                El paciente autoriza el diagnóstico preliminar por IA
              </span>
              <span style={{ display: 'block', fontSize: '0.75rem', lineHeight: 1.5, color: 'var(--text-muted)' }}>
                El análisis es preliminar y no reemplaza la evaluación del especialista.
              </span>
            </span>
          </label>
        </div>

        {/* Barra de acción */}
        <div style={{ display: 'flex', gap: '0.75rem', padding: '1.125rem 1.625rem', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
          <button onClick={guardar} disabled={guardando} className="btn-primary" style={{ fontWeight: 600 }}>
            {guardando ? 'Guardando…' : 'Guardar cita'}
          </button>
          <button onClick={() => router.push('/citas')} className="btn-secondary">Cancelar</button>
        </div>
      </div>
    </div>
  )
}

export default function NuevaCitaPage() {
  return (
    <Suspense>
      <NuevaCitaForm />
    </Suspense>
  )
}
