import { useEffect, useState } from 'react'
import type { AppInfo, AuthResult, AuthStatus } from './types/bridge'
import './App.css'

const INITIAL_AUTH_STATUS: AuthStatus = { state: 'loading' }

function MicrosoftMark() {
  return (
    <span className="microsoft-mark" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </span>
  )
}

function statusLabel(status: AuthStatus) {
  switch (status.state) {
    case 'authenticated': return `Cuenta: ${status.profile.name}`
    case 'signed-out': return 'Microsoft preparado'
    case 'working': return 'Conectando con Microsoft'
    case 'error': return 'La sesion necesita atencion'
    default: return 'Configuracion inicial'
  }
}

function App() {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [authStatus, setAuthStatus] = useState<AuthStatus>(INITIAL_AUTH_STATUS)
  const [authResult, setAuthResult] = useState<AuthResult | null>(null)

  useEffect(() => {
    let active = true

    Promise.all([window.empi.getAppInfo(), window.empi.auth.getStatus()]).then(
      ([info, status]) => {
        if (!active) return
        setAppInfo(info)
        setAuthStatus(status)
      },
    )

    return () => {
      active = false
    }
  }, [])

  const startMicrosoftLogin = async () => {
    setAuthResult(null)
    setAuthStatus({ state: 'working' })
    const result = await window.empi.auth.startMicrosoftLogin()
    setAuthResult(result)
    setAuthStatus(await window.empi.auth.getStatus())
  }

  const logout = async () => {
    setAuthResult(null)
    setAuthStatus(await window.empi.auth.logout())
  }

  const isBusy = authStatus.state === 'loading' || authStatus.state === 'working'
  const canLogin = authStatus.state === 'signed-out'

  return (
    <main className="launcher-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">E</span>
          <span>EmpiLauncher</span>
        </div>
        <span className="foundation-tag">Microsoft auth</span>
      </header>

      {authStatus.state === 'authenticated' ? (
        <section className="login-view" aria-labelledby="account-title">
          <div className="intro">
            <p className="eyebrow">Cuenta premium conectada</p>
            <h1 id="account-title">Hola, {authStatus.profile.name}.</h1>
            <p className="lede">
              EmpiLauncher comprobo tu licencia de Minecraft: Java Edition.
            </p>
          </div>

          <div className="account-row">
            <span className="account-avatar" aria-hidden="true">
              {authStatus.profile.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="account-copy">
              <strong>{authStatus.profile.name}</strong>
              <span>{authStatus.profile.id}</span>
            </div>
            <button className="secondary-button" type="button" onClick={logout}>
              Cerrar sesion
            </button>
          </div>
        </section>
      ) : (
        <section className="login-view" aria-labelledby="login-title">
          <div className="intro">
            <p className="eyebrow">Tu biblioteca de Minecraft</p>
            <h1 id="login-title">Todo listo para empezar.</h1>
            <p className="lede">
              Accede con tu cuenta de Microsoft para encontrar tus proyectos y
              mantener cada version al dia.
            </p>
          </div>

          <div className="login-actions">
            <button
              className="microsoft-button"
              type="button"
              disabled={isBusy || !canLogin}
              onClick={startMicrosoftLogin}
            >
              <MicrosoftMark />
              {authStatus.state === 'working'
                ? 'Esperando a Microsoft...'
                : 'Continuar con Microsoft'}
            </button>

            {authStatus.state === 'not-configured' && (
              <p className="status-message" role="status">
                Falta conectar la aplicacion de Microsoft.
              </p>
            )}
            {authStatus.state === 'error' && (
              <p className="status-message error" role="alert">
                {authStatus.message}
              </p>
            )}
            {authResult && !authResult.ok && (
              <p className="status-message error" role="alert">
                {authResult.message}
              </p>
            )}
          </div>
        </section>
      )}

      <footer className="statusbar">
        <span>{statusLabel(authStatus)}</span>
        <span>{appInfo ? `v${appInfo.version} - ${appInfo.platform}` : 'Cargando...'}</span>
      </footer>
    </main>
  )
}

export default App
