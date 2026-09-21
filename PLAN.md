# Redis 缓存参数探索器 — 实施计划（多 agent 并行版）

## 1. Context

Anthropic Platform SWE take-home：需交付**已部署、浏览器直接可用、自带 demo 数据**的原型（目标 1–2h，上限 8h），外加仓库、设计说明（视频+文档）、AI transcripts。
Idea：系统设计时人们本能地"加 Redis"，但容量 / TTL / 延迟 / 可用性配错时 Redis 可能毫无帮助甚至负优化。做一个交互式网页，用 Che's approximation 把"容量"和"TTL"统一到同一个时间量纲，让人看见自己的 Redis 选择如何决定 miss rate、尾延迟与脏读。
**主题（已与用户确认）：申报 Theme 1。** 形式是 Theme 1（可探索的讲解器 + 仿真），内容是 Theme 3（缓存、尾延迟、失效模式）；README 明确写出这一定位，让系统深度成为 Theme 1 下的差异化。
项目规则（AGENTS.md）：最少代码；英文注释只描述代码本身；语言限 Python / TypeScript / Bash。
**执行方式：多个 agent 基于本 plan 并发执行** → 先冻结协议，再按文件所有权拆成互不冲突的轨道。

## 2. Idea 审查结论（网络调研）

合理且有差异化：现有只有玩具级 LRU 演示器（CacheLab）和离线库（libCacheSim），没有把 Che 近似 + TTL + 延迟分位 + 成本合起来"选参数"的交互工具。

| 发现 | 影响 |
|---|---|
| arXiv 1202.3974 = Fricker/Robert/Roberts 2012，解释 Che 近似为何准确 | ✅ 数学核心 |
| **arXiv 1704.04448（d-TTL/f-TTL）是"自适应调 TTL 达到目标命中率/缓存大小"，不是 TTL↔脏数据权衡** | ⚠️ 改为支撑"TTL 是命中率/容量旋钮"；脏数据权衡改引 HotNets'24 *Revisiting Cache Freshness*（arXiv 2412.20221） |
| Twitter OSDI'20（153 集群）：α 多在 1–2.5（读多型中位 1.4，写多型 0.9）；"TTL 限定有效工作集" | α 范围 **0–2.5**；"TTL 与容量谁起作用"有生产数据背书 |
| Redis 默认 `noeviction`；LRU 为 5 样本近似；过期 lazy+active | 假设 `allkeys-lru`+即时过期，写进假设面板 |
| Brooker *Caches, Modes, and Unstable Systems*：缓存挂掉时后端吃全量 → 双稳态 | availability 输入配 DB 容量 → 输出"Redis 挂了 DB 扛不扛得住" |
| ElastiCache r7g.large $0.219/h、13.07 GiB、预留 25% | 默认 **$16/GB·月**，可编辑 |

模型补洞：加 DB/Redis 延迟输入（否则算不出分位）；加**脏读率**输出（否则 TTL 无张力、WPS 无作用）；写策略 `ttl-only | invalidate` 开关；Redis TTL 命中**不重置** ≠ Che 的"命中重置"，须分开建模；DB 大小由 key 数 × 对象大小派生。

## 3. 技术选型

TypeScript + **Vite 6**（`base: './'`；本机 Node 20.12 装不了 Vite 8 / Vitest 5，故用 Vite 6 + Vitest 3）+ 原生 DOM（无 UI 框架）+ **Observable Plot 0.6.17** + **Vitest** + Web Worker；GitHub Actions → GitHub Pages（Vite 官方 workflow）。
否决 marimo/Pyodide：首屏需下载 Python 运行时，加载慢、交互控制弱。

## 4. 协议（M0 产出，之后冻结）

`src/contract/types.ts` —— **输入明确分为"系统配置（给定）"与"Redis 配置（待评审的选择）"**：

