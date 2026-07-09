//frontend/app/citas/page.tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase, type Cita } from '@/lib/supabase'

type Vista = 'dia' | 'mes'

const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const estadoColores: Record<string, string> = {
  programada: 'badge-programada',
  confirmada: 'badge-confirmada',
  atendida:   'badge-atendida',
  cancelada:  'badge-cancelada',
  no_asistio: 'badge-no_asistio',
}

// Estados de 'analisis' que ya tienen un resultado del modelo y por lo
// tanto pueden (y deben) ser validados clínicamente. 'esperando_imagen',
// 'pendiente' y 'procesando' se excluyen porque todavía no hay nada que
// el optometrista pueda confirmar o corregir.
const ESTADOS_CON_RESULTADO = ['completado', 'rechazada_stage1', 'no_clasificable', 'error']

function fechaLocal(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function CitasPage() {
  const hoyDate = new Date()
  const [vista,    setVista]    = useState<Vista>('dia')
  const [fecha,    setFecha]    = useState(fechaLocal(hoyDate))
  const [mes,      setMes]      = useState(hoyDate.getMonth())
  const [anio,     setAnio]     = useState(hoyDate.getFullYear())
  const [citas,    setCitas]    = useState<Cita[]>([])
  const [cargando, setCargando] = useState(true)

  // paciente_id -> cita_id del análisis pendiente de validar (el más
  // reciente, si hubiera más de uno). Se usa para mostrar el aviso
  // "Diagnóstico IA previo sin validar" junto a cada cita (Escenario A:
  // triage hecho por asistente sin optometrista presente, que debe
  // revisarse en la cita de seguimiento) y para enlazar directo a la
  // pantalla de ambos ojos de ESA cita anterior, no la cita actual.
  const [pendientesPorPaciente, setPendientesPorPaciente] = useState<Map<string, string>>(new Map())
  // Se guarda para que la suscripción Realtime sepa a qué pacientes
  // volver a consultar cuando algo se valida en otra pantalla/pestaña.
  const [pacienteIdsDia, setPacienteIdsDia] = useState<string[]>([])

  useEffect(() => {
    vista === 'dia' ? cargarDia() : cargarMes()
  }, [fecha, mes, anio, vista])

  // Si el optometrista valida un análisis desde diagnostico/cita/{id}
  // (otra pestaña, u otra navegación dentro de la misma sesión), el
  // badge de "sin validar" en esta lista debe reflejarlo sin que el
  // usuario tenga que recargar la página manualmente.
  useEffect(() => {
    if (vista !== 'dia' || pacienteIdsDia.length === 0) return
    const channel = supabase
      .channel('citas-validaciones')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'analisis' },
        (payload) => {
          const fila = payload.new as any
          if (fila?.paciente_id && pacienteIdsDia.includes(fila.paciente_id)) {
            cargarValidacionesPendientes(pacienteIdsDia)
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [pacienteIdsDia, vista])

  function hoy() { return fechaLocal() }

  async function cargarValidacionesPendientes(pacienteIds: string[]) {
    if (pacienteIds.length === 0) { setPendientesPorPaciente(new Map()); return }

    const { data, error } = await supabase
      .from('analisis')
      .select('paciente_id, cita_id, created_at')
      .in('paciente_id', pacienteIds)
      .in('estado', ESTADOS_CON_RESULTADO)
      .or('validado.is.null,validado.eq.false')
      .order('created_at', { ascending: false })

    if (error || !data) { setPendientesPorPaciente(new Map()); return }

    // Si un paciente tiene más de un análisis pendiente (de citas
    // distintas), nos quedamos con el más reciente: como ya viene
    // ordenado descendente, el primer cita_id que veamos por paciente
    // es el correcto y los siguientes se ignoran.
    const mapa = new Map<string, string>()
    for (const r of data as any[]) {
      if (!r.cita_id) continue
      if (!mapa.has(r.paciente_id)) mapa.set(r.paciente_id, r.cita_id)
    }
    setPendientesPorPaciente(mapa)
  }

  async function cargarDia() {
    setCargando(true)
    const { data } = await supabase
      .from('citas')
      .select('*, pacientes(nombres, apellidos, expediente)')
      .gte('fecha_hora', `${fecha}T00:00:00-06:00`)
      .lte('fecha_hora', `${fecha}T23:59:59-06:00`)
      .order('fecha_hora')
    if (data) {
      setCitas(data)
      const ids = data.map((c: any) => c.paciente_id).filter(Boolean)
      setPacienteIdsDia(ids)
      await cargarValidacionesPendientes(ids)
    }
    setCargando(false)
  }

  async function cargarMes() {
    setCargando(true)
    const inicio = new Date(anio, mes, 1).toISOString()
    const fin    = new Date(anio, mes + 1, 0, 23, 59, 59).toISOString()
    const { data } = await supabase
      .from('citas')
      .select('*, pacientes(nombres, apellidos)')
      .gte('fecha_hora', inicio)
      .lte('fecha_hora', fin)
      .order('fecha_hora')
    if (data) setCitas(data)
    setCargando(false)
  }

  async function cambiarEstado(id: string, estado: string) {
    await supabase.from('citas').update({ estado }).eq('id', id)
    vista === 'dia' ? cargarDia() : cargarMes()
  }

  // ── Calendario mensual ────────────────────────────────────────────────────
  function generarCeldasMes() {
    const primerDia  = new Date(anio, mes, 1).getDay()
    const diasEnMes  = new Date(anio, mes + 1, 0).getDate()
    const celdas: (number | null)[] = [
      ...Array(primerDia).fill(null),
      ...Array.from({ length: diasEnMes }, (_, i) => i + 1),
    ]
    // Completar hasta múltiplo de 7
    while (celdas.length % 7 !== 0) celdas.push(null)
    return celdas
  }

  function citasDelDia(dia: number) {
    return citas.filter(c => new Date(c.fecha_hora).getDate() === dia)
  }

  function navMes(dir: -1 | 1) {
    const d = new Date(anio, mes + dir, 1)
    setMes(d.getMonth())
    setAnio(d.getFullYear())
  }

  const celdas = generarCeldasMes()
  const hoyNum = new Date().getDate()
  const esEsteMes = new Date().getMonth() === mes && new Date().getFullYear() === anio

  return (
    <div>
      {/* Encabezado */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Citas</h1>
        <Link href="/citas/nueva" className="btn-primary">Nueva cita</Link>

      </div>

      {/* Controles de vista */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {/* Toggle día / mes */}
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: '0.5rem', overflow: 'hidden' }}>
          {(['dia', 'mes'] as Vista[]).map(v => (
            <button key={v} onClick={() => setVista(v)}
              style={{
                padding: '0.4rem 1rem', fontSize: '0.8rem', fontWeight: 500, border: 'none', cursor: 'pointer',
                background: vista === v ? '#1d4ed8' : 'var(--bg-card)',
                color: vista === v ? '#fff' : 'var(--text)',
                transition: 'background 0.15s',
              }}>
              {v === 'dia' ? 'Por día' : 'Calendario'}
            </button>
          ))}
        </div>

        {/* Controles según vista */}
        {vista === 'dia' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              style={{ border: '1px solid var(--input-border)', borderRadius: '0.5rem',
                padding: '0.375rem 0.75rem', fontSize: '0.875rem',
                backgroundColor: 'var(--input-bg)', color: 'var(--input-text)' }} />
            <button onClick={() => setFecha(hoy())}
              style={{ fontSize: '0.75rem', color: '#3b82f6', background: 'none',
                border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Hoy
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button onClick={() => navMes(-1)} className="btn-secondary"
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.875rem' }}>‹</button>
            <span style={{ fontWeight: 600, color: 'var(--text)', minWidth: '140px', textAlign: 'center' }}>
              {MESES[mes]} {anio}
            </span>
            <button onClick={() => navMes(1)} className="btn-secondary"
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.875rem' }}>›</button>
            {!esEsteMes && (
              <button onClick={() => { setMes(new Date().getMonth()); setAnio(new Date().getFullYear()) }}
                style={{ fontSize: '0.75rem', color: '#3b82f6', background: 'none',
                  border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                Mes actual
              </button>
            )}
          </div>
        )}
      </div>

      {cargando ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Cargando...</p>
      ) : vista === 'dia' ? (

        /* ── Vista por día ─────────────────────────────────────────────── */
        citas.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No hay citas para esta fecha.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {citas.map(c => {
              const p = (c as any).pacientes
              const citaIdPendiente = pendientesPorPaciente.get((c as any).paciente_id)
              return (
                <div key={c.id} className="card p-4"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                    <div style={{ minWidth: '52px', textAlign: 'center' }}>
                      <p style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1d4ed8', lineHeight: 1 }}>
                        {new Date(c.fecha_hora).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div>
                      <p style={{ fontWeight: 500, color: 'var(--text)', fontSize: '0.875rem' }}>
                        {p?.apellidos}, {p?.nombres}
                        <span style={{ fontFamily: 'monospace', fontSize: '0.7rem',
                          color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                          EXP-{String(p?.expediente ?? 0).padStart(6, '0')}
                        </span>
                      </p>
                      {c.motivo && <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{c.motivo}</p>}
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                        {c.acepta_ia && (
                          <span className="badge" style={{ background: '#ede9fe', color: '#6d28d9' }}>
                            Diagnóstico IA autorizado
                          </span>
                        )}
                        {citaIdPendiente && (
                          <span className="badge" style={{ background: '#fef3c7', color: '#92400e', fontWeight: 600 }}>
                            Diagnóstico IA previo sin validar
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <select value={c.estado} onChange={e => cambiarEstado(c.id, e.target.value)}
                      className={`badge ${estadoColores[c.estado] ?? ''}`}
                      style={{ border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                      <option value="programada">Programada</option>
                      <option value="confirmada">Confirmada</option>
                      <option value="atendida">Atendida</option>
                      <option value="cancelada">Cancelada</option>
                      <option value="no_asistio">No asistió</option>
                    </select>
                    {citaIdPendiente && (
                      <Link href={`/diagnostico/cita/${citaIdPendiente}`}
                        style={{
                          fontSize: '0.75rem', padding: '0.35rem 0.75rem',
                          borderRadius: '0.5rem', background: '#92400e', color: '#fff',
                          fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap',
                        }}>
                        Ver diagnóstico previo
                      </Link>
                    )}
                    {c.acepta_ia && (
                      <Link href={`/diagnostico/nuevo?cita=${c.id}`}
                        style={{
                          fontSize: '0.75rem', padding: '0.35rem 0.75rem',
                          borderRadius: '0.5rem', background: '#1d4ed8', color: '#fff',
                          fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap',
                        }}>
                        Iniciar diagnóstico IA
                      </Link>
                    )}
                    <Link href={`/citas/${c.id}/imprimir`} target="_blank" className="btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}>
                      Imprimir
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )
      ) : (

        /* ── Vista calendario mensual ───────────────────────────────────── */
        <div className="card overflow-hidden">
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <div style={{ minWidth: 560 }}>
          {/* Cabecera días de semana */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
            background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
            {DIAS_SEMANA.map(d => (
              <div key={d} style={{ padding: '0.5rem', textAlign: 'center',
                fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {d}
              </div>
            ))}
          </div>

          {/* Celdas del mes */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {celdas.map((dia, idx) => {
              const citasDia = dia ? citasDelDia(dia) : []
              const esHoy    = esEsteMes && dia === hoyNum
              return (
                <div key={idx}
                  style={{
                    minHeight: '90px',
                    padding: '0.375rem',
                    borderRight: (idx + 1) % 7 !== 0 ? '1px solid var(--border)' : 'none',
                    borderBottom: idx < celdas.length - 7 ? '1px solid var(--border)' : 'none',
                    background: dia ? 'var(--bg-card)' : 'color-mix(in srgb, var(--bg) 60%, var(--bg-card))',
                  }}>
                  {dia && (
                    <>
                      <div style={{
                        width: '1.5rem', height: '1.5rem', borderRadius: '9999px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        marginBottom: '0.25rem',
                        background: esHoy ? '#1d4ed8' : 'transparent',
                        color: esHoy ? '#fff' : 'var(--text)',
                        fontSize: '0.75rem', fontWeight: esHoy ? 700 : 400,
                      }}>
                        {dia}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                        {citasDia.slice(0, 3).map(c => {
                          const p = (c as any).pacientes
                          return (
                            <Link key={c.id} href={`/citas/${c.id}/imprimir`}
                              style={{
                                fontSize: '0.65rem', padding: '0.1rem 0.3rem',
                                borderRadius: '0.25rem', display: 'block',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                background: c.estado === 'atendida'   ? '#dcfce7' :
                                            c.estado === 'cancelada'  ? '#fee2e2' :
                                            c.estado === 'confirmada' ? '#dbeafe' : '#fef9c3',
                                color:      c.estado === 'atendida'   ? '#166534' :
                                            c.estado === 'cancelada'  ? '#991b1b' :
                                            c.estado === 'confirmada' ? '#1e40af' : '#854d0e',
                              }}>
                              {new Date(c.fecha_hora).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' })}
                              {' '}{p?.apellidos ?? ''}
                            </Link>
                          )
                        })}
                        {citasDia.length > 3 && (
                          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', paddingLeft: '0.2rem' }}>
                            +{citasDia.length - 3} más
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
          </div>
          </div>
        </div>
      )}
    </div>
  )
}