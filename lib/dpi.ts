/** Verifica que el DPI tenga exactamente 13 dígitos numéricos. */
export function formatoValidoDPI(dpi: string): boolean {
  return /^\d{13}$/.test(dpi.trim())
}

/**
 * Verifica el dígito verificador real del CUI/DPI guatemalteco (módulo 11
 * sobre los primeros 8 dígitos). No wireado a ningún formulario todavía —
 * disponible para cuando quieras activarlo.
 *
 * OJO: existe un caso límite conocido cuando el módulo da 10 (no hay una
 * regla estándar consistente para ese caso). Por eso retorna `null`
 * ("no concluyente") en vez de forzar true/false — trátalo como advertencia,
 * no como bloqueo duro, para no rechazar un DPI real por error.
 */
export function digitoVerificadorValido(dpi: string): boolean | null {
  if (!formatoValidoDPI(dpi)) return false
  const d = dpi.trim()
  const primerosOcho = d.slice(0, 8).split('').map(Number)
  const digitoVerificador = Number(d[8])

  const total = primerosOcho.reduce((suma, digito, i) => suma + digito * (i + 2), 0)
  const modulo = total % 11

  if (modulo === 10) return null // caso límite sin regla consistente
  return modulo === digitoVerificador
}