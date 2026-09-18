/**
 * Identity layer (see assets/css/empi-identity.css): one short tear when something happens.
 * Purely presentational; nothing else reads it. Events: a view opens, the launch button changes state.
 * Nothing animates at rest, and there is no polling: two MutationObservers that only fire on real changes.
 */
(function () {
    const root = document.documentElement
    const tear = (element) => {
        // Nobody is looking at a hidden window, and its animations are paused, so a tear would only freeze half-drawn.
        if (!element || root.hasAttribute('data-empi-inactive')) return
        element.classList.remove('empi-tear')
        void element.offsetWidth
        element.classList.add('empi-tear')
        setTimeout(() => element.classList.remove('empi-tear'), 400)
    }

    // A view becoming visible tears its own title.
    const TITLES = {
        welcomeContainer: '#welcomeHeader',
        loginContainer: '#loginSubheader',
        loginOptionsContainer: '.loginOptionsMainContent h2',
        waitingContainer: '#waitingTextContainer h2',
        settingsContainer: '#settingsNavHeaderText',
        landingContainer: '#landingServerRailTitle'
    }
    const shown = new Set()
    const main = document.getElementById('main')
    if (main) {
        new MutationObserver((records) => {
            for (const record of records) {
                const view = record.target
                const selector = TITLES[view.id]
                if (!selector) continue
                const visible = view.style.display !== 'none'
                if (visible && !shown.has(view.id)) tear(view.querySelector(selector))
                if (visible) shown.add(view.id)
                else shown.delete(view.id)
            }
        }).observe(main, { attributes: true, attributeFilter: ['style'], subtree: true })
    }

    // The launcher's own update indicator changing state, and its "ready" notice appearing.
    const updates = document.getElementById('empiUpdateMediaContainer')
    if (updates) {
        new MutationObserver(() => tear(document.getElementById('empiUpdateMediaButton')))
            .observe(updates, { attributes: true, attributeFilter: ['data-state'] })
    }
    const notice = document.getElementById('empiUpdateReadyNotice')
    if (notice) {
        new MutationObserver(() => { if (notice.hasAttribute('visible')) tear(notice) })
            .observe(notice, { attributes: true, attributeFilter: ['visible'] })
    }

    // The launch button changing state (play, updating, launching, running...) tears its label.
    const launch = document.getElementById('launch_button')
    if (launch) {
        new MutationObserver(() => tear(document.getElementById('launch_button_label')))
            .observe(launch, { attributes: true, attributeFilter: ['data-state'] })
    }
})()
