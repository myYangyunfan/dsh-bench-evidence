// D 组异常路径 + E 组裸机降级 · 工具层实测（mock ctx，不装材料、不进 DSH）
// 方法：用 test/harness.mjs 同款 mock ctx 把插件加载起来，直接 execute 各工具，记录原始 JSON。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as plugin from 'file:///D:/workspace/dsh-bench/plugins/dsh-cover-pipeline/src/index.js';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cover-probe-d-'));
const registry = new Map();
const logs = [];
await plugin.apply({
  logger: { info: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push('[warn] ' + a.join(' ')) },
  get: () => ({ register: (d) => registry.set(d.name, d) }),
}, {});

const out = [];
const record = (id, desc, v) => {
  out.push({ id, desc, result: v });
  const brief = { ok: v.ok, phase: v.phase, error: v.error ?? null,
    expects: v.expects ?? undefined, exists: v.exists ?? undefined };
  console.log(`\n== ${id} | ${desc}`);
  console.log(JSON.stringify(brief, null, 1));
};

// 假 WAV（RIFF 头 + 数据），inputsIn 只看扩展名
function wav(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const data = Buffer.alloc(44100), h = Buffer.alloc(44);
  h.write('RIFF'); h.writeUInt32LE(data.length + 36, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(44100, 24); h.writeUInt32LE(88200, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(p, Buffer.concat([h, data]));
}

// ── D1 同名不同扩展 → 应报 collide
const d1in = path.join(TMP, 'd1', 'in'); fs.mkdirSync(d1in, { recursive: true });
wav(path.join(d1in, 'song.wav')); wav(path.join(d1in, 'song.mp3'));
record('D1', '同名 .wav+.mp3 → 预期 basename collide 报错',
  await registry.get('cover_separate').execute({ inputFolder: d1in, outDir: path.join(TMP, 'd1', 'out'), dryRun: true }));

// ── D2 输出已存在 → 应拒
const d2in = path.join(TMP, 'd2', 'in'), d2out = path.join(TMP, 'd2', 'out');
fs.mkdirSync(d2in, { recursive: true }); wav(path.join(d2in, 'new.wav'));
wav(path.join(d2out, 'new', 'vocals.wav'));
record('D2', 'outDir 已有上次产物 → 预期 Output already exists 拒跑',
  await registry.get('cover_separate').execute({ inputFolder: d2in, outDir: d2out, dryRun: true }));

// ── D3 无材料直接 convert（非 dryRun）→ 应 fail-closed
record('D3', '无材料 cover_convert mode=pilot → 预期 precondition 失败（不静默）',
  await registry.get('cover_convert').execute({ src: path.join(d2in, 'new.wav'), key: 0, outDir: path.join(TMP, 'd3'), mode: 'pilot' }));

// ── D4 cover_status 不存在目录
record('D4', 'cover_status 指不存在目录 → 预期 exists:false 不崩',
  await registry.get('cover_status').execute({ dir: path.join(TMP, 'no-such-dir') }));

// ── D5 文件名 ...wav dryRun → 预期产物路径逃到父目录
const d5in = path.join(TMP, 'd5', 'in'), d5out = path.join(TMP, 'd5', 'out');
fs.mkdirSync(d5in, { recursive: true }); wav(path.join(d5in, '...wav'));
record('D5', '输入文件名 "...wav" dryRun → 预期 expects 逃出 outDir（审计 F2）',
  await registry.get('cover_separate').execute({ inputFolder: d5in, outDir: d5out, dryRun: true }));

// ── E1 裸机 cover_doctor（本机无 MSST/DDSP/音色材料）
const doc = await registry.get('cover_doctor').execute({});
console.log(`\n== E1 | 裸机 cover_doctor → ok=${doc.ok} errors=${doc.errorCount} warns=${doc.warningCount}`);
for (const c of doc.checks) console.log(`   ${c.ok ? 'OK ' : c.level === 'error' ? 'ERR' : c.level === 'warn' ? 'WRN' : 'inf'} | ${c.name} | ${(c.detail ?? '').slice(0, 90)}${c.fix ? ' | fix: ' + c.fix.slice(0, 60) : ''}`);
out.push({ id: 'E1', desc: '裸机 doctor 全清单', ok: doc.ok, errorCount: doc.errorCount, warningCount: doc.warningCount, checks: doc.checks });

fs.writeFileSync('D:/workspace/dsh-bench/evidence/2026-10-19-cover-pipeline/mock-tool-runs.json', JSON.stringify(out, null, 2));
console.log('\n[saved] evidence/2026-10-19-cover-pipeline/mock-tool-runs.json');
