# 编码与换行规范

这个仓库默认把“中文可读、跨平台不乱、Windows 下可安全编辑”当成工程正确性的一部分。

## 仓库默认规则

- 所有源码和文档文本文件统一使用 `UTF-8`（无 BOM）
- 大多数文本文件统一使用 `LF`
- `cmd`、`bat`、`ps1` 这类 Windows 原生脚本保留 `CRLF`
- Git 以仓库内的 `.gitattributes` 为准统一换行，不依赖本机默认行为
- 编辑器以 `.editorconfig` 为准统一编码、缩进和换行

## 已落地的防线

- `.editorconfig`
  约束编辑器默认使用 `utf-8`、统一换行和缩进
- `.gitattributes`
  约束 Git 对文本文件做一致的换行归一化，并把二进制资源排除在外
- `npm run check:encoding`
  检查仓库源码/文档文件是否为有效 UTF-8，并拦截 UTF-8 BOM
- `npm run fix:encoding`
  清理源码/文档文件中的 UTF-8 BOM

说明：编码检查脚本会忽略运行时目录，例如 `data/`、`output/`、`.local/`，避免把项目数据或导出结果误当成源码规范问题。

## Windows 下编辑中文文件的约束

1. 优先做小范围修改，不要为了改几行中文整文件重写。
2. 优先使用补丁式编辑；如果必须脚本写回，必须显式指定 UTF-8。
3. 终端里出现乱码，不代表文件字节一定已经损坏，要区分“控制台显示问题”和“文件编码损坏”。
4. 改完含中文的 `html/js/css/md/json` 文件后，至少做一次语法检查或页面确认。

## 推荐本地 Git 配置

Windows 和 macOS 都建议执行：

```bash
git config --global core.autocrlf false
git config --global core.safecrlf true
```

这样可以把“换行怎么处理”的规则交给仓库里的 `.gitattributes`，而不是交给每台机器自己的默认设置。

## Node / PowerShell 写文件要求

Node.js 写文本文件时，显式指定 UTF-8：

```js
await fs.writeFile(filePath, content, "utf8");
```

PowerShell 写文本文件时，不要依赖默认编码；需要显式写成 UTF-8，且尽量避免整文件覆盖。

## 建议的日常检查方式

提交前可以执行：

```bash
npm run check:encoding
```

如果检查提示存在 UTF-8 BOM，可执行：

```bash
npm run fix:encoding
```

如果仓库刚新增或调整了 `.gitattributes`，建议执行一次：

```bash
git add --renormalize .
```

这会让 Git 按当前仓库规则重新识别文本文件换行，但不会改变文件语义。

## Mandatory UTF-8 Guard

- For Chinese or any non-ASCII text, default to the `windows-utf8-guard` workflow.
- Avoid full-file rewrites when only a few lines need to change.
- Any scripted write must use explicit UTF-8.
- If encoding is uncertain, stop large rewrites and verify bytes first.
- See `docs/encoding-workflow.md` for the required workflow.
