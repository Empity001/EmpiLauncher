import { useEffect, useState } from 'react'
import type {
  AppInfo,
  CurseForgeStatus,
  DirectInstanceResult,
  DirectInstanceStatus,
  InstallProgress,
  LauncherKind,
  ModrinthStatus,
  PackInfo,
} from './types/bridge'
import './App.css'

const INITIAL_CURSEFORGE_STATUS: CurseForgeStatus = { state: 'loading' }
const INITIAL_MODRINTH_STATUS: ModrinthStatus = { state: 'loading' }
const INITIAL_INSTANCE_STATUS: DirectInstanceStatus = { state: 'loading' }

function launcherLabel(
  launcher: LauncherKind,
  status: CurseForgeStatus | ModrinthStatus,
) {
  switch (status.state) {
    case 'detected':
      if (launcher === 'curseforge' && 'variant' in status) {
        return status.variant === 'standalone'
          ? 'CurseForge detectado'
          : 'CurseForge + Overwolf detectado'
      }
      return 'Modrinth detectado'
    case 'not-found': return `${launcher === 'curseforge' ? 'CurseForge' : 'Modrinth'} no detectado`
    case 'unsupported': return 'Disponible en Windows'
    default: return `Buscando ${launcher === 'curseforge' ? 'CurseForge' : 'Modrinth'}`
  }
}

function instanceLabel(status: DirectInstanceStatus) {
  switch (status.state) {
    case 'absent': return 'La instancia aun no existe'
    case 'installed': return 'Instancia instalada'
    case 'update-available': return 'Actualizacion disponible'
    case 'conflict': return 'El nombre de la instancia ya esta ocupado'
    case 'unsupported': return 'Instalacion disponible en Windows'
    default: return 'Comprobando la instancia'
  }
}

function installButtonLabel(
  launcher: LauncherKind,
  status: DirectInstanceStatus,
  installing: boolean,
) {
  if (installing) return 'Instalando...'
  if (status.state === 'installed') return 'Reparar instancia'
  if (status.state === 'update-available') return 'Actualizar instancia'
  return launcher === 'modrinth' ? 'Crear en Modrinth' : 'Crear instancia'
}

