# 💗 心愿之间 · Between Wishes

一个面向两个人的心愿清单与保密送礼网站。

**这是独立、完整的前端工程源码，不需要旧 GitHub 账号或旧仓库。** 技术栈：
React + TypeScript + Vite + Supabase（Auth、PostgreSQL、Private Storage、Edge Functions）。

> **重要**：这是准备部署与测试的 MVP，不是配置好数据库的成品在线服务。
> 即使已经上传到 GitHub，仍须创建 Supabase 项目、执行 SQL、配置 Vercel 环境变量、
> 发布账号删除函数并完成真实双账号安全测试后，才能开放真实客户使用。

## 如果你是第一次做网站
先看根目录的 **`新手部署_请先读.md`**，里面按顺序写了：
1. 新 GitHub 账号如何建立仓库
2. Supabase 数据库如何创建
3. Vercel 如何部署
4. 注册邮件如何设置
5. 必须测试哪些操作

## 主要功能
- 邮箱注册、登录、找回密码（Supabase Auth）
- 用户资料及用户名
- 个人心愿添加、编辑、归档和私有图片上传
- 发送 / 接受 / 拒绝情侣绑定邀请以及解绑
- 云端保密抽选（不会把对方完整心愿清单下载给浏览器）
- 标记礼物已购买 / 已送出 / 取消
- 送出后才向收礼人公开送礼状态；站内通知
- 导出当前账号可读取的数据库记录（图片本体需另行保存）
- 账号删除 Edge Function（需单独部署）

## 本地运行

**Node.js 22 或更新的兼容版本**（项目设定 Node >=22.12）：

```bash
npm install
cp .env.example .env.local
# 在 .env.local 填入你自己的 Supabase URL 和 publishable key
npm run dev
```

浏览器打开 `http://localhost:3000`。

构建检查：

```bash
npm run typecheck
npm run build
npm run preview
```

在 `.env.local` 未配置时，网站会显示数据库配置提示，而不会开启虚假的模拟账号。

## 文件结构

```text
between-wishes/
├─ index.html                       # 网页入口
├─ package.json                     # Node 依赖和命令
├─ src/
│  ├─ main.tsx                      # React 挂载入口
│  ├─ ProductionApp.tsx             # 用户页面及核心交互
│  ├─ production.css                # 响应式界面样式
│  ├─ supabase.ts                   # 安全的浏览器 Supabase 客户端
│  └─ types.ts                      # 业务数据类型
├─ public/
│  ├─ favicon.svg                   # 网站图标
│  ├─ privacy.html                  # 隐私说明草稿（上线前必须补齐）
│  └─ terms.html                    # 使用条款草稿（上线前必须补齐）
├─ supabase/
│  ├─ migrations/20261025_001_initial.sql   # 全新数据库：只执行一次
│  ├─ verify_schema.sql             # 建表后的只读校验
│  ├─ functions/delete-account/index.ts      # 账号删除 Edge Function
│  └─ config.toml
├─ .github/workflows/check.yml      # 提交代码后的基本构建检查
├─ .env.example                     # 环境变量示例：不包含真实密钥
└─ 新手部署_请先读.md
```

## 权限设计概要
- 不公开完整用户资料：只有本人可直接读取 `profiles` 行；
  伴侣资料通过受限 RPC 只返回昵称、用户名和是否暂停抽选。
- 只有用户自己可直接读取或编辑自己的心愿。
- 情侣不能读取对方的整个心愿表，只能调用受保护的抽选 RPC。
- 收礼人在礼物真正送出之前不能读到抽选与购买状态。
- 图片放在**私有 Storage Bucket**，并检查所有者或真实抽中礼物的赠送者权限。
- 拒绝大量连续抽选：同一对送礼关系每 24 小时最多一次抽取。

**不要把** `service_role` / `sb_secret_*` / 数据库密码写入 `VITE_*`、前端源码或 GitHub。

## 当前交付验证
- 已做：前端独立工程的静态结构检查；TypeScript 语法检查；数据库设计和访问权限审查。
- 需要你的 Supabase 环境：真实 SQL 执行、RLS 越权测试、邮箱发信测试。
- 需要安装依赖后执行：npm typecheck/build、Vercel Preview 构建。
- 需进一步完成：法律条款真实信息、稳定邮件服务、数据备份及恢复演练。

## 版本说明
这是**重建的独立正式版 MVP**，不是旧仓库所有交互的逐项复制。
旧版避雷清单、电商自动抓取、纪念日提醒等高级功能不包含在本 MVP 中。
