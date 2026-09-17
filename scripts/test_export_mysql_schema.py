from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


SCRIPT = (
    Path(__file__).resolve().parents[1]
    / "public"
    / "tools"
    / "export_mysql_schema.py"
)
SPEC = importlib.util.spec_from_file_location("export_mysql_schema", SCRIPT)
assert SPEC and SPEC.loader
EXPORTER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(EXPORTER)


class FakeCursor:
    def __init__(self) -> None:
        self.rows: list[tuple[object, ...]] = []
        self.one: tuple[object, ...] | None = None
        self.queries: list[str] = []

    def execute(self, sql: str, params: tuple[object, ...] = ()) -> None:
        normalized = " ".join(sql.split())
        self.queries.append(normalized)
        if normalized.startswith("SELECT TABLE_NAME"):
            self.rows = [("customer",), ("sales_order",)]
            self.one = None
        elif normalized == "SHOW CREATE TABLE `customer`":
            self.one = ("customer", "CREATE TABLE `customer` (`id` bigint NOT NULL)")
        elif normalized == "SHOW CREATE TABLE `sales_order`":
            self.one = (
                "sales_order",
                "CREATE TABLE `sales_order` (`id` bigint NOT NULL, `customer_id` bigint)",
            )
        else:
            raise AssertionError(f"unexpected query: {normalized} {params}")

    def fetchall(self) -> list[tuple[object, ...]]:
        return self.rows

    def fetchone(self) -> tuple[object, ...] | None:
        return self.one

    def close(self) -> None:
        pass


class FakeConnection:
    def __init__(self) -> None:
        self.fake_cursor = FakeCursor()

    def cursor(self) -> FakeCursor:
        return self.fake_cursor


class ExportMysqlSchemaTest(unittest.TestCase):
    def test_table_file_supports_comments_deduplication_and_validation(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            table_file = Path(directory) / "tables.txt"
            table_file.write_text(
                "# scope\ncustomer\n\nsales_order # order\ncustomer\n",
                encoding="utf-8",
            )
            self.assertEqual(
                EXPORTER.read_table_file(table_file),
                ["customer", "sales_order"],
            )
            table_file.write_text("customer\nbad-name\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "bad-name"):
                EXPORTER.read_table_file(table_file)

    def test_read_only_guard_rejects_every_write_query(self) -> None:
        self.assertTrue(
            EXPORTER.is_allowed_read_query(
                "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = %s AND TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME LIKE %s ORDER BY TABLE_NAME"
            )
        )
        self.assertTrue(
            EXPORTER.is_allowed_read_query("SHOW CREATE TABLE `customer`")
        )
        for sql in (
            "SELECT * FROM customer",
            "INSERT INTO customer VALUES (1)",
            "UPDATE customer SET id=2",
            "DELETE FROM customer",
            "DROP TABLE customer",
            "LOCK TABLES customer READ",
            "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = %s; DELETE FROM customer",
        ):
            self.assertFalse(EXPORTER.is_allowed_read_query(sql), sql)

    def test_fake_mysql_export_writes_drifty_sql_and_missing_list(self) -> None:
        connection = FakeConnection()
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "schema.sql"
            missing = Path(directory) / "missing.txt"
            exported, absent = EXPORTER.export_schema(
                connection,
                "demo",
                ["sales_order", "missing_table", "customer"],
                None,
                output,
                missing,
            )
            self.assertEqual(exported, ["sales_order", "customer"])
            self.assertEqual(absent, ["missing_table"])
            sql = output.read_text(encoding="utf-8")
            self.assertIn("CREATE TABLE `customer`", sql)
            self.assertIn("CREATE TABLE `sales_order`", sql)
            self.assertNotIn("missing_table", sql)
            self.assertEqual(missing.read_text(encoding="utf-8"), "missing_table\n")
            self.assertTrue(
                all(
                    EXPORTER.is_allowed_read_query(query)
                    for query in connection.fake_cursor.queries
                )
            )


if __name__ == "__main__":
    unittest.main()
