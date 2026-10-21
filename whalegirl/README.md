# dsh-we-whalegirl 测评证据（@gzyy111，main）

| 文件 | 内容 |
|---|---|
| probe-whalegirl-security.mjs | 隔离内核（0.2.1-rc.2 树）+ profile 挂载，伪造头探测 /dsh-we-whalegirl 控制面 |
| kernel-probe.json | 9 用例原始响应：无 token/Origin:evil/Sec-Fetch-Site:cross-site/Host:evil 全 200 且 /local/health 回传完整配置 |

复跑前置：D:/workspace/_dsh_kernel 内核树；探针自建隔离 home+junction。