```ts
export interface SystemConfig {        // the system being designed: workload + backing DB
  keys: number; objBytes: number;      // dataset size = keys * objBytes (derived, displayed)
  alpha: number;                       // Zipf exponent 0..2.5
  rps: number; wps: number;            // reads/s, writes/s (writes share read popularity)
  dbP50Ms: number; dbP99Ms: number; dbCapacityQps: number;
}
export interface RedisConfig {         // the choices under review
  memGB: number; ttlSec: number;       // ttlSec = Infinity means no TTL
  writePolicy: 'ttl-only' | 'invalidate';
  pricePerGBMonth: number; availability: number;   // availability in 0..1
  p50Ms: number; p99Ms: number; timeoutMs: number; // timeout is paid when Redis is down
}
export interface Params { sys: SystemConfig; redis: RedisConfig }
export interface Percentiles { p50: number; p75: number; p90: number; p99: number }
export interface Outputs {
  missRate: number; staleRate: number;
  evictionAgeSec: number;              // Che characteristic time Tc; Infinity if memory never fills
  binding: 'ttl' | 'capacity';         // 'capacity' when Tc < ttlSec
  memUsedGB: number; costPerMonth: number;
  latency: Percentiles; baseline: Percentiles;      // with cache vs DB only
  dbLoad: { withCache: number; noCache: number; redisDown: number }; // utilisation, >=1 is overload
}
export interface Curves {
  missVsMem: { memGB: number; miss: number; ideal: number }[];   // ideal = perfect top-C cache
  vsTtl: { ttlSec: number; miss: number; stale: number }[];
  latencyCdf: { ms: number; withCache: number; baseline: number }[];
}
export interface SimRequest { id: number; params: Params; requests: number; seed: number }
export interface SimResult  { id: number; missRate: number; staleRate: number }
export interface Advice { level: 'good' | 'warn' | 'bad'; title: string; detail: string }
export interface InputSpec { key: string; group: 'system' | 'redis'; label: string; unit: string;
  min: number; max: number; log: boolean; random?: [number, number] }  // random: plausible range for the dice button
```

目录：`src/contract/`（冻结的协议）· `src/engine/`（算法，无 DOM，轨道 A/B）· `src/ui/`（页面，轨道 C）。下文未带目录的文件名均按此归位。

模块签名（M0 先放 stub，全部可编译、可被 UI 调用）：

| 文件 | 导出 | 所有者 |
|---|---|---|
| `src/contract/types.ts` | 上述类型 | M0 → **冻结**（要改必须停下上报） |
| `src/contract/inputs.ts` | `INPUTS: InputSpec[]`、`DEFAULTS: Params`；`randomSystem(): SystemConfig` | M0 → 轨道 C |
| `src/engine/model.ts` | `evaluate(p): Outputs`、`curves(p): Curves` | 轨道 A → 完成后移交轨道 B |
| `src/engine/sim.ts` | `simulate(r): SimResult`、`scaleForSim(p, maxKeys=1e6): Params` | 轨道 B |
| `src/engine/worker.ts` | `onmessage: SimRequest → SimResult` | 轨道 B |
| `src/engine/advisor.ts` | `advise(p, o): Advice[]`（按严重度排序，`[0]` 即一句话结论） | A 完成后接手 |
| `src/engine/presets.ts` | `PRESETS: {name, blurb, params}[]` | A 完成后接手 |
| `index.html` `src/ui/main.ts` `src/ui/style.css` | UI | 轨道 C |
| `test/model.test.ts` / `test/sim.test.ts` `test/cross.test.ts` | | A / B |

输入规格（M0 转录进 `inputs.ts`）：

| 组 | key | 滑块范围 | 刻度 | 默认 | 🎲 随机范围 |
|---|---|---|---|---|---|
| system | keys | 1e3–1e9 | log | 1e7 | 1e5–1e8 |
| system | objBytes | 64–1e6 B | log | 1024 | 128–16384 |
| system | alpha | 0–2.5 | lin | 1.0 | 0.4–1.8 |
| system | rps | 1–1e6 | log | 1e4 | 1e2–1e5 |
| system | wps | 0–1e5 | log | 100 | rps 的 0.1%–30% |
| system | dbP50Ms / dbP99Ms | 0.5–500 / ≤5000 | log | 5 / 50 | 2–50 / P50 的 3–20× |
| system | dbCapacityQps | 10–1e6 | log | 2e4 | rps 的 0.3–3× |
| redis | memGB | 0.01–1024 | log | 1 | — |
| redis | ttlSec | 1s–30d，外加 ∞ | log | 3600 | — |
| redis | writePolicy | 开关 | — | ttl-only | — |
| redis | pricePerGBMonth | 1–100 | lin | 16 | — |
| redis | availability | 90%–100% | 按"几个 9" | 99.9% | — |
| redis | p50Ms / p99Ms / timeoutMs | 0.1–50 / ≥P50 / 1–5000 | log | 0.5 / 2 / 100 | — |

## 5. 模型规格（轨道 A 实现，轨道 B 验证并有权修正）

