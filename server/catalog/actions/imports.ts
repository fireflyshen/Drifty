import type { CatalogActionContext } from "@/server/catalog/actions/context";
import { handleImportConflictAction } from "@/server/catalog/actions/imports/conflict";
import { handleImportExecutionAction } from "@/server/catalog/actions/imports/execute";
import { handleImportMaintenanceAction } from "@/server/catalog/actions/imports/maintenance";
import { handleImportPreviewAction } from "@/server/catalog/actions/imports/preview";

/**
 * SQL 导入命令分派器。
 *
 * 依次交给冲突、预览、执行和维护处理器；没有命中时返回 null。
 */
export async function handleImportAction(
  context: CatalogActionContext,
): Promise<Response | null> {
  const conflictResponse = await handleImportConflictAction(context);
  if (conflictResponse) return conflictResponse;

  const previewResponse = await handleImportPreviewAction(context);
  if (previewResponse) return previewResponse;

  const executionResponse = await handleImportExecutionAction(context);
  if (executionResponse) return executionResponse;

  return handleImportMaintenanceAction(context);
}

