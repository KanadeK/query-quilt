# Query Quilt

Query Quilt 把本地 CSV 和 Parquet 文件编排成可检查的数据步骤链。每一步都会编译为
DuckDB SQL，并且可以撤销或重做。

v0.1.0 将包含本地文件导入、筛选/选择/派生列/分组/连接/排序、逐步行数、撤销重做、
图表以及 SQL/workflow/CSV/图表导出。

## 开发

```bash
npm ci
npm run verify
```

数据只留在浏览器内。应用没有上传服务，也没有分析统计端点。

## 项目状态

正在开发 v0.1.0。进度见 [CHANGELOG.md](CHANGELOG.md) 和
[docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md)。

## 许可证

[MIT](LICENSE)
