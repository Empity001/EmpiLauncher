import { useEffect, useState } from 'react'
import type {
  AppInfo,
  CurseForgeStatus,
  PackInfo,
  PreparePackResult,
} from './types/bridge'
import './App.css'

const INITIAL_CURSEFORGE_STATUS: CurseForgeStatus = { state: 'loading' }

function launcherLabel(status: CurseForgeStatus) {
  switch (status.state) {
    case 'detected':
      return status.variant === 'standalone'
        ? 'CurseForge detectado'
        : 'CurseForge + Overwolf detectado'
    case 'not-found': return 'CurseForge no detectado'
    case 'unsupported': return 'Deteccion disponible en Windows'
    default: return 'Buscando CurseForge'
  }
}

function App() {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [pack, setPack] = useState<PackInfo | null>(null)
  const [curseForge, setCurseForge] = useState<CurseForgeStatus>(
    INITIAL_CURSEFORGE_STATUS,
  )
  const [preparedPack, setPreparedPack] = useState<PreparePackResult | null>(null)
  const [isPreparing, setIsPreparing] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    Promise.all([
      window.empi.getAppInfo(),
      window.empi.getPackInfo(),
      window.empi.curseForge.getStatus(),
    ]).then(([info, packInfo, status]) => {
      if (!active) return
      setAppInfo(info)
      setPack(packInfo)
      setCurseForge(status)
    }).catch((error: unknown) => {
      if (!active) return
      setActionError(
        error instanceof Error ? error.message : 'No se pudo iniciar EmpiLauncher.',
      )
    })

    return () => {
      active = false
    }
  }, [])

  const preparePack = async () => {
    setActionError(null)
    setIsPreparing(true)
    try {
      const result = await window.empi.curseForge.preparePack()
      setPreparedPack(result)
      if (!result.ok) setActionError(result.message)
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'No se pudo preparar el paquete.',
      )
    } finally {
      setIsPreparing(false)
    }
  }

  const runAction = async (action: () => Promise<{ ok: true } | { ok: false; message: string }>) => {
    setActionError(null)
    try {
      const result = await action()
      if (!result.ok) setActionError(result.message)
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'La accion no pudo completarse.',
      )
    }
  }

  const isPackReady = preparedPack?.ok === true
  const launcherDetected = curseForge.state === 'detected'

  return (
    <main className="launcher-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">E</span>
          <span>EmpiLauncher</span>
        </div>
        <span className="foundation-tag">CurseForge bridge</span>
      </header>

      <section className="pack-view" aria-labelledby="pack-title">
        <div className="intro">
          <p className="eyebrow">Primera instancia</p>
          <h1 id="pack-title">Forge 1.20.1, listo para importar.</h1>
          <p className="lede">
            EmpiLauncher prepara el perfil y CurseForge instala Minecraft y Forge.
            Tu cuenta sigue viviendo en el launcher que ya utilizas.
          </p>
        </div>

        <dl className="pack-specs">
          <div>
            <dt>Minecraft</dt>
            <dd>{pack?.minecraftVersion ?? '1.20.1'}</dd>
          </div>
          <div>
            <dt>Modloader</dt>
            <dd>{pack ? `${pack.loader} ${pack.loaderVersion}` : 'Forge 47.4.10'}</dd>
          </div>
          <div>
            <dt>Paquete</dt>
            <dd>{pack ? `v${pack.version}` : 'Cargando'}</dd>
          </div>
        </dl>

        <div className="bridge-panel">
          <div className="bridge-status">
            <span
              className={`status-dot ${launcherDetected ? 'detected' : ''}`}
              aria-hidden="true"
            />
            <div>
              <strong>{launcherLabel(curseForge)}</strong>
              <span>
                {launcherDetected
                  ? 'La importacion se terminara dentro de CurseForge.'
                  : 'Puedes preparar el ZIP aunque CurseForge no aparezca aqui.'}
              </span>
            </div>
          </div>

          <button
            className="primary-button"
            type="button"
            disabled={isPreparing || !pack}
            onClick={preparePack}
          >
            {isPreparing ? 'Preparando...' : 'Preparar para CurseForge'}
          </button>
        </div>

        {isPackReady && (
          <div className="prepared-panel" role="status">
            <div className="prepared-copy">
              <p className="prepared-title">Paquete preparado</p>
              <span title={preparedPack.path}>{preparedPack.fileName}</span>
              <small>En CurseForge: Minecraft &gt; Import &gt; Choose .zip</small>
            </div>
            <div className="prepared-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => runAction(() => window.empi.curseForge.showPreparedPack())}
              >
                Mostrar ZIP
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => runAction(() => window.empi.curseForge.open())}
              >
                {launcherDetected ? 'Abrir CurseForge' : 'Obtener CurseForge'}
              </button>
            </div>
          </div>
        )}

        {actionError && (
          <p className="status-message error" role="alert">{actionError}</p>
        )}
      </section>

      <footer className="statusbar">
        <span>{launcherLabel(curseForge)}</span>
        <span>{appInfo ? `v${appInfo.version} - ${appInfo.platform}` : 'Cargando...'}</span>
      </footer>
    </main>
  )
}

export default App
