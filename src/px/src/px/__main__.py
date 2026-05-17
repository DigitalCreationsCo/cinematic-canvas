"""PX CLI entry point."""

from importlib.metadata import version as _pkg_version

import typer

from px.cli._authoring_commands import register as _register_authoring
from px.cli._remote_commands import register as _register_remote
from px.cli._running_commands import register as _register_running
from px.cli._setup_commands import register as _register_setup


def _version_callback(value: bool) -> None:
    if value:
        typer.echo(f"px {_pkg_version('px')}")
        raise typer.Exit(0)


app = typer.Typer(
    name="px",
    help="px - Portals Executor",
    add_completion=False,
)


@app.callback()
def _app_callback(
    version: bool = typer.Option(
        False,
        "--version",
        "-V",
        help="Show the px version and exit.",
        is_eager=True,
        callback=_version_callback,
    ),
) -> None:
    """Lfx - Portals Executor."""


# Register command groups (order determines help-panel ordering)
_register_setup(app)
_register_authoring(app)
_register_running(app)
_register_remote(app)


def main():
    """Main entry point for the PX CLI."""
    app()


if __name__ == "__main__":
    main()