```
C = memBytes/(objBytes+100)          // 100 B per-key Redis overhead (constant, listed in assumptions)
λ_i = rps·p_i,  w_i = wps·p_i,  p_i ∝ i^-α
L = LRU 淘汰时刻 ≈ Tc + Exp(m),  m = (e^{λTc}-1)/λ - Tc      （用 expm1；λTc>30 时 1/m=0）
life(λ,w,T,Tc) = ∫0^T P(L>t)·e^{-wt} dt
   T≤Tc: (1-e^{-wT})/w                      (w→0 取 T)
   T>Tc: (1-e^{-wTc})/w + e^{-wTc}·(1-e^{-(w+1/m)(T-Tc)})/(w+1/m)
ℓ   = life(λ, invalidate ? w : 0, T, Tc)
o_i = λℓ/(1+λℓ)                              // 占用概率 = 命中概率 (PASTA)
Tc:  二分解 Σ o_i(Tc) = C；若 Σ o_i(∞) ≤ C → Tc=∞, memUsed = Σo_i·bytes
hit = Σ p_i·o_i
stale(ttl-only) = Σ p_i·λ(ℓ_{w=0} - ℓ_w)/(1+λℓ_{w=0});  invalidate → 0
```
- 分箱：前 256 个 rank 逐个，其后几何分箱（比率 1.1，1e9 key 共 415 箱）；实测 `evaluate` 0.9ms、`curves` 44ms（测试上限 5ms / 60ms）。
- `missVsMem` 以 Tc 为参数直接扫，不逐点求根；`ideal` = top-C 的 Σp_i。
- 延迟：对数正态（μ=ln p50，σ=ln(p99/p50)/2.326）；三类混合 —— hit=Redis；miss=DB 右移 Redis p50；Redis down（权重 1-A）=DB 右移 timeout；混合 CDF 上二分取分位；baseline=仅 DB。
- dbLoad：`(rps·miss+wps)/cap`、`(rps+wps)/cap`（noCache 与 redisDown 同式，分开字段便于 UI 表述）。

## 6. UI 规格（轨道 C）

- 布局：左栏两张卡 **① Your system（given）**〔🎲 Randomize〕与 **② Your Redis choices（decide）**，视觉上明确区分；中栏结论句 + 数字卡片 + 图；右栏预留给 Advisor（扩展 MX1）。手机宽度纵向堆叠、无横向滚动。
- 🎲 只随机 SystemConfig（按 `random` 范围，log 刻度取对数均匀；再夹紧 wps≤rps、dbP99≥2×dbP50），Redis 配置保持不动 → 形成"给你一个系统，你来配 Redis"的练习。
- 图：① miss vs 内存（GB/$ 双轴；当前点；ideal 线）② miss 与 stale vs TTL（竖线标 Tc 与当前 TTL）③ 延迟 CDF 有/无缓存 ④ **模型-仿真 parity 图**（x=模型、y=仿真、对角线；点在线上即可信）。
- Validate：`scaleForSim(params)` → 当前点 + 4 个内存 + 4 个 TTL 共 9 组；每组 `evaluate()` 与 Worker `simulate()` 成对画进图④（统一一条代码路径，无论是否缩放）。
- 预设栏读 `PRESETS`；结论句读 `advise()[0]`；"Assumptions & non-goals"折叠面板。界面与 README 用英文。

### 6.1 视觉风格：Classroom paper（已与用户确认）

调研依据：讲解器要**引导注意力**（Bret Victor）→ 结论句最显眼、图在其下；**颜色只表示含义**（Distill / Ciechanowski / samwho）；**先引导再放开**（Nicky Case）→ 预设 = 引导，🎲+滑块 = 试验场。配色直接取自 `cat_teacher/generate.py`，使吉祥物（X2）与页面是同一套设计语言。

全部颜色定义为 `style.css` 的 `:root` 变量，别处不写裸 hex：

| 变量 | 值 | 含义（全页唯一用途） |
|---|---|---|
| `--paper` | `#FBF8F3` | 页面底色 |
| `--ink` | `#2B2320` | 正文、坐标轴、1.5px 卡片描边 |
| `--given` / `--given-bg` | `#33415C` / `#E6E9F0` | ① Your system：卡片、滑块、标签 |
| `--choice` / `--choice-bg` | `#D98A45` / `#F7EBDD` | ② Your Redis choices：卡片、滑块；**图中"你的配置"曲线与当前点**；结论句里的参数值 |
| `--good` / `--good-bg` | `#5B7F62` / `#E4EAE4` | `level: good`；图中 ideal 线（虚线）；Advisor 面板底色 |
| `--warn` | `#C9A24B` | `level: warn` |
| `--bad` | `#8C2F39` | `level: bad`；超载/变差的数字。不作他用 |
| `--muted` | `#8A8078` | 无缓存 baseline 曲线、次要文字、网格线 |

- 字体：标题与结论句用衬线（`Georgia, 'Iowan Old Style', serif`），结论句斜体、为全页最大字号；控件、数字卡片、图标注用 `system-ui`；数字加 `font-variant-numeric: tabular-nums`。不引入 web font。
- 卡片：`--ink` 1.5px 描边、8px 圆角、平涂无阴影无渐变（与吉祥物的描边画风一致）。
- 结论句中出现的用户所选参数值（内存、TTL 等）用 `--choice` 色 + 虚线下划线，与 ② 卡片呼应，让人一眼看出"句子里哪些数字是我选的"。
- 4 张图共用同一映射：`--choice` 实线 = 你的配置，`--good` 虚线 = ideal，`--muted` = baseline，Tc 竖线用 `--ink` 虚线；Plot 背景透明、坐标轴 `--ink`。图④ parity 点用 `--choice`，对角线用 `--muted`。
- Advisor 面板（X1b）：每条建议前缀 ✓ / △ / ✗ 对应 good / warn / bad 三色，呈现为"老师批改"。
- 克制：除上表外不加装饰色、不加插画、不用 emoji 以外的图标；避免显得幼稚。

