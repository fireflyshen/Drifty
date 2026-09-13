/** 目录命令处理器共享的最小上下文。 */
export type CatalogActionContext = {
  /** 客户端提交的稳定命令名。 */
  action: string;
  /** 命令参数；各处理器只读取自己负责的字段。 */
  payload: Record<string, unknown>;
  /** 当前请求使用的 Cloudflare D1 连接。 */
  db: D1Database;
};

