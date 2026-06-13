<div align="center">
  📦 :octocat:
</div>
<h1 align="center">
  action gh-release
</h1>

<p align="center">
   在 Linux、Windows 和 macOS 虚拟环境中创建 GitHub Release 的 GitHub Action
</p>

<div align="center">
  <img src="demo.png"/>
</div>

<div align="center">
  <a href="https://github.com/softprops/action-gh-release/actions">
		<img src="https://github.com/softprops/action-gh-release/workflows/Main/badge.svg"/>
	</a>
</div>

<br />

- [🤸 使用方法](#-使用方法)
  - [🚥 将 Release 限制为标签推送](#-将-release-限制为标签推送)
  - [⬆️ 上传 Release 资产](#️-上传-release-资产)
  - [📝 外部 Release 说明](#-外部-release-说明)
  - [💅 自定义配置](#-自定义配置)
    - [输入参数](#输入参数)
    - [输出参数](#输出参数)
    - [环境变量](#环境变量)
  - [权限设置](#权限设置)

## 🤸 使用方法

### 🚥 将 Release 限制为标签推送

通常，此 Action 的用法是在构建流程中添加一个步骤，该步骤受 Git 标签推送的约束。
您可能会发现 `step.if` 字段有助于实现这一点，因为它可以最大化工作流在非标签推送场景下的复用价值。

`v3` 需要支持 Node 24 的 GitHub Actions 运行时。如果您仍然需要最后一个兼容 Node 20 的版本，请继续使用 `v2.6.2`。

以下是一个简单的 `step.if` 标签限制示例：

```yaml
name: Main

on: push

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6
      - name: Release
        uses: softprops/action-gh-release@v3
        if: github.ref_type == 'tag'
```

您也可以使用推送配置标签过滤器：

```yaml
name: Main

on:
  push:
    tags:
      - "v*.*.*"

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6
      - name: Release
        uses: softprops/action-gh-release@v3
```

### ⬆️ 上传 Release 资产

您可以为 GitHub Release 配置多个选项，所有选项都是可选的。

GitHub Release 的一个常见用途是在验证和打包完成后上传二进制文件。
使用 `with.files` 输入来声明一个以换行符分隔的 glob 表达式列表，用于匹配您希望上传到 GitHub Release 的文件。如果您愿意，也可以直接按文件名列出文件。
如果某个标签已经有一个 GitHub Release，则会更新现有 Release 并添加资产。

以下是一个上传单个文件 `Release.txt` 的示例：

```yaml
name: Main

on: push

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6
      - name: Build
        run: echo ${{ github.sha }} > Release.txt
      - name: Test
        run: cat Release.txt
      - name: Release
        uses: softprops/action-gh-release@v3
        if: github.ref_type == 'tag'
        with:
          files: Release.txt
```

以下是一个上传多个资产到 GitHub Release 的示例：

```yaml
name: Main

on: push

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6
      - name: Build
        run: echo ${{ github.sha }} > Release.txt
      - name: Test
        run: cat Release.txt
      - name: Release
        uses: softprops/action-gh-release@v3
        if: github.ref_type == 'tag'
        with:
          files: |
            Release.txt
            LICENSE
```

> **⚠️ 注意：** 请注意上面 YAML 语法中的 `|` ☝️。它允许您有效地声明一个多行 YAML 字符串。您可以点击[此处](https://yaml-multiline.info)了解更多关于多行 YAML 语法的信息。

> **⚠️ Windows 用户注意：** `files` glob 中同时支持 `\` 和 `/` 路径分隔符。如果您需要匹配包含 glob 元字符（如 `[` 或 `]`）的文字文件名，请在模式中正确转义这些元字符。

如果您的 Release 资产生成在子目录下，请设置 `working_directory` 并将 `files` 模式保持为相对于该目录的路径。

```yaml
- name: Release
  uses: softprops/action-gh-release@v3
  if: github.ref_type == 'tag'
  with:
    working_directory: dist
    files: |
      Release.txt
      checksums/*.txt
```

### 📝 外部 Release 说明

存在许多系统可以帮助您生成 Release 说明。此 Action 支持从仓库构建路径中的文件加载 Release 说明，以便灵活地为您的 Release 使用任何 changelog 生成器，包括人工编写 👩‍💻。

```yaml
name: Main

on: push

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6
      - name: Generate Changelog
        run: echo "# Good things have arrived" > ${{ github.workspace }}-CHANGELOG.txt
      - name: Release
        uses: softprops/action-gh-release@v3
        if: github.ref_type == 'tag'
        with:
          body_path: ${{ github.workspace }}-CHANGELOG.txt
          repository: my_gh_org/my_gh_repo
          # 注意：通常您需要创建一个个人访问令牌（PAT）
          # 并具有在另一个仓库中创建 Release 的权限。
          # 非空的显式令牌会覆盖 GITHUB_TOKEN。
          # 省略此输入将使用 github.token；传入 "" 视作未设置令牌。
          token: ${{ secrets.CUSTOM_GITHUB_TOKEN }}
```

当您使用 GitHub 内置的 `generate_release_notes` 功能时，可以选择使用 `previous_tag` 明确指定比较基准。当默认比较范围与您要发布的版本系列不匹配时，这非常有用。

```yaml
- name: Release
  uses: softprops/action-gh-release@v3
  with:
    tag_name: stage-2026-03-15
    target_commitish: ${{ github.sha }}
    previous_tag: prod-2026-03-01
    generate_release_notes: true
```

### 💅 自定义配置

#### 输入参数

以下是 `step.with` 键中可选的输入参数：

| 名称 | 类型 | 描述 |
| -------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `body` | String | 描述此次 Release 的变更内容 |
| `body_path` | String | 加载 Release 变更说明的文件路径 |
| `draft` | Boolean | 将 Release 保持为草稿。默认为 false。复用已有草稿 Release 时，设置为 true 保持草稿；省略则在上传后发布 |
| `prerelease` | Boolean | 标记是否为预发布 |
| `preserve_order` | Boolean | 按提供的顺序依次上传资产。这控制 Action 的上传行为，但不控制 GitHub 在 Release 页面或 Releases API 中返回的最终资产排序 |
| `files` | String | 以换行符分隔的资产文件路径 glob。匹配包含 glob 元字符（如 `[` 或 `]`）的文字文件名时需要转义。`~/...` 会展开为运行者家目录。Windows 上同时支持 `\` 和 `/` 分隔符。GitHub 可能会规范化包含特殊字符的原始资产文件名；操作会尽可能恢复资产标签，但最终下载名称仍由 GitHub 控制 |
| `working_directory` | String | 解析 `files` glob 的基准目录。当 Release 资产位于子目录下时使用。如果省略，Action 从 `${{ github.workspace }}` 解析 `files` |
| `overwrite_files` | Boolean | 是否覆盖已存在的同名文件。默认为 true |
| `name` | String | Release 的名称，默认为标签名 |
| `tag_name` | String | 标签名称，默认为 `github.ref_name`。`refs/tags/<name>` 值会被规范化为 `<name>` |
| `fail_on_unmatched_files` | Boolean | 如果任何 `files` glob 没有匹配到文件，是否标记为失败 |
| `repository` | String | 目标仓库名称，格式为 `<owner>/<repo>`。默认为 GITHUB_REPOSITORY 环境变量 |
| `target_commitish` | String | 决定 Git 标签创建来源的 Commitish 值，可以是任何分支或提交 SHA。默认为仓库默认分支。为旧提交创建新标签时，`github.token` 可能没有创建引用的权限；如果遇到 `403 Resource not accessible by integration`，请使用 PAT 或具有足够内容权限的其他令牌 |
| `token` | String | 授权的 GitHub Token 或 PAT。省略时默认为 `${{ github.token }}`。非空显式令牌会覆盖 `GITHUB_TOKEN`。传入 `""` 视作明确未设置令牌，因此在将本 Action 包装在复合 Action 中时，请完全省略此输入或使用 `${{ inputs.token || github.token }}` 这样的表达式 |
| `discussion_category_name` | String | 如果指定，则会创建指定分类的讨论并链接到该 Release。该值必须是仓库中已存在的分类。更多信息请参见[管理仓库讨论分类](https://docs.github.com/en/discussions/managing-discussions-for-your-community/managing-categories-for-discussions-in-your-repository) |
| `generate_release_notes` | Boolean | 是否自动生成 Release 的名称和正文。如果指定了 name，则使用指定的名称；否则自动生成。如果指定了 body，则正文将追加到自动生成的说明之前。更多信息请参见[GitHub 自动生成 Release 说明文档](https://docs.github.com/en/repositories/releasing-projects-on-github/automatically-generated-release-notes) |
| `previous_tag` | String | 可选。当启用 `generate_release_notes` 时，使用此标签作为 GitHub 的 `previous_tag_name` 比较基准。如果省略，GitHub 会自动选择比较基准 |
| `append_body` | Boolean | 追加到现有正文而非覆盖 |
| `make_latest` | String | 指定此 Release 是否应设置为仓库的最新 Release。草稿和预发布不能设置为最新。可选值为 `true`、`false` 或 `legacy`。未提供时使用 GitHub API 默认值 |

💡 当同时提供 `body` 和 `body_path` 时，会优先尝试 `body_path`，如果无法读取文件路径，则回退到 `body` 输入。

💡 当 Release 信息键（如 `name`、`body`、`prerelease` 等）未明确设置且该标签已存在 Release 时，Release 将保留其原始信息。

💡 草稿状态在完成阶段单独处理。如果 Action 复用了已有的草稿 Release，请设置 `draft: true` 保持草稿；如果省略了 `draft`，Action 将在上传资产后发布该草稿。

💡 GitHub 不可变 Release 在发布后会锁定资产。此 Action 中的标准 Release 在发布前就已经上传资产，但预发布默认保持发布状态，以便 `release.prereleased` 工作流持续触发。在不可变 Release 仓库中，对于需要上传资产的预发布，请使用 `draft: true`，然后稍后从该草稿发布，并让下游工作流订阅 `release.published`。

💡 `files` 基于 glob 匹配，因此包含 glob 元字符（如 `[` 或 `]`）的文字文件名必须在模式中转义。

💡 GitHub 可能会规范化或重写包含特殊字符或非 ASCII 字符的上传资产文件名。此 Action 会上传请求的文件，但无法强制 GitHub 存储或从 Releases API 返回的最终资产名称。特别是，包含 emoji 在内的 4 字节 Unicode 字符当前无法通过资产标签恢复。

#### 输出参数

以下输出可以通过 `${{ steps.<step-id>.outputs }}` 从此 Action 中访问：

| 名称 | 类型 | 描述 |
| ------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `url` | String | Release 的 GitHub.com URL |
| `id` | String | Release ID |
| `upload_url` | String | 用于上传资产到 Release 的 URL |
| `assets` | String | JSON 数组，包含每个已更新（新上传或覆盖）资产的信息，格式参见[此处](https://docs.github.com/en/rest/releases/assets#get-a-release-asset)（不含 `uploader` 字段） |

例如，您可以使用 `${{ fromJSON(steps.<step-id>.outputs.assets)[0].browser_download_url }}` 获取第一个资产的下载 URL。

#### 环境变量

以下 `step.env` 键作为后备方案允许使用，但已弃用，建议使用输入参数。

| 名称 | 描述 |
| ------------------- | ------------------------------------------------------------------------------------------ |
| `GITHUB_TOKEN` | 由 `secrets` 提供的 GITHUB_TOKEN |
| `GITHUB_REPOSITORY` | 目标仓库名称，格式为 `<owner>/<repo>`，默认为当前仓库 |

> **⚠️ 注意：** 此 Action 之前是作为 Docker 容器实现的，这限制了它只能在 GitHub Actions Linux 虚拟环境中使用。在最近的版本中，我们现在支持跨平台使用。请在这些版本中移除 `docker://` 前缀。

### 权限设置

此 Action 需要以下 GitHub 集成令牌权限：

```yaml
permissions:
  contents: write
```

当使用 `discussion_category_name` 时，还需要额外的权限：

```yaml
permissions:
  contents: write
  discussions: write
```

[GitHub 令牌权限](https://docs.github.com/en/actions/security-guides/automatic-token-authentication#permissions-for-the-github_token)可以为单个作业、工作流或整个 Actions 进行设置。

请注意，如果您打算在 release 事件（`on: { release: { types: [published] } }`）上运行工作流，则需要为此 Action 使用个人访问令牌，因为默认的 `secrets.GITHUB_TOKEN` 不会触发另一个工作流。详情请参见[相关 issue](https://github.com/actions/create-release/issues/71)。

Doug Tangren (softprops) 2019
