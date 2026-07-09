// frontend/app/login/LoginForm.tsx
'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useAuth } from '@/contexts/AuthContext'

const sans = "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
const mono = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"

const labelStyle: React.CSSProperties = {
  display: 'block', fontFamily: mono, fontSize: '11px', fontWeight: 500,
  letterSpacing: '0.08em', textTransform: 'uppercase',
  color: 'var(--text-muted)', marginBottom: '0.5625rem',
}
const inputStyle: React.CSSProperties = {
  width: '100%', border: '1px solid var(--input-border)',
  borderRadius: '0.5625rem', padding: '0.8125rem 0.9375rem',
  fontSize: '0.9rem', fontFamily: sans,
  backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', outline: 'none',
}

export default function LoginForm() {
  const { iniciarSesion } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [verPassword, setVerPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function manejarEnvio(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setEnviando(true)
    const { error: errLogin } = await iniciarSesion(email.trim(), password)
    if (errLogin) setError(errLogin)
    setEnviando(false)
  }

  return (
    <div
      style={{
        position: 'relative', minHeight: '100vh', overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
        padding: '56px clamp(32px, 8vw, 104px)', fontFamily: sans,
      }}
    >
      {/* Fondo: imagen + velo navy para contraste */}
      <Image
        src="/01.png"
        alt=""
        fill
        priority
        sizes="100vw"
        style={{ objectFit: 'cover', objectPosition: 'center', zIndex: 0 }}
      />
      <div
        aria-hidden
        style={{
          position: 'absolute', inset: 0, zIndex: 1,
          background:
            'linear-gradient(100deg, rgba(8,27,64,0.90) 0%, rgba(8,27,64,0.62) 40%, rgba(8,27,64,0.22) 72%, rgba(8,27,64,0.05) 100%)',
        }}
      />

      <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%', maxWidth: 440 }}>
        <form
          onSubmit={manejarEnvio}
          style={{
            width: '100%', backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)', borderRadius: '0.875rem',
            overflow: 'hidden', boxShadow: '0 20px 56px rgba(8,27,64,0.42)',
          }}
        >
          {/* Cabecera con el logo sobre placa */}
          <div
            style={{
              display: 'flex', justifyContent: 'center',
              backgroundColor: 'var(--bg)', borderBottom: '1px solid var(--border)',
              padding: '2.125rem',
            }}
          >
            <div
              style={{
                backgroundColor: '#ffffff', border: '1px solid var(--border)',
                borderRadius: '0.75rem', padding: '1.125rem 1.625rem', display: 'inline-flex',
              }}
            >
              <Image
                src="/Logo_OptivisionIA.png"
                alt="OptiVisionIA"
                width={172}
                height={172}
                priority
                style={{ height: 'auto', display: 'block' }}
              />
            </div>
          </div>

          {/* Cuerpo */}
          <div style={{ padding: '2.125rem 2.25rem 2.375rem' }}>
            <div style={{ marginBottom: '1.625rem' }}>
              <div
                style={{
                  fontFamily: mono, fontSize: '11px', fontWeight: 500,
                  letterSpacing: '0.14em', textTransform: 'uppercase',
                  color: '#0d9488', marginBottom: '0.6875rem',
                }}
              >
                Acceso al sistema
              </div>
              <h1 style={{ fontSize: '1.375rem', fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text)', margin: 0 }}>
                Iniciar sesión
              </h1>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: '0.375rem 0 0' }}>
                Óptical Vi+ · Mixco, Guatemala
              </p>
            </div>

            {error && (
              <div className="alerta-error" style={{ marginBottom: '1rem', fontSize: '0.8125rem' }}>
                {error}
              </div>
            )}

            <div style={{ marginBottom: '1.25rem' }}>
              <label htmlFor="login-email" style={labelStyle}>Correo electrónico</label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                autoComplete="username"
                placeholder="nombre@opticavi.com"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: '1.75rem' }}>
              <label htmlFor="login-password" style={labelStyle}>Contraseña</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="login-password"
                  type={verPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  style={{ ...inputStyle, paddingRight: '4.375rem' }}
                />
                <button
                  type="button"
                  onClick={() => setVerPassword((v) => !v)}
                  style={{
                    position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', color: 'var(--text-muted)',
                    fontFamily: mono, fontSize: '10.5px', letterSpacing: '0.05em',
                    textTransform: 'uppercase', cursor: 'pointer', padding: '0.3rem 0.4rem',
                  }}
                >
                  {verPassword ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={enviando}
              className="btn-primary"
              style={{ width: '100%', height: '3.125rem', justifyContent: 'center', fontSize: '0.9375rem', fontWeight: 600 }}
            >
              {enviando ? 'Verificando…' : 'Entrar'}
            </button>

            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.5, margin: '1.375rem 0 0' }}>
              ¿Olvidaste tu contraseña? Contacta al administrador del sistema.
            </p>
          </div>

          {/* Firma tri-color del logo */}
          <div style={{ display: 'flex', height: '4px' }}>
            <div style={{ flex: 1, backgroundColor: '#1e3a8a' }} />
            <div style={{ flex: 1, backgroundColor: '#0d9488' }} />
            <div style={{ flex: 1, backgroundColor: '#22c55e' }} />
          </div>
        </form>

        <p
          style={{
            fontFamily: mono, fontSize: '10.5px', letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'rgba(255,255,255,0.78)', margin: 0, paddingLeft: 2,
          }}
        >
          Acceso restringido a personal autorizado
        </p>
      </div>
    </div>
  )
}
