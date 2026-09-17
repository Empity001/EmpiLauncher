// Requirements
const os     = require('os')
const semver = require('semver')
const screenshotsCrypto = require('crypto')
const screenshotsFs = require('fs-extra')
const { pathToFileURL: screenshotPathToFileURL } = require('url')

const DropinModUtil  = require('./assets/js/dropinmodutil')
const { MSFT_OPCODE, MSFT_REPLY_TYPE, MSFT_ERROR } = require('./assets/js/ipcconstants')

const settingsState = {
    invalid: new Set()
}
const loggerScreenshots = LoggerUtil.getLogger('Screenshots')

function bindSettingsSelect(){
    for(let ele of document.getElementsByClassName('settingsSelectContainer')) {
        const selectedDiv = ele.getElementsByClassName('settingsSelectSelected')[0]

        selectedDiv.onclick = (e) => {
            e.stopPropagation()
            closeSettingsSelect(e.target)
            e.target.nextElementSibling.toggleAttribute('hidden')
            e.target.classList.toggle('select-arrow-active')
        }
    }
}

function closeSettingsSelect(el){
    for(let ele of document.getElementsByClassName('settingsSelectContainer')) {
        const selectedDiv = ele.getElementsByClassName('settingsSelectSelected')[0]
        const optionsDiv = ele.getElementsByClassName('settingsSelectOptions')[0]

        if(!(selectedDiv === el)) {
            selectedDiv.classList.remove('select-arrow-active')
            optionsDiv.setAttribute('hidden', '')
        }
    }
}

/* If the user clicks anywhere outside the select box,
then close all select boxes: */
document.addEventListener('click', closeSettingsSelect)

bindSettingsSelect()


function bindFileSelectors(){
    for(let ele of document.getElementsByClassName('settingsFileSelButton')){
        
        ele.onclick = async e => {
            const isJavaExecSel = ele.id === 'settingsJavaExecSel'
            const directoryDialog = ele.hasAttribute('dialogDirectory') && ele.getAttribute('dialogDirectory') == 'true'
            const properties = directoryDialog ? ['openDirectory', 'createDirectory'] : ['openFile']

            const options = {
                properties
            }

            if(ele.hasAttribute('dialogTitle')) {
                options.title = ele.getAttribute('dialogTitle')
            }

            if(isJavaExecSel && process.platform === 'win32') {
                options.filters = [
                    { name: Lang.queryJS('settings.fileSelectors.executables'), extensions: ['exe'] },
                    { name: Lang.queryJS('settings.fileSelectors.allFiles'), extensions: ['*'] }
                ]
            }

            const res = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), options)
            if(!res.canceled) {
                ele.previousElementSibling.value = res.filePaths[0]
                if(isJavaExecSel) {
                    await populateJavaExecDetails(ele.previousElementSibling.value)
                }
            }
        }
    }
}

bindFileSelectors()


/**
 * General Settings Functions
 */

/**
  * Bind value validators to the settings UI elements. These will
  * validate against the criteria defined in the ConfigManager (if
  * any). If the value is invalid, the UI will reflect this and saving
  * will be disabled until the value is corrected. This is an automated
  * process. More complex UI may need to be bound separately.
  */
function initSettingsValidators(){
    const sEls = document.getElementById('settingsContainer').querySelectorAll('[cValue]')
    Array.from(sEls).map((v, index, arr) => {
        const vFn = ConfigManager['validate' + v.getAttribute('cValue')]
        if(typeof vFn === 'function'){
            if(v.tagName === 'INPUT'){
                if(v.type === 'number' || v.type === 'text'){
                    v.addEventListener('keyup', (e) => {
                        const v = e.target
                        if(!vFn(v.value)){
                            settingsState.invalid.add(v.id)
                            v.setAttribute('error', '')
                            settingsSaveDisabled(true)
                        } else {
                            if(v.hasAttribute('error')){
                                v.removeAttribute('error')
                                settingsState.invalid.delete(v.id)
                                if(settingsState.invalid.size === 0){
                                    settingsSaveDisabled(false)
                                }
                            }
                        }
                    })
                }
            }
        }

    })
}

/**
 * Load configuration values onto the UI. This is an automated process.
 */
async function initSettingsValues(deferJavaDetails = false){
    const sEls = document.getElementById('settingsContainer').querySelectorAll('[cValue]')

    for(const v of sEls) {
        const cVal = v.getAttribute('cValue')
        const serverDependent = v.hasAttribute('serverDependent') // Means the first argument is the server id.
        const gFn = ConfigManager['get' + cVal]
        const gFnOpts = []
        if(serverDependent) {
            gFnOpts.push(ConfigManager.getSelectedServer())
        }
        if(typeof gFn === 'function'){
            if(v.tagName === 'INPUT'){
                if(v.type === 'number' || v.type === 'text'){
                    // Special Conditions
                    if(cVal === 'JavaExecutable'){
                        v.value = gFn.apply(null, gFnOpts)
                        if(!deferJavaDetails){
                            await populateJavaExecDetails(v.value)
                        }
                    } else if (cVal === 'DataDirectory'){
                        v.value = gFn.apply(null, gFnOpts)
                    } else if(cVal === 'JVMOptions'){
                        v.value = gFn.apply(null, gFnOpts).join(' ')
                    } else {
                        v.value = gFn.apply(null, gFnOpts)
                    }
                } else if(v.type === 'checkbox'){
                    v.checked = gFn.apply(null, gFnOpts)
                }
            } else if(v.tagName === 'DIV'){
                if(v.classList.contains('rangeSlider')){
                    // Special Conditions
                    if(cVal === 'MinRAM' || cVal === 'MaxRAM'){
                        let val = gFn.apply(null, gFnOpts)
                        if(val.endsWith('M')){
                            val = Number(val.substring(0, val.length-1))/1024
                        } else {
                            val = Number.parseFloat(val)
                        }

                        v.setAttribute('value', val)
                    } else {
                        v.setAttribute('value', Number.parseFloat(gFn.apply(null, gFnOpts)))
                    }
                }
            }
        }
    }

}

/**
 * Save the settings values.
 */
function saveSettingsValues(){
    const sEls = document.getElementById('settingsContainer').querySelectorAll('[cValue]')
    Array.from(sEls).map((v, index, arr) => {
        const cVal = v.getAttribute('cValue')
        const serverDependent = v.hasAttribute('serverDependent') // Means the first argument is the server id.
        const sFn = ConfigManager['set' + cVal]
        const sFnOpts = []
        if(serverDependent) {
            sFnOpts.push(ConfigManager.getSelectedServer())
        }
        if(typeof sFn === 'function'){
            if(v.tagName === 'INPUT'){
                if(v.type === 'number' || v.type === 'text'){
                    // Special Conditions
                    if(cVal === 'JVMOptions'){
                        if(!v.value.trim()) {
                            sFnOpts.push([])
                            sFn.apply(null, sFnOpts)
                        } else {
                            sFnOpts.push(v.value.trim().split(/\s+/))
                            sFn.apply(null, sFnOpts)
                        }
                    } else {
                        sFnOpts.push(v.value)
                        sFn.apply(null, sFnOpts)
                    }
                } else if(v.type === 'checkbox'){
                    sFnOpts.push(v.checked)
                    sFn.apply(null, sFnOpts)
                    // Special Conditions
                    if(cVal === 'AllowPrerelease'){
                        changeAllowPrerelease(v.checked)
                    }
                }
            } else if(v.tagName === 'DIV'){
                if(v.classList.contains('rangeSlider')){
                    // Special Conditions
                    if(cVal === 'MinRAM' || cVal === 'MaxRAM'){
                        let val = Number(v.getAttribute('value'))
                        if(val%1 > 0){
                            val = val*1024 + 'M'
                        } else {
                            val = val + 'G'
                        }

                        sFnOpts.push(val)
                        sFn.apply(null, sFnOpts)
                    } else {
                        sFnOpts.push(v.getAttribute('value'))
                        sFn.apply(null, sFnOpts)
                    }
                }
            }
        }
    })
}

let selectedSettingsTab = 'settingsTabAccount'

/**
 * Modify the settings container UI when the scroll threshold reaches
 * a certain poin.
 * 
 * @param {UIEvent} e The scroll event.
 */
function settingsTabScrollListener(e){
    if(e.target.scrollTop > Number.parseFloat(getComputedStyle(e.target.firstElementChild).marginTop)){
        document.getElementById('settingsContainer').setAttribute('scrolled', '')
    } else {
        document.getElementById('settingsContainer').removeAttribute('scrolled')
    }
}

/**
 * Bind functionality for the settings navigation items.
 */
function setupSettingsTabs(){
    Array.from(document.getElementsByClassName('settingsNavItem')).map((val) => {
        if(val.hasAttribute('rSc')){
            val.onclick = () => {
                settingsNavItemListener(val)
            }
        }
    })
}

/**
 * Settings nav item onclick lisener. Function is exposed so that
 * other UI elements can quickly toggle to a certain tab from other views.
 * 
 * @param {Element} ele The nav item which has been clicked.
 * @param {boolean} fade Optional. True to fade transition.
 */
async function settingsNavItemListener(ele, fade = false){
    if(ele.hasAttribute('selected')){
        return
    }
    const navItems = document.getElementsByClassName('settingsNavItem')
    for(let i=0; i<navItems.length; i++){
        if(navItems[i].hasAttribute('selected')){
            navItems[i].removeAttribute('selected')
        }
    }
    ele.setAttribute('selected', '')
    const prevTab = selectedSettingsTab
    selectedSettingsTab = ele.getAttribute('rSc')
    if(selectedSettingsTab !== 'settingsTabJava'){
        stopMemoryStatusFresh()
    }
    if(prevTab === 'settingsTabScreenshots' && selectedSettingsTab !== 'settingsTabScreenshots'){
        releaseScreenshotsTab()
    }

    const previous = document.getElementById(prevTab)
    const next = document.getElementById(selectedSettingsTab)

    previous.onscroll = null
    next.onscroll = settingsTabScrollListener

    // Paint the selected tab immediately; expensive mod/Java preparation runs
    // afterward so clicking the navigation never feels frozen.
    previous.style.display = 'none'
    next.style.display = ''

    requestAnimationFrame(() => {
        settingsTabScrollListener({ target: next })
    })
    await prepareActiveSettingsTab(selectedSettingsTab)
}

