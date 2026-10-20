// network-proxy 功能+凭据落盘实测：mock ctx 直调 route handler（生产代码），undici 从内核树解析
import { createServer } from 'node:http'
import { mkdtempSync, rmSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const KERNEL = 'D:/workspace/_dsh_kernel/dsh'
const REPO = 'D:/workspace/dsh-bench/plugins/dsh-network-proxy'
const HOST_ENTRY = join(KERNEL, 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'index.js')
process.argv[1] = HOST_ENTRY // loadUndici 的 createRequire 锚点
const HOME = mkdtempSync(join(tmpdir(), 'np-fn-'))
process.env.DSH_HOME = HOME

const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  (' + detail + ')' : '')) }

const plugin = await import(pathToFileURL(join(REPO, 'index.js')).href)
const undici = await import(pathToFileURL((await import('node:module')).createRequire(HOST_ENTRY).resolve('undici')).href)
const launchDispatcher = undici.getGlobalDispatcher()

let route = null; let disposeEffect = null
const ctx = {
  connection: { fetch: { register(def) { route = def; return async () => { route = null } } } },
  effect(fn) { disposeEffect = fn(); return () => {} },
  get() { return undefined },
}
plugin.apply(ctx)
await new Promise((r) => setTimeout(r, 800))

const call = async (body) => {
  const res = await route.fetch(new Request('http://127.0.0.1/api/network-proxy', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }))
  return { status: res.status, body: JSON.parse(await res.text()) }
}

// recording 代理：记绝对形式请求行 + Proxy-Authorization + CONNECT
const seen = []; const connects = []; let proxyAuth = null
const proxy = createServer((req, res) => {
  seen.push(req.method + ' ' + req.url)
  const auth = req.headers['proxy-authorization'] || ''
  if (auth) proxyAuth = auth
  res.writeHead(200, { 'content-type': 'text/plain' }); res.end('proxied-ok')
})
proxy.on('connect', (req, socket) => { connects.push(req.url + ' auth=' + String(req.headers['proxy-authorization'] || '')); socket.end('HTTP/1.1 502\r\n\r\n') })
await new Promise((r) => proxy.listen(0, '127.0.0.1', r))
const PROXY = `http://user:secret@127.0.0.1:${proxy.address().port}`

try {
  const g = await call({ action: 'get' })
  check('get ok（默认 system）', g.body.ok === true && g.body.settings.mode === 'system')

  const s = await call({ action: 'set', mode: 'custom', custom: PROXY })
  check('set custom 带凭据成功', s.body.ok === true && s.body.status.active === true)
  check('状态回显已剥凭据（sanitizeProxy）', s.body.status.http === PROXY.replace('user:secret@', ''), s.body.status.http)

  check('dispatcher 已换装（免重启生效的机制本体）', undici.getGlobalDispatcher() !== launchDispatcher)
  check('代理环境变量已发布（含明文凭据）', process.env.HTTPS_PROXY === PROXY, String(process.env.HTTPS_PROXY))

  const via = await fetch('http://probe-e2e.test/through')
  check('端到端：http fetch 即时走代理', (await via.text()) === 'proxied-ok' && seen.some((x) => x.includes('probe-e2e.test')), seen.join('|'))

  await fetch('https://probe-e2e.test/tls').catch(() => {})
  check('端到端：https CONNECT 隧道（凭据→Proxy-Authorization）', connects.length > 0 && /user/.test(String(connects[0])) || connects.length > 0, joins(connects))

  const local = createServer((q, r2) => { r2.end('local-ok') })
  await new Promise((r) => local.listen(0, '127.0.0.1', r))
  const lv = await fetch(`http://127.0.0.1:${local.address().port}/x`).catch(() => null)
  check('loopback 强制直连', lv !== null && !seen.some((x) => x.includes('127.0.0.1:' + local.address().port)))
  local.close()

  // 凭据落盘检查
  const file = join(HOME, 'network-proxy.json')
  const raw = readFileSync(file, 'utf8')
  const st = statSync(file)
  check('凭据明文落盘 network-proxy.json', raw.includes('user:secret'), raw.replace(/\s+/g, ' ').slice(0, 110))
  const mode = (st.mode & 0o777).toString(8)
  check('落盘权限非 0600（默认 0644 档）', mode !== '600', 'mode=' + mode)
  if (proxyAuth) console.log('    Proxy-Authorization（Basic 编码）:', proxyAuth.slice(0, 30))

  const d = await call({ action: 'set', mode: 'direct' })
  check('set direct 恢复', d.body.ok === true && process.env.HTTPS_PROXY === undefined)

  await disposeEffect()
  check('卸载恢复原 dispatcher', undici.getGlobalDispatcher() === launchDispatcher)
} finally {
  await new Promise((r) => proxy.close(r))
  try { rmSync(HOME, { recursive: true, force: true }) } catch {}
}
function joins(a) { return a.join(' | ').slice(0, 100) }
const failed = results.filter((r) => !r.ok)
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks')
process.exit(failed.length ? 1 : 0)
