# dsh-network-proxy 1.0.0 测评证据（@baizhizzl，commit a564678）

| 文件 | 内容 |
|---|---|
| probe-network-proxy-security.mjs | 隔离内核（0.2.1-rc.2 树）+ 真实挂载，伪造头探测 /api/network-proxy 跨源属性 |
| probe-network-proxy-function.mjs | mock ctx 直调生产 route handler：端到端功能 + 凭据落盘检查 |
| kernel-probe.json | 安全探针原始响应矩阵（9 用例 401/403 判定数据） |

复跑前置：D:/workspace/_dsh_kernel 内核树（asar 解出）；security 探针自建隔离 home+junction，不碰真实安装。
