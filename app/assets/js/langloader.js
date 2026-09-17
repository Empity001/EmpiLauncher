const fs = require('fs-extra')
const path = require('path')
const toml = require('toml')
const merge = require('lodash.merge')

const SUPPORTED_LANGUAGES = new Set(['en_US', 'es_ES'])
let lang = {}

function resolveLanguage(selectedLanguage = 'auto'){
    if(SUPPORTED_LANGUAGES.has(selectedLanguage)){
        return selectedLanguage
    }

    const systemLanguage = Intl.DateTimeFormat()
        .resolvedOptions()
        .locale
        .toLowerCase()

    return systemLanguage.startsWith('es') ? 'es_ES' : 'en_US'
}

exports.loadLanguage = function(id){
    const languagePath = path.join(__dirname, '..', 'lang', `${id}.toml`)
    if(!fs.existsSync(languagePath)){
        return false
    }

    const parsed = toml.parse(fs.readFileSync(languagePath, 'utf8')) || {}
    lang = merge(lang, parsed)
    return true
}

exports.query = function(id, placeHolders){
    let res = lang

    for(const key of id.split('.')){
        if(res == null || typeof res !== 'object' || !(key in res)){
            return ''
        }
        res = res[key]
    }

    if(placeHolders && typeof res === 'string'){
        Object.entries(placeHolders).forEach(([key, value]) => {
            res = res.replaceAll(`{${key}}`, value)
        })
    }

    return res
}

exports.queryJS = function(id, placeHolders){
    return exports.query(`js.${id}`, placeHolders)
}

exports.queryEJS = function(id, placeHolders){
    return exports.query(`ejs.${id}`, placeHolders)
}

exports.setupLanguage = function(selectedLanguage = 'auto'){
    lang = {}

    const language = resolveLanguage(selectedLanguage)

    // English is always loaded first as a fallback.
    exports.loadLanguage('en_US')

    if(language !== 'en_US'){
        exports.loadLanguage(language)
    }

    // Shared launcher branding and links override both languages.
    exports.loadLanguage('_custom')
}
