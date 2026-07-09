// frontend/lib/contenidoClinico.ts
//
// Texto educativo FIJO por tipo de diagnóstico, mostrado únicamente en el
// PDF del reporte (no en la pantalla en vivo). No es generado por el
// modelo ni varía según el caso individual — es información general de
// la condición, redactada con base en fuentes clínicas públicas:
//
//   - Mayo Clinic: https://www.mayoclinic.org/es/diseases-conditions/cataracts
//   - National Eye Institute: https://www.nei.nih.gov/espanol/informacion-sobre-la-salud-ocular/enfermedades-y-afecciones-de-los-ojos/cataratas
//   - Clínica Barraquer: https://www.barraquer.com/patologia/cataratas
//   - PortalCLÍNIC (Hospital Clínic Barcelona): https://www.clinicbarcelona.org/asistencia/enfermedades/cataratas/sintomas-y-signos
//
// El "grado" de pterigión (I-IV por mm de invasión corneal) NO lo calcula
// el sistema: requiere medición con lámpara de hendidura por un
// profesional. El selector de grado en la validación clínica es de
// asignación manual del optometrista, nunca una salida del modelo.

export type DiagnosticoClase = 'catarata' | 'normal' | 'pterigion'

export interface ContenidoClinico {
  titulo: string
  descripcion: string
  caracteristicas: string[]
  notaImportante?: string
}

export const CONTENIDO_CLINICO: Record<DiagnosticoClase, ContenidoClinico> = {
  catarata: {
    titulo: 'Sobre la catarata',
    descripcion:
      'La catarata es la opacificación progresiva del cristalino (el lente natural del ojo), ' +
      'lo que dificulta el paso normal de la luz hacia la retina. Es una condición muy común ' +
      'asociada principalmente al envejecimiento, aunque también puede originarse por traumatismos, ' +
      'enfermedades como la diabetes, o el uso prolongado de ciertos medicamentos.',
    caracteristicas: [
      'Visión borrosa o nublada, como mirar a través de un cristal empañado.',
      'Disminución progresiva y generalmente indolora de la agudeza visual.',
      'Mayor sensibilidad al deslumbramiento (luz solar, faros, lámparas).',
      'Dificultad para distinguir colores o pérdida de su viveza habitual.',
      'Problemas de visión nocturna y halos alrededor de las luces.',
      'En etapas avanzadas, la pupila puede perder su color negro habitual y verse turbia o blanquecina.',
    ],
    notaImportante:
      'El tratamiento definitivo de la catarata es quirúrgico. La detección temprana permite planificar ' +
      'la cirugía en el momento más adecuado para cada paciente.',
  },

  pterigion: {
    titulo: 'Sobre el pterigión',
    descripcion:
      'El pterigión es un crecimiento fibrovascular benigno de la conjuntiva (la membrana que cubre ' +
      'la parte blanca del ojo) que puede avanzar progresivamente sobre la córnea. Se asocia comúnmente ' +
      'a la exposición prolongada a luz solar, viento y polvo, por lo que es más frecuente en personas ' +
      'que trabajan o residen en ambientes con alta exposición ambiental.',
    caracteristicas: [
      'Crecimiento triangular de tejido sobre la conjuntiva bulbar, generalmente del lado nasal del ojo.',
      'Presencia de vasos sanguíneos visibles y prominentes en la zona afectada.',
      'Puede invadir progresivamente la córnea si no se controla su evolución.',
      'En etapas avanzadas, puede comprometer el eje visual y afectar la agudeza visual.',
      'Frecuentemente causa sensación de cuerpo extraño, enrojecimiento o irritación ocular.',
    ],
    notaImportante:
      'El grado de invasión corneal (clasificación clínica I-IV) requiere medición directa con lámpara ' +
      'de hendidura por el optometrista y no es determinado por este sistema. El seguimiento periódico ' +
      'permite decidir el momento adecuado para una eventual intervención quirúrgica.',
  },

  normal: {
    titulo: 'Resultado dentro de parámetros normales',
    descripcion:
      'El análisis no encontró signos compatibles con catarata o pterigión en la imagen evaluada. ' +
      'Esto es un resultado favorable, aunque no sustituye un examen oftalmológico completo, ya que ' +
      'existen otras condiciones visuales que este sistema no evalúa.',
    caracteristicas: [
      'Se recomienda mantener revisiones visuales periódicas, incluso sin síntomas aparentes.',
      'Ante cualquier cambio en la visión (borrosidad, dolor, enrojecimiento persistente), consultar al optometrista.',
    ],
  },
}