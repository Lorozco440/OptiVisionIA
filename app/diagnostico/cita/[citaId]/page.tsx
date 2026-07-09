//frontend/app/diagnostico/cita/[citaId]/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import QRCode from 'react-qr-code'
import { supabase } from '@/lib/supabase'
import { CONTENIDO_CLINICO } from '@/lib/contenidoClinico'

type AnalisisRow = {
  id: string
  paciente_id: string | null
  cita_id: string | null
  codigo_sesion: string
  estado: string
  ojo: 'OD' | 'OI' | null
  imagen_path: string | null
  gradcam_path: string | null
  paso_filtro: boolean | null
  confianza_ojo: number | null
  diagnostico: string | null
  confianza: number | null
  probabilidades: Record<string, number> | null
  mensaje: string | null
  grado: string | null
  diagnostico_real: string | null
  validado: boolean | null
  validado_por: string | null
  validado_at: string | null
  observaciones: string | null
  created_at: string | null
  completado_at: string | null
}

const CLASES = ['catarata', 'normal', 'pterigion']
const COLOR_DIAG: Record<string, string> = {
  catarata: '#d97706',
  normal: '#16a34a',
  pterigion: '#dc2626',
}
const GRADOS_PTERIGION = ['Grado I', 'Grado II', 'Grado III', 'Grado IV']

function diagRGB(d: string): [number, number, number] {
  if (d === 'catarata') return [217, 119, 6]
  if (d === 'normal') return [22, 163, 74]
  if (d === 'pterigion') return [220, 38, 38]
  return [37, 99, 235]
}

// Recomendación para el paciente según el hallazgo del PDF.
// Aunque el ojo salga "normal", el mensaje lo compromete a un control
// periódico con el especialista (sin alarmarlo). Ante un hallazgo, prioriza consulta.
type RecPDF = {
  badge: string
  rgb: [number, number, number]
  tint: [number, number, number]
  titulo: string
  cuerpo: string
  cuando: string
}

