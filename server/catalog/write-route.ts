import { ensureDatabase } from "@/db/runtime";
import { clean } from "@/server/catalog/shared";
import { handleHistoryAction } from "@/server/catalog/actions/history";
import { handleImportAction } from "@/server/catalog/actions/imports";
import { handleManagementAction } from "@/server/catalog/actions/management";
import type { CatalogActionContext } from "@/server/catalog/actions/context";

/**
 * 目录写入 HTTP 入口。
 *
 * 只负责解析请求、创建 D1 上下文并按职责依次分派命令；具体业务由 actions 目录负责。
 */
export async function POST(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;
  const action = clean(body.action);
  const payload = (
    body.payload && typeof body.payload === "object" ? body.payload : {}
  ) as Record<string, unknown>;
  const db = await ensureDatabase();
  const context: CatalogActionContext = { action, payload, db };

  const managementResponse = await handleManagementAction(context);
  if (managementResponse) return managementResponse;

  const historyResponse = await handleHistoryAction(context);
  if (historyResponse) return historyResponse;

  const importResponse = await handleImportAction(context);
  if (importResponse) return importResponse;

  return Response.json({ error: "未知操作。" }, { status: 400 });
}

