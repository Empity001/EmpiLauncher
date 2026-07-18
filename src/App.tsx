import { useEffect, useState } from 'react'
import type {
  AppInfo,
  CurseForgeStatus,
  DirectInstanceResult,
  DirectInstanceStatus,
  InstallProgress,
  PackInfo,
} from './types/bridge'
import './App.css'

const INITIAL_CURSEFORGE_STATUS: CurseForgeStatus = { state: 'loading' }
const INITIAL_INSTANCE_STATUS: DirectInstanceStatus = { state: 'loading' }

function launcherLabel(status: CurseForgeStatus) {
  switch (status.state) {
    case 'detected':
      return status.variant === 'standalone'
        ? 'CurseForge detectado'
        : 'CurseForge + Overwolf detectado'
    case 'not-found': return 'CurseForge no detectado'
    case 'unsupported': return 'Disponible en Windows'
    default: return 'Buscando CurseForge'
  }
}

function instanceLabel(status: DirectInstanceStatus) {
  switch (status.state) {
    case 'absent': return 'La instancia aun no existe'
    case 'installed': return 'Instancia instalada'
    case 'update-available': return 'Actualizacion disponible'
    case 'conflict': return 'El nombre de la instancia ya esta ocupado'
    case 'unsupported': return 'Instalacion directa disponible en Windows'
    default: return 'Comprobando la instancia'
  }
}

function installButtonLabel(status: DirectInstanceStatus, installing: boolean) {
  if (installing) return 'Instalando...'
  if (status.state === 'installed') return 'Reparar instancia'
  if (status.state === 'update-available') return 'Actualizar instancia'
  return 'Crear instancia'
}

function App() {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [pack, setPack] = useState<PackInfo | null>(null)
  const [curseForge, setCurseForge] = useState<CurseForgeStatus>(
    INITIAL_CURSEFORGE_STATUS,
  )
  const [instance, setInstance] = useState<DirectInstanceStatus>(
    INITIAL_INSTANCE_STATUS,
  )
  const [installResult, setInstallResult] = useState<DirectInstanceResult | null>(null)
  const [progress, setProgress] = useState<InstallProgress | null>(null)
  const [isInstalling, setIsInstalling] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const stopProgress = window.empi.curseForge.onInstallProgress((nextProgress) => {
      if (active) setProgress(nextProgress)
    })

    Promise.all([
      window.empi.getAppInfo(),
      window.empi.getPackInfo(),
      window.empi.curseForge.getStatus(),
      window.empi.curseForge.getInstanceStatus(),
    ]).then(([info, packInfo, status, instanceStatus]) => {
      if (!active) return
      setAppInfo(info)
      setPack(packInfo)
      setCurseForge(status)
      setInstance(instanceStatus)
    }).catch((error: unknown) => {
      if (!active) return
      setActionError(
        error instanceof Error ? error.message : 'No se pudo iniciar EmpiLauncher.',
      )
    })

    return () => {
      active = false
      stopProgress()
    }
  }, [])

  const installInstance = async () => {
    setActionError(null)
    setInstallResult(null)
    setProgress({ stage: 'minecraft', message: 'Preparando la instalacion...' })
    setIsInstalling(true)
    try {
      const result = await window.empi.curseForge.installOrRepair()
      setInstallResult(result)
      if (!result.ok) {
        setActionError(result.message)
        return
      }
      setInstance(await window.empi.curseForge.getInstanceStatus())
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'No se pudo crear la instancia.',
      )
    } finally {
      setIsInstalling(false)
    }
  }

  const runAction = async (
    action: () => Promise<{ ok: true } | { ok: false; message: string }>,
  ) => {
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

  const launcherDetected = curseForge.state === 'detected'
  const instanceReady = instance.state === 'installed'
    || instance.state === 'update-available'
  const hasConflict = instance.state === 'conflict'
  const unsupported = instance.state === 'unsupported'

  return (
    <main className="launcher-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">E</span>
          <span>EmpiLauncher</span>
        </div>
        <span className="foundation-tag">CurseForge directo</span>
      </header>

      <section className="pack-view" aria-labelledby="pack-title">
        <div className="intro">
          <p className="eyebrow">Primera instancia</p>
          <h1 id="pack-title">Forge 1.20.1, directo a CurseForge.</h1>
          <p className="lede">
            EmpiLauncher crea la instancia en tu carpeta de CurseForge e instala
            Minecraft, Forge y sus librerias si hacen falta. Sin ZIP y sin importar nada.
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
              className={`status-dot ${instanceReady ? 'detected' : ''}`}
              aria-hidden="true"
            />
            <div>
              <strong>{instanceLabel(instance)}</strong>
              <span title={'path' in instance ? instance.path : undefined}>
                {'path' in instance
                  ? instance.path
                  : 'C:\\Users\\tu-usuario\\curseforge\\minecraft\\Instances'}
              </span>
            </div>
          </div>

          <button
            className="primary-button"
            type="button"
            disabled={isInstalling || !pack || hasConflict || unsupported}
            onClick={installInstance}
          >
            {installButtonLabel(instance, isInstalling)}
          </button>
        </div>

        {isInstalling && progress && (
          <div className="progress-panel" role="status" aria-live="polite">
            <span className="progress-pulse" aria-hidden="true" />
            <div>
              <p className="prepared-title">Preparando una instancia funcional</p>
              <span>{progress.message}</span>
              <small>La primera instalacion puede tardar varios minutos.</small>
            </div>
          </div>
        )}

        {instanceReady && !isInstalling && (
          <div className="prepared-panel" role="status">
            <div className="prepared-copy">
              <p className="prepared-title">
                {installResult?.ok && installResult.created
                  ? 'Instancia creada'
                  : 'Instancia lista'}
              </p>
              <span title={instance.path}>{instance.path}</span>
              <small>Si CurseForge estaba abierto, cierralo y vuelve a abrirlo para refrescar la lista.</small>
            </div>
            <div className="prepared-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => runAction(() => window.empi.curseForge.openInstance())}
              >
                Abrir carpeta
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

        {hasConflict && (
          <p className="status-message error" role="alert">
            Cambia de nombre o mueve la carpeta existente; EmpiLauncher no la sobrescribira.
          </p>
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
