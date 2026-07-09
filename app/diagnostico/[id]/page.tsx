//frontend/app/diagnostico/[id]/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import QRCode from 'react-qr-code'
import { supabase } from '@/lib/supabase'

type AnalisisRow = {
  id: string
  paciente_id: string | null
  codigo_sesion: string
  estado: string
  imagen_path: string | null
  gradcam_path: string | null
  paso_filtro: boolean | null
  confianza_ojo: number | null
  diagnostico: string | null
  confianza: number | null
  probabilidades: Record<string, number> | null
  mensaje: string | null
  created_at: string | null
  completado_at: string | null
}

const CLASES = ['catarata', 'normal', 'pterigion']
const COLOR_DIAG: Record<string, string> = {
  catarata: '#d97706',
  normal: '#16a34a',
  pterigion: '#dc2626',
}

function diagRGB(d: string): [number, number, number] {
  if (d === 'catarata') return [217, 119, 6]
  if (d === 'normal') return [22, 163, 74]
  if (d === 'pterigion') return [220, 38, 38]
  return [37, 99, 235]
}

async function urlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url)
  const blob = await res.blob()
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.readAsDataURL(blob)
  })
}
function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image()
    im.onload = () => resolve(im)
    im.onerror = reject
    im.src = src
  })
}
function calcularEdad(fechaNac?: string | null): number | null {
  if (!fechaNac) return null
  const n = new Date(fechaNac), h = new Date()
  let e = h.getFullYear() - n.getFullYear()
  const m = h.getMonth() - n.getMonth()
  if (m < 0 || (m === 0 && h.getDate() < n.getDate())) e--
  return e
}
export default function DiagnosticoEnVivoPage() {
  const params = useParams()
  const id = params?.id as string

  const [a, setA] = useState<AnalisisRow | null>(null)
  const [paciente, setPaciente] = useState<any>(null)
  const [cargando, setCargando] = useState(true)
  const [imgUrl, setImgUrl] = useState<string | null>(null)
  const [camUrl, setCamUrl] = useState<string | null>(null)
  const [origin, setOrigin] = useState('')
  const [generandoPdf, setGenerandoPdf] = useState(false)
  const [reintentando, setReintentando] = useState(false)

  useEffect(() => setOrigin(window.location.origin), [])

  useEffect(() => {
    if (!id) return
    ;(async () => {
      const { data } = await supabase.from('analisis').select('*').eq('id', id).maybeSingle()
      if (data) setA(data as AnalisisRow)
      setCargando(false)
    })()
  }, [id])

  useEffect(() => {
    if (!id) return
    const channel = supabase
      .channel(`analisis-${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'analisis', filter: `id=eq.${id}` },
        (payload) => setA(payload.new as AnalisisRow)
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [id])

  // Datos del paciente
  useEffect(() => {
    if (!a?.paciente_id) return
    ;(async () => {
      const { data } = await supabase.from('pacientes').select('*').eq('id', a.paciente_id).maybeSingle()
      if (data) setPaciente(data)
    })()
  }, [a?.paciente_id])

  // Firmar URLs
  useEffect(() => {
    ;(async () => {
      if (a?.imagen_path) {
        const { data } = await supabase.storage.from('imagenes').createSignedUrl(a.imagen_path, 3600)
        if (data?.signedUrl) setImgUrl(data.signedUrl)
      }
      if (a?.gradcam_path) {
        const { data } = await supabase.storage.from('imagenes').createSignedUrl(a.gradcam_path, 3600)
        if (data?.signedUrl) setCamUrl(data.signedUrl)
      }
    })()
  }, [a?.imagen_path, a?.gradcam_path])

  const wrap: React.CSSProperties = { maxWidth: 720, margin: '0 auto', padding: '2rem 1rem', color: 'var(--text)' }
  const card: React.CSSProperties = { background: 'var(--input-bg, #1e293b)', borderRadius: 16, padding: '1.5rem' }
  const pct = (n: number | null | undefined) => (n == null ? '—' : (n * 100).toFixed(1) + '%')

  async function reintentar() {
    if (!a) return
    setReintentando(true)
    try {
      const { error } = await supabase
        .from('analisis')
        .update({
          estado: 'esperando_imagen',
          imagen_path: null,
          diagnostico: null,
          confianza: null,
          probabilidades: null,
          confianza_ojo: null,
          gradcam_path: null,
          mensaje: null,
        })
        .eq('id', a.id)
      if (!error) {
        // Refleja el cambio de inmediato sin esperar el evento Realtime
        setA({
          ...a,
          estado: 'esperando_imagen',
          imagen_path: null,
          diagnostico: null,
          confianza: null,
          probabilidades: null,
          confianza_ojo: null,
          gradcam_path: null,
          mensaje: null,
        })
        setImgUrl(null)
        setCamUrl(null)
      }
    } finally {
      setReintentando(false)
    }
  }

  async function generarPDF() {
    if (!a) return
    setGenerandoPdf(true)
    try {
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({ unit: 'mm', format: 'a4' })
      const W = doc.internal.pageSize.getWidth()
      let y = 0

      // Encabezado con logo (color de fondo igual al del logo para que se funda)
      doc.setFillColor(36, 62, 146)
      doc.rect(0, 0, W, 26, 'F')
      let logoOk = false
      try {
        const logoData = await urlToDataUrl('/logo-optica.png')
        const logoImg = await loadImg(logoData)
        const logoH = 13
        const logoW = logoH * (logoImg.width / logoImg.height)
        doc.addImage(logoData, 'PNG', 14, 6.5, logoW, logoH)
        logoOk = true
      } catch {}
      if (!logoOk) {
        doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(18)
        doc.text('Óptica Vi+', 14, 13)
      }
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
      doc.text('Reporte de diagnóstico asistido por IA', W - 14, 16, { align: 'right' })
      y = 36

      // Datos del paciente
      doc.setTextColor(15, 23, 42)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
      doc.text('Datos del paciente', 14, y); y += 6
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
      const nombre = paciente ? `${paciente.apellidos ?? ''}, ${paciente.nombres ?? ''}` : '—'
      const exp = paciente?.expediente ? `EXP-${String(paciente.expediente).padStart(6, '0')}` : '—'
      doc.text(`Nombre: ${nombre}`, 14, y); doc.text(`Expediente: ${exp}`, 120, y); y += 5.5
      const edad = calcularEdad(paciente?.fecha_nacimiento)
      doc.text(`DPI: ${paciente?.dpi ?? '—'}`, 14, y); doc.text(`Sexo: ${paciente?.sexo ?? '—'}   Edad: ${edad !== null ? edad + ' años' : '—'}`, 120, y); y += 5.5
      const fechaAnalisis = a.completado_at ?? a.created_at
      doc.text(`Fecha del análisis: ${fechaAnalisis ? new Date(fechaAnalisis).toLocaleString('es-GT') : '—'}`, 14, y); y += 5.5
      doc.text(`Sesión: ${a.codigo_sesion}`, 14, y); y += 9

      // Diagnóstico
      const diag = a.diagnostico ?? '—'
      doc.setFillColor(241, 245, 249)
      doc.roundedRect(14, y, W - 28, 24, 2, 2, 'F')
      doc.setFontSize(9); doc.setTextColor(100, 116, 139)
      doc.text('DIAGNÓSTICO SUGERIDO', 18, y + 7)
      const [r, g, b] = diagRGB(diag)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(r, g, b)
      doc.text(diag.toUpperCase(), 18, y + 15)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(15, 23, 42)
      doc.text(`Confianza: ${pct(a.confianza)}`, 18, y + 21)
      doc.text(`Filtro de calidad (p ojo): ${pct(a.confianza_ojo)}`, 90, y + 21)
      y += 32

      // Probabilidades
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(15, 23, 42)
      doc.text('Probabilidades por clase', 14, y); y += 7
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
      for (const c of CLASES) {
        const v = a.probabilidades?.[c] ?? 0
        doc.text(c.charAt(0).toUpperCase() + c.slice(1), 14, y)
        const barX = 60, barW = 110, barH = 4
        doc.setFillColor(226, 232, 240); doc.rect(barX, y - 3, barW, barH, 'F')
        const [cr, cg, cb] = diagRGB(c); doc.setFillColor(cr, cg, cb); doc.rect(barX, y - 3, barW * v, barH, 'F')
        doc.text(pct(v), barX + barW + 4, y)
        y += 7
      }
      y += 5

      // Imágenes
      let imgData: string | null = null, camData: string | null = null
      try { if (imgUrl) imgData = await urlToDataUrl(imgUrl) } catch {}
      try { if (camUrl) camData = await urlToDataUrl(camUrl) } catch {}
      const imgY = y
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
      doc.text('Imagen capturada', 14, imgY)
      doc.text('Grad-CAM', 110, imgY)
      if (imgData) doc.addImage(imgData, 'JPEG', 14, imgY + 3, 80, 80)
      if (camData) doc.addImage(camData, 'PNG', 110, imgY + 3, 80, 80)
      y = imgY + 80 + 12

      // Disclaimer
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(100, 116, 139)
      const disc = 'Este resultado es una herramienta de apoyo diagnóstico generada por un sistema de inteligencia artificial y no sustituye la evaluación de un profesional de la salud visual. El optometrista debe validar el hallazgo.'
      doc.text(doc.splitTextToSize(disc, W - 28), 14, y); y += 16

      // Firma
      doc.setDrawColor(100, 116, 139)
      doc.line(14, y + 10, 90, y + 10)
      doc.setTextColor(15, 23, 42); doc.setFontSize(9)
      doc.text('Optometrista', 14, y + 15)

      doc.save(`reporte_${exp}.pdf`)
    } finally {
      setGenerandoPdf(false)
    }
  }

  if (cargando) return <main style={wrap}><p>Cargando…</p></main>
  if (!a) return <main style={wrap}><p>No se encontró el análisis.</p></main>

  const Header = (
    <div style={{ marginBottom: '1.5rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Diagnóstico asistido por IA</h1>
      <p style={{ opacity: 0.6, fontSize: '0.85rem' }}>Sesión {a.codigo_sesion}</p>
    </div>
  )

  const BotonReintentar = (
    <button
      onClick={reintentar}
      disabled={reintentando}
      style={{
        padding: '0.7rem 1.25rem', borderRadius: 10, border: '1px solid var(--border, #475569)',
        background: 'transparent', color: 'var(--text)', fontWeight: 600,
        cursor: reintentando ? 'not-allowed' : 'pointer', marginTop: '1rem',
      }}
    >
      {reintentando ? 'Reiniciando…' : 'Volver a escanear'}
    </button>
  )

  if (a.estado === 'esperando_imagen') {
    const url = `${origin}/captura?sesion=${a.codigo_sesion}`
    return (
      <main style={wrap}>
        {Header}
        <div style={{ ...card, textAlign: 'center' }}>
          <p style={{ marginBottom: '1.5rem', opacity: 0.85 }}>Esperando la imagen del teléfono. Escanea el código:</p>
          <div style={{ background: '#fff', padding: '1.25rem', borderRadius: 12, display: 'inline-block' }}>
            <QRCode value={url} size={200} />
          </div>
          <p style={{ marginTop: '1rem', fontSize: '1.5rem', fontWeight: 700, letterSpacing: '0.2rem' }}>{a.codigo_sesion}</p>
        </div>
      </main>
    )
  }

  if (a.estado === 'pendiente' || a.estado === 'procesando') {
    return (
      <main style={wrap}>
        {Header}
        <div style={{ ...card, textAlign: 'center', padding: '3rem 1.5rem' }}>
          <div className="ov-spinner" />
          <p style={{ marginTop: '1.5rem', fontSize: '1.1rem' }}>Procesando imagen con el modelo…</p>
          <p style={{ opacity: 0.6, fontSize: '0.85rem', marginTop: '0.5rem' }}>Filtro de calidad → clasificación de patología</p>
        </div>
        <style>{`
          .ov-spinner { width:56px;height:56px;border-radius:50%;border:5px solid rgba(148,163,184,0.3);border-top-color:#2563eb;margin:0 auto;animation:ov-spin 0.9s linear infinite; }
          @keyframes ov-spin { to { transform: rotate(360deg); } }
        `}</style>
      </main>
    )
  }

  if (a.estado === 'rechazada_stage1') {
    return (
      <main style={wrap}>
        {Header}
        <div style={{ ...card, borderLeft: '4px solid #d97706' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.5rem' }}>Imagen rechazada por el filtro de calidad</h2>
          <p style={{ opacity: 0.85 }}>{a.mensaje ?? 'La imagen no parece ser un ojo. Vuelve a capturar enfocando bien el ojo, con buena luz.'}</p>
          <p style={{ marginTop: '1rem', fontSize: '0.9rem', opacity: 0.7 }}>Confianza del filtro (p ojo): {pct(a.confianza_ojo)}</p>
          {BotonReintentar}
        </div>
      </main>
    )
  }

  if (a.estado === 'no_clasificable') {
    return (
      <main style={wrap}>
        {Header}
        <div style={{ ...card, borderLeft: '4px solid #64748b' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.5rem' }}>Sin diagnóstico concluyente</h2>
          <p style={{ opacity: 0.85 }}>{a.mensaje ?? 'La confianza del modelo no alcanzó el umbral para emitir un diagnóstico.'}</p>
          {BotonReintentar}
        </div>
      </main>
    )
  }

  if (a.estado === 'error') {
    return (
      <main style={wrap}>
        {Header}
        <div style={{ ...card, borderLeft: '4px solid #dc2626' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.5rem' }}>Error en el procesamiento</h2>
          <p style={{ opacity: 0.85 }}>{a.mensaje ?? 'Ocurrió un error al procesar la imagen.'}</p>
          {BotonReintentar}
        </div>
      </main>
    )
  }

  // completado
  const diag = a.diagnostico ?? '—'
  const colorDiag = COLOR_DIAG[diag] ?? '#2563eb'
  const probs = a.probabilidades ?? {}

  return (
    <main style={wrap}>
      {Header}

      <div style={{ ...card, borderTop: `4px solid ${colorDiag}`, marginBottom: '1.25rem' }}>
        <p style={{ opacity: 0.6, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05rem' }}>Diagnóstico sugerido</p>
        <p style={{ fontSize: '2rem', fontWeight: 800, color: colorDiag, textTransform: 'capitalize' }}>{diag}</p>
        <p style={{ fontSize: '1.1rem', opacity: 0.85 }}>Confianza: {pct(a.confianza)}</p>
      </div>

      <div style={{ ...card, marginBottom: '1.25rem' }}>
        <p style={{ fontWeight: 600, marginBottom: '0.75rem' }}>Probabilidades por clase</p>
        {CLASES.map((c) => {
          const v = probs[c] ?? 0
          return (
            <div key={c} style={{ marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                <span style={{ textTransform: 'capitalize' }}>{c}</span><span>{pct(v)}</span>
              </div>
              <div style={{ height: 10, background: 'rgba(148,163,184,0.25)', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ width: `${v * 100}%`, height: '100%', background: COLOR_DIAG[c] ?? '#2563eb', transition: 'width 0.6s ease' }} />
              </div>
            </div>
          )
        })}
        <p style={{ marginTop: '0.75rem', fontSize: '0.85rem', opacity: 0.7 }}>Filtro de calidad (p ojo): {pct(a.confianza_ojo)}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
        <div style={card}>
          <p style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.9rem' }}>Imagen capturada</p>
          {imgUrl ? <img src={imgUrl} alt="Ojo" style={{ width: '100%', borderRadius: 10 }} /> : <p style={{ opacity: 0.5 }}>—</p>}
        </div>
        <div style={card}>
          <p style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.9rem' }}>Grad-CAM</p>
          {camUrl ? <img src={camUrl} alt="Grad-CAM" style={{ width: '100%', borderRadius: 10 }} /> : <p style={{ opacity: 0.5 }}>—</p>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={generarPDF}
          disabled={generandoPdf}
          style={{
            padding: '0.85rem 1.5rem', borderRadius: 10, border: 'none',
            background: generandoPdf ? '#94a3b8' : '#1d4ed8', color: '#fff',
            fontWeight: 600, cursor: generandoPdf ? 'not-allowed' : 'pointer',
          }}
        >
          {generandoPdf ? 'Generando PDF…' : 'Descargar reporte PDF'}
        </button>
        <button
          onClick={reintentar}
          disabled={reintentando}
          style={{
            padding: '0.85rem 1.5rem', borderRadius: 10, border: '1px solid var(--border, #475569)',
            background: 'transparent', color: 'var(--text)', fontWeight: 600,
            cursor: reintentando ? 'not-allowed' : 'pointer',
          }}
        >
          {reintentando ? 'Reiniciando…' : 'Repetir captura'}
        </button>
      </div>

      <p style={{ fontSize: '0.8rem', opacity: 0.6, lineHeight: 1.5, marginTop: '1.25rem' }}>
        Este resultado es una herramienta de apoyo diagnóstico y no sustituye la evaluación de un profesional de la salud visual. El optometrista debe validar el hallazgo.
      </p>
    </main>
  )
}