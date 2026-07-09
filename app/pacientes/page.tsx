//frontend/app/pacientes/page.tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase, type Paciente } from '@/lib/supabase'

export default function PacientesPage() {
  const [pacientes, setPacientes] = useState<Paciente[]>([])
  const [busqueda,  setBusqueda]  = useState('')
  const [cargando,  setCargando]  = useState(true)

  useEffect(() => { cargarPacientes() }, [])

  async function cargarPacientes() {
    setCargando(true)
    const { data } = await supabase
      .from('pacientes')
      .select('*')
      .order('apellidos')
      .limit(100)
    if (data) setPacientes(data)
    setCargando(false)
  }

  async function buscar(texto: string) {
    setBusqueda(texto)
    if (!texto.trim()) { cargarPacientes(); return }
    const { data } = await supabase
      .from('pacientes')
      .select('*')
      .or(`nombres.ilike.%${texto}%,apellidos.ilike.%${texto}%,dpi.ilike.%${texto}%`)
      .order('apellidos')
      .limit(50)
    if (data) setPacientes(data)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Pacientes</h1>
        <Link href="/pacientes/nuevo" className="btn-primary">Nuevo paciente</Link>
      </div>

      <input
        type="text"
        placeholder="Buscar por nombre, apellido o DPI..."
        value={busqueda}
        onChange={e => buscar(e.target.value)}
        className="w-full border rounded-lg px-4 py-2 mb-6 text-sm"
        style={{ maxWidth: '420px', display: 'block' }}
      />

      {cargando ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Cargando...</p>
      ) : pacientes.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No se encontraron pacientes.</p>
      ) : (
        <div className="card overflow-hidden">
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table className="tabla w-full" style={{ minWidth: 560 }}>
            <thead>
              <tr>
                <th>Expediente</th>
                <th>Apellidos, Nombres</th>
                <th>DPI</th>
                <th>Teléfono</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pacientes.map(p => (
                <tr key={p.id}>
                  <td className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                    EXP-{String(p.expediente).padStart(6, '0')}
                  </td>
                  <td className="font-medium">{p.apellidos}, {p.nombres}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{p.dpi ?? '—'}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{p.telefono ?? '—'}</td>
                  <td>
                    <Link
                      href={`/pacientes/${p.id}`}
                      style={{ color: '#3b82f6', fontSize: '0.875rem' }}
                      className="hover:underline"
                    >
                      Ver / Editar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  )
}