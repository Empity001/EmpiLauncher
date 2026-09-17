async function getConfig() {
    const res = await fetch('/api/config')
    return res.json()
}

async function saveConfig(partial) {
    const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial)
    })
    return res.json()
}

function streamJob(jobId, logEl, onDone) {
    logEl.hidden = false
    const source = new EventSource(`/api/jobs/${jobId}/stream`)
    source.onmessage = (event) => {
        const data = JSON.parse(event.data)
        if (data.line != null) {
            logEl.textContent += data.line + '\n'
            logEl.scrollTop = logEl.scrollHeight
        }
        if (data.done) {
            source.close()
            if (data.error) {
                logEl.textContent += `\nERROR: ${data.error}\n`
            } else {
                logEl.textContent += '\nListo.\n'
            }
            logEl.scrollTop = logEl.scrollHeight
            onDone(data.error)
        }
    }
    source.onerror = () => {
        source.close()
        logEl.textContent += '\n(se corto la conexion con el servidor)\n'
        onDone('connection lost')
    }
}

async function startJob(endpoint, body, button, logEl) {
    logEl.textContent = ''
    logEl.hidden = false
    button.disabled = true
    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
        const { jobId } = await res.json()
        streamJob(jobId, logEl, () => { button.disabled = false })
    } catch (err) {
        logEl.textContent += `\nERROR: ${err.message}\n`
        button.disabled = false
    }
}

document.getElementById('publishLauncherButton').addEventListener('click', () => {
    const bumpVersion = document.getElementById('bumpVersion').checked
    startJob('/api/jobs/launcher', { bumpVersion },
        document.getElementById('publishLauncherButton'),
        document.getElementById('launcherLog'))
})

document.getElementById('publishPacksButton').addEventListener('click', () => {
    const commitMessage = document.getElementById('commitMessage').value
    startJob('/api/jobs/packs', { commitMessage },
        document.getElementById('publishPacksButton'),
        document.getElementById('packsLog'))
})

const settingsModal = document.getElementById('settingsModal')
const settingsFields = ['launcherRepoPath', 'empiPacksRepoPath', 'empiPacksGithubRepo', 'launcherGithubRepo', 'nebulaProjectPath', 'nebulaRootPath', 'nebulaCommand', 'largeFileThresholdMb']

document.getElementById('settingsButton').addEventListener('click', async () => {
    const config = await getConfig()
    for (const field of settingsFields) {
        document.getElementById(field).value = config[field] ?? ''
    }
    settingsModal.hidden = false
})

document.getElementById('closeSettingsButton').addEventListener('click', () => {
    settingsModal.hidden = true
})

document.getElementById('saveSettingsButton').addEventListener('click', async () => {
    const partial = {}
    for (const field of settingsFields) {
        const el = document.getElementById(field)
        partial[field] = el.type === 'number' ? Number(el.value) : el.value
    }
    await saveConfig(partial)
    settingsModal.hidden = true
})
