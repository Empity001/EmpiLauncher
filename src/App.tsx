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

  const isBusy = authStatus.state === 'loading' || authStatus.state === 'working'
  const isConfigured = authStatus.state === 'ready' || authStatus.state === 'working'

  return (
    <main className="launcher-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">E</span>
          <span>EmpiLauncher</span>
        </div>
        <span className="foundation-tag">Premium foundation</span>
      </header>

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
            disabled={isBusy || !isConfigured}
            onClick={startMicrosoftLogin}
          >
            <MicrosoftMark />
            {authStatus.state === 'working'
              ? 'Abriendo Microsoft...'
              : 'Continuar con Microsoft'}
          </button>

          {authStatus.state === 'not-configured' && (
            <p className="status-message" role="status">
              Falta conectar la aplicacion de Microsoft.
            </p>
          )}
          {authResult && !authResult.ok && (
            <p className="status-message error" role="alert">
              {authResult.message}
            </p>
          )}
        </div>
      </section>

      <footer className="statusbar">
        <span>
          {authStatus.state === 'ready'
            ? 'Microsoft preparado'
            : 'Configuracion inicial'}
        </span>
        <span>{appInfo ? `v${appInfo.version} - ${appInfo.platform}` : 'Cargando...'}</span>
      </footer>
    </main>
  )
}

export default App