function recomendacionPDF(diag: string | null): RecPDF {
  const d = (diag ?? '').toLowerCase()
  if (d === 'normal') return {
    badge: 'SIN HALLAZGOS', rgb: [22, 101, 52], tint: [240, 253, 244],
    titulo: 'Parámetros dentro de lo normal — conviene mantener control',
    cuerpo: 'No se identificaron hallazgos en este ojo. Aun así, se recomienda una revisión de control con el especialista para confirmar el resultado y establecer un seguimiento periódico de la salud visual.',
    cuando: 'Control sugerido: en 12 meses',
  }
  if (d === 'catarata') return {
    badge: 'REQUIERE EVALUACIÓN', rgb: [146, 64, 14], tint: [255, 251, 235],
    titulo: 'Hallazgo compatible con catarata',
    cuerpo: 'El análisis sugiere signos compatibles con catarata. Se recomienda agendar una consulta con el especialista para confirmar el hallazgo y definir el manejo adecuado.',
    cuando: 'Prioridad: agendar consulta con el especialista',
  }
  if (d === 'pterigion') return {
    badge: 'REQUIERE EVALUACIÓN', rgb: [153, 27, 27], tint: [254, 242, 242],
    titulo: 'Hallazgo compatible con pterigión',
    cuerpo: 'El análisis sugiere un posible pterigión. Se recomienda agendar una consulta con el especialista para confirmar el hallazgo, valorar su grado y definir el seguimiento adecuado.',
    cuando: 'Prioridad: agendar consulta con el especialista',
  }
  return {
    badge: 'REPETIR ESTUDIO', rgb: [71, 85, 105], tint: [248, 250, 252],
    titulo: 'Resultado no concluyente',
    cuerpo: 'El análisis no arrojó un resultado concluyente para este ojo. Se recomienda repetir la captura o acudir con el especialista para una evaluación presencial.',
    cuando: 'Sugerido: nueva evaluación',
  }
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

const ETIQUETA_OJO: Record<string, string> = { OD: 'Ojo derecho (OD)', OI: 'Ojo izquierdo (OI)' }

export default function DiagnosticoCitaPage() {
  const params = useParams()
  const citaId = params?.citaId as string

  const [filas, setFilas] = useState<AnalisisRow[]>([])
  const [paciente, setPaciente] = useState<any>(null)
  const [cargando, setCargando] = useState(true)
  const [origin, setOrigin] = useState('')
  const [generandoPdf, setGenerandoPdf] = useState(false)
  const [reintentandoId, setReintentandoId] = useState<string | null>(null)
  const [guardandoId, setGuardandoId] = useState<string | null>(null)

  // URLs firmadas, indexadas por id de análisis
  const [imgUrls, setImgUrls] = useState<Record<string, string>>({})
  const [camUrls, setCamUrls] = useState<Record<string, string>>({})

  useEffect(() => setOrigin(window.location.origin), [])

  useEffect(() => {
    if (!citaId) return
    ;(async () => {
      const { data } = await supabase
        .from('analisis')
        .select('*')
        .eq('cita_id', citaId)
        .order('ojo', { ascending: true })
      if (data) setFilas(data as AnalisisRow[])
      setCargando(false)
    })()
  }, [citaId])

  useEffect(() => {
    if (!citaId) return
    const channel = supabase
      .channel(`analisis-cita-${citaId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'analisis', filter: `cita_id=eq.${citaId}` },
        (payload) => {
          const actualizado = payload.new as AnalisisRow
          setFilas((prev) => prev.map((f) => (f.id === actualizado.id ? actualizado : f)))
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [citaId])

  // Datos del paciente (toma el paciente_id de cualquier fila, todas comparten el mismo)
  useEffect(() => {
    const pid = filas[0]?.paciente_id
    if (!pid) return
    ;(async () => {
      const { data } = await supabase.from('pacientes').select('*').eq('id', pid).maybeSingle()
      if (data) setPaciente(data)
    })()
  }, [filas[0]?.paciente_id])

  // Firmar URLs de imagen y Grad-CAM para cada fila completada
  useEffect(() => {
    ;(async () => {
      for (const f of filas) {
        if (f.imagen_path && !imgUrls[f.id]) {
          const { data } = await supabase.storage.from('imagenes').createSignedUrl(f.imagen_path, 3600)
          if (data?.signedUrl) setImgUrls((prev) => ({ ...prev, [f.id]: data.signedUrl }))
        }
        if (f.gradcam_path && !camUrls[f.id]) {
          const { data } = await supabase.storage.from('imagenes').createSignedUrl(f.gradcam_path, 3600)
          if (data?.signedUrl) setCamUrls((prev) => ({ ...prev, [f.id]: data.signedUrl }))
        }
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas])

  const pct = (n: number | null | undefined) => (n == null ? '—' : (n * 100).toFixed(1) + '%')

  async function reintentar(fila: AnalisisRow) {
    setReintentandoId(fila.id)
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
        .eq('id', fila.id)
      if (!error) {
        setFilas((prev) => prev.map((f) => f.id === fila.id ? {
          ...f, estado: 'esperando_imagen', imagen_path: null, diagnostico: null,
          confianza: null, probabilidades: null, confianza_ojo: null, gradcam_path: null, mensaje: null,
        } : f))
        setImgUrls((prev) => { const c = { ...prev }; delete c[fila.id]; return c })
        setCamUrls((prev) => { const c = { ...prev }; delete c[fila.id]; return c })
      }
    } finally {
      setReintentandoId(null)
    }
  }

  async function guardarValidacion(fila: AnalisisRow, cambios: Partial<AnalisisRow>) {
    setGuardandoId(fila.id)
    try {
      const payload = {
        ...cambios,
        validado: true,
        validado_at: new Date().toISOString(),
      }
      const { error } = await supabase.from('analisis').update(payload).eq('id', fila.id)
      if (!error) {
        setFilas((prev) => prev.map((f) => f.id === fila.id ? { ...f, ...payload } : f))
      }
    } finally {
      setGuardandoId(null)
    }
  }

  async function generarPDF() {
    setGenerandoPdf(true)
    try {
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({ unit: 'mm', format: 'a4' })
      const W = doc.internal.pageSize.getWidth()
      let y = 0

      // ── Encabezado ────────────────────────────────
      doc.setFillColor(30, 58, 138)
      doc.rect(0, 0, W, 30, 'F')
      let logoOk = false
      try {
        const logoData = await urlToDataUrl('/logo-optica.png')
        const logoImg = await loadImg(logoData)
        const logoH = 14
        const logoW = logoH * (logoImg.width / logoImg.height)
        doc.addImage(logoData, 'PNG', 14, 8, logoW, logoH)
        logoOk = true
      } catch {}
      if (!logoOk) {
        doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(18)
        doc.text('Óptical Vi+', 14, 16)
      }
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
      doc.text('OptiVisionIA', W - 14, 12, { align: 'right' })
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(191, 219, 254)
      doc.text('Reporte de diagnóstico asistido por IA', W - 14, 17.5, { align: 'right' })
      doc.text('Óptical Vi+ · Mixco, Guatemala', W - 14, 22, { align: 'right' })
      // barra tricolor bajo el encabezado
      const segW = W / 3
      doc.setFillColor(30, 58, 138); doc.rect(0, 30, segW, 1.8, 'F')
      doc.setFillColor(13, 148, 136); doc.rect(segW, 30, segW, 1.8, 'F')
      doc.setFillColor(34, 197, 94); doc.rect(segW * 2, 30, segW, 1.8, 'F')
      y = 42

      // Datos del paciente
      doc.setTextColor(15, 23, 42)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
      doc.text('Datos del paciente', 14, y); y += 6
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
      const nombre = paciente ? `${paciente.apellidos ?? ''}, ${paciente.nombres ?? ''}` : '—'
      const exp = paciente?.expediente ? `EXP-${String(paciente.expediente).padStart(6, '0')}` : '—'
      doc.text(`Nombre: ${nombre}`, 14, y); doc.text(`Expediente: ${exp}`, 120, y); y += 5.5
      const edad = calcularEdad(paciente?.fecha_nacimiento)
      doc.text(`DPI: ${paciente?.dpi ?? '—'}`, 14, y)
      doc.text(`Sexo: ${paciente?.sexo ?? '—'}   Edad: ${edad !== null ? edad + ' años' : '—'}`, 120, y); y += 5.5
      const fechaRef = filas[0]?.completado_at ?? filas[0]?.created_at ?? null
      doc.text(`Fecha del análisis: ${fechaRef ? new Date(fechaRef).toLocaleString('es-GT') : '—'}`, 14, y); y += 5.5
      doc.text(`Sesión: ${filas[0]?.codigo_sesion ?? '—'}`, 14, y); y += 9

      // Una sección por ojo
      const colW = (W - 28 - 8) / 2 // dos columnas con 8mm de separación
      const colX = [14, 14 + colW + 8]
      const yInicioOjos = y
      let yMaxAlcanzada = y

      for (let i = 0; i < filas.length; i++) {
        const f = filas[i]
        const x = colX[i] ?? 14
        let yo = yInicioOjos

        doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(15, 23, 42)
        doc.text(f.ojo ? ETIQUETA_OJO[f.ojo] : 'Ojo', x, yo); yo += 6

        const diag = f.diagnostico ?? '—'
        const [r, g, b] = diagRGB(diag)
        doc.setFillColor(248, 250, 252)
        doc.roundedRect(x, yo, colW, 23, 2, 2, 'F')
        doc.setFillColor(r, g, b); doc.rect(x, yo, colW, 1.6, 'F') // acento superior por diagnóstico
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(148, 163, 184)
        doc.text('DIAGNÓSTICO SUGERIDO POR IA', x + 4, yo + 7)
        doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(r, g, b)
        doc.text(diag.toUpperCase(), x + 4, yo + 14.5)
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(71, 85, 105)
        doc.text(`Confianza ${pct(f.confianza)}  ·  Filtro de calidad ${pct(f.confianza_ojo)}`, x + 4, yo + 20)
        yo += 28

        // Probabilidades compactas
        // El desglose de las 3 clases ya no se imprime en el PDF (queda solo
        // diagnóstico + confianza). El dato completo sigue disponible en
        // f.probabilidades para consulta interna / historial / tesis.
        yo += 4

        // Validación clínica, si existe — con ajuste de línea para no desbordar la columna
        if (f.validado && f.diagnostico_real) {
          doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(15, 23, 42)
          doc.text('Validación clínica:', x, yo); yo += 4
          doc.setFont('helvetica', 'normal')
          const textoValidacion = `Diagnóstico real: ${f.diagnostico_real}${f.grado ? ' (' + f.grado + ')' : ''}`
          const lineasValidacion: string[] = doc.splitTextToSize(textoValidacion, colW)
          doc.text(lineasValidacion, x, yo)
          yo += lineasValidacion.length * 3.8 + 2

          if (f.observaciones) {
            doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5); doc.setTextColor(71, 85, 105)
            const lineasObs: string[] = doc.splitTextToSize(`Obs.: ${f.observaciones}`, colW)
            doc.text(lineasObs, x, yo)
            yo += lineasObs.length * 3.5 + 2
            doc.setFont('helvetica', 'normal'); doc.setTextColor(15, 23, 42)
          }
          yo += 2
        }

        // Recomendación para el paciente (control si es normal; consulta si hay hallazgo)
        {
          const rec = recomendacionPDF(f.diagnostico)
          const titLines: string[] = doc.splitTextToSize(rec.titulo, colW - 8)
          const cuerpoLines: string[] = doc.splitTextToSize(rec.cuerpo, colW - 8)
          const boxH = 6 + titLines.length * 4 + 1.5 + cuerpoLines.length * 3.5 + 5.5 + 5
          doc.setFillColor(rec.tint[0], rec.tint[1], rec.tint[2])
          doc.roundedRect(x, yo, colW, boxH, 2, 2, 'F')
          doc.setFillColor(rec.rgb[0], rec.rgb[1], rec.rgb[2]); doc.rect(x, yo, 1.4, boxH, 'F') // barra lateral
          let ry = yo + 5
          doc.setFont('helvetica', 'bold'); doc.setFontSize(6.2); doc.setTextColor(rec.rgb[0], rec.rgb[1], rec.rgb[2])
          doc.text(`${rec.badge}  ·  RECOMENDACIÓN PARA EL PACIENTE`, x + 4, ry); ry += 4.5
          doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(15, 23, 42)
          doc.text(titLines, x + 4, ry); ry += titLines.length * 4 + 1.5
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(71, 85, 105)
          doc.text(cuerpoLines, x + 4, ry); ry += cuerpoLines.length * 3.5 + 1.5
          doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(rec.rgb[0], rec.rgb[1], rec.rgb[2])
          doc.text(rec.cuando, x + 4, ry)
          yo += boxH + 5
        }

        // Imagen + Grad-CAM, lado a lado dentro de la columna
        const imW = (colW - 4) / 2
        const imgData = imgUrls[f.id] ? await urlToDataUrl(imgUrls[f.id]).catch(() => null) : null
        const camData = camUrls[f.id] ? await urlToDataUrl(camUrls[f.id]).catch(() => null) : null
        if (imgData) doc.addImage(imgData, 'JPEG', x, yo, imW, imW)
        if (camData) doc.addImage(camData, 'PNG', x + imW + 4, yo, imW, imW)
        yo += imW + 4

        yMaxAlcanzada = Math.max(yMaxAlcanzada, yo)
      }

      y = yMaxAlcanzada + 8

      // ── Información clínica educativa (A7) ──────────────────────────
      // Texto fijo por tipo de diagnóstico, una sola vez por reporte
      // (si OD y OI comparten diagnóstico, no se repite el bloque).
      const diagnosticosUnicos = Array.from(
        new Set(filas.map((f) => f.diagnostico).filter((d): d is string => !!d))
      )

      for (const diagKey of diagnosticosUnicos) {
        const contenido = (CONTENIDO_CLINICO as Record<string, typeof CONTENIDO_CLINICO['catarata']>)[diagKey]
        if (!contenido) continue

        // Salto de página si no cabe ni el título + 2 líneas de descripción
        if (y > doc.internal.pageSize.getHeight() - 50) {
          doc.addPage()
          y = 20
        }

        doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(15, 23, 42)
        doc.text(contenido.titulo, 14, y); y += 6

        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(51, 65, 85)
        const lineasDesc: string[] = doc.splitTextToSize(contenido.descripcion, W - 28)
        doc.text(lineasDesc, 14, y); y += lineasDesc.length * 4.2 + 4

        if (contenido.caracteristicas.length > 0) {
          doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(15, 23, 42)
          doc.text('Características frecuentes:', 14, y); y += 5
          doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
          for (const item of contenido.caracteristicas) {
            if (y > doc.internal.pageSize.getHeight() - 25) { doc.addPage(); y = 20 }
            const lineasItem: string[] = doc.splitTextToSize(`•  ${item}`, W - 32)
            doc.text(lineasItem, 18, y); y += lineasItem.length * 4.2 + 1.5
          }
          y += 2
        }

        if (contenido.notaImportante) {
          if (y > doc.internal.pageSize.getHeight() - 30) { doc.addPage(); y = 20 }
          doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(100, 116, 139)
          const lineasNota: string[] = doc.splitTextToSize(contenido.notaImportante, W - 28)
          doc.text(lineasNota, 14, y); y += lineasNota.length * 4 + 2
          doc.setFont('helvetica', 'normal')
        }

        y += 6
      }

      if (y > doc.internal.pageSize.getHeight() - 35) { doc.addPage(); y = 20 }

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

  const wrap: React.CSSProperties = { maxWidth: 980, margin: '0 auto', padding: '2rem 1rem', color: 'var(--text)' }

  if (cargando) return <main style={wrap}><p>Cargando…</p></main>
  if (filas.length === 0) return <main style={wrap}><p>No se encontró ningún análisis para esta cita.</p></main>

  const codigoSesion = filas[0]?.codigo_sesion
  const hayCompletados = filas.some((f) => f.estado === 'completado')

  return (
    <main style={wrap}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Diagnóstico asistido por IA</h1>
        <p style={{ opacity: 0.6, fontSize: '0.85rem' }}>
          Sesión {codigoSesion} {paciente && `· ${paciente.apellidos}, ${paciente.nombres}`}
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: filas.length > 1 ? 'repeat(auto-fit, minmax(260px, 1fr))' : '1fr',
        gap: '1.25rem',
      }}>
        {filas.map((f) => (
          <ColumnaOjo
            key={f.id}
            fila={f}
            origin={origin}
            imgUrl={imgUrls[f.id]}
            camUrl={camUrls[f.id]}
            reintentando={reintentandoId === f.id}
            guardando={guardandoId === f.id}
            onReintentar={() => reintentar(f)}
            onGuardarValidacion={(cambios) => guardarValidacion(f, cambios)}
          />
        ))}
      </div>

      {hayCompletados && (
        <button
          onClick={generarPDF}
          disabled={generandoPdf}
          style={{
            marginTop: '1.5rem', padding: '0.85rem 1.5rem', borderRadius: 10, border: 'none',
            background: generandoPdf ? '#94a3b8' : '#1d4ed8', color: '#fff',
            fontWeight: 600, cursor: generandoPdf ? 'not-allowed' : 'pointer',
          }}
        >
          {generandoPdf ? 'Generando PDF…' : 'Descargar reporte PDF (ambos ojos)'}
        </button>
      )}

      <p style={{ fontSize: '0.8rem', opacity: 0.6, lineHeight: 1.5, marginTop: '1.25rem' }}>
        Este resultado es una herramienta de apoyo diagnóstico y no sustituye la evaluación de un profesional de la salud visual. El optometrista debe validar el hallazgo.
      </p>
    </main>
  )
}

// ============================================================
// Columna individual por ojo
// ============================================================
function ColumnaOjo({
  fila, origin, imgUrl, camUrl, reintentando, guardando, onReintentar, onGuardarValidacion,
}: {
  fila: AnalisisRow
  origin: string
  imgUrl?: string
  camUrl?: string
  reintentando: boolean
  guardando: boolean
  onReintentar: () => void
  onGuardarValidacion: (cambios: Partial<AnalisisRow>) => void
}) {
  const card: React.CSSProperties = { background: 'var(--input-bg, #1e293b)', borderRadius: 16, padding: '1.25rem' }
  const pct = (n: number | null | undefined) => (n == null ? '—' : (n * 100).toFixed(1) + '%')
  const colorDiag = fila.diagnostico ? (COLOR_DIAG[fila.diagnostico] ?? '#2563eb') : '#2563eb'

  const tituloOjo = fila.ojo ? ETIQUETA_OJO[fila.ojo] : 'Ojo'

  const Etiqueta = (
    <p style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '1rem', opacity: 0.9 }}>{tituloOjo}</p>
  )

  if (fila.estado === 'esperando_imagen') {
    const url = `${origin}/captura?sesion=${fila.codigo_sesion}`
    return (
      <div style={{ ...card, textAlign: 'center' }}>
        {Etiqueta}
        <p style={{ marginBottom: '1.25rem', opacity: 0.85, fontSize: '0.9rem' }}>Esperando la imagen del teléfono.</p>
        <div style={{ background: '#fff', padding: '1rem', borderRadius: 12, display: 'inline-block' }}>
          <QRCode value={url} size={160} />
        </div>
        <p style={{ marginTop: '0.75rem', fontSize: '1.2rem', fontWeight: 700, letterSpacing: '0.15rem' }}>{fila.codigo_sesion}</p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-block', marginTop: '0.6rem', maxWidth: '100%',
            fontSize: '0.72rem', color: '#2563eb', textDecoration: 'none', wordBreak: 'break-all',
          }}
        >
          {url}
        </a>
        <p style={{ marginTop: '0.5rem', fontSize: '0.72rem', opacity: 0.7, lineHeight: 1.5 }}>
          Desde el mismo teléfono, toca el enlace para abrir la captura sin escanear.
        </p>
      </div>
    )
  }

  if (fila.estado === 'pendiente' || fila.estado === 'procesando') {
    return (
      <div style={{
        position: 'relative', borderRadius: 16, padding: '1.5rem 1.25rem',
        background: 'linear-gradient(180deg, #101c33, #0b1322)',
        border: '1px solid rgba(148,197,255,0.14)', overflow: 'hidden',
      }}>
        <p style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.25rem', opacity: 0.95, position: 'relative' }}>{tituloOjo}</p>
        <AnimacionPipeline ojo={fila.ojo ?? ''} />
      </div>
    )
  }

  const BotonReintentar = (
    <button
      onClick={onReintentar}
      disabled={reintentando}
      style={{
        padding: '0.6rem 1rem', borderRadius: 10, border: '1px solid var(--border, #475569)',
        background: 'transparent', color: 'var(--text)', fontWeight: 600,
        cursor: reintentando ? 'not-allowed' : 'pointer', marginTop: '0.75rem', fontSize: '0.85rem',
      }}
    >
      {reintentando ? 'Reiniciando…' : 'Volver a escanear este ojo'}
    </button>
  )

  if (fila.estado === 'rechazada_stage1') {
    return (
      <div style={{ ...card, borderLeft: '4px solid #d97706' }}>
        {Etiqueta}
        <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>Imagen rechazada</h2>
        <p style={{ opacity: 0.85, fontSize: '0.9rem' }}>{fila.mensaje ?? 'La imagen no parece ser un ojo.'}</p>
        <p style={{ marginTop: '0.75rem', fontSize: '0.8rem', opacity: 0.7 }}>Confianza del filtro: {pct(fila.confianza_ojo)}</p>
        {BotonReintentar}
      </div>
    )
  }

  if (fila.estado === 'no_clasificable') {
    return (
      <div style={{ ...card, borderLeft: '4px solid #64748b' }}>
        {Etiqueta}
        <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>Sin diagnóstico concluyente</h2>
        <p style={{ opacity: 0.85, fontSize: '0.9rem' }}>{fila.mensaje ?? 'La confianza no alcanzó el umbral.'}</p>
        {BotonReintentar}
      </div>
    )
  }

  if (fila.estado === 'error') {
    return (
      <div style={{ ...card, borderLeft: '4px solid #dc2626' }}>
        {Etiqueta}
        <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>Error en el procesamiento</h2>
        <p style={{ opacity: 0.85, fontSize: '0.9rem' }}>{fila.mensaje ?? 'Ocurrió un error.'}</p>
        {BotonReintentar}
      </div>
    )
  }

  // completado
  const diag = fila.diagnostico ?? '—'
  const probs = fila.probabilidades ?? {}

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ ...card, borderTop: `4px solid ${colorDiag}` }}>
        {Etiqueta}
        <p style={{ opacity: 0.6, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05rem' }}>Diagnóstico sugerido</p>
        <p style={{ fontSize: '1.6rem', fontWeight: 800, color: colorDiag, textTransform: 'capitalize' }}>{diag}</p>
        <p style={{ fontSize: '0.95rem', opacity: 0.85 }}>Confianza: {pct(fila.confianza)}</p>
      </div>

      <div style={card}>
        <p style={{ fontWeight: 600, marginBottom: '0.6rem', fontSize: '0.9rem' }}>Probabilidades</p>
        {CLASES.map((c) => {
          const v = probs[c] ?? 0
          return (
            <div key={c} style={{ marginBottom: '0.6rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.2rem' }}>
                <span style={{ textTransform: 'capitalize' }}>{c}</span><span>{pct(v)}</span>
              </div>
              <div style={{ height: 8, background: 'rgba(148,163,184,0.25)', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ width: `${v * 100}%`, height: '100%', background: COLOR_DIAG[c] ?? '#2563eb', transition: 'width 0.6s ease' }} />
              </div>
            </div>
          )
        })}
        <p style={{ marginTop: '0.6rem', fontSize: '0.75rem', opacity: 0.7 }}>Filtro de calidad: {pct(fila.confianza_ojo)}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
        <div style={card}>
          <p style={{ fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.8rem' }}>Imagen</p>
          {imgUrl ? <img src={imgUrl} alt="Ojo" style={{ width: '100%', borderRadius: 8 }} /> : <p style={{ opacity: 0.5, fontSize: '0.8rem' }}>—</p>}
        </div>
        <div style={card}>
          <p style={{ fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.8rem' }}>Grad-CAM</p>
          {camUrl ? <img src={camUrl} alt="Grad-CAM" style={{ width: '100%', borderRadius: 8 }} /> : <p style={{ opacity: 0.5, fontSize: '0.8rem' }}>—</p>}
        </div>
      </div>

      <WidgetValidacion fila={fila} guardando={guardando} onGuardar={onGuardarValidacion} />

      <div style={{ textAlign: 'center' }}>{BotonReintentar}</div>
    </div>
  )
}

// ============================================================
// Widget de validación clínica (Escenario A y B)
// ============================================================
function WidgetValidacion({
  fila, guardando, onGuardar,
}: {
  fila: AnalisisRow
  guardando: boolean
  onGuardar: (cambios: Partial<AnalisisRow>) => void
}) {
  const [diagnosticoReal, setDiagnosticoReal] = useState(fila.diagnostico_real ?? fila.diagnostico ?? '')
  const [grado, setGrado] = useState(fila.grado ?? '')
  const [observaciones, setObservaciones] = useState(fila.observaciones ?? '')

  const card: React.CSSProperties = { background: 'var(--input-bg, #1e293b)', borderRadius: 16, padding: '1.25rem' }
  const inputStyle: React.CSSProperties = {
    width: '100%', borderRadius: 8, padding: '0.5rem 0.7rem', fontSize: '0.85rem',
    border: '1px solid var(--input-border, #475569)', backgroundColor: 'var(--input-bg, #0f172a)', color: 'var(--input-text, #f1f5f9)',
  }

  const yaValidado = !!fila.validado

  function guardar() {
    if (!diagnosticoReal) return
    onGuardar({
      diagnostico_real: diagnosticoReal as AnalisisRow['diagnostico_real'],
      grado: diagnosticoReal === 'pterigion' ? (grado || null) : null,
      observaciones: observaciones || null,
    })
  }

  return (
    <div style={{ ...card, border: yaValidado ? '1px solid #16a34a' : '1px solid #475569' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <p style={{ fontWeight: 700, fontSize: '0.9rem' }}>Validación clínica</p>
        <span style={{
          fontSize: '0.7rem', fontWeight: 600, padding: '0.2rem 0.55rem', borderRadius: 999,
          background: yaValidado ? 'rgba(22,163,74,0.2)' : 'rgba(148,163,184,0.2)',
          color: yaValidado ? '#16a34a' : '#94a3b8',
        }}>
          {yaValidado ? 'Validado ✓' : 'Sin validar'}
        </span>
      </div>

      <label style={{ display: 'block', fontSize: '0.75rem', opacity: 0.7, marginBottom: '0.25rem' }}>
        Diagnóstico real (confirmado por el optometrista)
      </label>
      <select value={diagnosticoReal} onChange={(e) => setDiagnosticoReal(e.target.value)} style={{ ...inputStyle, marginBottom: '0.75rem' }}>
        <option value="">— Seleccionar —</option>
        <option value="catarata">Catarata</option>
        <option value="normal">Normal</option>
        <option value="pterigion">Pterigión</option>
      </select>

      {diagnosticoReal === 'pterigion' && (
        <>
          <label style={{ display: 'block', fontSize: '0.75rem', opacity: 0.7, marginBottom: '0.25rem' }}>
            Grado de pterigión
          </label>
          <select value={grado} onChange={(e) => setGrado(e.target.value)} style={{ ...inputStyle, marginBottom: '0.75rem' }}>
            <option value="">— Seleccionar —</option>
            {GRADOS_PTERIGION.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </>
      )}

      <label style={{ display: 'block', fontSize: '0.75rem', opacity: 0.7, marginBottom: '0.25rem' }}>
        Observaciones (opcional)
      </label>
      <textarea
        value={observaciones}
        onChange={(e) => setObservaciones(e.target.value)}
        rows={2}
        style={{ ...inputStyle, resize: 'none', marginBottom: '0.75rem' }}
      />

      {fila.diagnostico && diagnosticoReal && (
        <p style={{ fontSize: '0.75rem', marginBottom: '0.75rem', color: diagnosticoReal === fila.diagnostico ? '#16a34a' : '#dc2626' }}>
          {diagnosticoReal === fila.diagnostico
            ? '✓ Coincide con el diagnóstico del modelo'
            : `✗ No coincide (modelo dijo: ${fila.diagnostico})`}
        </p>
      )}

      <button
        onClick={guardar}
        disabled={guardando || !diagnosticoReal}
        style={{
          width: '100%', padding: '0.6rem', borderRadius: 8, border: 'none',
          background: !diagnosticoReal ? '#94a3b8' : guardando ? '#94a3b8' : '#1d4ed8',
          color: '#fff', fontWeight: 600, fontSize: '0.85rem',
          cursor: guardando || !diagnosticoReal ? 'not-allowed' : 'pointer',
        }}
      >
        {guardando ? 'Guardando…' : yaValidado ? 'Actualizar validación' : 'Guardar validación'}
      </button>
    </div>
  )
}

// ============================================================
// Animación del pipeline (Stage-1 → Stage-2) — escáner neuronal
//
// IMPORTANTE: esta es una animación REPRESENTATIVA con tiempos
// estimados, no una telemetría real del worker. El worker en Python
// procesa ambas etapas en un solo paso y solo escribe el resultado
// final en Supabase — no reporta progreso intermedio. Esta animación
// simula visualmente la secuencia (filtro de calidad → clasificación)
// para comunicar el flujo del sistema durante la espera, sin requerir
// cambios en el pipeline de inferencia.
// ============================================================
const KEYFRAMES_PIPELINE = `
@keyframes ovp-spin{ to{ transform:rotate(360deg); } }
@keyframes ovp-spinrev{ to{ transform:rotate(-360deg); } }
@keyframes ovp-beam{ 0%{ transform:translateY(-130%); opacity:0; } 12%{ opacity:1; } 88%{ opacity:1; } 100%{ transform:translateY(130%); opacity:0; } }
@keyframes ovp-pulse{ 0%{ transform:scale(0.55); opacity:0.85; } 100%{ transform:scale(1.55); opacity:0; } }
@keyframes ovp-blink{ 0%,100%{ opacity:1; } 50%{ opacity:0.25; } }
@keyframes ovp-grid{ to{ transform:translateY(28px); } }
@keyframes ovp-comet{ 0%{ left:-6%; opacity:0; } 8%{ opacity:1; } 92%{ opacity:1; } 100%{ left:104%; opacity:0; } }
@keyframes ovp-shim{ to{ background-position:-200% 0; } }
@keyframes ovp-p1{ 0%,100%{ width:32%; } 25%{ width:61%; } 55%{ width:40%; } 78%{ width:69%; } }
@keyframes ovp-p2{ 0%,100%{ width:48%; } 30%{ width:24%; } 60%{ width:58%; } 85%{ width:36%; } }
@keyframes ovp-p3{ 0%,100%{ width:55%; } 22%{ width:38%; } 50%{ width:72%; } 80%{ width:44%; } }
@keyframes ovp-node{ 0%,100%{ opacity:0.35; transform:scale(0.8); } 50%{ opacity:1; transform:scale(1.25); } }
`

const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"

function AnimacionPipeline({ ojo }: { ojo: string }) {
  const [etapa, setEtapa] = useState<1 | 2>(1)
  useEffect(() => {
    const t = setTimeout(() => setEtapa(2), 1900)
    return () => clearTimeout(t)
  }, [])

  const cyan = '#38bdf8', teal = '#2dd4bf', violet = '#a78bfa', azure = '#60a5fa', muted = '#8294b2'
  const mask = { WebkitMask: '', mask: '' } // placeholder para tipado

  return (
    <div style={{ position: 'relative' }}>
      <style>{KEYFRAMES_PIPELINE}</style>

      {/* grid de fondo en movimiento */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'linear-gradient(rgba(96,165,250,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(96,165,250,0.07) 1px, transparent 1px)',
        backgroundSize: '28px 28px', animation: 'ovp-grid 5.5s linear infinite',
        WebkitMaskImage: 'radial-gradient(120% 90% at 50% 30%, #000 30%, transparent 80%)',
        maskImage: 'radial-gradient(120% 90% at 50% 30%, #000 30%, transparent 80%)',
        pointerEvents: 'none',
      }} />

      {/* HUD header */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0.25rem 0 0.75rem' }}>
        <span style={{ fontFamily: MONO, fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.14em', color: '#9cc4ff' }}>
          ANÁLISIS NEURONAL{ojo ? ' · ' + ojo : ''}
        </span>
        <span style={{ fontFamily: MONO, fontSize: '0.7rem', color: cyan, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: cyan, boxShadow: `0 0 8px ${cyan}`, animation: 'ovp-blink 0.9s ease-in-out infinite' }} />LIVE
        </span>
      </div>

      {/* Escáner de iris */}
      <div style={{ position: 'relative', height: 248, display: 'grid', placeItems: 'center' }}>
        {/* anillos de pulso */}
        {[0, 0.9, 1.8].map((d, i) => (
          <div key={i} style={{
            position: 'absolute', width: 188, height: 188, borderRadius: '50%',
            border: `1px solid ${['rgba(56,189,248,0.55)', 'rgba(45,212,191,0.45)', 'rgba(167,139,250,0.4)'][i]}`,
            animation: 'ovp-pulse 2.8s ease-out infinite', animationDelay: `${d}s`,
          }} />
        ))}

        {/* anillo punteado exterior */}
        <div style={{ position: 'absolute', width: 236, height: 236, borderRadius: '50%', border: '1px dashed rgba(96,165,250,0.35)', animation: 'ovp-spinrev 16s linear infinite' }} />
        {/* anillo de marcas */}
        <div style={{
          position: 'absolute', width: 212, height: 212, borderRadius: '50%',
          background: 'repeating-conic-gradient(from 0deg, rgba(156,196,255,0.45) 0deg 1.2deg, transparent 1.2deg 9deg)',
          WebkitMaskImage: 'radial-gradient(circle, transparent 60%, #000 61%, #000 66%, transparent 67%)',
          maskImage: 'radial-gradient(circle, transparent 60%, #000 61%, #000 66%, transparent 67%)',
          animation: 'ovp-spin 24s linear infinite',
        }} />

        {/* iris */}
        <div style={{
          position: 'relative', width: 182, height: 182, borderRadius: '50%', overflow: 'hidden',
          boxShadow: '0 0 0 1px rgba(56,189,248,0.5), 0 0 40px rgba(56,189,248,0.35), inset 0 0 30px rgba(2,8,20,0.9)',
        }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 50%, #0a1426 0 13%, #0e7490 15% 21%, #0891b2 21% 33%, #155e75 33% 50%, #1e3a8a 50% 70%, #0b1a36 72% 88%, #060c18 90%)' }} />
          {/* fibras */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'repeating-conic-gradient(from 0deg at 50% 50%, rgba(125,211,252,0.16) 0deg 2deg, transparent 2deg 5deg)',
            WebkitMaskImage: 'radial-gradient(circle, transparent 14%, #000 16%, #000 70%, transparent 74%)',
            maskImage: 'radial-gradient(circle, transparent 14%, #000 16%, #000 70%, transparent 74%)',
            animation: 'ovp-spin 40s linear infinite',
          }} />
          {/* pupila */}
          <div style={{ position: 'absolute', top: '50%', left: '50%', width: 54, height: 54, transform: 'translate(-50%,-50%)', borderRadius: '50%', background: 'radial-gradient(circle at 42% 38%, #1b2940 0%, #060a14 70%)', boxShadow: 'inset 0 0 18px rgba(56,189,248,0.5), 0 0 0 1px rgba(56,189,248,0.4)' }} />
          {/* brillo especular */}
          <div style={{ position: 'absolute', top: '38%', left: '40%', width: 14, height: 14, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.9), transparent 70%)', filter: 'blur(1px)' }} />
          {/* haz de barrido */}
          <div style={{ position: 'absolute', left: '-10%', top: '50%', width: '120%', height: 3, background: `linear-gradient(90deg, transparent, ${cyan}, #ffffff, ${cyan}, transparent)`, boxShadow: '0 0 14px 3px rgba(56,189,248,0.7)', animation: 'ovp-beam 2.4s cubic-bezier(.45,0,.55,1) infinite' }} />
          {/* retícula */}
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, background: 'rgba(156,196,255,0.25)' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: 'rgba(156,196,255,0.25)' }} />
          {/* puntos de característica */}
          {[
            { t: '30%', l: '28%', c: teal, d: '0s' },
            { t: '62%', l: '36%', c: cyan, d: '0.4s' },
            { t: '40%', l: '68%', c: violet, d: '0.8s' },
            { t: '70%', l: '62%', c: azure, d: '1.1s' },
          ].map((p, i) => (
            <div key={i} style={{ position: 'absolute', top: p.t, left: p.l, width: 6, height: 6, borderRadius: '50%', background: p.c, boxShadow: `0 0 8px ${p.c}`, animation: 'ovp-blink 1.4s ease-in-out infinite', animationDelay: p.d }} />
          ))}
        </div>

        {/* sweep cónico giratorio */}
        <div style={{
          position: 'absolute', width: 200, height: 200, borderRadius: '50%',
          background: 'conic-gradient(from 0deg, transparent 0 64%, rgba(56,189,248,0) 64%, rgba(56,189,248,0.45) 86%, rgba(255,255,255,0.55) 96%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(circle, transparent 47%, #000 49%)',
          maskImage: 'radial-gradient(circle, transparent 47%, #000 49%)',
          animation: 'ovp-spin 2.6s linear infinite',
        }} />

        {/* corchetes HUD */}
        <div style={{ position: 'absolute', width: 228, height: 228 }}>
          <div style={{ position: 'absolute', top: 0, left: 0, width: 22, height: 22, borderTop: `2px solid ${cyan}`, borderLeft: `2px solid ${cyan}`, animation: 'ovp-blink 2.4s ease-in-out infinite' }} />
          <div style={{ position: 'absolute', top: 0, right: 0, width: 22, height: 22, borderTop: `2px solid ${cyan}`, borderRight: `2px solid ${cyan}`, animation: 'ovp-blink 2.4s ease-in-out infinite', animationDelay: '0.3s' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, width: 22, height: 22, borderBottom: `2px solid ${cyan}`, borderLeft: `2px solid ${cyan}`, animation: 'ovp-blink 2.4s ease-in-out infinite', animationDelay: '0.6s' }} />
          <div style={{ position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, borderBottom: `2px solid ${cyan}`, borderRight: `2px solid ${cyan}`, animation: 'ovp-blink 2.4s ease-in-out infinite', animationDelay: '0.9s' }} />
        </div>
      </div>

      {/* Pipeline de etapas */}
      <div style={{ position: 'relative', marginTop: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: '0.55rem', padding: '0.55rem 0.75rem', borderRadius: 10,
          background: etapa === 1 ? 'rgba(56,189,248,0.1)' : 'rgba(56,189,248,0.05)',
          border: `1px solid ${etapa === 1 ? 'rgba(56,189,248,0.35)' : 'rgba(56,189,248,0.18)'}`,
          opacity: etapa === 1 ? 1 : 0.65,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: cyan, boxShadow: `0 0 9px ${cyan}`, animation: etapa === 1 ? 'ovp-blink 1s ease-in-out infinite' : 'none' }} />
          <div>
            <div style={{ fontFamily: MONO, fontSize: '0.6rem', letterSpacing: '0.1em', color: muted }}>ETAPA 01</div>
            <div style={{ fontSize: '0.78rem', fontWeight: 600 }}>Filtro de calidad</div>
          </div>
        </div>
        <div style={{ position: 'relative', flex: '0 0 46px', height: 2, background: 'linear-gradient(90deg, rgba(56,189,248,0.5), rgba(167,139,250,0.5))' }}>
          <div style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', width: 10, height: 10, borderRadius: '50%', background: '#fff', boxShadow: `0 0 12px 3px ${cyan}`, animation: 'ovp-comet 1.8s ease-in-out infinite' }} />
        </div>
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: '0.55rem', padding: '0.55rem 0.75rem', borderRadius: 10,
          background: etapa === 2 ? 'rgba(167,139,250,0.12)' : 'rgba(167,139,250,0.05)',
          border: `1px solid ${etapa === 2 ? 'rgba(167,139,250,0.4)' : 'rgba(167,139,250,0.2)'}`,
          opacity: etapa === 2 ? 1 : 0.65,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: violet, animation: 'ovp-node 1.4s ease-in-out infinite' }} />
          <div>
            <div style={{ fontFamily: MONO, fontSize: '0.6rem', letterSpacing: '0.1em', color: muted }}>ETAPA 02</div>
            <div style={{ fontSize: '0.78rem', fontWeight: 600 }}>Clasificación</div>
          </div>
        </div>
      </div>

      {/* Barras de probabilidad "vibrando" */}
      <div style={{ marginTop: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {[
          { c: 'catarata', grad: 'linear-gradient(90deg, #f59e0b, #fcd34d, #f59e0b)', anim: 'ovp-p1 3.1s ease-in-out infinite, ovp-shim 1.3s linear infinite' },
          { c: 'normal', grad: 'linear-gradient(90deg, #22c55e, #86efac, #22c55e)', anim: 'ovp-p2 3.4s ease-in-out infinite, ovp-shim 1.3s linear infinite' },
          { c: 'pterigión', grad: 'linear-gradient(90deg, #f43f5e, #fda4af, #f43f5e)', anim: 'ovp-p3 2.9s ease-in-out infinite, ovp-shim 1.3s linear infinite' },
        ].map((b) => (
          <div key={b.c}>
            <div style={{ fontFamily: MONO, fontSize: '0.62rem', color: muted, marginBottom: '0.3rem' }}>{b.c}</div>
            <div style={{ height: 7, borderRadius: 6, background: 'rgba(148,163,184,0.16)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 6, background: b.grad, backgroundSize: '200% 100%', animation: b.anim, opacity: etapa === 2 ? 1 : 0.4 }} />
            </div>
          </div>
        ))}
      </div>

      {/* Estado clínico (lo que la IA está revisando) */}
      <div style={{ fontFamily: MONO, marginTop: '1.1rem', paddingTop: '0.85rem', borderTop: '1px solid rgba(148,197,255,0.1)', fontSize: '0.66rem', color: muted, lineHeight: 1.7 }}>
        {etapa === 1 ? (
          <div style={{ color: cyan }}>
            › Verificando que la imagen sea un ojo · nitidez e iluminación
            <span style={{ display: 'inline-block', width: 8, color: cyan, animation: 'ovp-blink 0.8s step-end infinite' }}>▌</span>
          </div>
        ) : (
          <>
            <div style={{ color: teal }}>› Imagen válida · nitidez e iluminación verificadas ✓</div>
            <div>
              › Comparando con patrones de catarata, normal y pterigión
              <span style={{ display: 'inline-block', width: 8, color: cyan, animation: 'ovp-blink 0.8s step-end infinite' }}>▌</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