const settingsNavDone = document.getElementById('settingsNavDone')

/**
 * Set if the settings save (done) button is disabled.
 * 
 * @param {boolean} v True to disable, false to enable.
 */
function settingsSaveDisabled(v){
    settingsNavDone.disabled = v
}

function fullSettingsSave() {
    saveSettingsValues()
    const selectedServer = ConfigManager.getSelectedServer()
    // Mod and shader UI is loaded lazily. Do not touch those values unless
    // that tab was actually prepared for the currently selected server.
    if(preparedModsServerId === selectedServer){
        saveModConfiguration()
        saveDropinModConfiguration()
        saveShaderpackSettings()
    }
    ConfigManager.save()
}

/* Closes the settings view and saves all data. */
settingsNavDone.onclick = () => {
    stopMemoryStatusFresh()
    fullSettingsSave()
    switchView(getCurrentView(), VIEWS.landing)
}

/**
 * Account Management Tab
 */

const msftLoginLogger = LoggerUtil.getLogger('Microsoft Login')
const msftLogoutLogger = LoggerUtil.getLogger('Microsoft Logout')

// Bind the add mojang account button.
document.getElementById('settingsAddMojangAccount').onclick = (e) => {
    switchView(getCurrentView(), VIEWS.login, 500, 500, () => {
        loginViewOnCancel = VIEWS.settings
        loginViewOnSuccess = VIEWS.settings
        loginCancelEnabled(true)
    })
}

// Bind the add microsoft account button.
document.getElementById('settingsAddMicrosoftAccount').onclick = (e) => {
    switchView(getCurrentView(), VIEWS.waiting, 500, 500, () => {
        ipcRenderer.send(MSFT_OPCODE.OPEN_LOGIN, VIEWS.settings, VIEWS.settings)
    })
}

// Bind reply for Microsoft Login.
ipcRenderer.on(MSFT_OPCODE.REPLY_LOGIN, (_, ...arguments_) => {
    if (arguments_[0] === MSFT_REPLY_TYPE.ERROR) {

        const viewOnClose = arguments_[2]
        console.log(arguments_)
        switchView(getCurrentView(), viewOnClose, 500, 500, () => {

            if(arguments_[1] === MSFT_ERROR.NOT_FINISHED) {
                // User cancelled.
                msftLoginLogger.info('Login cancelled by user.')
                return
            }

            // Unexpected error.
            setOverlayContent(
                Lang.queryJS('settings.msftLogin.errorTitle'),
                Lang.queryJS('settings.msftLogin.errorMessage'),
                Lang.queryJS('settings.msftLogin.okButton')
            )
            setOverlayHandler(() => {
                toggleOverlay(false)
            })
            toggleOverlay(true)
        })
    } else if(arguments_[0] === MSFT_REPLY_TYPE.SUCCESS) {
        const queryMap = arguments_[1]
        const viewOnClose = arguments_[2]

        // Error from request to Microsoft.
        if (Object.prototype.hasOwnProperty.call(queryMap, 'error')) {
            switchView(getCurrentView(), viewOnClose, 500, 500, () => {
                // TODO Dont know what these errors are. Just show them I guess.
                // This is probably if you messed up the app registration with Azure.      
                let error = queryMap.error // Error might be 'access_denied' ?
                let errorDesc = queryMap.error_description
                console.log('Error getting authCode, is Azure application registered correctly?')
                console.log(error)
                console.log(errorDesc)
                console.log('Full query map: ', queryMap)
                setOverlayContent(
                    error,
                    errorDesc,
                    Lang.queryJS('settings.msftLogin.okButton')
                )
                setOverlayHandler(() => {
                    toggleOverlay(false)
                })
                toggleOverlay(true)

            })
        } else {

            msftLoginLogger.info('Acquired authCode, proceeding with authentication.')

            const authCode = queryMap.code
            AuthManager.addMicrosoftAccount(authCode).then(value => {
                updateSelectedAccount(value)
                switchView(getCurrentView(), viewOnClose, 500, 500, async () => {
                    await prepareSettings()
                })
            })
                .catch((displayableError) => {

                    let actualDisplayableError
                    if(isDisplayableError(displayableError)) {
                        msftLoginLogger.error('Error while logging in.', displayableError)
                        actualDisplayableError = displayableError
                    } else {
                        // Uh oh.
                        msftLoginLogger.error('Unhandled error during login.', displayableError)
                        actualDisplayableError = Lang.queryJS('login.error.unknown')
                    }

                    switchView(getCurrentView(), viewOnClose, 500, 500, () => {
                        setOverlayContent(actualDisplayableError.title, actualDisplayableError.desc, Lang.queryJS('login.tryAgain'))
                        setOverlayHandler(() => {
                            toggleOverlay(false)
                        })
                        toggleOverlay(true)
                    })
                })
        }
    }
})

/**
 * Bind functionality for the account selection buttons. If another account
 * is selected, the UI of the previously selected account will be updated.
 */
function bindAuthAccountSelect(){
    Array.from(document.getElementsByClassName('settingsAuthAccountSelect')).map((val) => {
        val.onclick = (e) => {
            if(val.hasAttribute('selected')){
                return
            }
            const selectBtns = document.getElementsByClassName('settingsAuthAccountSelect')
            for(let i=0; i<selectBtns.length; i++){
                if(selectBtns[i].hasAttribute('selected')){
                    selectBtns[i].removeAttribute('selected')
                    selectBtns[i].innerHTML = Lang.queryJS('settings.authAccountSelect.selectButton')
                }
            }
            val.setAttribute('selected', '')
            val.innerHTML = Lang.queryJS('settings.authAccountSelect.selectedButton')
            setSelectedAccount(val.closest('.settingsAuthAccount').getAttribute('uuid'))
        }
    })
}

/**
 * Bind functionality for the log out button. If the logged out account was
 * the selected account, another account will be selected and the UI will
 * be updated accordingly.
 */
function bindAuthAccountLogOut(){
    Array.from(document.getElementsByClassName('settingsAuthAccountLogOut')).map((val) => {
        val.onclick = (e) => {
            let isLastAccount = false
            if(Object.keys(ConfigManager.getAuthAccounts()).length === 1){
                isLastAccount = true
                setOverlayContent(
                    Lang.queryJS('settings.authAccountLogout.lastAccountWarningTitle'),
                    Lang.queryJS('settings.authAccountLogout.lastAccountWarningMessage'),
                    Lang.queryJS('settings.authAccountLogout.confirmButton'),
                    Lang.queryJS('settings.authAccountLogout.cancelButton')
                )
                setOverlayHandler(() => {
                    processLogOut(val, isLastAccount)
                    toggleOverlay(false)
                })
                setDismissHandler(() => {
                    toggleOverlay(false)
                })
                toggleOverlay(true, true)
            } else {
                processLogOut(val, isLastAccount)
            }
            
        }
    })
}

let msAccDomElementCache
/**
 * Process a log out.
 * 
 * @param {Element} val The log out button element.
 * @param {boolean} isLastAccount If this logout is on the last added account.
 */
function processLogOut(val, isLastAccount){
    const parent = val.closest('.settingsAuthAccount')
    const uuid = parent.getAttribute('uuid')
    const prevSelAcc = ConfigManager.getSelectedAccount()
    const targetAcc = ConfigManager.getAuthAccount(uuid)
    if(targetAcc.type === 'microsoft') {
        msAccDomElementCache = parent
        switchView(getCurrentView(), VIEWS.waiting, 500, 500, () => {
            ipcRenderer.send(MSFT_OPCODE.OPEN_LOGOUT, uuid, isLastAccount)
        })
    } else {
        AuthManager.removeMojangAccount(uuid).then(() => {
            if(!isLastAccount && uuid === prevSelAcc.uuid){
                const selAcc = ConfigManager.getSelectedAccount()
                refreshAuthAccountSelected(selAcc.uuid)
                updateSelectedAccount(selAcc)
                validateSelectedAccount()
            }
            if(isLastAccount) {
                loginOptionsCancelEnabled(false)
                loginOptionsViewOnLoginSuccess = VIEWS.settings
                loginOptionsViewOnLoginCancel = VIEWS.loginOptions
                switchView(getCurrentView(), VIEWS.loginOptions)
            }
        })
        $(parent).fadeOut(250, () => {
            parent.remove()
        })
    }
}

// Bind reply for Microsoft Logout.
ipcRenderer.on(MSFT_OPCODE.REPLY_LOGOUT, (_, ...arguments_) => {
    if (arguments_[0] === MSFT_REPLY_TYPE.ERROR) {
        switchView(getCurrentView(), VIEWS.settings, 500, 500, () => {

            if(arguments_.length > 1 && arguments_[1] === MSFT_ERROR.NOT_FINISHED) {
                // User cancelled.
                msftLogoutLogger.info('Logout cancelled by user.')
                return
            }

            // Unexpected error.
            setOverlayContent(
                Lang.queryJS('settings.msftLogout.errorTitle'),
                Lang.queryJS('settings.msftLogout.errorMessage'),
                Lang.queryJS('settings.msftLogout.okButton')
            )
            setOverlayHandler(() => {
                toggleOverlay(false)
            })
            toggleOverlay(true)
        })
    } else if(arguments_[0] === MSFT_REPLY_TYPE.SUCCESS) {
        
        const uuid = arguments_[1]
        const isLastAccount = arguments_[2]
        const prevSelAcc = ConfigManager.getSelectedAccount()

        msftLogoutLogger.info('Logout Successful. uuid:', uuid)
        
        AuthManager.removeMicrosoftAccount(uuid)
            .then(() => {
                if(!isLastAccount && uuid === prevSelAcc.uuid){
                    const selAcc = ConfigManager.getSelectedAccount()
                    refreshAuthAccountSelected(selAcc.uuid)
                    updateSelectedAccount(selAcc)
                    validateSelectedAccount()
                }
                if(isLastAccount) {
                    loginOptionsCancelEnabled(false)
                    loginOptionsViewOnLoginSuccess = VIEWS.settings
                    loginOptionsViewOnLoginCancel = VIEWS.loginOptions
                    switchView(getCurrentView(), VIEWS.loginOptions)
                }
                if(msAccDomElementCache) {
                    msAccDomElementCache.remove()
                    msAccDomElementCache = null
                }
            })
            .finally(() => {
                if(!isLastAccount) {
                    switchView(getCurrentView(), VIEWS.settings, 500, 500)
                }
            })

    }
})