## 7. 执行编排

```
阶段0 (串行, 1 agent)   M0 脚手架 + 协议 + stub + 部署管线
阶段1 (并行, 3 agent)   A 模型 ─┬→ A' 预设 + 结论规则 (presets.ts, advisor.ts)
                        B 仿真 ─┴→ B' 交叉验证 + 修正 model.ts
                        C UI（全程对着 stub 开发，含 Validate 接线与 🎲）
阶段2 (串行, 1 agent)   M4 集成：合并、全量测试、浏览器逐预设验收、部署
阶段3 (可与阶段2并行)   M5 交付物：README / 视频提纲 / transcripts
```
关键路径 ≈ M0 25m + C 75m + 集成 20m ≈ **2h 墙钟**（agent 总工时约 4.5h）。

并行规则：每轨道一个 git worktree/分支（`track/model|verify|ui`）；**只改自己拥有的文件**，因此合并无冲突；`package.json` 依赖在 M0 一次装齐，之后无人改动；`types.ts` 冻结；`model.ts` 在 A 验收通过并合入 main 后所有权移交 B。

| 工作包 | 目的 | 执行 plan | 验收成果 → 预期 | 完成后 |
|---|---|---|---|---|
| **M0** | 消灭部署风险、冻结协议 | ✅ GitHub 公开仓库与 remote 已由你配好（`LimboAntique/Anthropic`）。剩余：Vite+TS+Vitest；装齐全部依赖；`types.ts`、`inputs.ts`；各模块 stub（model 返回单调的假数据，sim/worker 返回假点，advisor 返回 `[]`，presets 含 1 个默认）；deploy.yml；开启 Pages（见 T0.2） | `https://limboantique.github.io/Anthropic/` → 打开见占位页；`npm test`、`npm run build` 绿；所有 stub 可被 import | 通知 A/B/C 开工 |
| **A 模型** | 数学核心 | 按 §5 实现 `evaluate`/`curves` | `model.test.ts` → T=∞ 得 `1-e^{-λTc}`、Tc=∞ 得 `λT/(1+λT)`、α=0∧T=∞ 得 hit=C/N（误差<1e-6）；miss 对 mem、TTL 单调；T=∞ 时 hit 与 rps 无关；invalidate 下 stale=0；性能达标 | 合入 main，移交 model.ts 给 B；转做 **A'** |
| **A' 预设+结论** | 自包含 demo（硬性要求） | `presets.ts` 5 个：Redis 很有用 / α≈0 无用 / TTL 太短内存白买 / 写多致脏读或抖动 / P99 纹丝不动；`advisor.ts` 先写 3 条结论规则（helps / useless / hurts） | 每个预设的 `advise()[0]` 与其标题一致（写成测试） | 有余力 → MX1 |
| **B 仿真** | 独立真值 | `simulate`：Map 实现 LRU、FIFO 队列做定长 TTL 即时过期、CDF 二分采样 Zipf、Poisson 读写、两种写策略、前半预热丢弃、可复现 seed；`scaleForSim`；`worker.ts` | `sim.test.ts`（不依赖模型）→ α=0∧T=∞ 得 hit≈C/N；C≥N 得 hit→1；单 key 得 `λT/(1+λT)`；1e6 key×5e6 请求 <3s | 转做 **B'** |
| **B' 交叉验证+修正** | 让模型可信 | `cross.test.ts`：α∈{0,0.8,1.2,2} × C/N∈{1%,10%} × T∈{∞,≈Tc,≪Tc} × 两种写策略；偏差>2pp 时以闭式极限为仲裁判定谁错，**直接修 `model.ts`**（必要时把 `life()` 的指数近似换成对 P(L>t) 的数值积分） | 网格上 miss/stale 偏差 ≤2pp；实测最大误差记入 README | 通知集成 |
| **C UI** | 核心交互 | 按 §6；由 `INPUTS` 生成两组滑块；`render()`：evaluate+curves → 卡片 + 4 图；🎲；预设栏；Validate 接 Worker | 部署页 → 拖动刷新<50ms；两组输入一眼可分；🎲 连点 20 次无 NaN/无非法组合；手机视口正常 | 有余力 → MX1 面板 |
| **M4 集成** | 端到端正确 | 合并三轨；`npm test` 全绿；`npm run preview` 逐预设核对结论句、图标注、parity 点；推送后无痕窗口复测 Pages（相对 base、Worker 路径） | 线上页面 → 5 个预设结论正确，Validate 的点贴对角线 | — |
| **M5 交付物** | 提交材料 | README：主题、非显然之处、取舍、扩展、耗时、模型假设与实测误差；视频提纲；导出 transcripts（骨架可在 M0 后随时开始，判断性内容由你定稿） | 覆盖 PDF 要求的 5 项 | — |

