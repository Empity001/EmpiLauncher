/**
 * Detección compartida de "poca RAM" para el modo de optimización absoluta.
 * La usan tanto el proceso principal (index.js, para decidir si desactiva la
 * aceleración de GPU antes de que la app esté lista) como el renderer
 * (landing.js, para decidir si carga fondos/banners/animaciones). Vive en un
 * único lugar para que el umbral nunca quede desincronizado entre los dos.
 */
const os = require('os')

const LOW_MEMORY_THRESHOLD_BYTES = 6 * 1024 * 1024 * 1024 // 6 GB

function isLowMemorySystem(){
    try {
        return os.totalmem() < LOW_MEMORY_THRESHOLD_BYTES
    } catch(_) {
        return false
    }
}

module.exports = { LOW_MEMORY_THRESHOLD_BYTES, isLowMemorySystem }