/**
 * Refreshes the status of the selected account on the auth account
 * elements.
 * 
 * @param {string} uuid The UUID of the new selected account.
 */
function refreshAuthAccountSelected(uuid){
    Array.from(document.getElementsByClassName('settingsAuthAccount')).map((val) => {
        const selBtn = val.getElementsByClassName('settingsAuthAccountSelect')[0]
        if(uuid === val.getAttribute('uuid')){
            selBtn.setAttribute('selected', '')
            selBtn.innerHTML = Lang.queryJS('settings.authAccountSelect.selectedButton')
        } else {
            if(selBtn.hasAttribute('selected')){
                selBtn.removeAttribute('selected')
            }
            selBtn.innerHTML = Lang.queryJS('settings.authAccountSelect.selectButton')
        }
    })
}

const settingsCurrentMicrosoftAccounts = document.getElementById('settingsCurrentMicrosoftAccounts')
const settingsCurrentMojangAccounts = document.getElementById('settingsCurrentMojangAccounts')

/**
 * Add auth account elements for each one stored in the authentication database.
 */
function populateAuthAccounts(){
    const authAccounts = ConfigManager.getAuthAccounts()
    const authKeys = Object.keys(authAccounts)
    if(authKeys.length === 0){
        return
    }
    const selectedUUID = ConfigManager.getSelectedAccount().uuid

    let microsoftAuthAccountStr = ''
    let mojangAuthAccountStr = ''

    authKeys.forEach((val) => {
        const acc = authAccounts[val]

        const accHtml = `<div class="settingsAuthAccount" uuid="${acc.uuid}">
            <div class="settingsAuthAccountLeft">
                <img class="settingsAuthAccountImage" alt="${acc.displayName}" src="https://mc-heads.net/body/${acc.uuid}/60">
            </div>
            <div class="settingsAuthAccountRight">
                <div class="settingsAuthAccountDetails">
                    <div class="settingsAuthAccountDetailPane">
                        <div class="settingsAuthAccountDetailTitle">${Lang.queryJS('settings.authAccountPopulate.username')}</div>
                        <div class="settingsAuthAccountDetailValue">${acc.displayName}</div>
                    </div>
                    <div class="settingsAuthAccountDetailPane">
                        <div class="settingsAuthAccountDetailTitle">${Lang.queryJS('settings.authAccountPopulate.uuid')}</div>
                        <div class="settingsAuthAccountDetailValue">${acc.uuid}</div>
                    </div>
                </div>
                <div class="settingsAuthAccountActions">
                    <button class="settingsAuthAccountSelect" ${selectedUUID === acc.uuid ? 'selected>' + Lang.queryJS('settings.authAccountPopulate.selectedAccount') : '>' + Lang.queryJS('settings.authAccountPopulate.selectAccount')}</button>
                    <div class="settingsAuthAccountWrapper">
                        <button class="settingsAuthAccountLogOut">${Lang.queryJS('settings.authAccountPopulate.logout')}</button>
                    </div>
                </div>
            </div>
        </div>`

        if(acc.type === 'microsoft') {
            microsoftAuthAccountStr += accHtml
        } else {
            mojangAuthAccountStr += accHtml
        }

    })

    settingsCurrentMicrosoftAccounts.innerHTML = microsoftAuthAccountStr
    settingsCurrentMojangAccounts.innerHTML = mojangAuthAccountStr
}

/**
 * Prepare the accounts tab for display.
 */
function prepareAccountsTab() {
    populateAuthAccounts()
    bindAuthAccountSelect()
    bindAuthAccountLogOut()
}

/**
 * Minecraft Tab
 */

/**
  * Disable decimals, negative signs, and scientific notation.
  */
document.getElementById('settingsGameWidth').addEventListener('keydown', (e) => {
    if(/^[-.eE]$/.test(e.key)){
        e.preventDefault()
    }
})
document.getElementById('settingsGameHeight').addEventListener('keydown', (e) => {
    if(/^[-.eE]$/.test(e.key)){
        e.preventDefault()
    }
})

/**
 * Mods Tab
 */

const settingsModsContainer = document.getElementById('settingsModsContainer')

/**
 * Resolve and update the mods on the UI.
 */
async function resolveModsForUI(){
    const serv = ConfigManager.getSelectedServer()

    const distro = await DistroAPI.getDistribution()
    const servConf = ConfigManager.getModConfiguration(serv)

    const modStr = parseModulesForUI(distro.getServerById(serv).modules, false, servConf.mods)

    document.getElementById('settingsReqModsContent').innerHTML = modStr.reqMods
    document.getElementById('settingsOptModsContent').innerHTML = modStr.optMods
}

/**
 * Recursively build the mod UI elements.
 * 
 * @param {Object[]} mdls An array of modules to parse.
 * @param {boolean} submodules Whether or not we are parsing submodules.
 * @param {Object} servConf The server configuration object for this module level.
 */
function parseModulesForUI(mdls, submodules, servConf){

    let reqMods = ''
    let optMods = ''

    for(const mdl of mdls){

        if(mdl.rawModule.type === Type.ForgeMod || mdl.rawModule.type === Type.LiteMod || mdl.rawModule.type === Type.LiteLoader || mdl.rawModule.type === Type.FabricMod){

            if(mdl.getRequired().value){

                reqMods += `<div id="${mdl.getVersionlessMavenIdentifier()}" class="settingsBaseMod settings${submodules ? 'Sub' : ''}Mod" enabled>
                    <div class="settingsModContent">
                        <div class="settingsModMainWrapper">
                            <div class="settingsModStatus"></div>
                            <div class="settingsModDetails">
                                <span class="settingsModName">${mdl.rawModule.name}</span>
                                <span class="settingsModVersion">v${mdl.mavenComponents.version}</span>
                            </div>
                        </div>
                        <label class="toggleSwitch" reqmod>
                            <input type="checkbox" checked>
                            <span class="toggleSwitchSlider"></span>
                        </label>
                    </div>
                    ${mdl.subModules.length > 0 ? `<div class="settingsSubModContainer">
                        ${Object.values(parseModulesForUI(mdl.subModules, true, servConf[mdl.getVersionlessMavenIdentifier()])).join('')}
                    </div>` : ''}
                </div>`

            } else {

                const conf = servConf[mdl.getVersionlessMavenIdentifier()]
                const val = typeof conf === 'object' ? conf.value : conf

                optMods += `<div id="${mdl.getVersionlessMavenIdentifier()}" class="settingsBaseMod settings${submodules ? 'Sub' : ''}Mod" ${val ? 'enabled' : ''}>
                    <div class="settingsModContent">
                        <div class="settingsModMainWrapper">
                            <div class="settingsModStatus"></div>
                            <div class="settingsModDetails">
                                <span class="settingsModName">${mdl.rawModule.name}</span>
                                <span class="settingsModVersion">v${mdl.mavenComponents.version}</span>
                            </div>
                        </div>
                        <label class="toggleSwitch">
                            <input type="checkbox" formod="${mdl.getVersionlessMavenIdentifier()}" ${val ? 'checked' : ''}>
                            <span class="toggleSwitchSlider"></span>
                        </label>
                    </div>
                    ${mdl.subModules.length > 0 ? `<div class="settingsSubModContainer">
                        ${Object.values(parseModulesForUI(mdl.subModules, true, conf.mods)).join('')}
                    </div>` : ''}
                </div>`

            }
        }
    }

    return {
        reqMods,
        optMods
    }

}

/**
 * Bind functionality to mod config toggle switches. Switching the value
 * will also switch the status color on the left of the mod UI.
 */
function bindModsToggleSwitch(){
    const sEls = settingsModsContainer.querySelectorAll('[formod]')
    Array.from(sEls).map((v, index, arr) => {
        v.onchange = () => {
            if(v.checked) {
                document.getElementById(v.getAttribute('formod')).setAttribute('enabled', '')
            } else {
                document.getElementById(v.getAttribute('formod')).removeAttribute('enabled')
            }
        }
    })
}


/**
 * Save the mod configuration based on the UI values.
 */
function saveModConfiguration(){
    const serv = ConfigManager.getSelectedServer()
    const modConf = ConfigManager.getModConfiguration(serv)
    modConf.mods = _saveModConfiguration(modConf.mods)
    ConfigManager.setModConfiguration(serv, modConf)
}

/**
 * Recursively save mod config with submods.
 * 
 * @param {Object} modConf Mod config object to save.
 */
function _saveModConfiguration(modConf){
    for(let m of Object.entries(modConf)){
        const tSwitch = settingsModsContainer.querySelectorAll(`[formod='${m[0]}']`)
        if(!tSwitch[0].hasAttribute('dropin')){
            if(typeof m[1] === 'boolean'){
                modConf[m[0]] = tSwitch[0].checked
            } else {
                if(m[1] != null){
                    if(tSwitch.length > 0){
                        modConf[m[0]].value = tSwitch[0].checked
                    }
                    modConf[m[0]].mods = _saveModConfiguration(modConf[m[0]].mods)
                }
            }
        }
    }
    return modConf
}

// Drop-in mod elements.

let CACHE_SETTINGS_MODS_DIR
let CACHE_DROPIN_MODS

/**
 * Resolve any located drop-in mods for this server and
 * populate the results onto the UI.
 */
