// A child process of the engine: makes the frames of one animated picture (see anim.js) and prints the result as one line of JSON.
// It lives only as long as the job, so everything the image library held goes back to the system when it ends.
//   node anim-worker.js '{"file": "...", "outDir": "...", "format": "png", "maxWidth": 560, "maxFrames": 120, "minDelay": 40}'
const { build } = require('./anim')

const options = JSON.parse(process.argv[2] || '{}')
build(options.file, options.outDir, options)
    .then((result) => { process.stdout.write(JSON.stringify(result)); process.exit(0) })
    .catch((err) => { process.stdout.write(JSON.stringify({ animated: false, reason: 'error', error: String((err && err.message) || err) })); process.exit(0) })
