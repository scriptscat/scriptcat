# 文件系统

可插拔的 `FileSystem` 抽象（[`filesystem.ts`](./filesystem.ts) / [`factory.ts`](./factory.ts)），用于脚本同步与备份。
当前 provider（见对应目录）：

- WebDAV（`webdav/`）
- OneDrive（`onedrive/`）
- Google Drive（`googledrive/`）
- Dropbox（`dropbox/`）
- 百度网盘（`baidu/`）
- S3（`s3/`）
- Zip（`zip/`）—— 同一个 `FileSystem` 抽象的归档/本地备份实现，不是远端 provider，导出为本地 zip 文件而非同步到云端。

云同步的详细语义（同步文件、状态合并、错误分类、重试策略）见 [`docs/cloud-sync.md`](../../docs/cloud-sync.md)，
不在本 README 重复。
