"""Smoke tests: every px subcommand's --help must exit 0."""

from __future__ import annotations

import pytest
from px.__main__ import app
from typer.testing import CliRunner

runner = CliRunner()

ALL_SUBCOMMANDS = [
    "init",
    "login",
    "create",
    "requirements",
    "validate",
    "run",
    "serve",
    "status",
    "push",
    "pull",
    "export",
]


def test_root_help():
    result = runner.invoke(app, ["--help"])
    assert result.exit_code == 0
    assert "px" in result.output.lower()


@pytest.mark.parametrize("cmd", ALL_SUBCOMMANDS)
def test_subcommand_help(cmd: str):
    result = runner.invoke(app, [cmd, "--help"])
    assert result.exit_code == 0, f"`px {cmd} --help` failed: {result.output}"
