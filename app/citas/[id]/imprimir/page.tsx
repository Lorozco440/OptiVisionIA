//frontend/app/citas/[id]/imprimir/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase, type Cita, type Paciente } from '@/lib/supabase'

export default function ImprimirCitaPage() {
  const { id } = useParams<{ id: string }>()
  const [cita,     setCita]     = useState<Cita | null>(null)
  const [paciente, setPaciente] = useState<Paciente | null>(null)
  const [generandoPdf, setGenerandoPdf] = useState(false)

  useEffect(() => { cargarDatos() }, [id])

  async function cargarDatos() {
    const { data } = await supabase
      .from('citas')
      .select('*, pacientes(*)')
      .eq('id', id)
      .single()
    if (data) {
      setCita(data)
      setPaciente((data as any).pacientes)
    }
  }

  // Genera la boleta como PDF (misma info que la versión impresa) y, en
  // teléfono, ofrece la hoja de compartir; en escritorio la descarga.
  async function descargarPdf() {
    if (!cita || !paciente) return
    setGenerandoPdf(true)
    try {
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({ unit: 'mm', format: 'a4' })
      const W = doc.internal.pageSize.getWidth()
      const H = doc.internal.pageSize.getHeight()
      const cx = W / 2
      const M = 24
      let y = 20
      const f = new Date(cita.fecha_hora)

      try {
        const logo = await cargarImagen('/Logo_OptivisionIA.png')
        const lw = 34, lh = lw * (logo.height / logo.width || 0.5)
        doc.addImage(logo, 'PNG', cx - lw / 2, y, lw, lh)
        y += lh + 5
      } catch { y += 2 }

      doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(15, 23, 42)
      doc.text('Óptica Vi+', cx, y, { align: 'center' }); y += 6
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(100, 116, 139)
      doc.text('Mixco, Guatemala · Sistema OptiVisionIA', cx, y, { align: 'center' }); y += 5

      const bw = 26, bh = 1.4, bx = cx - bw / 2
      doc.setFillColor(30, 58, 138);  doc.rect(bx, y, bw / 3, bh, 'F')
      doc.setFillColor(13, 148, 136); doc.rect(bx + bw / 3, y, bw / 3, bh, 'F')
      doc.setFillColor(34, 197, 94);  doc.rect(bx + (2 * bw) / 3, y, bw / 3, bh, 'F')
      y += 11

      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(100, 116, 139)
      doc.text('BOLETA DE CITA', cx, y, { align: 'center' }); y += 9
      doc.setFontSize(26); doc.setTextColor(29, 78, 216)
      doc.text(`#${cita.numero_cita}`, cx, y, { align: 'center' }); y += 14

      const seccion = (titulo: string) => {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(148, 163, 184)
        doc.text(titulo.toUpperCase(), M, y); y += 6
      }
      const fila = (label: string, valor: string | number) => {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(100, 116, 139)
        doc.text(label, M, y)
        doc.setTextColor(15, 23, 42)
        doc.text(String(valor), M + 34, y); y += 6
      }

      seccion('Paciente')
      fila('Nombre', `${paciente.apellidos}, ${paciente.nombres}`)
      fila('Expediente', `EXP-${String(paciente.expediente).padStart(6, '0')}`)
      if (paciente.dpi) fila('DPI', paciente.dpi)
      if (paciente.telefono) fila('Teléfono', paciente.telefono)
      y += 4

      seccion('Cita')
      fila('Fecha', f.toLocaleDateString('es-GT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))
      fila('Hora', f.toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' }))
      if (cita.motivo) fila('Motivo', cita.motivo)
      fila('Estado', cita.estado.replace('_', ' '))
      y += 6

      if (cita.acepta_ia) {
        const boxW = W - M * 2
        const texto = 'El paciente autoriza el análisis preliminar asistido por IA. Este análisis no reemplaza la evaluación del especialista oftalmológico.'
        const lineas = doc.splitTextToSize(texto, boxW - 8)
        const boxH = 11 + lineas.length * 4 + 3
        doc.setDrawColor(153, 246, 228); doc.setFillColor(240, 253, 250)
        doc.roundedRect(M, y, boxW, boxH, 2, 2, 'FD')
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(15, 23, 42)
        doc.text('Consentimiento para diagnóstico por IA', M + 4, y + 6)
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(71, 85, 105)
        doc.text(lineas, M + 4, y + 11)
        y += boxH + 6
      }

      const pieY = H - 18
      doc.setDrawColor(226, 232, 240); doc.line(M, pieY, W - M, pieY)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(148, 163, 184)
      doc.text(`Generado el ${new Date().toLocaleString('es-GT')}`, cx, pieY + 5, { align: 'center' })
      doc.text('OptiVisionIA — Óptica Vi+', cx, pieY + 9, { align: 'center' })

      const nombre = `boleta-cita-${cita.numero_cita}.pdf`
      const blob = doc.output('blob')
      const file = new File([blob], nombre, { type: 'application/pdf' })

      if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: nombre }); return } catch { /* cancelado: cae a descarga */ }
      }
      doc.save(nombre)
    } catch (e) {
      alert('No se pudo generar el PDF: ' + (e as Error).message)
    } finally {
      setGenerandoPdf(false)
    }
  }

  if (!cita || !paciente) {
    return <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', padding: '2rem' }}>Cargando boleta…</p>
  }

  const fechaCita = new Date(cita.fecha_hora)

  const estadoColores: Record<string, { bg: string; fg: string }> = {
    programada: { bg: '#fef9c3', fg: '#854d0e' },
    confirmada: { bg: '#dbeafe', fg: '#1e40af' },
    atendida:   { bg: '#dcfce7', fg: '#166534' },
    cancelada:  { bg: '#fee2e2', fg: '#991b1b' },
    no_asistio: { bg: '#f1f5f9', fg: '#475569' },
  }
  const estadoColor = estadoColores[cita.estado] ?? { bg: '#f1f5f9', fg: '#475569' }

  return (
    <>
      <div className="no-print" style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, fontWeight: 600, letterSpacing: '0.13em', textTransform: 'uppercase', color: '#0d9488', marginBottom: '0.5rem' }}>
          Agenda · Boleta
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={() => window.print()} className="btn-primary" style={{ fontWeight: 600 }}>Imprimir boleta</button>
          <button onClick={descargarPdf} disabled={generandoPdf} className="btn-secondary" style={{ fontWeight: 600 }}>{generandoPdf ? 'Generando…' : 'Descargar PDF'}</button>
          <Link href="/citas" className="btn-secondary">Volver a citas</Link>
        </div>
      </div>

      <div className="boleta">

        {/* Encabezado */}
        <div style={{ textAlign: 'center', paddingBottom: '1.125rem', marginBottom: '1.125rem', borderBottom: '1px solid #e2e8f0' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Logo_OptivisionIA.png" alt="OptiVisionIA" width={132} style={{ height: 'auto', display: 'inline-block', marginBottom: '0.75rem' }} />
          <p style={{ fontSize: '1.125rem', fontWeight: 700, letterSpacing: '-0.01em', margin: 0, color: '#0f172a' }}>Óptica Vi+</p>
          <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '0.125rem 0 0' }}>Mixco, Guatemala · Sistema OptiVisionIA</p>
          <div style={{ display: 'flex', height: 3, width: 80, margin: '0.875rem auto 0', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ flex: 1, background: '#1e3a8a' }} />
            <div style={{ flex: 1, background: '#0d9488' }} />
            <div style={{ flex: 1, background: '#22c55e' }} />
          </div>
        </div>

        {/* Número de cita */}
        <div style={{ textAlign: 'center', marginBottom: '1.375rem' }}>
          <p style={{ fontFamily: mono, fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#64748b', margin: 0 }}>
            Boleta de cita
          </p>
          <p style={{ fontFamily: mono, fontSize: '2.125rem', fontWeight: 600, color: '#1d4ed8', margin: '0.25rem 0 0', letterSpacing: '-0.01em' }}>
            #{cita.numero_cita}
          </p>
        </div>

        {/* Datos del paciente */}
        <p style={seccionBoleta}>Paciente</p>
        <table style={{ width: '100%', fontSize: '0.84rem', borderCollapse: 'collapse', marginBottom: '1.125rem' }}>
          <tbody>
            <FilaBoleta label="Nombre"     valor={`${paciente.apellidos}, ${paciente.nombres}`} bold />
            <FilaBoleta label="Expediente" valor={`EXP-${String(paciente.expediente).padStart(6, '0')}`} mono />
            {paciente.dpi      && <FilaBoleta label="DPI"      valor={paciente.dpi} mono />}
            {paciente.telefono && <FilaBoleta label="Teléfono" valor={paciente.telefono} />}
          </tbody>
        </table>

        <div style={{ borderTop: '1px dashed #cbd5e1', margin: '1.125rem 0' }} />

        {/* Datos de la cita */}
        <p style={seccionBoleta}>Cita</p>
        <table style={{ width: '100%', fontSize: '0.84rem', borderCollapse: 'collapse', marginBottom: '1.125rem' }}>
          <tbody>
            <FilaBoleta label="Fecha" bold valor={fechaCita.toLocaleDateString('es-GT', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            })} />
            <FilaBoleta label="Hora" mono valor={fechaCita.toLocaleTimeString('es-GT', {
              hour: '2-digit', minute: '2-digit'
            })} />
            {cita.motivo && <FilaBoleta label="Motivo" valor={cita.motivo} />}
            <tr>
              <td style={{ padding: '0.3125rem 0.75rem 0.3125rem 0', color: '#64748b', width: '7rem', verticalAlign: 'top' }}>Estado</td>
              <td style={{ padding: '0.3125rem 0' }}>
                <span style={{ display: 'inline-block', fontSize: '0.6875rem', fontWeight: 600, padding: '0.1875rem 0.625rem', borderRadius: 9999, background: estadoColor.bg, color: estadoColor.fg, textTransform: 'capitalize' }}>
                  {cita.estado.replace('_', ' ')}
                </span>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Consentimiento IA */}
        {cita.acepta_ia && (
          <div style={{ border: '1px solid #99f6e4', background: 'rgba(13,148,136,0.06)', borderRadius: '0.5625rem', padding: '0.8125rem 0.9375rem', marginBottom: '1.375rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4375rem', marginBottom: '0.3125rem' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#0d9488' }} />
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#0f172a' }}>
                Consentimiento para diagnóstico preliminar por IA
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.72rem', lineHeight: 1.55, color: '#475569' }}>
              El paciente autoriza el análisis preliminar asistido por inteligencia artificial.
              Este análisis <strong style={{ color: '#0f172a' }}>no reemplaza</strong> la evaluación del especialista oftalmológico.
            </p>
          </div>
        )}

        {/* Pie */}
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.875rem', textAlign: 'center', fontSize: '0.6875rem', color: '#94a3b8', lineHeight: 1.6 }}>
          <p style={{ margin: 0 }}>Generado el {new Date().toLocaleString('es-GT')}</p>
          <p style={{ margin: '0.1875rem 0 0', fontFamily: mono, letterSpacing: '0.04em' }}>OptiVisionIA — Óptica Vi+</p>
        </div>
      </div>

      <style>{`
        .boleta {
          width: 13cm;
          font-family: 'IBM Plex Sans', Arial, sans-serif;
          padding: 2rem 2.25rem;
          margin: 0 auto;
          background: white;
          color: #0f172a;
          border: 1px solid #e2e8f0;
          border-radius: 0.75rem;
          box-shadow: 0 8px 30px rgba(15,23,42,0.10);
        }
        @media print {
          .no-print { display: none !important; }
          nav        { display: none !important; }
          body       { background: white !important; }
          .boleta    { width: 100%; padding: 0; margin: 0; border: none; box-shadow: none; border-radius: 0; }
        }
      `}</style>
    </>
  )
}

const mono = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"

function cargarImagen(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

const seccionBoleta: React.CSSProperties = {
  fontFamily: mono, fontSize: '0.59rem', fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.1em', color: '#94a3b8', margin: '0 0 0.5625rem',
}

function FilaBoleta({ label, valor, bold = false, mono: isMono = false }: { label: string; valor: string; bold?: boolean; mono?: boolean }) {
  return (
    <tr>
      <td style={{ padding: '0.3125rem 0.75rem 0.3125rem 0', color: '#64748b', width: '7rem', verticalAlign: 'top' }}>
        {label}
      </td>
      <td style={{ padding: '0.3125rem 0', fontWeight: bold ? 600 : 400, color: '#0f172a', fontFamily: isMono ? mono : 'inherit', fontSize: isMono ? '0.78rem' : 'inherit' }}>
        {valor}
      </td>
    </tr>
  )
}
