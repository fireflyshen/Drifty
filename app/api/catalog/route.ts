/**
 * Next/Vinext 的目录 API 适配层。
 *
 * 本文件只暴露稳定的 HTTP 入口；读取与写入职责分别位于 server/catalog 下。
 */
export { GET } from "@/server/catalog/read-route";
export { POST } from "@/server/catalog/write-route";
