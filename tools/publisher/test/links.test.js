// node --test tools/publisher/test/*.test.js
// "Comprobar enlaces": what counts as a link that opens, one that does not, and one that cannot be told. No real network: fetch is a stub.
const test = require('node:test')
const assert = require('node:assert')
const { checkLink, checkLinks } = require('../lib/links')

const answer = (status) => async () => ({ status, body: { cancel: async () => {} } })
const seen = []
const routes = (map) => async (url) => { seen.push(url); const status = map[url]; if (status instanceof Error) throw status; return { status: status ?? 200, body: { cancel: async () => {} } } }

test('a page that opens is fine, one that is gone is not, and one that refuses robots is "cannot tell"', async () => {
    assert.strictEqual((await checkLink('https://example.com/a', { fetchImpl: answer(200) })).ok, true)
    assert.strictEqual((await checkLink('https://example.com/a', { fetchImpl: answer(302) })).ok, true)
    const gone = await checkLink('https://example.com/a', { fetchImpl: answer(404) })
    assert.strictEqual(gone.ok, false)
    assert.match(gone.note, /no existe/)
    assert.strictEqual((await checkLink('https://example.com/a', { fetchImpl: answer(403) })).ok, null)
    assert.strictEqual((await checkLink('https://example.com/a', { fetchImpl: answer(429) })).ok, null)
    assert.strictEqual((await checkLink('https://example.com/a', { fetchImpl: answer(503) })).ok, false)
})

test('only https, and only real addresses', async () => {
    assert.strictEqual((await checkLink('http://example.com', { fetchImpl: answer(200) })).ok, false)
    assert.match((await checkLink('http://example.com', { fetchImpl: answer(200) })).note, /https/)
    assert.strictEqual((await checkLink('esto no es un enlace', { fetchImpl: answer(200) })).ok, false)
})

test('a site that does not exist is a failure; one that takes too long is only "cannot tell"', async () => {
    const dns = Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } })
    assert.match((await checkLink('https://no-existe.example', { fetchImpl: async () => { throw dns } })).note, /no existe/)
    const slow = Object.assign(new Error('timed out'), { name: 'TimeoutError' })
    assert.strictEqual((await checkLink('https://lento.example', { fetchImpl: async () => { throw slow } })).ok, null)
})

test('a Discord invitation is checked against Discord itself, because its page says 200 even when the invitation died', async () => {
    seen.length = 0
    const fetchImpl = routes({ 'https://discord.com/api/v10/invites/muerta': 404, 'https://discord.com/api/v10/invites/viva': 200 })
    const dead = await checkLink('https://discord.gg/muerta', { fetchImpl })
    const alive = await checkLink('https://discord.com/invite/viva?event=1', { fetchImpl })
    assert.strictEqual(dead.ok, false)
    assert.match(dead.note, /invitación/)
    assert.strictEqual(alive.ok, true)
    assert.deepStrictEqual(seen, ['https://discord.com/api/v10/invites/muerta', 'https://discord.com/api/v10/invites/viva'])
    // a channel link needs a login: it is asked as any page (and cannot be told wrong by the invite rule)
    seen.length = 0
    await checkLink('https://discord.com/channels/1/2', { fetchImpl })
    assert.deepStrictEqual(seen, ['https://discord.com/channels/1/2'])
})

test('a list is checked and keeps where each link came from', async () => {
    const fetchImpl = routes({ 'https://a.example/': 200, 'https://b.example/': 404 })
    const out = await checkLinks([{ where: 'Aviso "Uno"', url: 'https://a.example/' }, { where: 'Novedades', url: 'https://b.example/' }], { fetchImpl })
    assert.deepStrictEqual(out.map((r) => [r.where, r.ok]), [['Aviso "Uno"', true], ['Novedades', false]])
})
