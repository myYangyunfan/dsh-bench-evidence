# dsh-model-usage 1.0.5 测评证据（@PonyDevAI，commit b638876）

| 文件 | 内容 |
|---|---|
| probe-model-usage-security.mjs | 隔离内核（0.2.1-rc.2 树）+ profile bundles 挂载，伪造头探测 /model-usage 的 connection.admit 围栏 |
| kernel-probe.json | 9 用例原始响应矩阵（全部 401/403——围栏有效） |

复跑前置：D:/workspace/_dsh_kernel 内核树；探针自建隔离 home+junction。
