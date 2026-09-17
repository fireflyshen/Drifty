#!/usr/bin/env python3
"""Export selected MySQL CREATE TABLE statements for Drifty using read-only queries."""

from __future__ import annotations

import argparse
import getpass
import os
import re
from pathlib import Path
from typing import Iterable, Sequence


IDENTIFIER_PATTERN = re.compile(r"^[A-Za-z0-9_$]+$")
SHOW_CREATE_PATTERN = re.compile(r"^SHOW CREATE TABLE `[A-Za-z0-9_$]+`$")
TABLE_LOOKUP_PATTERN = re.compile(
    r"^SELECT TABLE_NAME FROM information_schema\.TABLES "
    r"WHERE TABLE_SCHEMA = %s AND TABLE_TYPE = 'BASE TABLE' "
    r"AND TABLE_NAME (?:LIKE %s|IN \(%s(?:,\s*%s)*\)) ORDER BY TABLE_NAME$"
)


def validate_identifier(value: str, label: str) -> str:
    value = value.strip()
    if not value or not IDENTIFIER_PATTERN.fullmatch(value):
        raise ValueError(
            f"{label} {value!r} 非法；只允许字母、数字、下划线、$。"
        )
    return value


def unique(values: Iterable[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        if value not in seen:
            seen.add(value)
            result.append(value)
    return result


def read_table_file(path: Path) -> list[str]:
    if not path.is_file():
        raise ValueError(f"表清单不存在：{path}")
    tables: list[str] = []
    for line_number, raw_line in enumerate(
        path.read_text(encoding="utf-8-sig").splitlines(),
        start=1,
    ):
        value = raw_line.split("#", 1)[0].strip()
        if not value:
            continue
        try:
            tables.append(validate_identifier(value, "表名"))
        except ValueError as error:
            raise ValueError(f"{path}:{line_number}: {error}") from error
    return unique(tables)


def is_allowed_read_query(sql: str) -> bool:
    normalized = " ".join(sql.strip().split())
    return bool(
        TABLE_LOOKUP_PATTERN.fullmatch(normalized)
        or SHOW_CREATE_PATTERN.fullmatch(normalized)
    )


class ReadOnlyCursor:
    """Reject every query outside Drifty's two schema-read operations."""

    def __init__(self, cursor: object) -> None:
        self._cursor = cursor

    def execute(self, sql: str, params: Sequence[object] = ()) -> object:
        if not is_allowed_read_query(sql):
            raise RuntimeError(f"拒绝非只读结构查询：{' '.join(sql.split())[:120]}")
        return self._cursor.execute(sql, params)  # type: ignore[attr-defined]

    def fetchall(self) -> list[tuple[object, ...]]:
        return list(self._cursor.fetchall())  # type: ignore[attr-defined]

    def fetchone(self) -> tuple[object, ...] | None:
        return self._cursor.fetchone()  # type: ignore[attr-defined]

    def close(self) -> None:
        self._cursor.close()  # type: ignore[attr-defined]


def resolve_existing_tables(
    cursor: ReadOnlyCursor,
    database: str,
    requested_tables: list[str],
    prefix: str | None,
) -> tuple[list[str], list[str]]:
    if requested_tables:
        placeholders = ",".join(["%s"] * len(requested_tables))
        cursor.execute(
            f"""
            SELECT TABLE_NAME
            FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = %s
              AND TABLE_TYPE = 'BASE TABLE'
              AND TABLE_NAME IN ({placeholders})
            ORDER BY TABLE_NAME
            """,
            (database, *requested_tables),
        )
        existing = {str(row[0]) for row in cursor.fetchall()}
        return (
            [table for table in requested_tables if table in existing],
            [table for table in requested_tables if table not in existing],
        )

    assert prefix is not None
    cursor.execute(
        """
        SELECT TABLE_NAME
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = %s
          AND TABLE_TYPE = 'BASE TABLE'
          AND TABLE_NAME LIKE %s
        ORDER BY TABLE_NAME
        """,
        (database, f"{prefix}%"),
    )
    return [str(row[0]) for row in cursor.fetchall()], []


def export_schema(
    connection: object,
    database: str,
    requested_tables: list[str],
    prefix: str | None,
    output: Path,
    missing_output: Path,
) -> tuple[list[str], list[str]]:
    cursor = ReadOnlyCursor(connection.cursor())  # type: ignore[attr-defined]
    try:
        table_names, missing = resolve_existing_tables(
            cursor,
            database,
            requested_tables,
            prefix,
        )
        if not table_names:
            raise ValueError("没有找到任何可导出的真实数据表。")

        statements = [
            "-- Drifty MySQL schema export",
            f"-- Database: {database}",
            f"-- Tables: {len(table_names)}",
            "-- Read-only source operations: information_schema SELECT + SHOW CREATE TABLE",
            "",
        ]
        exported: list[str] = []
        for table_name in table_names:
            cursor.execute(f"SHOW CREATE TABLE `{table_name}`")
            row = cursor.fetchone()
            if not row or len(row) < 2 or not row[1]:
                missing.append(table_name)
                continue
            statements.extend(
                [
                    f"-- {table_name}",
                    str(row[1]).rstrip().rstrip(";") + ";",
                    "",
                ]
            )
            exported.append(table_name)
    finally:
        cursor.close()

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("\n".join(statements), encoding="utf-8")
    missing_output.parent.mkdir(parents=True, exist_ok=True)
    missing_output.write_text(
        "".join(f"{table}\n" for table in unique(missing)),
        encoding="utf-8",
    )
    return exported, unique(missing)


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="只读导出指定 MySQL 表的 CREATE TABLE，输出可直接导入 Drifty 的 SQL"
    )
    parser.add_argument("--host", default=os.getenv("MYSQL_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.getenv("MYSQL_PORT", "3306")))
    parser.add_argument("--user", default=os.getenv("MYSQL_USER", "root"))
    parser.add_argument("--database", default=os.getenv("MYSQL_DATABASE"))
    parser.add_argument("--password", default=os.getenv("MYSQL_PASSWORD"))
    selection = parser.add_mutually_exclusive_group(required=True)
    selection.add_argument(
        "--tables-file",
        type=Path,
        help="表清单文件，一行一个表名；支持空行和 # 注释",
    )
    selection.add_argument(
        "--table",
        action="append",
        dest="tables",
        help="直接指定表名；可重复传入",
    )
    selection.add_argument(
        "--prefix",
        help="兼容旧用法：只读导出指定前缀的真实数据表",
    )
    parser.add_argument("--out", type=Path, default=Path("drifty-schema.sql"))
    parser.add_argument(
        "--missing-out",
        type=Path,
        help="缺失表清单；默认是 <out>.missing.txt",
    )
    parser.add_argument(
        "--list-only",
        action="store_true",
        help="只校验并打印显式表清单，不连接数据库",
    )
    parser.add_argument(
        "--connect-timeout",
        type=int,
        default=10,
        help="数据库连接超时秒数，默认 10",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        database = (
            validate_identifier(args.database, "数据库名") if args.database else None
        )
        requested_tables = (
            read_table_file(args.tables_file)
            if args.tables_file
            else unique(validate_identifier(value, "表名") for value in (args.tables or []))
        )
        prefix = validate_identifier(args.prefix, "表名前缀") if args.prefix else None
    except ValueError as error:
        raise SystemExit(str(error)) from error

    if args.list_only:
        if prefix:
            raise SystemExit("--list-only 只能用于 --tables-file 或 --table。")
        if not requested_tables:
            raise SystemExit("表清单为空。")
        print("\n".join(requested_tables))
        return 0

    if not database:
        raise SystemExit("请提供 --database，或设置 MYSQL_DATABASE 环境变量。")
    if not requested_tables and not prefix:
        raise SystemExit("请通过 --tables-file、--table 或 --prefix 指定导出范围。")
    password = (
        args.password
        if args.password is not None
        else getpass.getpass("MySQL 密码（不会显示）：")
    )

    try:
        import mysql.connector
    except ImportError as error:
        raise SystemExit(
            "缺少 mysql-connector-python；请先运行：python -m pip install mysql-connector-python"
        ) from error

    connection = mysql.connector.connect(
        host=args.host,
        port=args.port,
        user=args.user,
        password=password,
        database=database,
        connection_timeout=max(1, args.connect_timeout),
        autocommit=True,
        charset="utf8mb4",
    )
    missing_output = args.missing_out or Path(f"{args.out}.missing.txt")
    try:
        exported, missing = export_schema(
            connection,
            database,
            requested_tables,
            prefix,
            args.out,
            missing_output,
        )
    except ValueError as error:
        raise SystemExit(str(error)) from error
    finally:
        connection.close()

    print(f"已只读导出 {len(exported)} 张表 → {args.out.resolve()}")
    print(f"缺失或无法读取 {len(missing)} 张表 → {missing_output.resolve()}")
    print("把生成的 .sql 文件带回 Drifty，在‘导入’页以‘采集快照’方式导入。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