## 8. TODO（所有 agent 共享的状态表）

**进度快照（2026-09-21，由主会话汇总；逐项状态以下方清单为准）**

线上：https://limboantique.github.io/Anthropic/ 与 `/exam.html`；main = `0b81d87` 之后，7 个测试文件 88 个测试全绿，CI 自动部署。

| 阶段 / 轨道 | 状态 | 说明 |
|---|---|---|
| 阶段 0 脚手架与协议 | ✅ 6/6 | 目录拆为 `contract/` `engine/` `ui/` |
| 轨道 A 模型 → 预设与结论 | ✅ 5/5 | `evaluate` 0.9ms / `curves` 44ms |
| 轨道 B 仿真 → 交叉验证 | ✅ 5/5 | 模型无需修改：64 点网格最大偏差 0.35pp，Validate 路径 1.09pp，stale age 相对误差 ≤2.5% |
| 轨道 C UI | ✅ 6/6 | Classroom paper 风格；已合入 main |
| 集成 | ✅ 3/3 | 线上逐预设验收、🎲 压测、Pages 子路径下 Worker 均通过 |
| 交付物 | 🔄 3/4 | D1 README 骨架、D2 README 定稿（含截图）、D3 视频提纲完成；D4 已提交 4 份子会话记录，**主会话记录与视频录制仍需用户完成** |
| 扩展 | ✅ 6/6 | X1a 规则集、X1b 面板、X2 吉祥物、X3 教育内容、X4 逐 rank 图、X5 考试页 |
| 追加（集成后） | ✅ 15/15 | X6–X20：延迟图成为题眼、性价比指标、裁判面板、吉祥物统一风格、帮助按钮等 |

集成后追加的改动逐条列在下方清单的 **追加** 一节（X6–X20），全部已上线。

待用户判断：脏读率对"写与读同分布"假设很敏感（默认配置 60% 脏读）——目前写进 README 假设与页面 Assumptions；是否加"写分布独立"开关未定。

规则：**依赖全部 `[x]` 才能开工**；开工时把 `[ ]` 改成 `[~]` 并写上轨道名；完成且验收通过后改成 `[x]` 并在行尾附 commit hash；**只改自己那一行**。唯一状态源是主目录的 `/Users/blakexu/Documents/PythonProjects/Anthropic/PLAN.md`：所有 agent（包括在 worktree 里的）都按这个绝对路径读写，不要改 worktree 内的副本。

**阶段 0 — 脚手架与协议（串行）**
- [x] **T0.1** GitHub 公开仓库 + remote（`https://github.com/LimboAntique/Anthropic`）— 依赖：无 — 用户已完成
- [x] **T0.2** 开启 GitHub Pages，Source = GitHub Actions（当前 Pages API 返回 404，即尚未开启；属账号设置，需用户操作或明确授权）— 依赖：T0.1
- [x] **T0.3** Vite+TS+Vitest 脚手架、装齐全部依赖、`.gitignore`、`tsconfig`、`vite.config.ts`（`base:'./'`）— 依赖：无
- [x] **T0.4** `src/contract/types.ts` + `src/contract/inputs.ts`（`INPUTS`、`DEFAULTS`）→ **协议冻结** — 依赖：T0.3
- [x] **T0.5** 全部 stub（model/sim/worker/advisor/presets/main）+ 占位 `index.html`，`npm test`/`build` 绿 — 依赖：T0.4
- [x] **T0.6** `deploy.yml` + 首次部署在公网 URL 验证 — 依赖：T0.2, T0.5 — 582b6ff，https://limboantique.github.io/Anthropic/ 返回 200

**轨道 A — 模型 → 预设与结论**
- [x] **A1** `model.ts: evaluate()` — 依赖：T0.4 — 8962b6d
- [x] **A2** `model.ts: curves()` — 依赖：A1 — 8962b6d
- [x] **A3** `model.test.ts` 全绿 + 性能达标 → 合入 main，`model.ts` 移交轨道 B — 依赖：A1, A2 — 8962b6d
- [x] **A4** `presets.ts` 5 个预设 — 依赖：A3 — 72c9d42
- [x] **A5** `advisor.ts` 3 条结论规则 + 预设-结论一致性测试 — 依赖：A3, A4 — 72c9d42