async function resolveDropinModsForUI(){
    const serv = (await DistroAPI.getDistribution()).getServerById(ConfigManager.getSelectedServer())
    CACHE_SETTINGS_MODS_DIR = path.join(ConfigManager.getInstanceDirectory(), serv.rawServer.id, 'mods')
    CACHE_DROPIN_MODS = DropinModUtil.scanForDropinMods(CACHE_SETTINGS_MODS_DIR, serv.rawServer.minecraftVersion)

    let dropinMods = ''

    for(const dropin of CACHE_DROPIN_MODS){
        dropinMods += `<div id="${dropin.fullName}" class="settingsBaseMod settingsDropinMod" ${!dropin.disabled ? 'enabled' : ''}>
                    <div class="settingsModContent">
                        <div class="settingsModMainWrapper">
                            <div class="settingsModStatus"></div>
                            <div class="settingsModDetails">
                                <span class="settingsModName">${dropin.name}</span>
                                <div class="settingsDropinRemoveWrapper">
                                    <button class="settingsDropinRemoveButton" remmod="${dropin.fullName}">${Lang.queryJS('settings.dropinMods.removeButton')}</button>
                                </div>
                            </div>
                        </div>
                        <label class="toggleSwitch">
                            <input type="checkbox" formod="${dropin.fullName}" dropin ${!dropin.disabled ? 'checked' : ''}>
                            <span class="toggleSwitchSlider"></span>
                        </label>
                    </div>
                </div>`
    }

    document.getElementById('settingsDropinModsContent').innerHTML = dropinMods
}

/**
 * Bind the remove button for each loaded drop-in mod.
 */
function bindDropinModsRemoveButton(){
    const sEls = settingsModsContainer.querySelectorAll('[remmod]')
    Array.from(sEls).map((v, index, arr) => {
        v.onclick = async () => {
            const fullName = v.getAttribute('remmod')
            const res = await DropinModUtil.deleteDropinMod(CACHE_SETTINGS_MODS_DIR, fullName)
            if(res){
                document.getElementById(fullName).remove()
            } else {
                setOverlayContent(
                    Lang.queryJS('settings.dropinMods.deleteFailedTitle', { fullName }),
                    Lang.queryJS('settings.dropinMods.deleteFailedMessage'),
                    Lang.queryJS('settings.dropinMods.okButton')
                )
                setOverlayHandler(null)
                toggleOverlay(true)
            }
        }
    })
}

/**
 * Bind functionality to the file system button for the selected
 * server configuration.
 */
function bindDropinModFileSystemButton(){
    const fsBtn = document.getElementById('settingsDropinFileSystemButton')
    fsBtn.onclick = () => {
        DropinModUtil.validateDir(CACHE_SETTINGS_MODS_DIR)
        shell.openPath(CACHE_SETTINGS_MODS_DIR)
    }
    fsBtn.ondragenter = e => {
        e.dataTransfer.dropEffect = 'move'
        fsBtn.setAttribute('drag', '')
        e.preventDefault()
    }
    fsBtn.ondragover = e => {
        e.preventDefault()
    }
    fsBtn.ondragleave = e => {
        fsBtn.removeAttribute('drag')
    }

    fsBtn.ondrop = async e => {
        fsBtn.removeAttribute('drag')
        e.preventDefault()

        DropinModUtil.addDropinMods(e.dataTransfer.files, CACHE_SETTINGS_MODS_DIR)
        await reloadDropinMods()
    }
}

/**
 * Save drop-in mod states. Enabling and disabling is just a matter
 * of adding/removing the .disabled extension.
 */
function saveDropinModConfiguration(){
    for(const dropin of CACHE_DROPIN_MODS){
        const dropinUI = document.getElementById(dropin.fullName)
        if(dropinUI != null){
            const dropinUIEnabled = dropinUI.hasAttribute('enabled')
            if(DropinModUtil.isDropinModEnabled(dropin.fullName) != dropinUIEnabled){
                DropinModUtil.toggleDropinMod(CACHE_SETTINGS_MODS_DIR, dropin.fullName, dropinUIEnabled).catch(err => {
                    if(!isOverlayVisible()){
                        setOverlayContent(
                            Lang.queryJS('settings.dropinMods.failedToggleTitle'),
                            err.message,
                            Lang.queryJS('settings.dropinMods.okButton')
                        )
                        setOverlayHandler(null)
                        toggleOverlay(true)
                    }
                })
            }
        }
    }
}

// Refresh the drop-in mods when F5 is pressed.
// Only active on the mods tab.
document.addEventListener('keydown', async (e) => {
    if(getCurrentView() === VIEWS.settings && selectedSettingsTab === 'settingsTabMods'){
        if(e.key === 'F5'){
            await reloadDropinMods()
            saveShaderpackSettings()
            await resolveShaderpacksForUI()
        }
    }
})

async function reloadDropinMods(){
    await resolveDropinModsForUI()
    bindDropinModsRemoveButton()
    bindDropinModFileSystemButton()
    bindModsToggleSwitch()
}

// Shaderpack

let CACHE_SETTINGS_INSTANCE_DIR
let CACHE_SHADERPACKS
let CACHE_SELECTED_SHADERPACK

/**
 * Load shaderpack information.
 */
async function resolveShaderpacksForUI(){
    const serv = (await DistroAPI.getDistribution()).getServerById(ConfigManager.getSelectedServer())
    CACHE_SETTINGS_INSTANCE_DIR = path.join(ConfigManager.getInstanceDirectory(), serv.rawServer.id)
    CACHE_SHADERPACKS = DropinModUtil.scanForShaderpacks(CACHE_SETTINGS_INSTANCE_DIR)
    CACHE_SELECTED_SHADERPACK = DropinModUtil.getEnabledShaderpack(CACHE_SETTINGS_INSTANCE_DIR)

    setShadersOptions(CACHE_SHADERPACKS, CACHE_SELECTED_SHADERPACK)
}

function setShadersOptions(arr, selected){
    const cont = document.getElementById('settingsShadersOptions')
    cont.innerHTML = ''
    for(let opt of arr) {
        const d = document.createElement('DIV')
        d.innerHTML = opt.name
        d.setAttribute('value', opt.fullName)
        if(opt.fullName === selected) {
            d.setAttribute('selected', '')
            document.getElementById('settingsShadersSelected').innerHTML = opt.name
        }
        d.addEventListener('click', function(e) {
            this.parentNode.previousElementSibling.innerHTML = this.innerHTML
            for(let sib of this.parentNode.children){
                sib.removeAttribute('selected')
            }
            this.setAttribute('selected', '')
            closeSettingsSelect()
        })
        cont.appendChild(d)
    }
}

function saveShaderpackSettings(){
    let sel = 'OFF'
    for(let opt of document.getElementById('settingsShadersOptions').childNodes){
        if(opt.hasAttribute('selected')){
            sel = opt.getAttribute('value')
        }
    }
    DropinModUtil.setEnabledShaderpack(CACHE_SETTINGS_INSTANCE_DIR, sel)
}

function bindShaderpackButton() {
    const spBtn = document.getElementById('settingsShaderpackButton')
    spBtn.onclick = () => {
        const p = path.join(CACHE_SETTINGS_INSTANCE_DIR, 'shaderpacks')
        DropinModUtil.validateDir(p)
        shell.openPath(p)
    }
    spBtn.ondragenter = e => {
        e.dataTransfer.dropEffect = 'move'
        spBtn.setAttribute('drag', '')
        e.preventDefault()
    }
    spBtn.ondragover = e => {
        e.preventDefault()
    }
    spBtn.ondragleave = e => {
        spBtn.removeAttribute('drag')
    }

    spBtn.ondrop = async e => {
        spBtn.removeAttribute('drag')
        e.preventDefault()

        DropinModUtil.addShaderpacks(e.dataTransfer.files, CACHE_SETTINGS_INSTANCE_DIR)
        saveShaderpackSettings()
        await resolveShaderpacksForUI()
    }
}

// Server status bar functions.

/**
 * Load the currently selected server information onto the mods tab.
 */
function isSettingsServerWhitelisted(server){
    const raw = server?.rawServer || server || {}
    const values = [raw.whitelist, raw.meta?.whitelist, raw.metadata?.whitelist, raw.serverMeta?.whitelist]
    return values.some(value => value === true || String(value).toLowerCase() === 'true')
}

async function loadSelectedServerOnModsTab(){
    const serv = (await DistroAPI.getDistribution()).getServerById(ConfigManager.getSelectedServer())
    if(serv == null){
        return
    }

    const raw = serv.rawServer
    const whitelistBadge = isSettingsServerWhitelisted(serv) ? '<div class="serverListingWhitelist">Whitelist</div>' : ''
    const mainBadge = raw.mainServer ? '<div class="serverListingMainBadge">Principal</div>' : ''

    for(const el of document.getElementsByClassName('settingsSelServContent')) {
        const container = el.closest('.settingsSelServContainer')
        if(container != null){
            container.toggleAttribute('data-whitelist', isSettingsServerWhitelisted(serv))
            container.toggleAttribute('data-main-server', raw.mainServer === true)
        }

        el.innerHTML = `
            <img class="serverListingImg" src="${raw.icon}" alt=""/>
            <div class="serverListingDetails">
                <span class="serverListingName">${raw.name}</span>
                <span class="serverListingDescription">${raw.description}</span>
                <div class="serverListingInfo">
                    <div class="serverListingVersion">${raw.minecraftVersion}</div>
                    <div class="serverListingRevision">${raw.version}</div>
                    ${mainBadge}
                    ${whitelistBadge}
                </div>
            </div>
        `
    }
}

// Bind functionality to the server switch button.
Array.from(document.getElementsByClassName('settingsSwitchServerButton')).forEach(el => {
    el.addEventListener('click', async e => {
        e.target.blur()
        await toggleServerSelection(true)
    })
})

/**
 * Save mod configuration for the current selected server.
 */
function saveAllModConfigurations(){
    saveModConfiguration()
    ConfigManager.save()
    saveDropinModConfiguration()
}

