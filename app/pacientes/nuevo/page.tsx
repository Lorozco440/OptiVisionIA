//frontend/app/pacientes/nuevo/page.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { formatoValidoDPI } from '@/lib/dpi'

const mono = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
const sans = "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

export default function NuevoPacientePage() {
  const router = useRouter()
  const [guardando, setGuardando] = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [form, setForm] = useState({
    nombres: '', apellidos: '', dpi: '', fecha_nacimiento: '',
    sexo: '', telefono: '', email: '', direccion: '', antecedentes: '',
  })

  function cambiar(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function guardar() {
    if (!form.nombres.trim() || !form.apellidos.trim()) {
      setError('Nombres y apellidos son obligatorios.')
      return
    }
    if (form.dpi.trim() && !formatoValidoDPI(form.dpi)) {
      setError('El DPI debe tener exactamente 13 dígitos numéricos.')
      return
    }
    setGuardando(true)
    setError(null)
    const { error: err } = await supabase.from('pacientes').insert({
      nombres:          form.nombres.trim(),
      apellidos:        form.apellidos.trim(),
      dpi:              form.dpi.trim()          || null,
      fecha_nacimiento: form.fecha_nacimiento    || null,
      sexo:             form.sexo                || null,
      telefono:         form.telefono.trim()     || null,
      email:            form.email.trim()        || null,
      direccion:        form.direccion.trim()    || null,
      antecedentes:     form.antecedentes.trim() || null,
    })
    if (err) { setError(err.message); setGuardando(false); return }
    router.push('/pacientes')
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', fontFamily: sans }}>
      {/* Cabecera */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontFamily: mono, fontSize: '11px', fontWeight: 600, letterSpacing: '0.13em', textTransform: 'uppercase', color: '#0d9488', marginBottom: '0.5rem' }}>
          Expedientes · Nuevo
        </div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, letterSpacing: '-0.015em', color: 'var(--text)', margin: 0 }}>
          Nuevo paciente
        </h1>
        <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: '0.375rem 0 0' }}>
          Los campos con <span style={{ color: '#dc2626' }}>*</span> son obligatorios.
        </p>
      </div>

      {error && <div className="alerta-error" style={{ marginBottom: '1rem' }}>{error}</div>}

      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        {/* Datos personales */}
        <Seccion titulo="Datos personales">
          <div style={grid2}>
            <Campo label="Nombres" required name="nombres" value={form.nombres} onChange={cambiar} placeholder="Sofía" />
            <Campo label="Apellidos" required name="apellidos" value={form.apellidos} onChange={cambiar} placeholder="Aguilar Ramírez" />
            <Campo label="DPI" name="dpi" value={form.dpi} onChange={cambiar} placeholder="0000 00000 0000" mono />
            <Campo label="Fecha de nacimiento" name="fecha_nacimiento" value={form.fecha_nacimiento} onChange={cambiar} type="date" />
            <div>
              <label style={labelStyle}>Sexo</label>
              <select name="sexo" value={form.sexo} onChange={cambiar} style={inputStyle}>
                <option value="">— Seleccionar —</option>
                <option value="M">Masculino</option>
                <option value="F">Femenino</option>
              </select>
            </div>
          </div>
        </Seccion>

        <Divisor />

        {/* Contacto */}
        <Seccion titulo="Contacto">
          <div style={grid2}>
            <Campo label="Teléfono" name="telefono" value={form.telefono} onChange={cambiar} type="tel" placeholder="0000 0000" />
            <Campo label="Email" name="email" value={form.email} onChange={cambiar} type="email" placeholder="nombre@correo.com" />
            <div style={{ gridColumn: '1 / -1' }}>
              <Campo label="Dirección" name="direccion" value={form.direccion} onChange={cambiar} placeholder="Zona, colonia, referencia…" />
            </div>
          </div>
        </Seccion>

        <Divisor />

        {/* Antecedentes */}
        <Seccion titulo="Antecedentes">
          <div>
            <label style={labelStyle}>Antecedentes oculares / médicos</label>
            <textarea
              name="antecedentes"
              value={form.antecedentes}
              onChange={cambiar}
              rows={3}
              placeholder="Cirugías previas, alergias, condiciones relevantes…"
              style={{ ...inputStyle, resize: 'none' }}
            />
          </div>
        </Seccion>

        {/* Barra de acción */}
        <div style={{ display: 'flex', gap: '0.75rem', padding: '1.125rem 1.625rem', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
          <button onClick={guardar} disabled={guardando} className="btn-primary" style={{ fontWeight: 600 }}>
            {guardando ? 'Guardando…' : 'Guardar paciente'}
          </button>
          <button onClick={() => router.back()} className="btn-secondary">Cancelar</button>
        </div>
      </div>
    </div>
  )
}

/* ── Estilos ────────────────────────────────────────────────────────────── */
const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }

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

/* ── Subcomponentes de presentación (sin lógica) ────────────────────────── */
function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '1.375rem 1.625rem' }}>
      <div style={{ fontFamily: mono, fontSize: '10.5px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '1rem' }}>
        {titulo}
      </div>
      {children}
    </div>
  )
}

function Divisor() {
  return <div style={{ height: 1, background: 'var(--border)' }} />
}

function Campo({ label, name, value, onChange, type = 'text', required = false, placeholder, mono: isMono = false }: {
  label: string; name: string; value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  type?: string; required?: boolean; placeholder?: string; mono?: boolean
}) {
  return (
    <div>
      <label style={labelStyle}>
        {label}{required && <span style={{ color: '#dc2626' }}> *</span>}
      </label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        style={{ ...inputStyle, fontFamily: isMono ? mono : sans }}
      />
    </div>
  )
}
