// 探针：验证输入文件名 stem 边界（.. 逃逸 / 保留名 / 前导点）对输出路径构造的影响
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { resolveConfig } from 'file:///D:/workspace/dsh-bench/plugins/dsh-cover-pipeline/src/config.js';
import { runSeparation } from 'file:///D:/workspace/dsh-bench/plugins/dsh-cover-pipeline/src/execution.js';

const base = mkdtempSync(join(tmpdir(), 'probe-cover-'));
const inputFolder = join(base, 'in');
const outDir = join(base, 'out');
mkdirSync(inputFolder, { recursive: true });
mkdirSync(outDir, { recursive: true });
// 伪造一个最小 WAV（RIFF 头 + 4 字节数据）——inputsIn 只看扩展名，不读内容
const fakeWav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')]);
const evilName = '...wav';          // extname('.wav') => stem '..'
writeFileSync(join(inputFolder, evilName), fakeWav);

const cfg = resolveConfig({ songRoot: base });
// dryRun 只回显命令与预期产物，不执行外部 Python —— 安全
const r = await runSeparation(cfg, { inputFolder, outDir, dryRun: true });
console.log('ok =', r.ok);
console.log('expects =', JSON.stringify(r.expects, null, 1));
if (r.error) console.log('error =', r.error);
// 检查 expects 是否逃出 outDir
const escaped = (r.expects ?? []).filter((p) => !p.startsWith(resolve(outDir)));
console.log('ESCAPED_OUT_OF_OUTDIR =', escaped.length ? escaped : '(none)');
rmSync(base, { recursive: true, force: true });