/**
 * Function to refresh the current tab whenever the selected
 * server is changed.
 */
async function animateSettingsTabRefresh(){
    await prepareSettings()
    const currentTab = document.getElementById(selectedSettingsTab)
    settingsTabScrollListener({ target: currentTab })
}

/**
 * Prepare the Mods tab for display.
 */
async function prepareModsTab(first){
    await resolveModsForUI()
    await resolveDropinModsForUI()
    await resolveShaderpacksForUI()
    bindDropinModsRemoveButton()
    bindDropinModFileSystemButton()
    bindShaderpackButton()
    bindModsToggleSwitch()
    await loadSelectedServerOnModsTab()
}

/**
 * Java Tab
 */

// DOM Cache
const settingsMaxRAMRange     = document.getElementById('settingsMaxRAMRange')
const settingsMinRAMRange     = document.getElementById('settingsMinRAMRange')
const settingsMaxRAMLabel     = document.getElementById('settingsMaxRAMLabel')
const settingsMinRAMLabel     = document.getElementById('settingsMinRAMLabel')
const settingsMemoryTotal     = document.getElementById('settingsMemoryTotal')
const settingsMemoryAvail     = document.getElementById('settingsMemoryAvail')
const settingsJavaExecDetails = document.getElementById('settingsJavaExecDetails')
const settingsJavaReqDesc     = document.getElementById('settingsJavaReqDesc')
const settingsJvmOptsLink     = document.getElementById('settingsJvmOptsLink')

function updateMemoryBarTone(slider, value){
    const bar = slider?.getElementsByClassName('rangeSliderBar')[0]
    if(bar == null){
        return
    }

    const total = os.totalmem()/1073741824
    if(value >= total * 0.75){
        bar.dataset.tone = 'danger'
    } else if(value >= total * 0.5){
        bar.dataset.tone = 'warning'
    } else {
        bar.dataset.tone = 'normal'
    }
}

// Bind on change event for min memory container.
settingsMinRAMRange.onchange = (e) => {
    const sMaxV = Number(settingsMaxRAMRange.getAttribute('value'))
    const sMinV = Number(settingsMinRAMRange.getAttribute('value'))

    updateMemoryBarTone(e.target, sMinV)

    if(sMaxV < sMinV){
        const sliderMeta = calculateRangeSliderMeta(settingsMaxRAMRange)
        updateRangedSlider(
            settingsMaxRAMRange,
            sMinV,
            valueToSliderNotch(sMinV, sliderMeta)
        )
    }

    settingsMinRAMLabel.textContent = `${sMinV.toFixed(1)}G`
}

// Bind on change event for max memory container.
settingsMaxRAMRange.onchange = (e) => {
    const sMaxV = Number(settingsMaxRAMRange.getAttribute('value'))
    const sMinV = Number(settingsMinRAMRange.getAttribute('value'))

    updateMemoryBarTone(e.target, sMaxV)

    if(sMaxV < sMinV){
        const sliderMeta = calculateRangeSliderMeta(settingsMinRAMRange)
        updateRangedSlider(
            settingsMinRAMRange,
            sMaxV,
            valueToSliderNotch(sMaxV, sliderMeta)
        )
    }

    settingsMaxRAMLabel.textContent = `${sMaxV.toFixed(1)}G`
}

function calculateRangeSliderMeta(element){
    const max = Number(element.getAttribute('max'))
    const min = Number(element.getAttribute('min'))
    const requestedStep = Number(element.getAttribute('step'))
    const step = Number.isFinite(requestedStep) && requestedStep > 0 ? requestedStep : 0.5
    const ticks = Math.max(1, Math.round((max-min)/step))
    return {
        max,
        min,
        step,
        ticks,
        inc: 100/ticks
    }
}

function clampRangeValue(value, sliderMeta){
    const clamped = Math.min(sliderMeta.max, Math.max(sliderMeta.min, Number(value)))
    const steps = Math.round((clamped-sliderMeta.min)/sliderMeta.step)
    return Number((sliderMeta.min + steps*sliderMeta.step).toFixed(3))
}

function valueToSliderNotch(value, sliderMeta){
    const normalized = clampRangeValue(value, sliderMeta)
    return ((normalized-sliderMeta.min)/(sliderMeta.max-sliderMeta.min || 1))*100
}

function pointerToSliderValue(element, clientX, sliderMeta){
    const bounds = element.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX-bounds.left)/(bounds.width || 1)))
    return clampRangeValue(sliderMeta.min + ratio*(sliderMeta.max-sliderMeta.min), sliderMeta)
}

/**
 * Bind stable pointer and keyboard controls to the custom RAM sliders.
 * getBoundingClientRect keeps the cursor aligned even when Settings is
 * scrolled or the window is moved.
 */
function bindRangeSlider(){
    for(const element of document.getElementsByClassName('rangeSlider')){
        const sliderMeta = calculateRangeSliderMeta(element)
        const initialValue = clampRangeValue(element.getAttribute('value'), sliderMeta)

        element.tabIndex = 0
        element.setAttribute('role', 'slider')
        element.setAttribute('aria-valuemin', sliderMeta.min)
        element.setAttribute('aria-valuemax', sliderMeta.max)

        if(element.dataset.rangeSliderBound !== 'true'){
            element.dataset.rangeSliderBound = 'true'
            let pointerFrame = null
            let pendingClientX = null

            const flushPointer = () => {
                pointerFrame = null
                if(pendingClientX == null){
                    return
                }
                const currentMeta = calculateRangeSliderMeta(element)
                const value = pointerToSliderValue(element, pendingClientX, currentMeta)
                pendingClientX = null
                updateRangedSlider(element, value, valueToSliderNotch(value, currentMeta))
            }

            const schedulePointerUpdate = clientX => {
                pendingClientX = clientX
                if(pointerFrame == null){
                    pointerFrame = requestAnimationFrame(flushPointer)
                }
            }

            element.onpointerdown = event => {
                if(event.button !== 0){
                    return
                }
                event.preventDefault()
                element.focus({ preventScroll: true })
                element.setPointerCapture(event.pointerId)
                schedulePointerUpdate(event.clientX)
            }

            element.onpointermove = event => {
                if(element.hasPointerCapture(event.pointerId)){
                    event.preventDefault()
                    schedulePointerUpdate(event.clientX)
                }
            }

            element.onpointerup = event => {
                if(element.hasPointerCapture(event.pointerId)){
                    schedulePointerUpdate(event.clientX)
                    element.releasePointerCapture(event.pointerId)
                }
            }

            element.onpointercancel = event => {
                if(element.hasPointerCapture(event.pointerId)){
                    element.releasePointerCapture(event.pointerId)
                }
                pendingClientX = null
            }

            element.onkeydown = event => {
                const currentMeta = calculateRangeSliderMeta(element)
                let direction = 0
                if(event.key === 'ArrowLeft' || event.key === 'ArrowDown'){
                    direction = -1
                } else if(event.key === 'ArrowRight' || event.key === 'ArrowUp'){
                    direction = 1
                } else if(event.key === 'Home'){
                    updateRangedSlider(element, currentMeta.min, 0)
                    event.preventDefault()
                    return
                } else if(event.key === 'End'){
                    updateRangedSlider(element, currentMeta.max, 100)
                    event.preventDefault()
                    return
                }

                if(direction !== 0){
                    const value = clampRangeValue(Number(element.getAttribute('value')) + direction*currentMeta.step, currentMeta)
                    updateRangedSlider(element, value, valueToSliderNotch(value, currentMeta))
                    event.preventDefault()
                }
            }
        }

        updateRangedSlider(element, initialValue, valueToSliderNotch(initialValue, sliderMeta))
    }
}

function updateRangedSlider(element, value, notch){
    if(element == null){
        return
    }

    const bar = element.getElementsByClassName('rangeSliderBar')[0]
    const track = element.getElementsByClassName('rangeSliderTrack')[0]
    if(bar == null || track == null){
        return
    }

    const sliderMeta = calculateRangeSliderMeta(element)
    const normalizedValue = clampRangeValue(value, sliderMeta)
    const normalizedNotch = Math.min(100, Math.max(0, Number(notch) || 0))
    const oldValue = element.getAttribute('value')

    element.setAttribute('value', normalizedValue)
    element.setAttribute('aria-valuenow', normalizedValue)
    element.setAttribute('aria-valuetext', `${normalizedValue.toFixed(1)} GB`)

    const event = new Event('change', {
        bubbles: false,
        cancelable: true
    })

    if(element.dispatchEvent(event)){
        track.style.left = `${normalizedNotch}%`
        bar.style.width = `${normalizedNotch}%`
    } else {
        element.setAttribute('value', oldValue)
    }
}

let settingsMemoryStatusTimer = null

/** Display total and currently available RAM. */
function populateMemoryStatus(){
    if(settingsMemoryTotal != null){
        settingsMemoryTotal.textContent = `${Number(os.totalmem()/1073741824).toFixed(1)}G`
    }
    if(settingsMemoryAvail != null){
        settingsMemoryAvail.textContent = `${Number(os.freemem()/1073741824).toFixed(1)}G`
    }
}

function keepMemoryStatusFresh(){
    populateMemoryStatus()
    if(settingsMemoryStatusTimer == null){
        settingsMemoryStatusTimer = setInterval(() => {
            if(!document.hidden && getCurrentView() === VIEWS.settings && selectedSettingsTab === 'settingsTabJava'){
                populateMemoryStatus()
            }
        }, 10000)
    }
}

function stopMemoryStatusFresh(){
    if(settingsMemoryStatusTimer != null){
        clearInterval(settingsMemoryStatusTimer)
        settingsMemoryStatusTimer = null
    }
}

/**
 * Validate the provided executable path and display the data on
 * the UI.
 * 
 * @param {string} execPath The executable path to populate against.
 */
