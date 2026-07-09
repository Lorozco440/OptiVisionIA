//frontend/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnon)

// ── Tipos TypeScript alineados con el schema SQL ──────────────────────────────

// Roles del sistema (A4 — login):
//   examinador:    ingresa pacientes/citas, captura diagnósticos IA,
//                  valida clínicamente (diagnostico_real, grado, observaciones).
//   administrador: gestiona usuarios y contraseñas, consulta historial —
//                  no diagnostica ni valida.
export type Rol = 'examinador' | 'administrador'
export type Sexo = 'M' | 'F'

export type EstadoCita =
  | 'programada'
  | 'confirmada'
  | 'atendida'
  | 'cancelada'
  | 'no_asistio'

export type EstadoAnalisis =
  | 'esperando_imagen'
  | 'pendiente'
  | 'procesando'
  | 'completado'
  | 'rechazada_stage1'
  | 'no_clasificable'
  | 'error'

export interface Personal {
  id:         string
  auth_id:    string | null
  nombre:     string
  rol:        Rol
  activo:     boolean
  created_at: string
}

export interface Paciente {
  id:               string
  expediente:       number
  nombres:          string
  apellidos:        string
  dpi:              string | null
  fecha_nacimiento: string | null
  sexo:             Sexo | null
  telefono:         string | null
  email:            string | null
  direccion:        string | null
  antecedentes:     string | null
  created_at:       string
  updated_at:       string
  creado_por:       string | null
}

export interface Cita {
  id:          string
  numero_cita: number
  paciente_id: string
  fecha_hora:  string
  motivo:      string | null
  estado:      EstadoCita
  acepta_ia:   boolean
  notas:       string | null
  created_at:  string
  creado_por:  string | null
  // join opcional
  pacientes?:  Paciente
}

export interface Analisis {
  id:             string
  paciente_id:    string
  cita_id:        string | null
  codigo_sesion:  string
  imagen_path:    string | null
  estado:         EstadoAnalisis
  paso_filtro:    boolean | null
  confianza_ojo:  number | null
  diagnostico:    string | null
  confianza:      number | null
  probabilidades: Record<string, number> | null
  gradcam_path:   string | null
  modelo_version: string | null
  mensaje:        string | null
  validado:       boolean
  observaciones:  string | null
  created_at:     string
  completado_at:  string | null
}