**轨道 B — 仿真 → 交叉验证与修正**
- [x] **B1** (轨道 B) `sim.ts: simulate()` + `scaleForSim()` — 依赖：T0.4 — 330d195 (track/verify)；82e4184（已随 e236d5a 合入 main）：`scaleForSim` 按冷启动记忆时长分配事件预算，下限 100 key / 64 槽位，内存对齐到整数个 key
- [x] **B2** (轨道 B) `sim.test.ts`（不依赖模型的自检）+ 性能 — 依赖：B1 — 330d195 (track/verify)；82e4184：增至 15 项（King 精确 LRU、多 key 闭式、单槽 Σp²、与朴素 Map 参考实现逐位一致、退化输入），8 个注入缺陷检出 7 个、另 1 个为等价变异
- [x] **B3** (轨道 B) `worker.ts` — 依赖：B1 — 924197a (track/verify)
- [x] **B4** (轨道 B) `cross.test.ts` 网格 — 依赖：B2, A3 — 3510bc0 (track/verify)；82e4184：网格加 T=1.5Tc（64 点，最大 0.35pp）；新增 Validate 路径 37 组配置（默认+5 预设+15 慢热配置+16 随机系统），最大 1.09pp
- [x] **B5** (轨道 B) 修正 `model.ts` 直到网格偏差 ≤2pp，记录实测最大误差 — 依赖：B4 — 3510bc0 (track/verify)；model.ts 无需修改：48 点网格最大偏差 0.25pp，网格外探测（C=20、T=1.5Tc）最大 0.51pp

**轨道 C — UI（对着 stub 开发）**
- [x] **C1** (轨道 C) 布局 + 由 `INPUTS` 生成的两张输入卡（system / redis 明确分开）— 依赖：T0.5 — ec37c2c (track/ui)
- [x] **C2** (轨道 C) 🎲 按钮（`randomSystem()` 已在 M0 的 `inputs.ts` 里实现并测试） — 依赖：C1 — ec37c2c；连点 20 次无 NaN (track/ui)
- [x] **C3** (轨道 C) `render()`：结论句 + 数字卡片 — 依赖：C1 — ec37c2c，§6.1 样式 489886c (track/ui)
- [x] **C4** (轨道 C) 图①②③ — 依赖：C3 — 489886c；单次刷新实测 32–67ms，其中 `curves()` 约 44ms（UI 自身约 8ms），拖动经 rAF 合帧仍流畅，但未达 <50ms (track/ui)
- [x] **C5** (轨道 C) Validate → Worker → parity 图④ — 依赖：C3（真实数据联调另需 B3） — 29c4e36；与 track/verify 临时合并实测：默认 + 5 预设最大偏差 0.73pp，每次 3–5s (track/ui)
- [x] **C6** (轨道 C) 预设栏 + Assumptions 面板 + 手机布局 — 依赖：C3 — 489886c；375px 无横向滚动 (track/ui)

**集成与交付**
- [x] **I1** 合并三轨，`npm test` 全绿 — 依赖：A5, B5, C2, C4, C5, C6 — 086cb7a；三轨已合入 main，7 个测试文件 55 个测试全绿，交叉网格最大偏差 0.25pp
- [x] **I2** `preview` 下浏览器逐预设验收 + 🎲 压测 — 依赖：I1 — 线上验收：5 个预设结论句全部与标题一致；🎲 连点 30 次无 NaN/undefined，出现 5 种不同结论；无 console 报错
- [x] **I3** 部署并在无痕窗口复测 Pages URL — 依赖：I2, T0.6 — 2671e92 已部署；`/` 与 `/exam.html` 均 200；Pages 子路径下 Worker 正常（Validate 2.8s，最大偏差 0.02pp，点落在对角线）；375px 无横向滚动。首次 push 因性能断言在 CI 上超时而失败，已放宽为本机 10 倍
- [x] **D1** README 骨架（模型、假设、参考）— 依赖：T0.4 — 247164a；5 处 `TODO(author)` 留给用户定稿
- [x] **D2** README 定稿（理由、取舍、实测误差、耗时；判断性内容由用户定稿）— 依赖：B5, I3 — 用户已定稿（设计取舍、扩展方向、耗时 2.5 小时）；截图 a1125d4（`docs/explorer.webp`、`docs/exam.png`）
- [x] **D3** 视频提纲 — 依赖：I3 — 39344bc，`VIDEO.md`；末尾 1 处 `TODO(author)`
- [~] **D4** 导出 transcripts — 依赖：全部 — 已提交 `claude_code_conversation/` 下 4 份会话记录（吉祥物、页面风格调研、轨道 B 仿真验证、轨道 C UI）；提交前已扫描，无密钥/令牌，仅含本机路径。**主会话（规划、模型、集成、考试页等）的记录尚未导出**，需用户导出后补入

