// frontend/app/captura/page.tsx

'use client'

import { Suspense, useEffect, useState, useCallback, useRef, memo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Cropper, { Area } from 'react-easy-crop'
import { supabase } from '@/lib/supabase'
import {
  iniciarStreamCamara, detenerStream, capturarMejoresFrames, dataUrlABlob,
  type FrameCapturado,
} from '@/lib/capturaVideo'

const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"

type EstadoVista =
  | 'validando' | 'lista' | 'grabando' | 'eligiendo' | 'recortar'
  | 'subiendo' | 'enviada' | 'invalida' | 'error'
type Ojo = 'OD' | 'OI'

type RegistroOjo = {
  id: string
  ojo: Ojo | null
  estado: string
}

const ETIQUETA_OJO: Record<Ojo, string> = {
  OD: 'Ojo derecho (OD)',
  OI: 'Ojo izquierdo (OI)',
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.addEventListener('load', () => resolve(img))
    img.addEventListener('error', (e) => reject(e))
    img.src = url
  })
}

async function getCroppedBlob(imageSrc: string, crop: Area): Promise<Blob> {
  const image = await createImage(imageSrc)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const size = 512
  canvas.width = size
  canvas.height = size
  ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, size, size)
  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b as Blob), 'image/jpeg', 0.92)
  )
}

// ── Barra tricolor de marca (Óptica Vi+) ───────────────────────────
function BarraMarca({ ancho = 54 }: { ancho?: number }) {
  return (
    <div style={{ display: 'flex', height: 3, width: ancho, borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ flex: 1, background: '#1e3a8a' }} />
      <div style={{ flex: 1, background: '#0d9488' }} />
      <div style={{ flex: 1, background: '#22c55e' }} />
    </div>
  )
}

function CapturaInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const codigoSesion = searchParams.get('sesion')
  const [citaId, setCitaId] = useState<string | null>(null)

  // Bloquea el pinch-zoom nativo del navegador SOLO mientras esta página
  // está montada. El Cropper (react-easy-crop) maneja su propio zoom vía
  // JS; si el navegador también intenta hacer zoom de página con el mismo
  // gesto de dos dedos, ambos compiten y se ve como un destello/flash al
  // recortar. Al salir de /captura, se restaura el viewport original para
  // no afectar el zoom nativo en el resto de la app (pacientes, citas, etc).
  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]')
    const contenidoOriginal = meta?.getAttribute('content') ?? 'width=device-width, initial-scale=1'
    if (meta) {
      meta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    }
    return () => {
      if (meta) meta.setAttribute('content', contenidoOriginal)
    }
  }, [])

  const [vista, setVista] = useState<EstadoVista>('validando')
  const [pendientes, setPendientes] = useState<RegistroOjo[]>([])
  const [mensaje, setMensaje] = useState('')

  const [imageSrc, setImageSrc] = useState<string | null>(null)

  // ── Modo B: video en vivo + selección del mejor frame ──────────────
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [frames, setFrames] = useState<FrameCapturado[]>([])
  const [errorCamara, setErrorCamara] = useState<string | null>(null)
  const [progresoGrabacion, setProgresoGrabacion] = useState(0) // 0-100

  // El registro que se está capturando ahora es siempre pendientes[0].
  const registroActual = pendientes[0] ?? null

  useEffect(() => {
    async function validar() {
      if (!codigoSesion) { setVista('invalida'); setMensaje('No se encontró el código de sesión en el enlace.'); return }

      const { data, error } = await supabase
        .from('analisis')
        .select('id, ojo, estado, cita_id')
        .eq('codigo_sesion', codigoSesion)
        .order('ojo', { ascending: true }) // 'OD' < 'OI' alfabéticamente, así OD siempre va primero

      if (error) { setVista('error'); setMensaje('Error al validar la sesión: ' + error.message); return }
      if (!data || data.length === 0) { setVista('invalida'); setMensaje('La sesión no existe o expiró.'); return }

      setCitaId((data[0] as { cita_id?: string | null })?.cita_id ?? null)

      const enEspera = data.filter((r) => r.estado === 'esperando_imagen') as RegistroOjo[]

      if (enEspera.length === 0) {
        setVista('invalida')
        setMensaje('Esta sesión ya recibió las imágenes necesarias.')
        return
      }

      setPendientes(enEspera)
      setVista('lista')
    }
    validar()
  }, [codigoSesion])

  // Limpieza: si el componente se desmonta mientras la cámara está
  // activa (el usuario navega fuera a medio proceso), se libera el
  // stream para no dejar la cámara encendida en segundo plano.
  useEffect(() => {
    return () => { detenerStream(streamRef.current) }
  }, [])

  function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setImageSrc(reader.result as string)
      setVista('recortar')
    }
    reader.readAsDataURL(file)
  }

  async function iniciarModoVideo() {
    setErrorCamara(null)
    try {
      const stream = await iniciarStreamCamara()
      streamRef.current = stream
      setVista('grabando')
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(() => {})
        }
      }, 0)
    } catch (err: any) {
      setErrorCamara(
        err?.name === 'NotAllowedError'
          ? 'Permiso de cámara denegado. Puedes usar "Tomar fotografía" en su lugar.'
          : 'No se pudo iniciar la cámara. Puedes usar "Tomar fotografía" en su lugar.'
      )
    }
  }

  async function grabarYElegir() {
    const video = videoRef.current
    if (!video) return

    if (video.readyState < 2) {
      await new Promise<void>((resolve) => {
        video.onloadeddata = () => resolve()
        setTimeout(resolve, 800)
      })
    }

    setProgresoGrabacion(0)
    const duracionMs = 3000
    const intervaloMs = 200
    const pasos = Math.floor(duracionMs / intervaloMs)
    let pasoActual = 0
    const avance = setInterval(() => {
      pasoActual++
      setProgresoGrabacion(Math.min(100, Math.round((pasoActual / pasos) * 100)))
    }, intervaloMs)

    const mejores = await capturarMejoresFrames(video, { duracionMs, intervaloMs, cantidadFinal: 4 })
    clearInterval(avance)
    detenerStream(streamRef.current)
    streamRef.current = null

    setFrames(mejores)
    setVista('eligiendo')
  }

  function cancelarModoVideo() {
    detenerStream(streamRef.current)
    streamRef.current = null
    setVista('lista')
  }

  function elegirFrame(frame: FrameCapturado) {
    setImageSrc(frame.dataUrl)
    setFrames([])
    setVista('recortar')
  }

  function volverAGrabar() {
    setFrames([])
    iniciarModoVideo()
  }

  // Recibe el recorte final ya resuelto desde el componente aislado.
  async function confirmarYEnviar(croppedAreaPixels: Area) {
    if (!imageSrc || !croppedAreaPixels || !registroActual) return
    setVista('subiendo')

    let blob: Blob
    try {
      blob = await getCroppedBlob(imageSrc, croppedAreaPixels)
    } catch {
      setVista('error'); setMensaje('No se pudo recortar la imagen.'); return
    }

    const path = `analisis/${registroActual.id}.jpg`
    const { error: errUpload } = await supabase.storage
      .from('imagenes')
      .upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
    if (errUpload) { setVista('error'); setMensaje('No se pudo subir la imagen: ' + errUpload.message); return }

    const { error: errUpdate } = await supabase
      .from('analisis')
      .update({ imagen_path: path, estado: 'pendiente' })
      .eq('id', registroActual.id)
      .eq('codigo_sesion', codigoSesion)
    if (errUpdate) { setVista('error'); setMensaje('No se pudo actualizar el registro: ' + errUpdate.message); return }

    const restantes = pendientes.slice(1)
    setPendientes(restantes)
    setImageSrc(null)

    if (restantes.length > 0) {
      setVista('lista')
    } else {
      setVista('enviada')
    }
  }

  const wrap: React.CSSProperties = {
    minHeight: '100dvh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', padding: '1.75rem',
    textAlign: 'center', color: '#e6edf7',
    background: 'radial-gradient(120% 70% at 50% 0%, #131f38 0%, #0a1120 60%, #070b14 100%)',
  }

  if (vista === 'validando') {
    return (
      <main style={wrap}>
        <div style={{ width: 26, height: 26, borderRadius: '50%', border: '2px solid rgba(56,189,248,0.25)', borderTopColor: '#38bdf8', animation: 'cap-spin 0.8s linear infinite' }} />
        <p style={{ fontFamily: MONO, fontSize: '0.8rem', color: '#7c8aa5', marginTop: '1rem', letterSpacing: '0.04em' }}>Validando sesión…</p>
        <style>{`@keyframes cap-spin{to{transform:rotate(360deg)}}`}</style>
      </main>
    )
  }

  if (vista === 'invalida' || vista === 'error') {
    return (
      <main style={wrap}>
        <BarraMarca />
        <h1 style={{ fontSize: '1.3rem', fontWeight: 600, margin: '1.25rem 0 0.75rem' }}>No se puede continuar</h1>
        <p style={{ color: '#9fb0c9', maxWidth: 320, lineHeight: 1.55 }}>{mensaje}</p>
      </main>
    )
  }

  if (vista === 'enviada') {
    return (
      <main style={{ ...wrap, background: 'radial-gradient(120% 70% at 50% 10%, #10241f 0%, #0a1120 55%, #070b14 100%)', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', height: 4 }}>
          <div style={{ flex: 1, background: '#1e3a8a' }} /><div style={{ flex: 1, background: '#0d9488' }} /><div style={{ flex: 1, background: '#22c55e' }} />
        </div>
        <div style={{ width: 88, height: 88, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.4)', marginBottom: '1.6rem' }}>
          <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        </div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.6rem' }}>Imagen enviada</h1>
        <p style={{ color: '#9fb0c9', maxWidth: 280, lineHeight: 1.55 }}>Ya puedes ver el resultado en la pantalla de la computadora.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', width: '100%', maxWidth: 300, marginTop: '1.9rem' }}>
          {citaId && (
            <button
              onClick={() => router.push(`/diagnostico/cita/${citaId}`)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.55rem', padding: '0.95rem', borderRadius: 14, border: 'none', background: '#1d4ed8', color: '#fff', fontFamily: 'inherit', fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
              Ver diagnóstico en vivo
            </button>
          )}
          <button
            onClick={() => router.push('/')}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.55rem', padding: '0.8rem', borderRadius: 14, border: '1px solid rgba(148,197,255,0.2)', background: 'transparent', color: '#cdd9ec', fontFamily: 'inherit', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
            Volver al inicio
          </button>
        </div>
        <div style={{ marginTop: '1.25rem', padding: '0.85rem 1rem', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(148,197,255,0.12)', maxWidth: 300 }}>
          <p style={{ fontFamily: MONO, fontSize: '0.7rem', lineHeight: 1.55, color: '#7c8aa5', margin: 0 }}>
            Si el optometrista solicita repetir la captura, vuelve a escanear el código QR en la pantalla.
          </p>
        </div>
      </main>
    )
  }

  if (vista === 'grabando') {
    return (
      <main style={{ minHeight: '100dvh', background: '#000', color: '#fff', display: 'flex', flexDirection: 'column' }}>
        <div style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', background: '#000', flexShrink: 0, touchAction: 'none' }}>
          <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          {/* corchetes de encuadre */}
          {[
            { top: 24, left: 24, bt: true, bl: true }, { top: 24, right: 24, bt: true, br: true },
            { bottom: 24, left: 24, bb: true, bl: true }, { bottom: 24, right: 24, bb: true, br: true },
          ].map((c, i) => (
            <div key={i} style={{
              position: 'absolute', top: c.top, bottom: c.bottom, left: c.left, right: c.right, width: 30, height: 30,
              borderTop: c.bt ? '2px solid rgba(255,255,255,0.85)' : undefined,
              borderBottom: c.bb ? '2px solid rgba(255,255,255,0.85)' : undefined,
              borderLeft: c.bl ? '2px solid rgba(255,255,255,0.85)' : undefined,
              borderRight: c.br ? '2px solid rgba(255,255,255,0.85)' : undefined,
            }} />
          ))}
          {progresoGrabacion > 0 && (
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 6, background: 'rgba(255,255,255,0.2)' }}>
              <div style={{ width: `${progresoGrabacion}%`, height: '100%', background: '#38bdf8', transition: 'width 0.15s linear' }} />
            </div>
          )}
        </div>
        <div style={{ width: '100%', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ fontSize: '0.9rem', color: '#cdd9ec', lineHeight: 1.5 }}>
            {progresoGrabacion > 0
              ? 'Capturando, mantén el teléfono estable…'
              : 'Encuadra el ojo y mantén el teléfono firme. Se tomarán varias capturas para elegir la más nítida.'}
          </p>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={cancelarModoVideo} disabled={progresoGrabacion > 0}
              style={{ flex: 1, padding: '0.95rem', borderRadius: 13, border: '1px solid rgba(148,197,255,0.2)', background: 'transparent', color: 'inherit', fontWeight: 600, opacity: progresoGrabacion > 0 ? 0.5 : 1 }}>
              Cancelar
            </button>
            <button onClick={grabarYElegir} disabled={progresoGrabacion > 0}
              style={{ flex: 1, padding: '0.95rem', borderRadius: 13, border: 'none', background: progresoGrabacion > 0 ? '#334155' : '#1d4ed8', color: '#fff', fontWeight: 600 }}>
              {progresoGrabacion > 0 ? 'Capturando…' : 'Iniciar captura'}
            </button>
          </div>
        </div>
      </main>
    )
  }

  if (vista === 'eligiendo') {
    return (
      <main style={{ minHeight: '100dvh', color: '#e6edf7', display: 'flex', flexDirection: 'column', padding: '1.5rem',
        background: 'radial-gradient(120% 70% at 50% 0%, #131f38 0%, #0a1120 60%, #070b14 100%)' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.25rem' }}>Elige la mejor toma</h1>
        <p style={{ fontSize: '0.85rem', color: '#9fb0c9', marginBottom: '1.1rem' }}>Ordenadas de más a menos nítida. Toca la que prefieras.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', flex: 1, alignContent: 'start' }}>
          {frames.map((f, idx) => (
            <button key={f.id} onClick={() => elegirFrame(f)}
              style={{ position: 'relative', padding: 0, border: idx === 0 ? '2.5px solid #38bdf8' : '1px solid #2a3850', borderRadius: 12, overflow: 'hidden', cursor: 'pointer', background: '#000' }}>
              <img src={f.dataUrl} alt={`Toma ${idx + 1}`} style={{ width: '100%', display: 'block', aspectRatio: '1 / 1', objectFit: 'cover' }} />
              {idx === 0 && (
                <span style={{ position: 'absolute', top: 7, left: 7, fontFamily: MONO, fontSize: '0.6rem', fontWeight: 700, background: '#38bdf8', color: '#06283d', padding: '0.18rem 0.5rem', borderRadius: 999 }}>
                  Más nítida
                </span>
              )}
            </button>
          ))}
        </div>
        <button onClick={volverAGrabar}
          style={{ marginTop: '1rem', padding: '0.95rem', borderRadius: 13, border: '1px solid rgba(148,197,255,0.2)', background: 'transparent', color: 'inherit', fontWeight: 600 }}>
          Ninguna me convence, grabar de nuevo
        </button>
      </main>
    )
  }

  if (vista === 'recortar' && imageSrc) {
    return (
      <RecortarVista
        imageSrc={imageSrc}
        ojoLabel={registroActual?.ojo ? ETIQUETA_OJO[registroActual.ojo] : null}
        onCancelar={() => { setImageSrc(null); setVista('lista') }}
        onConfirmar={confirmarYEnviar}
      />
    )
  }

  // vista === 'lista' o 'subiendo'
  const totalOjos = pendientes.length
  const haySecuencia = registroActual?.ojo != null

  return (
    <main style={wrap}>
      <div style={{ width: '100%', maxWidth: 340 }}>
        <BarraMarca />
        <p style={{ fontFamily: MONO, fontSize: '0.66rem', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#2dd4bf', margin: '0.9rem 0 0.5rem' }}>
          OptiVisionIA · Captura
        </p>
        <h1 style={{ fontSize: '1.45rem', fontWeight: 600, letterSpacing: '-0.015em', marginBottom: '1rem', textAlign: 'left' }}>Captura del ojo</h1>

        {haySecuencia && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.7rem 0.85rem', borderRadius: 12, background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.22)', marginBottom: '1.5rem' }}>
            <span style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 9, display: 'grid', placeItems: 'center', fontFamily: MONO, fontSize: '0.75rem', fontWeight: 600, background: 'rgba(56,189,248,0.18)', color: '#7dd3fc' }}>
              {registroActual!.ojo}
            </span>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>{registroActual!.ojo === 'OD' ? 'Ojo derecho' : 'Ojo izquierdo'}</div>
              {totalOjos > 1 && <div style={{ fontFamily: MONO, fontSize: '0.66rem', color: '#7c8aa5' }}>Primero este, luego el otro ojo</div>}
            </div>
            {totalOjos > 1 && (
              <div style={{ display: 'flex', gap: '0.3rem' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#38bdf8' }} />
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'rgba(148,163,184,0.35)' }} />
              </div>
            )}
          </div>
        )}

        <p style={{ color: '#9fb0c9', fontSize: '0.9rem', lineHeight: 1.55, marginBottom: '1.5rem', textAlign: 'left' }}>
          Acerca la cámara al ojo, con buena luz y enfoque. Evita reflejos directos.
        </p>

        {errorCamara && (
          <p style={{ color: '#fb7185', fontSize: '0.85rem', marginBottom: '1rem', textAlign: 'left' }}>{errorCamara}</p>
        )}

        {vista === 'subiendo' ? (
          <p style={{ fontFamily: MONO, color: '#7c8aa5' }}>Enviando imagen…</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', padding: '1rem', borderRadius: 14, background: '#1d4ed8', color: '#fff', fontWeight: 600, fontSize: '1.05rem', cursor: 'pointer' }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
              Tomar fotografía
              <input type="file" accept="image/*" capture="environment" onChange={onArchivo} style={{ display: 'none' }} />
            </label>
            <button onClick={iniciarModoVideo}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', padding: '0.9rem', borderRadius: 14, border: '1px solid rgba(148,197,255,0.2)', background: 'transparent', color: '#cdd9ec', fontWeight: 600, fontSize: '0.92rem', cursor: 'pointer' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
              Grabar y elegir mejor toma
            </button>
          </div>
        )}
      </div>
    </main>
  )
}

// ============================================================
// Vista de recorte — AISLADA y memoizada.
//
// FIX DEL PARPADEO:
//  1. crop/zoom viven AQUÍ (estado local), no en CapturaInner. Así, al
//     mover el slider o pellizcar, solo se re-renderiza este componente
//     y no toda la página con sus ramas y objetos de estilo, eliminando
//     el thrash de render que causaba el flash.
//  2. mediaStyle fuerza una capa de composición propia
//     (backface-visibility:hidden + translateZ(0)). En WebKit móvil esto
//     evita el repintado de la capa completa en cada paso del transform
//     del zoom — la causa visual directa del parpadeo.
// ============================================================
const RecortarVista = memo(function RecortarVista({
  imageSrc, ojoLabel, onCancelar, onConfirmar,
}: {
  imageSrc: string
  ojoLabel: string | null
  onCancelar: () => void
  onConfirmar: (croppedAreaPixels: Area) => void
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const croppedRef = useRef<Area | null>(null)

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    croppedRef.current = areaPixels
  }, [])

  return (
    <main style={{ minHeight: '100dvh', color: '#e6edf7', display: 'flex', flexDirection: 'column', background: '#0a1120' }}>
      <div style={{ textAlign: 'center', padding: '0.85rem 0 0.6rem' }}>
        {ojoLabel
          ? <span style={{ fontFamily: MONO, fontSize: '0.66rem', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7dd3fc' }}>{ojoLabel}</span>
          : <span style={{ fontFamily: MONO, fontSize: '0.66rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7c8aa5' }}>Encuadrar</span>}
      </div>

      <div style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', background: '#000', flexShrink: 0, touchAction: 'none' }}>
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={1}
          cropShape="rect"
          showGrid
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
          style={{
            mediaStyle: {
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'translateZ(0)',
              willChange: 'transform',
            },
          }}
        />
      </div>

      <div style={{ width: '100%', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
        <p style={{ fontSize: '0.88rem', color: '#9fb0c9', lineHeight: 1.5, textAlign: 'center', margin: 0 }}>
          Arrastra para mover · pellizca o usa la barra para acercar.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7c8aa5" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>
          <input type="range" min={1} max={4} step={0.05} value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            style={{ flex: 1, accentColor: '#38bdf8' }} />
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c8aa5" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </div>

        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={onCancelar}
            style={{ flex: 1, padding: '0.95rem', borderRadius: 13, border: '1px solid rgba(148,197,255,0.2)', background: 'transparent', color: 'inherit', fontWeight: 600 }}>
            Volver a tomar
          </button>
          <button onClick={() => { if (croppedRef.current) onConfirmar(croppedRef.current) }}
            style={{ flex: 1, padding: '0.95rem', borderRadius: 13, border: 'none', background: '#1d4ed8', color: '#fff', fontWeight: 600 }}>
            Confirmar y enviar
          </button>
        </div>
      </div>
    </main>
  )
})

export default function CapturaPage() {
  return (
    <Suspense fallback={<p style={{ padding: '2rem', textAlign: 'center' }}>Cargando…</p>}>
      <CapturaInner />
    </Suspense>
  )
}