async function populateJavaExecDetails(execPath){
    const server = (await DistroAPI.getDistribution()).getServerById(ConfigManager.getSelectedServer())

    const details = await validateSelectedJvm(ensureJavaDirIsRoot(execPath), server.effectiveJavaOptions.supported)

    if(details != null) {
        settingsJavaExecDetails.innerHTML = Lang.queryJS('settings.java.selectedJava', { version: details.semverStr, vendor: details.vendor })
    } else {
        settingsJavaExecDetails.innerHTML = Lang.queryJS('settings.java.invalidSelection')
    }
}

function populateJavaReqDesc(server) {
    settingsJavaReqDesc.innerHTML = Lang.queryJS('settings.java.requiresJava', { major: server.effectiveJavaOptions.suggestedMajor })
}

function populateJvmOptsLink(server) {
    const major = server.effectiveJavaOptions.suggestedMajor
    settingsJvmOptsLink.innerHTML = Lang.queryJS('settings.java.availableOptions', { major: major })
    if(major >= 12) {
        settingsJvmOptsLink.href = `https://docs.oracle.com/en/java/javase/${major}/docs/specs/man/java.html#extra-options-for-java`
    }
    else if(major >= 11) {
        settingsJvmOptsLink.href = 'https://docs.oracle.com/en/java/javase/11/tools/java.html#GUID-3B1CE181-CD30-4178-9602-230B800D4FAE'
    }
    else if(major >= 9) {
        settingsJvmOptsLink.href = `https://docs.oracle.com/javase/${major}/tools/java.htm`
    }
    else {
        settingsJvmOptsLink.href = `https://docs.oracle.com/javase/${major}/docs/technotes/tools/${process.platform === 'win32' ? 'windows' : 'unix'}/java.html`
    }
}

function bindMinMaxRam(server) {
    // Store maximum memory values.
    const SETTINGS_MAX_MEMORY = ConfigManager.getAbsoluteMaxRAM(server.rawServer.javaOptions?.ram)
    const SETTINGS_MIN_MEMORY = ConfigManager.getAbsoluteMinRAM(server.rawServer.javaOptions?.ram)

    // Set the max and min values for the ranged sliders.
    settingsMaxRAMRange.setAttribute('max', SETTINGS_MAX_MEMORY)
    settingsMaxRAMRange.setAttribute('min', SETTINGS_MIN_MEMORY)
    settingsMinRAMRange.setAttribute('max', SETTINGS_MAX_MEMORY)
    settingsMinRAMRange.setAttribute('min', SETTINGS_MIN_MEMORY)
}

/**
 * Prepare the Java tab for display.
 */
let lastPreparedJavaKey = null
async function prepareJavaTab(){
    const server = (await DistroAPI.getDistribution()).getServerById(ConfigManager.getSelectedServer())
    if(server == null){
        return
    }
    bindMinMaxRam(server)
    bindRangeSlider(server)
    keepMemoryStatusFresh()
    populateJavaReqDesc(server)
    populateJvmOptsLink(server)

    const javaPath = ConfigManager.getJavaExecutable(server.rawServer.id) || ''
    const javaKey = `${server.rawServer.id}|${javaPath}|${server.effectiveJavaOptions.supported}`
    if(javaKey !== lastPreparedJavaKey){
        lastPreparedJavaKey = javaKey
        await populateJavaExecDetails(javaPath)
    }
}

/**
 * About Tab
 */

const settingsTabAbout             = document.getElementById('settingsTabAbout')
const settingsAboutChangelogTitle  = settingsTabAbout.getElementsByClassName('settingsChangelogTitle')[0]
const settingsAboutChangelogText   = settingsTabAbout.getElementsByClassName('settingsChangelogText')[0]
const settingsAboutChangelogButton = settingsTabAbout.getElementsByClassName('settingsChangelogButton')[0]

// Bind the devtools toggle button.
document.getElementById('settingsAboutDevToolsButton').onclick = (e) => {
    let window = remote.getCurrentWindow()
    window.toggleDevTools()
}

/**
 * Return whether or not the provided version is a prerelease.
 * 
 * @param {string} version The semver version to test.
 * @returns {boolean} True if the version is a prerelease, otherwise false.
 */
function isPrerelease(version){
    const preRelComp = semver.prerelease(version)
    return preRelComp != null && preRelComp.length > 0
}

/**
 * Utility method to display version information on the
 * About and Update settings tabs.
 * 
 * @param {string} version The semver version to display.
 * @param {Element} valueElement The value element.
 * @param {Element} titleElement The title element.
 * @param {Element} checkElement The check mark element.
 */
function populateVersionInformation(version, valueElement, titleElement, checkElement){
    valueElement.innerHTML = version
    if(isPrerelease(version)){
        titleElement.innerHTML = Lang.queryJS('settings.about.preReleaseTitle')
        titleElement.style.color = '#ff886d'
        checkElement.style.background = '#ff886d'
    } else {
        titleElement.innerHTML = Lang.queryJS('settings.about.stableReleaseTitle')
        titleElement.style.color = null
        checkElement.style.background = null
    }
}

/**
 * Retrieve the version information and display it on the UI.
 */
function populateAboutVersionInformation(){
    populateVersionInformation(remote.app.getVersion(), document.getElementById('settingsAboutCurrentVersionValue'), document.getElementById('settingsAboutCurrentVersionTitle'), document.getElementById('settingsAboutCurrentVersionCheck'))
}

/**
 * Fetches the GitHub atom release feed and parses it for the release notes
 * of the current version. This value is displayed on the UI.
 */
let releaseNotesRequest = null
let releaseNotesLoaded = false

function populateReleaseNotes(){
    if(releaseNotesLoaded){
        return Promise.resolve()
    }
    if(releaseNotesRequest != null){
        return releaseNotesRequest
    }

    releaseNotesRequest = $.ajax({
        url: 'https://github.com/dscalzi/HeliosLauncher/releases.atom',
        timeout: 2500
    }).then(data => {
        const version = 'v' + remote.app.getVersion()
        const entries = $(data).find('entry')

        for(let i=0; i<entries.length; i++){
            const entry = $(entries[i])
            let id = entry.find('id').text()
            id = id.substring(id.lastIndexOf('/')+1)

            if(id === version){
                settingsAboutChangelogTitle.innerHTML = entry.find('title').text()
                settingsAboutChangelogText.innerHTML = entry.find('content').text()
                settingsAboutChangelogButton.href = entry.find('link').attr('href')
                break
            }
        }
        releaseNotesLoaded = true
    }).catch(() => {
        settingsAboutChangelogText.innerHTML = Lang.queryJS('settings.about.releaseNotesFailed')
    }).then(() => {
        releaseNotesRequest = null
    })

    return releaseNotesRequest
}

/**
 * Prepare account tab for display.
 */
function prepareAboutTab(){
    populateAboutVersionInformation()
    populateReleaseNotes()
}

/**
 * Update Tab
 */

const settingsTabUpdate            = document.getElementById('settingsTabUpdate')
const settingsUpdateTitle          = document.getElementById('settingsUpdateTitle')
const settingsUpdateVersionCheck   = document.getElementById('settingsUpdateVersionCheck')
const settingsUpdateVersionTitle   = document.getElementById('settingsUpdateVersionTitle')
const settingsUpdateVersionValue   = document.getElementById('settingsUpdateVersionValue')
const settingsUpdateChangelogTitle = settingsTabUpdate.getElementsByClassName('settingsChangelogTitle')[0]
const settingsUpdateChangelogText  = settingsTabUpdate.getElementsByClassName('settingsChangelogText')[0]
const settingsUpdateChangelogCont  = settingsTabUpdate.getElementsByClassName('settingsChangelogContainer')[0]
const settingsUpdateActionButton   = document.getElementById('settingsUpdateActionButton')

/**
 * Update the properties of the update action button.
 * 
 * @param {string} text The new button text.
 * @param {boolean} disabled Optional. Disable or enable the button
 * @param {function} handler Optional. New button event handler.
 */
function settingsUpdateButtonStatus(text, disabled = false, handler = null){
    settingsUpdateActionButton.innerHTML = text
    settingsUpdateActionButton.disabled = disabled
    if(handler != null){
        settingsUpdateActionButton.onclick = handler
    }
}

/**
 * Populate the update tab with relevant information.
 * 
 * @param {Object} data The update data.
 */
function populateSettingsUpdateInformation(data){
    if(data != null){
        settingsUpdateTitle.innerHTML = isPrerelease(data.version) ? Lang.queryJS('settings.updates.newPreReleaseTitle') : Lang.queryJS('settings.updates.newReleaseTitle')
        settingsUpdateChangelogCont.style.display = null
        settingsUpdateChangelogTitle.innerHTML = data.releaseName
        settingsUpdateChangelogText.innerHTML = data.releaseNotes
        populateVersionInformation(data.version, settingsUpdateVersionValue, settingsUpdateVersionTitle, settingsUpdateVersionCheck)
        
        if(process.platform === 'darwin'){
            settingsUpdateButtonStatus(Lang.queryJS('settings.updates.downloadButton'), false, () => {
                shell.openExternal(data.darwindownload)
            })
        } else {
            settingsUpdateButtonStatus(Lang.queryJS('settings.updates.downloadingButton'), true)
        }
    } else {
        settingsUpdateTitle.innerHTML = Lang.queryJS('settings.updates.latestVersionTitle')
        settingsUpdateChangelogCont.style.display = 'none'
        populateVersionInformation(remote.app.getVersion(), settingsUpdateVersionValue, settingsUpdateVersionTitle, settingsUpdateVersionCheck)
        settingsUpdateButtonStatus(Lang.queryJS('settings.updates.checkForUpdatesButton'), false, () => {
            if(!isDev){
                ipcRenderer.send('autoUpdateAction', 'checkForUpdate')
                settingsUpdateButtonStatus(Lang.queryJS('settings.updates.checkingForUpdatesButton'), true)
            }
        })
    }
}

/**
 * Prepare update tab for display.
 * 
 * @param {Object} data The update data.
 */
function prepareUpdateTab(data = null){
    populateSettingsUpdateInformation(data)
}

/**
 * Screenshots tab.
 *
 * Minecraft writes screenshots inside each instance. The launcher only reads
 * that directory and stores small generated thumbnails in its own cache.
 * Original screenshots and EmpiPacks files are never changed.
 */