**扩展（原计划内，6/6 完成）**
- [x] **X1a** `advisor.ts` 完整规则集 — 依赖：A5 — e4659e9；共 12 条规则（3 bad / 8 warn / 1 good）
- [x] **X1b** 右侧 Advisor 面板（渲染全部 `advise()` 条目）— 依赖：C3 — (轨道 C) 489886c (track/ui)
- [x] **X2** (轨道 C) 吉祥物 Professor Amber 入驻 Advisor 面板，表情绑定 `level` — 依赖：X1b — 素材已精简（e4659e9）：`cat_teacher/face_{happy,thinking,stern,surprised}.svg`（同一 viewBox，可直接互换）+ `face_full_marks.svg`（同为大头风格，旁标 A+）；映射 good→happy、warn→thinking、bad→stern、DB 过载/承重墙→surprised、全部 good→face_full_marks — 19eb2cc (track/ui)
- [x] **X3** 教育内容 — 依赖：I3 — e41a9fa；主页 `#lessons`：6 课（miss 比无缓存慢 / 容量是隐形 TTL / 中位动而尾部不动 / 脏读跟着热 key / 承重缓存与双稳态 / Redis 默认配置陷阱），其中 4 课带 Try it 按钮加载同名预设，附延伸阅读
- [x] **X5** 考试页 `exam.html`：50 题题库（`src/engine/quiz.ts`，数字类题目由测试用 `evaluate()` 复核）→ 随机抽 5 道选择题 → 打分 + 逐题解释；专属监考吉祥物猫头鹰（`cat_teacher/proctor_*.svg`）— 依赖：A3；新增文件 `exam.html` `src/ui/exam.ts` `src/ui/exam.css` `test/quiz.test.ts`，并改 `vite.config.ts` 为多页 — f4fe2bd；浏览器验收通过（答题→交卷→打分/解释/猫头鹰表情，无 console 报错）
- [x] **X4** 逐 rank 命中概率图 / LFU 对比 — 依赖：A3, C4 — 51eac81；图 “Which keys are cached”：逐 rank 命中概率（LRU 渐降）+ 累计流量 + 理想缓存（= 完美 LFU，钉住最热 key）的截止线；`engine/model.ts` 新增 `byRank()`，测试验证逐 rank 加权和等于总命中率。LFU 对比即此截止线与图①的 ideal 线，未另建 LFU 模型

**追加（集成后用户提出，15/15 完成；均已上线）**
- [x] **X6** 延迟图成为题眼：**database only vs Redis + database**；列出 hit / miss / Redis down 三条路径、平均延迟盈亏平衡点（命中率 > Redis 延迟 ÷ DB 延迟）、各分位 Change 行（变慢标红）、命中率虚线；`engine/model.ts` 新增 `meanLatency()` 并有测试 — bca8917
- [x] **X7** 延迟图移到第一张；横轴按数据自适应，并在两条曲线都到 100% 处收尾 — 330a09d、f060ca8
- [x] **X8** 性价比指标卡片 **Cost per ms saved**（月费 ÷ 平均读延迟降低的毫秒数，附"内存翻倍"的边际值；变慢时显示"⚠ slower"）。已知局限：不计 DB 卸载的价值，也不乘流量 — 330a09d
- [x] **X9** "Uniform access" 预设内存改为 250 MB，成为真正的负提升示例（各分位 +2%～+7%）— bca8917
- [x] **X10** 验证图独立为"裁判"面板 **Can you trust these numbers?**：反色标题栏 + 双线边框，去掉 tooltip，说明文字与按钮放在图下方 — 44ac480
- [x] **X11** 任何设置变化即清空仿真点、终止进行中的仿真，并提示重新运行 — c7bce70
- [x] **X12** 吉祥物素材筛选：9 张原图 → 4 张可互换的大头表情；满分图重画为同一大头风格（`face_full_marks.svg`，旁标 A+）；`generate.py` 222 → 118 行 — e4659e9、b6d2985
- [x] **X13** 监考吉祥物猫头鹰 Proctor Hoot（监考 / 偷瞄 / 及格 / 不及格四个表情）— 499302e（随 X5）
- [x] **X14** 每个标题旁的 "!" 帮助按钮（白话解释），仅悬停时显示气泡，标记为正圆；图例右对齐 —（UI agent）64dabd9、8f0a5db、7bccfbd、fc12777
- [x] **X15** 主页与考试页互相跳转的按钮放在各自吉祥物下方；页面标题放大，Advisor 面板滚动时保持可见 —（UI agent）ff11020、7980a0b、14865b1
- [x] **X16** CI 性能断言放宽为本机实测的 10 倍（共享 runner 慢，首次部署因此失败过一次）— 2671e92
- [x] **X17** 脏读的时间维度 **Stale age**：发生脏读时读到的值平均已过期多久（最坏情况 = TTL；不设 TTL 时为 ∞）。**协议新增字段** `Outputs.staleAgeSec`、`SimResult.staleAgeSec`（只增不改）；模型闭式解 `lifeMoment()`；仿真独立计量；交叉验证在可测的网格点上相对误差 ≤2.5%；数字卡片、Advisor 文案、第 4 课、README 同步 — da0a0cb
- [x] **X18** 延迟图改为"百分位 × 延迟"：横轴百分位（刻度 0/25/50/75/90/99，与表格列对应），纵轴线性 ms、上限取较慢的 P99 × 1.15（不超过 150 ms）；命中率由横线改为竖线。此前两轮：CDF 采样到 200 ms、横轴定 150 ms（后被本项取代）— 316a4cf、e4c7ada、48f4ab2
- [x] **X19** **Latency saved by Redis** 差值图：每个百分位上 DB only − (Redis + DB)，零线以上绿色 = 变快，以下红色 = 变慢（miss 多付一次 Redis 往返），带命中率虚线；`engine/model.ts` 新增 `latencyGap()`，测试验证命中率为 0 时每个百分位恰好慢一次 Redis 往返 — 648fa51、079dd56
- [x] **X20** 仿真加固（验证 agent）：`scaleForSim` 按冷启动时长分配事件预算、缓存槽位下限 64；新增"Validate 按钮路径"测试（默认、全部预设、慢热边界、16 个随机系统）— 82e4184、e236d5a

