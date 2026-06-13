# Release 工作流程

在发布新版本的 `action-gh-release` 时，请使用此清单。

## 前置准备

- 首先确定语义化版本号：`major`（主版本）、`minor`（次版本）或 `patch`（补丁）。
- 在编写变更日志条目之前，审查最近合并的 PR 及其标签。
- 确保 `master` 分支是最新的，工作区是干净的。

## 清单

1. 将 [package.json](package.json) 更新为新版本号。
2. 在 [CHANGELOG.md](CHANGELOG.md) 顶部添加新条目。
   - 用 1 个简短的段落总结本次发布。
   - 如果摘要中提到 issue，请使用 `#123` 引用或完整的 issue 链接；不要将 `#123` 这样的编号包含在反引号中。
   - 优先编写用户可见的修复和功能，而非内部维护变更。
   - 确保合并的 PR 列表与 `.github/release.yml` 中的分类保持一致。
3. 运行 `npm i` 以刷新 [package-lock.json](package-lock.json)。
4. 运行完整的本地验证集：
   - `npm run fmtcheck`
   - `npm run typecheck`
   - `npm run build`
   - `npm test`
5. 提交发布准备。
   - 使用简洁的发布提交信息，例如 `release 3.0.0`。
6. 为发布提交创建附注标签。
   - 示例：`git tag -a v3.0.0 -m "v3.0.0"`
7. 推送提交和标签。
   - 示例：`git push origin master && git push origin v3.0.0`
8. 将浮动主版本标签移动到新的发布标签。
   - 对于当前主版本线，运行 `npm run updatetag` 来移动 `v3`。
   - 将 `v2` 固定在最新的 `2.x` 版本，供仍需要 Node 20 运行时的使用者使用。
   - 验证浮动标签指向与新的完整标签相同的提交。
9. 从新标签创建 GitHub Release。
   - 优先使用 [CHANGELOG.md](CHANGELOG.md) 中的发布正文，然后仅在自动生成的说明有价值时才让 GitHub 附加它们。
   - 验证 Release 显示了正确的标签、标题、说明和附件。

## 注意事项

- 行为变更应在发布准备开始之前，已在 [README.md](README.md)、[action.yml](action.yml)、测试和 `dist/index.js` 中包含相应的更新。
- 仅文档变更也需要有明确的变更日志条目和版本号更新决定。
- 如果发布内容主要是错误修复，请保持标题和摘要面向补丁版本；不要将实际的修复内容埋没在依赖更新的噪声中。
