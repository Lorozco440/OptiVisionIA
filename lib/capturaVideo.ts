// frontend/lib/capturaVideo.ts
//
// Utilidades para el Modo B de captura (video en vivo + selección del
// mejor frame), como alternativa al Modo A (foto directa con la cámara
// nativa del sistema vía <input type="file" capture>).
//
// El cálculo de nitidez usa una versión simplificada de la varianza del
// Laplaciano: por velocidad en teléfonos de gama media, se calcula sobre
// una versión REDUCIDA del frame (no a resolución nativa). La nitidez
// relativa entre frames de la misma sesión se preserva igual a baja
// resolución, y el cálculo es order(es) de magnitud más rápido.

export interface FrameCapturado {
  id: string
  dataUrl: string       // imagen completa, a resolución de captura, para mostrar/subir
  scoreNitidez: number  // mayor = más nítido
}

const TAMANO_ANALISIS = 128 // resolución reducida solo para el cálculo de nitidez

/**
 * Inicia el stream de la cámara trasera del dispositivo.
 * Lanza un Error si el navegador no soporta getUserMedia o si el usuario
 * niega el permiso — el llamador debe capturar esto y ofrecer caer de
 * vuelta al Modo A (foto directa).
 */
export async function iniciarStreamCamara(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Este navegador no soporta captura de video en vivo.')
  }
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 1280 } },
    audio: false,
  })
}

export function detenerStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop())
}

/**
 * Calcula un score de nitidez para un frame ya dibujado en un canvas
 * pequeño (TAMANO_ANALISIS x TAMANO_ANALISIS), usando varianza de un
 * Laplaciano discreto simplificado (kernel de 4 vecinos) sobre la
 * imagen en escala de grises. No requiere ninguna librería externa.
 */
function calcularNitidez(ctx: CanvasRenderingContext2D, w: number, h: number): number {
  const { data } = ctx.getImageData(0, 0, w, h)
  const gris = new Float32Array(w * h)

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    // Luminancia estándar (perceptual), evita convertir a otro espacio de color.
    gris[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  }

  // Laplaciano discreto: centro*4 - (arriba+abajo+izq+der). Bordes nítidos
  // producen valores altos en magnitud; zonas borrosas, valores cercanos a 0.
  let suma = 0
  let sumaCuadrados = 0
  let n = 0

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x
      const lap =
        4 * gris[idx] - gris[idx - 1] - gris[idx + 1] - gris[idx - w] - gris[idx + w]
      suma += lap
      sumaCuadrados += lap * lap
      n++
    }
  }

  if (n === 0) return 0
  const media = suma / n
  // Varianza del Laplaciano = score de nitidez.
  return sumaCuadrados / n - media * media
}

/**
 * Captura un frame del <video> en dos resoluciones: una reducida (para
 * el cálculo de nitidez, rápido) y otra completa (para mostrar/subir si
 * el usuario elige este frame).
 */
export function capturarFrame(video: HTMLVideoElement): FrameCapturado {
  // Canvas a resolución completa (limitado a 1024px de lado mayor para
  // no generar imágenes innecesariamente pesadas desde el teléfono).
  const maxLado = 1024
  const escala = Math.min(1, maxLado / Math.max(video.videoWidth, video.videoHeight))
  const wCompleto = Math.round(video.videoWidth * escala)
  const hCompleto = Math.round(video.videoHeight * escala)

  const canvasCompleto = document.createElement('canvas')
  canvasCompleto.width = wCompleto
  canvasCompleto.height = hCompleto
  const ctxCompleto = canvasCompleto.getContext('2d')!
  ctxCompleto.drawImage(video, 0, 0, wCompleto, hCompleto)
  const dataUrl = canvasCompleto.toDataURL('image/jpeg', 0.85)

  // Canvas reducido, solo para el cálculo de nitidez.
  const canvasAnalisis = document.createElement('canvas')
  canvasAnalisis.width = TAMANO_ANALISIS
  canvasAnalisis.height = TAMANO_ANALISIS
  const ctxAnalisis = canvasAnalisis.getContext('2d')!
  ctxAnalisis.drawImage(video, 0, 0, TAMANO_ANALISIS, TAMANO_ANALISIS)
  const scoreNitidez = calcularNitidez(ctxAnalisis, TAMANO_ANALISIS, TAMANO_ANALISIS)

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    dataUrl,
    scoreNitidez,
  }
}

/**
 * Captura una ráfaga de frames a intervalos regulares durante
 * `duracionMs`, y devuelve los `cantidadFinal` con mejor score de
 * nitidez, ordenados de mejor a peor.
 */
export async function capturarMejoresFrames(
  video: HTMLVideoElement,
  opciones: { duracionMs?: number; intervaloMs?: number; cantidadFinal?: number } = {}
): Promise<FrameCapturado[]> {
  const { duracionMs = 3000, intervaloMs = 200, cantidadFinal = 4 } = opciones
  const frames: FrameCapturado[] = []
  const totalCapturas = Math.floor(duracionMs / intervaloMs)

  for (let i = 0; i < totalCapturas; i++) {
    frames.push(capturarFrame(video))
    if (i < totalCapturas - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervaloMs))
    }
  }

  return frames
    .sort((a, b) => b.scoreNitidez - a.scoreNitidez)
    .slice(0, cantidadFinal)
}

/** Convierte un dataURL (string base64) a Blob, para subir a Supabase Storage. */
export function dataUrlABlob(dataUrl: string): Blob {
  const [meta, base64] = dataUrl.split(',')
  const mime = meta.match(/:(.*?);/)?.[1] ?? 'image/jpeg'
  const binario = atob(base64)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}