#!/usr/bin/env python3
"""Backward-compatible entry point for the portable Drifty schema exporter."""

from __future__ import annotations

import runpy
import sys
from pathlib import Path


if __name__ == "__main__":
    if not any(
        option in sys.argv[1:]
        for option in ("--tables-file", "--table", "--prefix")
    ):
        sys.argv[1:1] = ["--prefix", "mes_"]
    runpy.run_path(
        str(
            Path(__file__).resolve().parents[1]
            / "public"
            / "tools"
            / "export_mysql_schema.py"
        ),
        run_name="__main__",
    )
