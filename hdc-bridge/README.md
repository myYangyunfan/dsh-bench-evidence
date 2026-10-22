# dsh-hdc-bridge 0.10.2 测评证据（@1na-ko，main@51868ae）

| 文件 | 内容 |
|---|---|
| probe-hdc-bridge-security.mjs | 隔离内核（0.2.1-rc.2 树）+ profile 挂载，伪造头探测 /api2/hdc-bridge 面板路由 |
| kernel-probe.json | 原始响应：GET panel-state 全矩阵 200（无 token/Origin:evil/SFS:cross-site/Host:evil），POST 405（方法校验在鉴权之后=handler 可达） |

复跑前置：D:/workspace/_dsh_kernel 内核树；探针自建隔离 home+junction。
