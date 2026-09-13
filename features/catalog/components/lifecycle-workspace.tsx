"use client";

import type { LifecycleObject } from "@/features/catalog/model/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Empty, SelectField } from "@/features/catalog/presentation";
import { Archive, Database, Network, Shield, Table2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

/**
 * 生命周期工作区。
 *
 * 负责读取全部目录对象、按状态与关键字过滤，并发出生命周期变更命令；
 * 不负责保存全局导航状态，也不直接操作 D1。
 */
/** 读取、过滤并更新目录对象生命周期。 */
export function LifecycleWorkspace({
  locale,
  call,
  toast,
}: {
  locale: "zh" | "en";
  call: (
    action: string,
    payload?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  toast: (message: string) => void;
}) {
  const [objects, setObjects] = useState<LifecycleObject[]>([]);
  const [filter, setFilter] = useState<
    "all" | "active" | "deprecated" | "removed"
  >("all");
  const [query, setQuery] = useState("");
  const load = useCallback(
    () =>
      fetch("/api/catalog?mode=lifecycle")
        .then((response) => response.json())
        .then((result) =>
          setObjects(
            Array.isArray((result as { objects?: unknown }).objects)
              ? ((result as { objects: LifecycleObject[] }).objects)
              : [],
          ),
        )
        .catch(() => setObjects([])),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const visible = objects.filter(
    (item) =>
      (filter === "all" || item.lifecycleStatus === filter) &&
      `${item.name} ${item.tableName ?? ""} ${item.lifecycleNote}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const update = async (
    item: LifecycleObject,
    status: "active" | "deprecated" | "removed",
  ) => {
    try {
      await call("lifecycle.set", { entity: item.entity, id: item.id, status });
      await load();
      toast(locale === "zh" ? "状态已更新" : "Status updated");
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <Card className="md:col-span-2">
      <CardHeader className="gap-3">
        <div className="flex items-center gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Archive className="size-4" />
            {locale === "zh" ? "对象生命周期" : "Object lifecycle"}
            <Badge variant="secondary">{visible.length}</Badge>
          </CardTitle>
          <SelectField
            value={filter}
            onValueChange={(value) => setFilter(value as typeof filter)}
            className="ml-auto w-32"
          >
            <option value="all">{locale === "zh" ? "全部" : "All"}</option>
            <option value="active">
              {locale === "zh" ? "正常" : "Active"}
            </option>
            <option value="deprecated">
              {locale === "zh" ? "废弃" : "Deprecated"}
            </option>
            <option value="removed">
              {locale === "zh" ? "已移除" : "Removed"}
            </option>
          </SelectField>
        </div>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={
            locale === "zh"
              ? "搜索表、字段、索引或约束"
              : "Search tables, fields, indexes, or constraints"
          }
          className="h-9 text-xs"
        />
      </CardHeader>
      <CardContent className="divide-y p-0">
        {visible.slice(0, 200).map((item) => (
          <div
            key={`${item.entity}-${item.id}`}
            className="flex items-center gap-3 px-4 py-3"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-muted">
              {item.entity === "table" ? (
                <Table2 className="size-3.5" />
              ) : item.entity === "field" ? (
                <Database className="size-3.5" />
              ) : item.entity === "index" ? (
                <Network className="size-3.5" />
              ) : (
                <Shield className="size-3.5" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <code className="block truncate text-xs">
                {item.tableName && item.entity !== "table"
                  ? `${item.tableName}.${item.name}`
                  : item.name}
              </code>
              <span className="text-[10px] text-muted-foreground">
                {item.lifecycleNote || item.entity}
              </span>
            </span>
            <Badge variant="outline">
              {item.lifecycleStatus === "deprecated"
                ? locale === "zh"
                  ? "废弃"
                  : "Deprecated"
                : item.lifecycleStatus === "removed"
                  ? locale === "zh"
                    ? "已移除"
                    : "Removed"
                  : locale === "zh"
                    ? "正常"
                    : "Active"}
            </Badge>
            {item.lifecycleStatus === "active" ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void update(item, "deprecated")}
              >
                {locale === "zh" ? "废弃" : "Deprecate"}
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void update(item, "active")}
              >
                {locale === "zh" ? "恢复" : "Restore"}
              </Button>
            )}
          </div>
        ))}
        {!visible.length && (
          <Empty text={locale === "zh" ? "暂无对象" : "No objects"} />
        )}
      </CardContent>
    </Card>
  );
}
