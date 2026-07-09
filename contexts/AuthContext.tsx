// frontend/contexts/AuthContext.tsx
//
// Contexto de autenticación global (A4). Envuelve toda la app y expone:
//   - usuario: la sesión de Supabase Auth (o null si no hay sesión)
//   - personal: la fila de la tabla 'personal' vinculada (nombre, rol, activo)
//   - cargando: true mientras se resuelve el estado inicial de sesión
//   - iniciarSesion(email, password) / cerrarSesion()
//
// El teléfono del paciente (captura/page.tsx) NUNCA usa este contexto —
// sigue operando sin sesión, vía codigo_sesion, como siempre.
'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, type Personal } from '@/lib/supabase'

interface AuthContextValue {
  usuario: User | null
  sesion: Session | null
  personal: Personal | null
  cargando: boolean
  iniciarSesion: (email: string, password: string) => Promise<{ error: string | null }>
  cerrarSesion: () => Promise<void>
  esAdministrador: boolean
  esExaminador: boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [sesion, setSesion] = useState<Session | null>(null)
  const [personal, setPersonal] = useState<Personal | null>(null)
  const [cargando, setCargando] = useState(true)

  // Centraliza el cierre de sesión + redirección al inicio. Se usa en
  // los tres puntos donde se puede cerrar sesión (desactivación detectada
  // al cargar, desactivación detectada en vivo por Realtime, y el botón
  // manual de "Salir"), para que SIEMPRE se navegue a "/" después de
  // cerrar sesión — así la siguiente persona que inicie sesión en este
  // mismo dispositivo no hereda la URL/pantalla en la que se quedó la
  // sesión anterior (ej. un detalle de diagnóstico de un paciente).
  async function cerrarSesionYRedirigir() {
    await supabase.auth.signOut()
    setSesion(null)
    setPersonal(null)
    router.push('/')
  }

  // Carga la fila de 'personal' vinculada al usuario autenticado actual.
  // Si la cuenta está desactivada (activo=false), cierra la sesión de
  // inmediato — no debe operar con una sesión ya abierta tras revocársele
  // el acceso.
  async function cargarPersonal(userId: string) {
    const { data, error } = await supabase
      .from('personal')
      .select('*')
      .eq('auth_id', userId)
      .maybeSingle()
    if (error) {
      console.error('Error al cargar personal:', error.message)
      setPersonal(null)
      return
    }
    if (data && data.activo === false) {
      await cerrarSesionYRedirigir()
      return
    }
    setPersonal(data as Personal | null)
  }

  useEffect(() => {
    // Estado inicial: ¿ya hay una sesión guardada (localStorage)?
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSesion(session)
      if (session?.user) await cargarPersonal(session.user.id)
      setCargando(false)
    })

    // Suscripción a cambios de sesión (login, logout, refresh de token).
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSesion(session)
      if (session?.user) {
        await cargarPersonal(session.user.id)
      } else {
        setPersonal(null)
      }
      setCargando(false)
    })

    return () => { listener.subscription.unsubscribe() }
  }, [])

  // Vigilancia en tiempo real: si el administrador desactiva esta cuenta
  // (activo=false) MIENTRAS la sesión ya está abierta, se cierra de
  // inmediato sin esperar a la siguiente recarga de página.
  useEffect(() => {
    const userId = sesion?.user?.id
    if (!userId) return

    const channel = supabase
      .channel(`personal-activo-${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'personal', filter: `auth_id=eq.${userId}` },
        async (payload) => {
          const fila = payload.new as Personal
          if (fila.activo === false) {
            await cerrarSesionYRedirigir()
          } else {
            setPersonal(fila)
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [sesion?.user?.id])

  async function iniciarSesion(email: string, password: string): Promise<{ error: string | null }> {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      // Mensaje genérico a propósito: no revelar si el email existe o no,
      // ni si el problema es la contraseña específicamente (evita dar
      // pistas útiles para un intento de adivinanza de credenciales).
      return { error: 'Correo o contraseña incorrectos.' }
    }
    return { error: null }
  }

  async function cerrarSesion() {
    await cerrarSesionYRedirigir()
  }

  const value: AuthContextValue = {
    usuario: sesion?.user ?? null,
    sesion,
    personal,
    cargando,
    iniciarSesion,
    cerrarSesion,
    esAdministrador: personal?.rol === 'administrador',
    esExaminador: personal?.rol === 'examinador',
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}