const SETTINGS_SCREENSHOT_EXTENSIONS = new Set([
    '.png',
    '.jpg',
    '.jpeg',
    '.jfif',
    '.webp',
    '.gif',
    '.apng',
    '.avif',
    '.bmp',
    '.heic',
    '.heif',
    '.tif',
    '.tiff'
])
const SETTINGS_SCREENSHOT_NATIVE_PREVIEW_EXTENSIONS = new Set([
    '.png',
    '.jpg',
    '.jpeg',
    '.jfif',
    '.webp',
    '.gif',
    '.apng',
    '.avif',
    '.bmp'
])
const SETTINGS_SCREENSHOT_THUMB_WIDTH = 480
const SETTINGS_SCREENSHOT_THUMB_HEIGHT = 270
const SETTINGS_SCREENSHOT_THUMB_WORKERS = 2

const settingsScreenshotsContainer = document.getElementById('settingsScreenshotsContainer')
const settingsScreenshotsGrid = document.getElementById('settingsScreenshotsGrid')
const settingsScreenshotsState = document.getElementById('settingsScreenshotsState')
const settingsScreenshotsCount = document.getElementById('settingsScreenshotsCount')
const settingsScreenshotsRefresh = document.getElementById('settingsScreenshotsRefresh')
const settingsScreenshotsOpenFolder = document.getElementById('settingsScreenshotsOpenFolder')
const settingsScreenshotPreview = document.getElementById('settingsScreenshotPreview')
const settingsScreenshotPreviewImage = document.getElementById('settingsScreenshotPreviewImage')
const settingsScreenshotPreviewName = document.getElementById('settingsScreenshotPreviewName')
const settingsScreenshotPreviewMeta = document.getElementById('settingsScreenshotPreviewMeta')
const settingsScreenshotPreviewPrevious = document.getElementById('settingsScreenshotPreviewPrevious')
const settingsScreenshotPreviewNext = document.getElementById('settingsScreenshotPreviewNext')

let settingsScreenshotFiles = []
let settingsScreenshotDirectory = null
let settingsScreenshotObserver = null
let settingsScreenshotGeneration = 0
let settingsScreenshotPreviewIndex = -1
let settingsScreenshotSharp = null
let settingsScreenshotSharpUnavailable = false
let settingsScreenshotThumbnailQueue = []
let settingsScreenshotThumbnailWorkers = 0
let settingsScreenshotPreviewRequest = 0

function getSelectedScreenshotDirectory(){
    const serverId = ConfigManager.getSelectedServer()
    return serverId == null
        ? null
        : path.join(ConfigManager.getInstanceDirectory(), serverId, 'screenshots')
}

function getScreenshotLocale(){
    const language = ConfigManager.getLanguage()
    if(language === 'es_ES'){
        return 'es-ES'
    }
    if(language === 'en_US'){
        return 'en-US'
    }
    return undefined
}

