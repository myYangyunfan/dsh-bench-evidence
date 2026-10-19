# dsh-cover-pipeline 1.1.2 测评证据包（@ commit 0589d92）

对应测评报告的证据链可复核材料。测评环境：Windows 11 · Node v24.15.0（工具层）/ v24.21.0（真宿主）· 无 MSST/DDSP 材料。

## 文件索引

| 文件 | 内容 | 支撑结论 |
|---|---|---|
| `mock-tool-runs.json` | 工具层直调 execute 的原始返回（mock ctx，不进 DSH、不装材料） | 异常路径行为表：同名冲突拒 / 防覆盖拒并指名文件 / 无材料 precondition 拦截 / 不存在目录不崩 / `...wav` 输入 dry-run 的 expects 逃逸到父目录（F2 两次独立实测之一）；裸机 doctor 14 ERR＋1 WRN 全带 fix |
| `probe-tool-behaviors.mjs` | 上述实测的探针脚本（生成 mock-tool-runs.json） | 方法可复核：`node probe-tool-behaviors.mjs`（需先 clone 插件并改文件内 import 路径） |
| `probe-stem-escape.mjs` | F2 专项探针（dry-run，不执行外部 Python） | `...wav` → stem `..` → 预期产物落 outDir 父目录 |
| `host-01-doctor.png` / `host-02-doctor.png` | 真实 DSH 宿主内 cover_doctor 输出（无材料） | 真宿主 14 阻塞＋1 警告＋8 就绪，与工具层结果逐项一致；fail-closed 成立 |
| `host-03-orchestration.png` | 真实 DSH 宿主内一句话编排（无材料） | 模型先报环境阻塞→按 cover_plan 反问清单（源路径/K 策略/和声）→明确「流水线尚未启动」；无假成功、无绕过插件手工执行 |

## F16 前后对比（加载即写盘）

探针运行前本机无 `D:\AI-Song`；运行 `cover_doctor`（工具层）后出现 `D:\AI-Song\cover_runs`（目录创建时间与运行时刻吻合）。根因链：`src/config.js:132`（songRoot fallback 字符串）→ `src/config.js:271-273`（resolveConfig 无条件 mkdirSync）。
