//frontend/app/layout.tsx
'use client'

import './globals.css'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import LoginPage from './login/LoginForm'

// Rutas que NUNCA requieren sesión, sin importar el estado de login:
//   /captura — el paciente usa esto desde su teléfono, sin cuenta.
const RUTAS_PUBLICAS = ['/captura']

function esRutaPublica(pathname: string): boolean {
  return RUTAS_PUBLICAS.some((ruta) => pathname.startsWith(ruta))
}

function NavBar() {
  const [tema, setTema] = useState<'light' | 'dark'>('light')
  const { personal, esAdministrador, cerrarSesion } = useAuth()
  const pathname = usePathname()

  useEffect(() => {
    const yaAplicado = document.documentElement.getAttribute('data-theme') as 'light' | 'dark' | null
    if (yaAplicado === 'light' || yaAplicado === 'dark') {
      setTema(yaAplicado)
      return
    }
    const guardado = localStorage.getItem('tema') as 'light' | 'dark' | null
    const inicial  = guardado ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    setTema(inicial)
    document.documentElement.setAttribute('data-theme', inicial)
  }, [])

  function toggleTema() {
    const nuevo = tema === 'light' ? 'dark' : 'light'
    setTema(nuevo)
    document.documentElement.setAttribute('data-theme', nuevo)
    localStorage.setItem('tema', nuevo)
  }

  // En /captura no se muestra navbar — el paciente no debe ver
  // navegación interna del sistema clínico en su teléfono.
  if (esRutaPublica(pathname)) return null

  return (
    <nav style={{ backgroundColor: 'var(--bg-nav)' }} className="text-white shadow-md no-print">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 sm:gap-8 min-w-0">
          <span className="font-bold text-base tracking-tight hidden sm:inline">OptiVisionIA</span>
          <div className="flex gap-3 sm:gap-6 text-sm">
            <Link href="/"          className="hover:opacity-80 transition-opacity">Inicio</Link>
            <Link href="/pacientes" className="hover:opacity-80 transition-opacity">Pacientes</Link>
            <Link href="/citas"     className="hover:opacity-80 transition-opacity">Citas</Link>
            {esAdministrador && (
              <Link href="/usuarios" className="hover:opacity-80 transition-opacity">Usuarios</Link>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {personal && (
            <span style={{ fontSize: '0.75rem', opacity: 0.85 }} className="hidden sm:inline">
              {personal.nombre} · {personal.rol === 'administrador' ? 'Administrador' : 'Examinador'}
            </span>
          )}
          <button
            onClick={toggleTema}
            title={tema === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
            style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)' }}
            className="px-3 py-1.5 rounded-md text-xs font-medium hover:bg-white/25 transition"
          >
            {tema === 'light' ? 'Modo oscuro' : 'Modo claro'}
          </button>
          {personal && (
            <button
              onClick={cerrarSesion}
              style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}
              className="px-3 py-1.5 rounded-md text-xs font-medium hover:bg-white/20 transition"
            >
              Salir
            </button>
          )}
        </div>
      </div>
    </nav>
  )
}

// Decide el "envoltorio" según el estado de sesión:
//   · ruta pública → contenido directo (con padding, sin navbar)
//   · cargando      → pantalla de carga a página completa
//   · sin sesión    → login a PANTALLA COMPLETA (sin navbar ni contenedor)
//   · sin perfil    → aviso de cuenta sin acceso
//   · autenticado   → navbar + contenedor con padding
function Contenido({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { sesion, personal, cargando, cerrarSesion } = useAuth()

  // El teléfono del paciente pasa siempre, sin pedir sesión.
  if (esRutaPublica(pathname)) {
    return <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">{children}</main>
  }

  if (cargando) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text)' }}>
        <p style={{ opacity: 0.6, fontSize: '0.875rem' }}>Cargando…</p>
      </div>
    )
  }

  // Sin sesión → el login ocupa toda la ventana, sin barra ni contenedor.
  if (!sesion) {
    return <LoginPage />
  }

  // Sesión válida en Supabase Auth, pero sin fila vinculada en 'personal'
  // (o esa fila fue desactivada): no debería poder usar el sistema.
  if (!personal) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', color: 'var(--text)', padding: '1.5rem', textAlign: 'center' }}>
        <p style={{ fontWeight: 600 }}>Tu cuenta no tiene acceso configurado.</p>
        <p style={{ fontSize: '0.875rem', opacity: 0.7, maxWidth: 360 }}>
          Esta cuenta inició sesión correctamente, pero no está vinculada a un perfil de personal activo en el sistema. Contacta al administrador.
        </p>
        <button onClick={cerrarSesion} className="btn-secondary" style={{ marginTop: '0.5rem' }}>
          Cerrar sesión
        </button>
      </div>
    )
  }

  // Aplicación autenticada: barra de navegación + contenido con padding.
  return (
    <>
      <NavBar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">{children}</main>
    </>
  )
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <title>OptiVisionIA — Óptica Vi+</title>
        <meta name="description" content="Sistema clínico con diagnóstico preliminar por IA" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var t = localStorage.getItem('tema');
                  if (t !== 'light' && t !== 'dark') {
                    t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                  }
                  document.documentElement.setAttribute('data-theme', t);
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body>
        <AuthProvider>
          <Contenido>{children}</Contenido>
        </AuthProvider>
      </body>
    </html>
  )
}
