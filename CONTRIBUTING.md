## 环境初始化

这是一个基于 [JavaScript](https://help.github.com/en/articles/about-actions#types-of-actions) 的 Action，但使用 [TypeScript](https://www.typescriptlang.org/docs/home.html) 来生成 JavaScript 代码。

您可以通过安装现代版本的 npm 并在仓库根目录运行 `npm i` 来初始化开发环境。

## 测试

测试文件位于 `__tests__` 目录下，可以通过 `npm t` 命令运行。

## 源代码

源代码位于 `src` 目录下。运行 `npm run build` 将生成在 GitHub 工作流中运行的 JavaScript 文件。

## 代码格式化

运行 `npm run fmt` 可以保持代码风格的一致性。
