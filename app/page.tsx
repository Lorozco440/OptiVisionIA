//frontend/app/page.tsx
import Link from 'next/link'
import Image from 'next/image'

const mono = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
const sans = "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

type Modulo = { href: string; code: string; titulo: string; desc: string; tint: string }

const MODULOS: Modulo[] = [
  { href: '/pacientes', code: 'PAC', titulo: 'Pacientes', desc: 'Registrar, buscar y gestionar expedientes de pacientes.', tint: '29,78,216' },
  { href: '/citas',     code: 'CIT', titulo: 'Citas',     desc: 'Ver citas del día, crear nuevas e imprimir boletas.',   tint: '13,148,136' },
]

const tintColor: Record<string, string> = { '29,78,216': '#1d4ed8', '13,148,136': '#0d9488' }

export default function Home() {
  return (
    <div style={{ fontFamily: sans }}>
      {/* Banner */}
      <div style={{ position: 'relative', width: '100%', height: 220, borderRadius: 16, overflow: 'hidden', marginBottom: '1.75rem', border: '1px solid var(--border)' }}>
        <Image src="/02.png" alt="" fill priority sizes="100vw" style={{ objectFit: 'cover', objectPosition: 'center 30%' }} />
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(90deg, rgba(8,27,64,0.92) 0%, rgba(8,27,64,0.68) 42%, rgba(8,27,64,0.30) 100%)',
          }}
        />
        <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 2.25rem' }}>
          <div style={{ fontFamily: mono, fontSize: '11px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#4ade80', marginBottom: '0.625rem' }}>
            Inicio
          </div>
          <h1 style={{ fontSize: '1.625rem', fontWeight: 600, letterSpacing: '-0.015em', color: '#fff', margin: '0 0 0.4375rem' }}>
            Bienvenido a OptiVisionIA
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.82)', margin: 0, maxWidth: 440 }}>
            Sistema de apoyo clínico con diagnóstico preliminar por IA,   Óptica Vi+
          </p>
        </div>
      </div>

      {/* Accesos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-3xl">
        {MODULOS.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="card block hover:shadow-md transition-shadow"
            style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', textDecoration: 'none', padding: 0 }}
          >
            {/* Cabecera tintada */}
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: '0.875rem',
                padding: '1.125rem 1.25rem', background: `rgba(${m.tint},0.07)`,
                borderBottom: '1px solid var(--border)',
              }}
            >
              <span
                style={{
                  width: 42, height: 42, flexShrink: 0, borderRadius: 11, display: 'grid', placeItems: 'center',
                  fontFamily: mono, fontSize: '0.8125rem', fontWeight: 600,
                  background: `rgba(${m.tint},0.16)`, color: tintColor[m.tint],
                }}
              >
                {m.code}
              </span>
              <h2 style={{ fontSize: '1.03rem', fontWeight: 600, color: 'var(--text)', margin: 0 }}>{m.titulo}</h2>
            </div>

            {/* Cuerpo */}
            <div style={{ flex: 1, padding: '1.125rem 1.25rem' }}>
              <p style={{ fontSize: '0.84rem', lineHeight: 1.55, color: 'var(--text-muted)', margin: 0 }}>{m.desc}</p>
            </div>

            {/* Firma tri-color */}
            <div style={{ display: 'flex', height: 3 }}>
              <div style={{ flex: 1, background: '#1e3a8a' }} />
              <div style={{ flex: 1, background: '#0d9488' }} />
              <div style={{ flex: 1, background: '#22c55e' }} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
