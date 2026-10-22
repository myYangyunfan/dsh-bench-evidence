// dsh-network-proxy 安全探针：隔离内核 + 真实挂载 + 伪造头探测 /api/network-proxy
// 复刻 wyymusic probe-boot 的内核启动配方（隔离 DSH_HOME / profile bundles / junction）
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import http from 'node:http'
import { tmpdir, homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = 'D:/workspace/dsh-bench/plugins/dsh-hdc-bridge'
const KERNEL = 'D:/workspace/_dsh_kernel/dsh'
const HOME = mkdtempSync(join(tmpdir(), 'np-sec-'))
const PORT = 15598
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 1) 隔离 home：profile bundles + junction（@local scope）
const PW = join(HOME, 'profiles', 'web')
mkdirSync(join(PW, 'node_modules'), { recursive: true })
writeFileSync(join(PW, 'package.json'), JSON.stringify({
  name: 'dsh-profile-web', private: true,
  dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dsh-hdc-bridge'] } },
}, null, 2) + '\n')
writeFileSync(join(PW, 'cordis.yml'), '[]\n')
const SCOPE = join(PW, 'node_modules', '@local')
const JUNC = join(PW, 'node_modules', 'dsh-hdc-bridge')
if (!existsSync(JUNC)) {
  execFileSync('cmd', ['/c', 'mklink', '/J', JUNC.replace(/\//g, '\\'), REPO.replace(/\//g, '\\')], { stdio: 'ignore' })
}
console.log('[setup] isolated home =', HOME)

// 2) 起内核（token 从 stdout 抓）
const hostLog = []
const host = spawn(process.execPath, [
  join(KERNEL, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
  'web', '--no-open', '--host', '127.0.0.1', '--port', String(PORT),
], { cwd: KERNEL, env: { ...process.env, DSH_HOME: HOME }, stdio: ['ignore', 'pipe', 'pipe'] })
host.stdout.on('data', (d) => hostLog.push(String(d)))
host.stderr.on('data', (d) => hostLog.push(String(d)))

let token = ''
for (let i = 0; i < 120; i++) {
  const m = hostLog.join('').match(/\?token=([A-Za-z0-9_-]+)/)
  if (m) { token = m[1]; break }
  await sleep(500)
}
if (token === '') {
  console.log('[fatal] kernel did not start; log tail:\n' + hostLog.join('').slice(-1500))
  try { host.kill() } catch {}
  process.exit(1)
}
console.log('[kernel] up on 127.0.0.1:' + PORT + ' (token captured, length ' + token.length + ')')
await sleep(4000) // 给插件 bootstrap（读系统代理+装 dispatcher）留时间

// 3) 伪造头探测器（node:http——fetch 会拦 Host/Sec-Fetch-Site 伪造）
const req = (method, path, { headers = {}, body = null, hostHeader } = {}) => new Promise((resolve) => {
  const h = { Host: hostHeader || `127.0.0.1:${PORT}`, ...headers }
  if (body !== null) h['Content-Length'] = Buffer.byteLength(body)
  const r = http.request({ host: '127.0.0.1', port: PORT, method, path, headers: h, timeout: 20000 }, (res) => {
    const chunks = []
    res.on('data', (c) => chunks.push(c))
    res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8') }))
  })
  r.on('timeout', () => { r.destroy(new Error('timeout')) })
  r.on('error', (e) => resolve({ status: 0, text: 'REQ ' + e.message }))
  if (body !== null) r.write(body)
  r.end()
})

const J = (obj) => JSON.stringify(obj)
const CT = { 'Content-Type': 'application/json' }
const rows = []
const probe = async (label, method, path, opts) => {
  const r = await req(method, path, opts)
  const brief = r.text.slice(0, 120).replace(/\s+/g, ' ')
  rows.push({ label, status: r.status, body: brief })
  console.log(String(r.status).padStart(3), ' |', label, ' |', brief)
}

const API = '/api2/hdc-bridge/panel-state'
console.log('\n===== 探测矩阵 =====')
await probe('A0 页面基线（不带 token）', 'GET', '/', {})
await probe('A1 页面带 token', 'GET', '/?token=' + token, {})
await probe('B1 snapshot 正常头（无 token/无 Origin）', 'GET', API, { ...CT, body: '' })
await probe('B2 snapshot + Origin: evil', 'GET', API, { ...CT, Origin: 'https://evil.example', body: '' })
await probe('B3 snapshot + Sec-Fetch-Site: cross-site', 'GET', API, { ...CT, 'Sec-Fetch-Site': 'cross-site', body: '' })
await probe('B4 snapshot + Host: evil（rebinding 形）', 'GET', API, { ...CT, body: '', hostHeader: `evil.example:${PORT}` })
await probe('C1 unknown endpoint 探针（到达 handler 则 ok:false）', 'GET', API, { ...CT, Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site', body: '' })
await probe('C2 unknown endpoint（无 Origin，curl 形）', 'GET', API, { ...CT, body: '' })
await probe('D1 logo 静态路由（GET）', 'GET', API, { ...CT, Cookie: 'token=' + token, body: '' })

console.log('\n===== 判定 =====')
const b1 = rows.find((r) => r.label.startsWith('B1'))
const c1 = rows.find((r) => r.label.startsWith('C1'))
if (b1 && b1.status === 200) console.log('· /api/network-proxy 无 token 即可读（无 token 闸）')
else if (b1) console.log('· /api/network-proxy 存在 token/鉴权闸（B1=' + b1.status + '）')
if (c1 && c1.status === 400) console.log('★ 跨源伪造头（Origin evil + cross-site）的 set 请求到达 handler（400 invalid-mode）＝【缺 Origin 放行】')
else if (c1) console.log('· 跨源 set 被 ' + c1.status + ' 拦截')

// 4) 清理
try { host.kill() } catch {}
await sleep(1000)
try { rmSync(HOME, { recursive: true, force: true }) } catch { /* junction 删除 */ }
console.log('\n[done] kernel stopped, home cleaned')

// 原始数据落盘
const { writeFileSync: wf } = await import('node:fs')
wf('D:/workspace/dsh-bench/evidence/2026-10-21-hdc-bridge/kernel-probe.json', JSON.stringify({ port: PORT, rows }, null, 2))
console.log('[saved] evidence/2026-10-21-hdc-bridge/kernel-probe.json')
