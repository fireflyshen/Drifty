"use client";

import type { CatalogData, Confirmation, ModalKind } from "@/features/catalog/model/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EntityMenu, IconButton, words } from "@/features/catalog/presentation";
import { Boxes, FolderGit2, Plus, Trash2 } from "lucide-react";

/**
 * 设置工作区。
 *
 * 负责语言、主题和结构重置入口；实际状态与危险操作由上层控制器提供。
 */
/** 展示语言、主题和结构重置设置。 */
export function SettingsView({
  data,
  t,
  open,
  remove,
  call,
  toast,
  askConfirm,
}: {
  data: CatalogData;
  t: (typeof words)["zh"] | (typeof words)["en"];
  open: (
    kind: Exclude<ModalKind, null>,
    record?: Record<string, unknown>,
  ) => void;
  remove: (entity: string, id: string) => Promise<void>;
  call: (
    action: string,
    payload?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  toast: (message: string) => void;
  askConfirm: (request: Confirmation) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="gap-0">
        <CardHeader className="flex-row items-center">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Boxes className="size-4" />
            {t.modules}
            <Badge variant="secondary">{data.modules.length}</Badge>
          </CardTitle>
          <div className="ml-auto">
            <IconButton label={t.addModule} onClick={() => open("module")}>
              <Plus />
            </IconButton>
          </div>
        </CardHeader>
        <CardContent className="divide-y p-0">
          {data.modules.map((module) => (
            <div key={module.id} className="flex items-center gap-4 px-4 py-4">
              <div className="min-w-0 flex-1">
                <strong className="block truncate text-xs">
                  {module.name}
                </strong>
                <span className="text-[10px] text-muted-foreground">
                  {module.code} · {module.tableCount}{" "}
                  {t === words.zh ? "张表" : "tables"}
                </span>
              </div>
              <EntityMenu
                t={t}
                onEdit={() =>
                  open("module", module as unknown as Record<string, unknown>)
                }
                onDelete={() => void remove("module", module.id)}
              />
            </div>
          ))}
        </CardContent>
      </Card>
      <Card className="gap-0">
        <CardHeader className="flex-row items-center">
          <CardTitle className="flex items-center gap-2 text-sm">
            <FolderGit2 className="size-4" />
            GitHub<Badge variant="secondary">{data.repositories.length}</Badge>
          </CardTitle>
          <div className="ml-auto">
            <IconButton label={t.addSource} onClick={() => open("repository")}>
              <Plus />
            </IconButton>
          </div>
        </CardHeader>
        <CardContent className="divide-y p-0">
          {data.repositories.map((source) => (
            <div key={source.id} className="flex items-center gap-4 px-4 py-4">
              <div className="min-w-0 flex-1">
                <strong className="block truncate text-xs">
                  {source.name}
                </strong>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {source.repository} · {source.branch} · {source.pathPattern}
                </span>
              </div>
              <EntityMenu
                t={t}
                onEdit={() =>
                  open(
                    "repository",
                    source as unknown as Record<string, unknown>,
                  )
                }
                onDelete={() => void remove("repository", source.id)}
              />
            </div>
          ))}
          {!data.repositories.length && <Empty text={t.noData} />}
        </CardContent>
      </Card>
      <Card className="md:col-span-2">
        <CardContent className="flex items-center justify-between">
          <span className="text-sm font-medium">{t.reset}</span>
          <Button
            variant="destructive"
            size="icon"
            aria-label={t.reset}
            onClick={() =>
              askConfirm({
                title: t.confirmReset,
                description:
                  t === words.zh
                    ? "字段、表、环境范围和全部导入记录都将被清空，项目与环境设置会保留。此操作无法撤销。"
                    : "All fields, tables, scopes, and import history will be cleared. Projects and environments stay. This cannot be undone.",
                confirmLabel: t.reset,
                run: async () => {
                  await call("catalog.reset");
                  toast(t.saved);
                },
              })
            }
          >
            <Trash2 />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