function App() {
  const [selectedLauncher, setSelectedLauncher] = useState<LauncherKind | null>(null)
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [pack, setPack] = useState<PackInfo | null>(null)
  const [curseForge, setCurseForge] = useState<CurseForgeStatus>(INITIAL_CURSEFORGE_STATUS)
  const [modrinth, setModrinth] = useState<ModrinthStatus>(INITIAL_MODRINTH_STATUS)
  const [curseForgeInstance, setCurseForgeInstance] = useState<DirectInstanceStatus>(INITIAL_INSTANCE_STATUS)
  const [modrinthInstance, setModrinthInstance] = useState<DirectInstanceStatus>(INITIAL_INSTANCE_STATUS)
  const [installResult, setInstallResult] = useState<DirectInstanceResult | null>(null)
  const [progress, setProgress] = useState<InstallProgress | null>(null)
  const [isInstalling, setIsInstalling] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const refreshInstance = async (launcher: LauncherKind) => {
    const nextStatus = launcher === 'curseforge'
      ? await window.empi.curseForge.getInstanceStatus()
      : await window.empi.modrinth.getInstanceStatus()
    if (launcher === 'curseforge') setCurseForgeInstance(nextStatus)
    else setModrinthInstance(nextStatus)
    return nextStatus
  }

  useEffect(() => {
    let active = true
    const stopProgress = window.empi.onInstallProgress((nextProgress) => {
      if (active) setProgress(nextProgress)
    })

    Promise.all([
      window.empi.getAppInfo(),
      window.empi.getPackInfo(),
      window.empi.curseForge.getStatus(),
      window.empi.modrinth.getStatus(),
      window.empi.curseForge.getInstanceStatus(),
      window.empi.modrinth.getInstanceStatus(),
    ]).then(([info, packInfo, curseStatus, modrinthStatus, curseInstance, modrinthProfile]) => {
      if (!active) return
      setAppInfo(info)
      setPack(packInfo)
      setCurseForge(curseStatus)
      setModrinth(modrinthStatus)
      setCurseForgeInstance(curseInstance)
      setModrinthInstance(modrinthProfile)
    }).catch((error: unknown) => {
      if (!active) return
      setActionError(error instanceof Error ? error.message : 'No se pudo iniciar EmpiLauncher.')
    })

    return () => {
      active = false
      stopProgress()
    }
  }, [])

  useEffect(() => {
    if (selectedLauncher !== 'modrinth' || !installResult?.ok || !installResult.requiresLauncher) {
      return undefined
    }
    const timer = window.setInterval(() => {
      void refreshInstance('modrinth').then((status) => {
        if (status.state === 'installed' || status.state === 'update-available') {
          setInstallResult(null)
        }
      })
    }, 2_000)
    return () => window.clearInterval(timer)
  }, [installResult, selectedLauncher])

  const chooseLauncher = (launcher: LauncherKind) => {
    setSelectedLauncher(launcher)
    setActionError(null)
    setInstallResult(null)
    setProgress(null)
    void refreshInstance(launcher)
  }

  const goBack = () => {
    if (isInstalling) return
    setSelectedLauncher(null)
    setActionError(null)
    setInstallResult(null)
    setProgress(null)
  }

  const installInstance = async () => {
    if (!selectedLauncher) return
    setActionError(null)
    setInstallResult(null)
    setProgress({
      launcher: selectedLauncher,
      stage: 'preparing',
      message: 'Preparando la instalacion...',
      percent: 0,
    })
    setIsInstalling(true)
    try {
      const result = selectedLauncher === 'curseforge'
        ? await window.empi.curseForge.installOrRepair()
        : await window.empi.modrinth.installOrRepair()
      setInstallResult(result)
      if (!result.ok) {
        setActionError(result.message)
        return
      }
      await refreshInstance(selectedLauncher)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'No se pudo crear la instancia.')
    } finally {
      setIsInstalling(false)
    }
  }

  const runAction = async (
    action: () => Promise<{ ok: true } | { ok: false; message: string }>,
    refresh = false,
  ) => {
    setActionError(null)
    try {
      const result = await action()
      if (!result.ok) setActionError(result.message)
      if (result.ok && refresh && selectedLauncher) await refreshInstance(selectedLauncher)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'La accion no pudo completarse.')
    }
  }

  const launcherStatus = selectedLauncher === 'curseforge' ? curseForge : modrinth
  const instance = selectedLauncher === 'curseforge' ? curseForgeInstance : modrinthInstance
  const instanceReady = instance.state === 'installed' || instance.state === 'update-available'
  const hasConflict = instance.state === 'conflict'
  const unsupported = instance.state === 'unsupported'
  const selectedProgress = progress?.launcher === selectedLauncher ? progress : null
  const launcherDetected = launcherStatus.state === 'detected'
  const launcherName = selectedLauncher === 'curseforge' ? 'CurseForge' : 'Modrinth'

  return (
    <main className="launcher-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">E</span>
          <span>EmpiLauncher</span>
        </div>
        <span className="foundation-tag">
          {selectedLauncher ? launcherName : 'Elige tu launcher'}
        </span>
      </header>

      {!selectedLauncher ? (
        <section className="launcher-picker" aria-labelledby="launcher-picker-title">
          <div className="picker-intro">
            <p className="eyebrow">Tu instancia, donde prefieras</p>
            <h1 id="launcher-picker-title">¿Donde jugamos hoy?</h1>
            <p className="lede">Elige el launcher que ya usas. EmpiLauncher recordara cada instancia por separado.</p>
          </div>
          <div className="launcher-options">
            <button className="launcher-option curseforge-option" type="button" onClick={() => chooseLauncher('curseforge')}>
              <span className="launcher-monogram">CF</span>
              <span className="launcher-option-copy">
                <strong>CurseForge</strong>
                <small>Instalacion directa y silenciosa</small>
                <span>{curseForgeInstance.state === 'installed' || curseForgeInstance.state === 'update-available'
                  ? instanceLabel(curseForgeInstance)
                  : launcherLabel('curseforge', curseForge)}</span>
              </span>
              <span className="option-arrow" aria-hidden="true">&gt;</span>
            </button>
            <button className="launcher-option modrinth-option" type="button" onClick={() => chooseLauncher('modrinth')}>
              <span className="launcher-monogram">MR</span>
              <span className="launcher-option-copy">
                <strong>Modrinth</strong>
                <small>Instalacion mediante Modrinth App</small>
                <span>{modrinthInstance.state === 'installed' || modrinthInstance.state === 'update-available'
                  ? instanceLabel(modrinthInstance)
                  : launcherLabel('modrinth', modrinth)}</span>
              </span>
              <span className="option-arrow" aria-hidden="true">&gt;</span>
            </button>
          </div>
          {actionError && <p className="status-message error" role="alert">{actionError}</p>}
        </section>
      ) : (
        <section className="pack-view" aria-labelledby="pack-title">
          <button className="back-button" type="button" disabled={isInstalling} onClick={goBack}>
            <span aria-hidden="true">&lt;</span> Atras
          </button>

          <div className="intro">
            <p className="eyebrow">{launcherName}</p>
            <h1 id="pack-title">Forge 1.20.1, listo para {launcherName}.</h1>
            <p className="lede">
              {selectedLauncher === 'curseforge'
                ? 'EmpiLauncher instala Minecraft, Forge y sus librerias, y despues sincroniza solo los archivos gestionados.'
                : 'EmpiLauncher prepara el paquete, Modrinth crea la instancia y luego recordamos su carpeta para las actualizaciones.'}
            </p>
          </div>

          <dl className="pack-specs">
            <div><dt>Minecraft</dt><dd>{pack?.minecraftVersion ?? '1.20.1'}</dd></div>
            <div><dt>Modloader</dt><dd>{pack ? `${pack.loader} ${pack.loaderVersion}` : 'Forge 47.4.10'}</dd></div>
            <div><dt>Paquete</dt><dd>{pack ? `v${pack.version}` : 'Cargando'}</dd></div>
          </dl>

          <div className="bridge-panel">
            <div className="bridge-status">
              <span className={`status-dot ${instanceReady ? 'detected' : ''}`} aria-hidden="true" />
              <div>
                <strong>{instanceLabel(instance)}</strong>
                <span title={'path' in instance ? instance.path : undefined}>
                  {'path' in instance ? instance.path : `Carpeta de ${launcherName}`}
                </span>
              </div>
            </div>
            <button className="primary-button" type="button" disabled={isInstalling || !pack || hasConflict || unsupported} onClick={installInstance}>
              {installButtonLabel(selectedLauncher, instance, isInstalling)}
            </button>
          </div>

          {isInstalling && selectedProgress && (
            <div className="progress-panel" role="status" aria-live="polite">
              <div className="progress-heading">
                <p className="prepared-title">{selectedProgress.message}</p>
                <strong>{selectedProgress.percent}%</strong>
              </div>
              <div className="progress-track" aria-hidden="true">
                <span style={{ width: `${selectedProgress.percent}%` }} />
              </div>
              <small title={selectedProgress.currentFile}>{selectedProgress.currentFile ?? 'Comprobando archivos necesarios...'}</small>
            </div>
          )}

          {installResult?.ok && installResult.requiresLauncher && !instanceReady && (
            <div className="handoff-panel" role="status">
              <div className="prepared-copy">
                <p className="prepared-title">Termina en Modrinth</p>
                <span>{installResult.message}</span>
                <small>EmpiLauncher detectara la nueva instancia automaticamente.</small>
              </div>
              <button className="secondary-button" type="button" onClick={() => runAction(() => window.empi.modrinth.locateInstance(), true)}>
                Buscar carpeta
              </button>
            </div>
          )}

          {instanceReady && !isInstalling && (
            <div className="prepared-panel" role="status">
              <div className="prepared-copy">
                <p className="prepared-title">Instancia lista</p>
                <span title={instance.path}>{instance.path}</span>
                <small>Esta ruta queda guardada para las proximas actualizaciones.</small>
              </div>
              <div className="prepared-actions">
                <button className="secondary-button" type="button" onClick={() => runAction(() => selectedLauncher === 'curseforge' ? window.empi.curseForge.openInstance() : window.empi.modrinth.openInstance())}>
                  Abrir carpeta
                </button>
                <button className="secondary-button" type="button" onClick={() => runAction(() => selectedLauncher === 'curseforge' ? window.empi.curseForge.open() : window.empi.modrinth.open())}>
                  {launcherDetected ? `Abrir ${launcherName}` : `Obtener ${launcherName}`}
                </button>
              </div>
            </div>
          )}

          {selectedLauncher === 'modrinth' && !instanceReady && !isInstalling && !installResult?.ok && (
            <button className="text-button" type="button" onClick={() => runAction(() => window.empi.modrinth.locateInstance(), true)}>
              Ya existe, buscar su carpeta
            </button>
          )}
          {hasConflict && <p className="status-message error" role="alert">EmpiLauncher no sobrescribira una instancia ajena.</p>}
          {actionError && <p className="status-message error" role="alert">{actionError}</p>}
        </section>
      )}

      <footer className="statusbar">
        <span>{selectedLauncher ? launcherLabel(selectedLauncher, launcherStatus) : 'CurseForge + Modrinth'}</span>
        <span>{appInfo ? `v${appInfo.version} - ${appInfo.platform}` : 'Cargando...'}</span>
      </footer>
    </main>
  )
}

export default App
