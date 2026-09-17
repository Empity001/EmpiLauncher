const { spawn } = require('child_process')

/**
 * Runs a command, streaming each output line to `onLine` as it arrives (for live
 * log UIs), and resolves/rejects based on the exit code. Does not print the
 * command itself - callers that want that visible should log it separately.
 */
function run(command, args, options = {}, onLine = () => {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: options.cwd,
            env: options.env ? { ...process.env, ...options.env } : process.env,
            shell: false,
            windowsHide: true
        })

        let buffer = ''
        const feed = (chunk) => {
            buffer += chunk.toString()
            const lines = buffer.split(/\r?\n/)
            buffer = lines.pop()
            for (const line of lines) onLine(line)
        }

        child.stdout.on('data', feed)
        child.stderr.on('data', feed)

        child.on('error', (err) => reject(err))
        child.on('close', (code) => {
            if (buffer) onLine(buffer)
            if (code === 0) resolve()
            else reject(new Error(`"${command} ${args.join(' ')}" salio con codigo ${code}`))
        })
    })
}

/** Runs a command silently and returns its combined stdout+stderr as a string. */
async function capture(command, args, options = {}) {
    const lines = []
    await run(command, args, options, (line) => lines.push(line))
    return lines.join('\n').trim()
}

/** npm is a .cmd shim on Windows, which plain spawn() can't exec directly without shell:true. */
function npmBinary() {
    return process.platform === 'win32' ? 'npm.cmd' : 'npm'
}

module.exports = { run, capture, npmBinary }
