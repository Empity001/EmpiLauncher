/**
 * Makes `require('electron')` and `require('@electron/remote')` resolve to the shim, for every module loaded after this runs.
 * Only these two specifiers are redirected; everything else (helios-core, fs-extra, the launcher's own modules) is untouched.
 */
const Module = require('module')
const path = require('path')

const SHIM = path.join(__dirname, 'electron.js')
const original = Module._resolveFilename

Module._resolveFilename = function resolveWithShim(request, parent, ...rest) {
    if (request === 'electron' || request === '@electron/remote') return SHIM
    return original.call(this, request, parent, ...rest)
}

module.exports = require(SHIM)