## 9. 扩展（全部完成，逐项状态见 §8 清单）

- [x] MX1 Advisor：页面右侧根据用户的 Redis 选择逐条点评。协议已在 M0 预留（`Advice`、`advise()`、右栏占位），核心只显示 `advise()[0]`；扩展 = 在 `advisor.ts` 补全规则 + 右栏渲染全部条目。规则示例：内存买多了（TTL 只留住 X GB，你付了 Y GB）；TTL 形同虚设（淘汰年龄 Tc < TTL）；P99 比不加缓存更差（miss>1%）；缓存已成承重墙（redisDown 负载≥1）；脏读率过高 → 建议缩短 TTL 或改 invalidate；α 太低命中率≈C/N；已过拐点（再加 1GB 命中率提升<0.1%）。规则与面板分属 `advisor.ts` / UI 文件，可两个 agent 并行。
- [x] MX2 吉祥物：`cat_teacher/generate.py` 现只生成 4 张头像（happy / thinking / stern / surprised，共用一个 viewBox，每张约 2 KB）和 `face_full_marks.svg`（同一大头风格，旁标 A+）。住在 Advisor 侧栏，头像随 `advise()[0].level` 切换；具体映射见 TODO 的 X2 行。
- [x] MX3 教育内容："为什么容量就是一个隐形 TTL"、noeviction 陷阱、Brooker 双稳态。
- [x] MX4 按 rank 的逐 key 命中概率图；LFU 对比。
- [x] MX5 考试页：50 题题库随机抽 5 题、打分与逐题解释，监考猫头鹰 Proctor Hoot；题库里的数值结论由测试用 `evaluate()` 复核。
- [x] 集成后的追加见 §8 的 X6–X20。

**保持不做**：key 设计、穿透/雪崩/多级缓存、对象大小差异、副本滞后；另加非平稳流量（IRM 假设）。

## 10. 验证

1. `npm test`：A 的极限恒等式与单调性；B 的仿真自检；B' 的交叉网格（正确性的核心证据）；A' 的预设-结论一致性。
2. `npm run build && npm run preview`：浏览器逐预设核对；🎲 压测；手机视口。
3. 推送后在无痕窗口打开 Pages URL 复测。

## 11. 需要你拍板的点（已给默认值）

1. 写策略开关，默认 `ttl-only`。 2. α 0–2.5 及 §4 的输入/随机范围。 3. 仿真验证列为核心（图④）。 4. 界面/README 英文，申报 Theme 1。 5. **T0.2**：仓库已就绪，但 Pages 尚未开启（API 404）。请在 Settings → Pages 把 Source 设为 GitHub Actions，或明确授权 agent 执行 `gh api -X POST repos/LimboAntique/Anthropic/pages -f build_type=workflow`。

## 参考

Che 近似 https://arxiv.org/abs/1202.3974 · d-TTL/f-TTL https://arxiv.org/abs/1704.04448 · 新鲜度成本 https://arxiv.org/abs/2412.20221 · Twitter 缓存分析 https://www.usenix.org/conference/osdi20/presentation/yang · Redis 淘汰 https://redis.io/docs/latest/develop/reference/eviction/ · Brooker https://brooker.co.za/blog/2021/08/27/caches.html · ElastiCache 价格 https://instances.vantage.sh/aws/elasticache/cache.r7g.large · Vite→Pages https://vite.dev/guide/static-deploy