function formatScreenshotBytes(bytes){
    if(bytes < 1024 * 1024){
        return `${Math.max(1, Math.round(bytes / 1024))} KB`
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatScreenshotMeta(entry){
    const date = new Intl.DateTimeFormat(getScreenshotLocale(), {
        dateStyle: 'medium',
        timeStyle: 'short'
    }).format(entry.mtime)
    return `${date} · ${formatScreenshotBytes(entry.size)}`
}

function setScreenshotsState(message){
    settingsScreenshotsState.textContent = message
    settingsScreenshotsState.hidden = false
}

function updateScreenshotsCount(count){
    settingsScreenshotsCount.textContent = count === 1
        ? settingsScreenshotsContainer.dataset.countOne
        : settingsScreenshotsContainer.dataset.countMany.replace('{count}', String(count))
}

function getScreenshotSharp(){
    if(settingsScreenshotSharpUnavailable){
        return null
    }
    if(settingsScreenshotSharp == null){
        try {
            settingsScreenshotSharp = require('sharp')
        } catch(error) {
            settingsScreenshotSharpUnavailable = true
            loggerScreenshots.warn('Thumbnail optimization is unavailable. Screenshots will use native previews.', error)
        }
    }
    return settingsScreenshotSharp
}

function getScreenshotCachePath(entry, kind){
    const serverId = String(ConfigManager.getSelectedServer() || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_')
    const key = screenshotsCrypto
        .createHash('sha1')
        .update(`${entry.path}|${entry.size}|${entry.mtimeMs}`)
        .digest('hex')
    return path.join(
        ConfigManager.getLauncherDirectory(),
        'Cache',
        'screenshot-thumbnails',
        serverId,
        `${key}-${kind}.webp`
    )
}

async function createScreenshotThumbnail(entry){
    const thumbnailPath = getScreenshotCachePath(entry, 'thumb')
    if(await screenshotsFs.pathExists(thumbnailPath)){
        return thumbnailPath
    }

    const sharp = getScreenshotSharp()
    if(sharp == null){
        return entry.path
    }

    await screenshotsFs.ensureDir(path.dirname(thumbnailPath))
    const temporaryPath = `${thumbnailPath}.${process.pid}.${Date.now()}.tmp`
    try {
        await sharp(entry.path, {
            animated: false,
            failOn: 'none',
            limitInputPixels: 100000000
        })
            .rotate()
            .resize(SETTINGS_SCREENSHOT_THUMB_WIDTH, SETTINGS_SCREENSHOT_THUMB_HEIGHT, {
                fit: 'cover',
                position: 'centre',
                withoutEnlargement: true
            })
            .webp({ quality: 76, effort: 3 })
            .toFile(temporaryPath)
        await screenshotsFs.move(temporaryPath, thumbnailPath, { overwrite: true })
        return thumbnailPath
    } catch(error) {
        await screenshotsFs.remove(temporaryPath).catch(() => {})
        loggerScreenshots.debug(`Unable to create a thumbnail for ${entry.name}.`, error)
        return entry.path
    }
}

async function createScreenshotDisplayPreview(entry){
    if(SETTINGS_SCREENSHOT_NATIVE_PREVIEW_EXTENSIONS.has(path.extname(entry.path).toLowerCase())){
        return entry.path
    }

    const previewPath = getScreenshotCachePath(entry, 'preview')
    if(await screenshotsFs.pathExists(previewPath)){
        return previewPath
    }

    const sharp = getScreenshotSharp()
    if(sharp == null){
        return await createScreenshotThumbnail(entry)
    }

    await screenshotsFs.ensureDir(path.dirname(previewPath))
    const temporaryPath = `${previewPath}.${process.pid}.${Date.now()}.tmp`
    try {
        await sharp(entry.path, {
            animated: false,
            failOn: 'none',
            limitInputPixels: 100000000
        })
            .rotate()
            .resize(1920, 1080, {
                fit: 'inside',
                withoutEnlargement: true
            })
            .webp({ quality: 88, effort: 3 })
            .toFile(temporaryPath)
        await screenshotsFs.move(temporaryPath, previewPath, { overwrite: true })
        return previewPath
    } catch(error) {
        await screenshotsFs.remove(temporaryPath).catch(() => {})
        loggerScreenshots.debug(`Unable to create a display preview for ${entry.name}.`, error)
        return await createScreenshotThumbnail(entry)
    }
}

function pumpScreenshotThumbnailQueue(){
    while(
        settingsScreenshotThumbnailWorkers < SETTINGS_SCREENSHOT_THUMB_WORKERS
        && settingsScreenshotThumbnailQueue.length > 0
    ){
        const task = settingsScreenshotThumbnailQueue.shift()
        settingsScreenshotThumbnailWorkers++
        createScreenshotThumbnail(task.entry)
            .then(thumbnailPath => {
                if(
                    task.generation !== settingsScreenshotGeneration
                    || !task.image.isConnected
                ){
                    return
                }
                task.image.onload = () => task.image.setAttribute('loaded', '')
                task.image.onerror = () => task.image.removeAttribute('loaded')
                task.image.src = screenshotPathToFileURL(thumbnailPath).href
            })
            .catch(error => {
                loggerScreenshots.debug(`Unable to load the thumbnail for ${task.entry.name}.`, error)
            })
            .finally(() => {
                settingsScreenshotThumbnailWorkers--
                pumpScreenshotThumbnailQueue()
            })
    }
}

function queueScreenshotThumbnail(entry, image, generation){
    settingsScreenshotThumbnailQueue.push({ entry, image, generation })
    pumpScreenshotThumbnailQueue()
}

function renderScreenshotCards(generation){
    settingsScreenshotsGrid.replaceChildren()

    if(settingsScreenshotObserver != null){
        settingsScreenshotObserver.disconnect()
    }
    settingsScreenshotObserver = new IntersectionObserver(entries => {
        for(const observed of entries){
            if(!observed.isIntersecting){
                continue
            }
            settingsScreenshotObserver.unobserve(observed.target)
            const index = Number.parseInt(observed.target.dataset.index)
            const image = observed.target.querySelector('img')
            const entry = settingsScreenshotFiles[index]
            if(entry != null && image != null){
                queueScreenshotThumbnail(entry, image, generation)
            }
        }
    }, {
        root: document.getElementById('settingsTabScreenshots'),
        rootMargin: '320px 0px'
    })

    settingsScreenshotFiles.forEach((entry, index) => {
        const card = document.createElement('button')
        card.type = 'button'
        card.className = 'settingsScreenshotCard'
        card.dataset.index = String(index)
        card.title = entry.name

        const thumbnail = document.createElement('div')
        thumbnail.className = 'settingsScreenshotThumb'
        const image = document.createElement('img')
        image.alt = entry.name
        image.decoding = 'async'
        thumbnail.appendChild(image)

        const details = document.createElement('div')
        details.className = 'settingsScreenshotDetails'
        const name = document.createElement('span')
        name.className = 'settingsScreenshotName'
        name.textContent = entry.name
        const meta = document.createElement('span')
        meta.className = 'settingsScreenshotMeta'
        meta.textContent = formatScreenshotMeta(entry)
        details.append(name, meta)

        card.append(thumbnail, details)
        card.onclick = () => {
            openScreenshotPreview(index).catch(error => {
                loggerScreenshots.debug(`Unable to preview ${entry.name}.`, error)
            })
        }
        settingsScreenshotsGrid.appendChild(card)
        settingsScreenshotObserver.observe(card)
    })
}

async function scanScreenshotsDirectory(directory){
    const children = await screenshotsFs.readdir(directory, { withFileTypes: true })
    const candidates = children
        .filter(entry => entry.isFile() && SETTINGS_SCREENSHOT_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
        .map(async entry => {
            const filePath = path.join(directory, entry.name)
            const stats = await screenshotsFs.stat(filePath)
            return {
                name: entry.name,
                path: filePath,
                size: stats.size,
                mtime: stats.mtime,
                mtimeMs: stats.mtimeMs
            }
        })
    const entries = await Promise.all(candidates)
    return entries.sort((a, b) => b.mtimeMs - a.mtimeMs || a.name.localeCompare(b.name))
}

async function prepareScreenshotsTab(){
    const generation = ++settingsScreenshotGeneration
    settingsScreenshotThumbnailQueue = []
    closeScreenshotPreview()
    releaseScreenshotImages()
    settingsScreenshotsGrid.replaceChildren()
    settingsScreenshotDirectory = getSelectedScreenshotDirectory()
    settingsScreenshotsCount.textContent = ''
    setScreenshotsState(settingsScreenshotsContainer.dataset.missing)

    await loadSelectedServerOnModsTab()

    if(settingsScreenshotDirectory == null){
        updateScreenshotsCount(0)
        return
    }

    try {
        if(!(await screenshotsFs.pathExists(settingsScreenshotDirectory))){
            updateScreenshotsCount(0)
            setScreenshotsState(settingsScreenshotsContainer.dataset.missing)
            return
        }

        const files = await scanScreenshotsDirectory(settingsScreenshotDirectory)
        if(generation !== settingsScreenshotGeneration){
            return
        }
        settingsScreenshotFiles = files
        updateScreenshotsCount(files.length)
        if(files.length === 0){
            setScreenshotsState(settingsScreenshotsContainer.dataset.empty)
            return
        }
        settingsScreenshotsState.hidden = true
        renderScreenshotCards(generation)
    } catch(error) {
        if(generation !== settingsScreenshotGeneration){
            return
        }
        settingsScreenshotFiles = []
        updateScreenshotsCount(0)
        setScreenshotsState(settingsScreenshotsContainer.dataset.error)
        loggerScreenshots.warn(`Unable to read screenshots from ${settingsScreenshotDirectory}.`, error)
    }
}

function releaseScreenshotImages(){
    if(settingsScreenshotObserver != null){
        settingsScreenshotObserver.disconnect()
        settingsScreenshotObserver = null
    }
    for(const image of settingsScreenshotsGrid.querySelectorAll('img')){
        image.onload = null
        image.onerror = null
        image.removeAttribute('src')
    }
}

function releaseScreenshotsTab(){
    settingsScreenshotGeneration++
    settingsScreenshotThumbnailQueue = []
    closeScreenshotPreview()
    releaseScreenshotImages()
    settingsScreenshotsGrid.replaceChildren()
    settingsScreenshotFiles = []
}

async function openScreenshotPreview(index){
    const entry = settingsScreenshotFiles[index]
    if(entry == null){
        return
    }
    const request = ++settingsScreenshotPreviewRequest
    settingsScreenshotPreviewIndex = index
    settingsScreenshotPreviewName.textContent = entry.name
    settingsScreenshotPreviewMeta.textContent = formatScreenshotMeta(entry)
    settingsScreenshotPreviewImage.alt = entry.name
    settingsScreenshotPreviewImage.removeAttribute('src')
    settingsScreenshotPreviewPrevious.disabled = settingsScreenshotFiles.length < 2
    settingsScreenshotPreviewNext.disabled = settingsScreenshotFiles.length < 2
    settingsScreenshotPreview.hidden = false
    document.getElementById('settingsScreenshotPreviewClose').focus()
    const previewPath = await createScreenshotDisplayPreview(entry)
    if(
        request === settingsScreenshotPreviewRequest
        && settingsScreenshotPreviewIndex === index
        && !settingsScreenshotPreview.hidden
    ){
        settingsScreenshotPreviewImage.src = screenshotPathToFileURL(previewPath).href
    }
}

function closeScreenshotPreview(){
    settingsScreenshotPreviewRequest++
    settingsScreenshotPreview.hidden = true
    settingsScreenshotPreviewImage.removeAttribute('src')
    settingsScreenshotPreviewImage.alt = ''
    settingsScreenshotPreviewIndex = -1
}

function moveScreenshotPreview(direction){
    if(settingsScreenshotFiles.length < 2 || settingsScreenshotPreviewIndex < 0){
        return
    }
    const next = (
        settingsScreenshotPreviewIndex
        + direction
        + settingsScreenshotFiles.length
    ) % settingsScreenshotFiles.length
    openScreenshotPreview(next).catch(error => {
        loggerScreenshots.debug('Unable to move to the next screenshot preview.', error)
    })
}

settingsScreenshotsRefresh.onclick = () => {
    prepareScreenshotsTab().catch(error => loggerScreenshots.warn('Unable to refresh screenshots.', error))
}

settingsScreenshotsOpenFolder.onclick = async () => {
    const directory = getSelectedScreenshotDirectory()
    if(directory == null){
        return
    }
    await screenshotsFs.ensureDir(directory)
    const error = await shell.openPath(directory)
    if(error){
        loggerScreenshots.warn(`Unable to open the screenshots directory: ${error}`)
    }
}

document.getElementById('settingsScreenshotPreviewClose').onclick = closeScreenshotPreview
document.getElementById('settingsScreenshotPreviewBackdrop').onclick = closeScreenshotPreview
settingsScreenshotPreviewPrevious.onclick = () => moveScreenshotPreview(-1)
settingsScreenshotPreviewNext.onclick = () => moveScreenshotPreview(1)
document.getElementById('settingsScreenshotPreviewFile').onclick = () => {
    const entry = settingsScreenshotFiles[settingsScreenshotPreviewIndex]
    if(entry != null){
        shell.showItemInFolder(entry.path)
    }
}

document.addEventListener('keydown', event => {
    if(settingsScreenshotPreview.hidden){
        return
    }
    if(event.key === 'Escape'){
        closeScreenshotPreview()
    } else if(event.key === 'ArrowLeft'){
        moveScreenshotPreview(-1)
    } else if(event.key === 'ArrowRight'){
        moveScreenshotPreview(1)
    }
})

document.addEventListener('visibilitychange', () => {
    if(document.hidden){
        stopMemoryStatusFresh()
        releaseScreenshotsTab()
    } else if(getCurrentView() === VIEWS.settings && selectedSettingsTab === 'settingsTabScreenshots'){
        prepareScreenshotsTab().catch(error => loggerScreenshots.warn('Unable to restore screenshots.', error))
    } else if(getCurrentView() === VIEWS.settings && selectedSettingsTab === 'settingsTabJava'){
        keepMemoryStatusFresh()
    }
})

window.addEventListener('empi-background-state', event => {
    if(event.detail?.inBackground){
        stopMemoryStatusFresh()
        releaseScreenshotsTab()
    } else if(getCurrentView() === VIEWS.settings && selectedSettingsTab === 'settingsTabScreenshots'){
        prepareScreenshotsTab().catch(error => loggerScreenshots.warn('Unable to restore screenshots.', error))
    } else if(getCurrentView() === VIEWS.settings && selectedSettingsTab === 'settingsTabJava'){
        keepMemoryStatusFresh()
    }
})

/**
 * Settings preparation functions.
 */

/**
  * Prepare the entire settings UI.
  * 
  * @param {boolean} first Whether or not it is the first load.
  */
let settingsCorePrepared = false
let settingsValuesPrepared = false
let settingsValuesServerId = null
let preparedModsServerId = null

async function prepareActiveSettingsTab(tabId){
    switch(tabId){
        case 'settingsTabMods': {
            const serverId = ConfigManager.getSelectedServer()
            if(preparedModsServerId !== serverId){
                await prepareModsTab()
                preparedModsServerId = serverId
            }
            break
        }
        case 'settingsTabJava':
            await prepareJavaTab()
            break
        case 'settingsTabScreenshots':
            await prepareScreenshotsTab()
            break
        case 'settingsTabAccount':
            prepareAccountsTab()
            break
        case 'settingsTabAbout':
            prepareAboutTab()
            break
        case 'settingsTabUpdate':
            prepareUpdateTab()
            break
    }
}

async function prepareSettings(first = false) {
    if(!settingsCorePrepared){
        setupSettingsTabs()
        initSettingsValidators()
        prepareUpdateTab()
        settingsCorePrepared = true
    }

    // Startup only needs static updater/navigation wiring. Java validation,
    // mod scans and shader scans are delayed until Settings is actually opened.
    if(first){
        return
    }

    const selectedServerId = ConfigManager.getSelectedServer()
    if(!settingsValuesPrepared || settingsValuesServerId !== selectedServerId){
        await initSettingsValues(true)
        prepareAccountsTab()
        settingsValuesPrepared = true
        settingsValuesServerId = selectedServerId
        lastPreparedJavaKey = null
    }

    await prepareActiveSettingsTab(selectedSettingsTab)
}

// Prepare the settings UI on startup.
//prepareSettings(true)

// Selector de idioma de EmpiLauncher.
const settingsLanguageSelect = document.getElementById('settingsLanguageSelect')

if(settingsLanguageSelect){
    settingsLanguageSelect.value = ConfigManager.getLanguage()

    settingsLanguageSelect.addEventListener('change', () => {
        const selectedLanguage = settingsLanguageSelect.value
        ConfigManager.setLanguage(selectedLanguage)
        ConfigManager.save()
        ipcRenderer.send('languageChange', selectedLanguage)
    })
}
