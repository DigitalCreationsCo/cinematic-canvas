import asyncio
import json
import os
import re
import sys
import tempfile
import warnings
from contextlib import asynccontextmanager, suppress
from http import HTTPStatus
from pathlib import Path
from typing import TYPE_CHECKING, cast
from urllib.parse import urlencode

import anyio
import httpx
import sqlalchemy
from fastapi import FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi_pagination import add_pagination
from filelock import FileLock
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from px.interface.utils import setup_llm_caching
from px.log.logger import configure, logger
from pydantic import PydanticDeprecatedSince20
from pydantic_core import PydanticSerializationError
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from portals.api import health_check_router, log_router
from portals.api.router import router
from portals.api.v1.mcp_projects import init_mcp_servers
from portals.initial_setup.setup import (
    copy_profile_pictures,
    create_or_update_starter_projects,
    initialize_auto_login_default_superuser,
    load_bundles_from_urls,
    load_flows_from_directory,
    sync_flows_from_fs,
)
from portals.middleware import ContentSizeLimitMiddleware
from portals.plugin_routes import load_plugin_routes
from portals.services.database.models.deployment.exceptions import DeploymentGuardError
from portals.services.database.service import UnsupportedPostgreSQLVersionError
from portals.services.deps import (
    get_queue_service,
    get_service,
    get_settings_service,
    get_telemetry_service,
)
from portals.services.nap import (
    MockNapRepository,
    NapService,
    initialize_nap_service,
)
from portals.services.schema import ServiceType
from portals.services.utils import (
    initialize_services,
    initialize_settings_service,
    teardown_services,
)
from portals.utils.mcp_cleanup import cleanup_mcp_sessions

if TYPE_CHECKING:
    from tempfile import TemporaryDirectory

    from px.services.mcp_composer.service import MCPComposerService

# Ignore Pydantic deprecation warnings from Langchain
warnings.filterwarnings("ignore", category=PydanticDeprecatedSince20)

# Suppress ResourceWarning from anyio streams (SSE connections)
warnings.filterwarnings("ignore", category=ResourceWarning, message=".*MemoryObjectReceiveStream.*")
warnings.filterwarnings("ignore", category=ResourceWarning, message=".*MemoryObjectSendStream.*")

_tasks: list[asyncio.Task] = []

MAX_PORT = 65535


async def log_exception_to_telemetry(exc: Exception, context: str) -> None:
    """Helper to safely log exceptions to telemetry without raising."""
    try:
        telemetry_service = get_telemetry_service()
        await telemetry_service.log_exception(exc, context)
    except (httpx.HTTPError, asyncio.QueueFull):
        await logger.awarning(f"Failed to log {context} exception to telemetry")


class RequestCancelledMiddleware(BaseHTTPMiddleware):
    def __init__(self, app) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        sentinel = object()

        async def cancel_handler():
            while True:
                if await request.is_disconnected():
                    return sentinel
                await asyncio.sleep(0.1)

        handler_task = asyncio.create_task(call_next(request))
        cancel_task = asyncio.create_task(cancel_handler())

        done, pending = await asyncio.wait([handler_task, cancel_task], return_when=asyncio.FIRST_COMPLETED)

        for task in pending:
            task.cancel()

        if cancel_task in done:
            return Response("Request was cancelled", status_code=499)
        return await handler_task


class JavaScriptMIMETypeMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        try:
            response = await call_next(request)
        except Exception as exc:
            if isinstance(exc, PydanticSerializationError):
                message = (
                    "Something went wrong while serializing the response. "
                    "Please share this error on our GitHub repository."
                )
                error_messages = json.dumps([message, str(exc)])
                raise HTTPException(status_code=HTTPStatus.INTERNAL_SERVER_ERROR, detail=error_messages) from exc
            raise
        if (
            "files/" not in request.url.path
            and request.url.path.endswith(".js")
            and response.status_code == HTTPStatus.OK
        ):
            response.headers["Content-Type"] = "text/javascript"
        return response


async def load_bundles_with_error_handling():
    try:
        return await load_bundles_from_urls()
    except (httpx.TimeoutException, httpx.HTTPError, httpx.RequestError) as exc:
        await logger.aerror(f"Error loading bundles from URLs: {exc}")
        return [], []


def warn_about_future_cors_changes(settings):
    """Warn users about upcoming CORS security changes in version 1.7."""
    # Check if using default (backward compatible) settings
    using_defaults = settings.cors_origins == "*" and settings.cors_allow_credentials is True

    if using_defaults:
        logger.warning(
            "CORS: Using permissive defaults (all origins + credentials). "
            "Set PORTALS_CORS_ORIGINS for production. Stricter defaults in v2.0."
        )


def get_lifespan(*, fix_migration=False, version=None):
    initialize_settings_service()
    telemetry_service = get_telemetry_service()

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        from px.interface.components import get_and_cache_all_types_dict

        configure()

        # Startup message
        if version:
            await logger.adebug(f"Starting Portals v{version}...")
        else:
            await logger.adebug("Starting Portals...")

        temp_dirs: list[TemporaryDirectory] = []
        sync_flows_from_fs_task = None
        mcp_init_task = None

        try:
            start_time = asyncio.get_event_loop().time()

            await logger.adebug("Initializing services")
            await initialize_services(fix_migration=fix_migration)
            await logger.adebug(f"Services initialized in {asyncio.get_event_loop().time() - start_time:.2f}s")

            current_time = asyncio.get_event_loop().time()
            await logger.adebug("Setting up LLM caching")
            setup_llm_caching()
            await logger.adebug(f"LLM caching setup in {asyncio.get_event_loop().time() - current_time:.2f}s")

            current_time = asyncio.get_event_loop().time()
            await logger.adebug("Syncing Stripe products to local cache")
            try:
                from portals.services.deps import session_scope
                from portals.services.stripe_service import sync_stripe_products_to_db

                async with session_scope() as session:
                    await sync_stripe_products_to_db(session)
            except Exception as e:  # noqa: BLE001
                await logger.awarning(
                    f"Failed to sync Stripe products on startup: {e}. Product data will be fetched on demand."
                )
            await logger.adebug(f"Stripe products synced in {asyncio.get_event_loop().time() - current_time:.2f}s")

            current_time = asyncio.get_event_loop().time()
            await logger.adebug("Copying profile pictures")
            await copy_profile_pictures()
            await logger.adebug(f"Profile pictures copied in {asyncio.get_event_loop().time() - current_time:.2f}s")

            if get_settings_service().auth_settings.AUTO_LOGIN:
                current_time = asyncio.get_event_loop().time()
                await logger.adebug("Initializing default super user")
                await initialize_auto_login_default_superuser()
                await logger.adebug(
                    f"Default super user initialized in {asyncio.get_event_loop().time() - current_time:.2f}s"
                )

            await logger.adebug("Initializing super user")
            await initialize_auto_login_default_superuser()
            await logger.adebug(f"Super user initialized in {asyncio.get_event_loop().time() - current_time:.2f}s")

            current_time = asyncio.get_event_loop().time()
            await logger.adebug("Loading bundles")
            (
                temp_dirs,
                bundles_components_paths,
            ) = await load_bundles_with_error_handling()
            get_settings_service().settings.components_path.extend(bundles_components_paths)
            await logger.adebug(f"Bundles loaded in {asyncio.get_event_loop().time() - current_time:.2f}s")

            current_time = asyncio.get_event_loop().time()
            await logger.adebug("Caching types")
            all_types_dict = await get_and_cache_all_types_dict(get_settings_service(), telemetry_service)
            await logger.adebug(f"Types cached in {asyncio.get_event_loop().time() - current_time:.2f}s")

            # Use file-based lock to prevent multiple workers from creating duplicate starter projects concurrently.
            # Note that it's still possible that one worker may complete this task, release the lock,
            # then another worker pick it up, but the operation is idempotent so worst case it duplicates
            # the initialization work.
            current_time = asyncio.get_event_loop().time()
            await logger.adebug("Creating/updating starter projects")

            lock_file = Path(tempfile.gettempdir()) / "portals_starter_projects.lock"
            lock = FileLock(lock_file, timeout=1)
            try:
                with lock:
                    await create_or_update_starter_projects(all_types_dict)
                    await logger.adebug(
                        f"Starter projects created/updated in {asyncio.get_event_loop().time() - current_time:.2f}s"
                    )
            except TimeoutError:
                # Another process has the lock
                await logger.adebug("Another worker is creating starter projects, skipping")
            except Exception as e:  # noqa: BLE001
                await logger.awarning(
                    f"Failed to acquire lock for starter projects: {e}. Starter projects may not be created or updated."
                )

            # Initialize agentic global variables early (before MCP server and flows)
            if get_settings_service().settings.agentic_experience:
                from portals.api.utils.mcp.agentic_mcp import (
                    initialize_agentic_global_variables,
                )

                current_time = asyncio.get_event_loop().time()
                await logger.ainfo("Initializing agentic global variables...")
                try:
                    async with session_scope() as session:
                        await initialize_agentic_global_variables(session)
                    await logger.adebug(
                        f"Agentic global variables initialized in {asyncio.get_event_loop().time() - current_time:.2f}s"
                    )
                except Exception as e:  # noqa: BLE001
                    await logger.awarning(f"Failed to initialize agentic global variables: {e}")

            current_time = asyncio.get_event_loop().time()
            await logger.adebug("Starting telemetry service")
            telemetry_service.start()
            await logger.adebug(f"started telemetry service in {asyncio.get_event_loop().time() - current_time:.2f}s")

            current_time = asyncio.get_event_loop().time()
            await logger.adebug("Starting MCP Composer service")
            mcp_composer_service = cast("MCPComposerService", get_service(ServiceType.MCP_COMPOSER_SERVICE))
            await mcp_composer_service.start()
            await logger.adebug(
                f"started MCP Composer service in {asyncio.get_event_loop().time() - current_time:.2f}s"
            )

            # ── Nap Service Initialization ─────────────────────────────
            current_time = asyncio.get_event_loop().time()
            storage_path = anyio.Path(get_settings_service().settings.nap_storage_dir)
            nap_storage = await storage_path.expanduser()
            await nap_storage.mkdir(parents=True, exist_ok=True)
            nap_repo = MockNapRepository(assets_dir=nap_storage)
            initialize_nap_service(NapService(repo=nap_repo))
            await logger.adebug(
                f"NAP service initialized (dir={nap_storage}) in {asyncio.get_event_loop().time() - current_time:.2f}s"
            )

            # Auto-configure Agentic MCP server if enabled (after variables are initialized)
            if get_settings_service().settings.agentic_experience:
                from portals.api.utils.mcp.agentic_mcp import (
                    auto_configure_agentic_mcp_server,
                )

                current_time = asyncio.get_event_loop().time()
                await logger.ainfo("Configuring Agentic MCP server...")
                try:
                    async with session_scope() as session:
                        await auto_configure_agentic_mcp_server(session)
                    await logger.adebug(
                        f"Agentic MCP server configured in {asyncio.get_event_loop().time() - current_time:.2f}s"
                    )
                except Exception as e:  # noqa: BLE001
                    await logger.awarning(f"Failed to configure agentic MCP server: {e}")

            current_time = asyncio.get_event_loop().time()
            await logger.adebug("Loading flows")
            await load_flows_from_directory()
            sync_flows_from_fs_task = asyncio.create_task(sync_flows_from_fs())
            queue_service = get_queue_service()
            if not queue_service.is_started():  # Start if not already started
                queue_service.start()
            await logger.adebug(f"Flows loaded in {asyncio.get_event_loop().time() - current_time:.2f}s")

            total_time = asyncio.get_event_loop().time() - start_time
            await logger.adebug(f"Total initialization time: {total_time:.2f}s")

            async def delayed_init_mcp_servers():
                await asyncio.sleep(10.0)  # Increased delay to allow starter projects to be created
                current_time = asyncio.get_event_loop().time()
                await logger.adebug("Loading MCP servers for projects")
                try:
                    await init_mcp_servers()
                    await logger.adebug(f"MCP servers loaded in {asyncio.get_event_loop().time() - current_time:.2f}s")
                except Exception as e:  # noqa: BLE001
                    await logger.awarning(f"First MCP server initialization attempt failed: {e}")
                    await asyncio.sleep(5.0)  # Increased retry delay
                    current_time = asyncio.get_event_loop().time()
                    await logger.adebug("Retrying MCP servers initialization")
                    try:
                        await init_mcp_servers()
                        await logger.adebug(
                            f"MCP servers loaded on retry in {asyncio.get_event_loop().time() - current_time:.2f}s"
                        )
                    except Exception as e2:  # noqa: BLE001
                        await logger.aexception(f"Failed to initialize MCP servers after retry: {e2}")

            # Start the delayed initialization as a background task
            # Allows the server to start first to avoid race conditions with MCP Server startup
            mcp_init_task = asyncio.create_task(delayed_init_mcp_servers())

            # v1 and project MCP server context managers
            from portals.api.v1.mcp import start_streamable_http_manager
            from portals.api.v1.mcp_projects import start_project_task_group

            await start_streamable_http_manager()
            await start_project_task_group()

            # ── Periodic background tasks ────────────────────────────────────
            async def _hourly_credit_expiry() -> None:
                """Placeholder: called every hour to expire credits.

                Credit expiry is intentionally a **no-op** until we have
                a concrete policy decision.  Options to consider when
                designing the policy:

                *   **Fixed TTL** — expire purchased credits after N
                    months (e.g. 12 months from purchase date).
                *   **Activity-based** — expire credits only if the user
                    has been inactive for N months.
                *   **Tier-based** — allowance credits expire monthly
                    (renewed each billing cycle), purchased credits
                    never expire (premium model).
                *   **First-in-first-out** — always consume the oldest
                    credits first so any expiry naturally affects the
                    oldest stock.

                The actual implementation will need to:
                    1. Query ``credit_transaction`` for expired batches.
                    2. Insert a zero-credit adjustment transaction
                       crediting the user and noting the reason.
                    3. Optionally notify the user via email/in-app.

                See also ``credit_service.expire_credits()``.
                """
                while True:
                    try:
                        await asyncio.sleep(3600)  # every hour
                        # TODO: implement credit expiry
                    except asyncio.CancelledError:
                        break
                    except Exception:
                        # Don't let a single iteration crash the loop
                        await logger.aexception("Hourly credit expiry failed")

            async def _daily_cleanup_stale_pending_jobs() -> None:
                """Delete pending_jobs older than 7 days every 24h.

                Runs once at startup (to catch up after any downtime), then
                every 24 hours thereafter.

                NOTE: Uses its own ``session_scope()`` rather than sharing the
                HTTP-request session.  This is correct for a fire-and-forget
                periodic task — it prevents the cleanup from being entangled
                with any request lifecycle.  The trade-off is that the cleanup
                IS NOT rolled back if the enclosing request fails (but there is
                no enclosing request — this runs in a background asyncio task).
                If we later add transactional background work that needs to be
                consistent with a request (e.g. deduct credits + send
                notification in the same client session), share the session
                instead of opening a new one.
                """
                from portals.services.credit_service import expire_stale_pending_jobs

                while True:
                    try:
                        async with session_scope() as session:
                            count = await expire_stale_pending_jobs(session)
                            if count:
                                logger.info("Expired %d stale pending jobs", count)
                    except asyncio.CancelledError:
                        break
                    except Exception:
                        await logger.aexception("Daily pending-job cleanup failed")
                    await asyncio.sleep(86_400)  # every 24h

            bg_tasks = [
                asyncio.create_task(_hourly_credit_expiry()),
                asyncio.create_task(_daily_cleanup_stale_pending_jobs()),
            ]

            yield

            # Cancel background tasks
            for t in bg_tasks:
                t.cancel()
            await asyncio.gather(*bg_tasks, return_exceptions=True)
        except asyncio.CancelledError:
            await logger.adebug("Lifespan received cancellation signal")
        except UnsupportedPostgreSQLVersionError:
            # Normally caught by the pre-flight check in __main__.py
            # before the server starts.  If we get here anyway (e.g.
            # direct uvicorn invocation via ``make backend``), exit
            # immediately and tell the parent (reloader) to stop.
            import signal

            sys.stdout.flush()
            sys.stderr.flush()
            with suppress(ProcessLookupError, PermissionError):
                os.kill(os.getppid(), signal.SIGTERM)
            os._exit(3)
        except Exception as exc:
            if "portals migration --fix" not in str(exc):
                logger.exception(exc)

                await log_exception_to_telemetry(exc, "lifespan")
            raise
        finally:
            # CRITICAL: Cleanup MCP sessions FIRST, before any other shutdown logic.
            # This ensures MCP subprocesses are killed even if shutdown is interrupted.
            await cleanup_mcp_sessions()

            # Clean shutdown with progress indicator
            # Create shutdown progress (show verbose timing if log level is DEBUG)
            from portals.__main__ import get_number_of_workers
            from portals.cli.progress import create_portals_shutdown_progress

            log_level = os.getenv("PORTALS_LOG_LEVEL", "info").lower()
            num_workers = get_number_of_workers(get_settings_service().settings.workers)
            shutdown_progress = create_portals_shutdown_progress(
                verbose=log_level == "debug", multiple_workers=num_workers > 1
            )

            try:
                # Step 0: Stopping Server
                with shutdown_progress.step(0):
                    await logger.adebug("Stopping server gracefully...")
                    # The actual server stopping is handled by the lifespan context
                    await asyncio.sleep(0.1)  # Brief pause for visual effect

                # Step 1: Cancelling Background Tasks
                with shutdown_progress.step(1):
                    from portals.api.v1.mcp import stop_streamable_http_manager
                    from portals.api.v1.mcp_projects import stop_project_task_group

                    # Shutdown MCP project servers
                    try:
                        await stop_project_task_group()
                    except Exception as e:  # noqa: BLE001
                        await logger.aerror(f"Failed to stop MCP Project servers: {e}")
                    # Close MCP server streamable-http session manager .run() context manager
                    try:
                        await stop_streamable_http_manager()
                    except Exception as e:  # noqa: BLE001
                        await logger.aerror(f"Failed to stop MCP server streamable-http session manager: {e}")
                    # Cancel background tasks
                    tasks_to_cancel = []
                    if sync_flows_from_fs_task:
                        sync_flows_from_fs_task.cancel()
                        tasks_to_cancel.append(sync_flows_from_fs_task)
                    if mcp_init_task and not mcp_init_task.done():
                        mcp_init_task.cancel()
                        tasks_to_cancel.append(mcp_init_task)
                    if tasks_to_cancel:
                        # Wait for all tasks to complete, capturing exceptions
                        results = await asyncio.gather(*tasks_to_cancel, return_exceptions=True)
                        # Log any non-cancellation exceptions
                        for result in results:
                            if isinstance(result, Exception) and not isinstance(result, asyncio.CancelledError):
                                await logger.aerror(
                                    f"Error during task cleanup: {result}",
                                    exc_info=result,
                                )

                # Step 2: Cleaning Up Services
                with shutdown_progress.step(2):
                    try:
                        await asyncio.wait_for(teardown_services(), timeout=30)
                    except asyncio.TimeoutError:
                        await logger.awarning("Teardown services timed out after 30s.")

                # Step 3: Clearing Temporary Files
                with shutdown_progress.step(3):
                    temp_dir_cleanups = [asyncio.to_thread(temp_dir.cleanup) for temp_dir in temp_dirs]
                    try:
                        await asyncio.wait_for(asyncio.gather(*temp_dir_cleanups), timeout=10)
                    except asyncio.TimeoutError:
                        await logger.awarning("Temporary file cleanup timed out after 10s.")

                # Step 4: Finalizing Shutdown
                with shutdown_progress.step(4):
                    await logger.adebug("Portals shutdown complete")

                # Show completion summary and farewell
                shutdown_progress.print_shutdown_summary()

            except (sqlalchemy.exc.OperationalError, sqlalchemy.exc.DBAPIError) as e:
                # Case where the database connection is closed during shutdown
                await logger.awarning(f"Database teardown failed due to closed connection: {e}")
            except asyncio.CancelledError:
                # Swallow this - it's normal during shutdown
                await logger.adebug("Teardown cancelled during shutdown.")
            except Exception as e:  # noqa: BLE001
                await logger.aexception(f"Unhandled error during cleanup: {e}")
                await log_exception_to_telemetry(e, "lifespan_cleanup")

    return lifespan


def create_app():
    """Create the FastAPI app and include the router."""
    from portals.utils.version import get_version_info

    __version__ = get_version_info()["version"]
    configure()
    lifespan = get_lifespan(version=__version__)

    settings = get_settings_service().settings

    app = FastAPI(
        title="Portals",
        version=__version__,
        lifespan=lifespan,
        root_path=settings.root_path,
    )
    app.add_middleware(
        ContentSizeLimitMiddleware,
    )

    setup_sentry(app)

    # Warn about future CORS changes
    warn_about_future_cors_changes(settings)

    # Configure CORS using settings (with backward compatible defaults)
    origins = settings.cors_origins
    if isinstance(origins, str) and origins != "*":
        origins = [origins]

    # Apply current CORS configuration (maintains backward compatibility)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=settings.cors_allow_credentials,
        allow_methods=settings.cors_allow_methods,
        allow_headers=settings.cors_allow_headers,
    )
    app.add_middleware(JavaScriptMIMETypeMiddleware)

    @app.middleware("http")
    async def check_boundary(request: Request, call_next):
        if "/api/v1/files/upload" in request.url.path:
            content_type = request.headers.get("Content-Type")

            if not content_type or "multipart/form-data" not in content_type or "boundary=" not in content_type:
                return JSONResponse(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    content={"detail": "Content-Type header must be 'multipart/form-data' with a boundary parameter."},
                )

            boundary = content_type.split("boundary=")[-1].strip()

            if not re.match(r"^[\w\-]{1,70}$", boundary):
                return JSONResponse(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    content={"detail": "Invalid boundary format"},
                )

            body = await request.body()

            boundary_start = f"--{boundary}".encode()
            # The multipart/form-data spec doesn't require a newline after the boundary, however many clients do
            # implement it that way
            boundary_end = f"--{boundary}--\r\n".encode()
            boundary_end_no_newline = f"--{boundary}--".encode()

            if not body.startswith(boundary_start) or not body.endswith((boundary_end, boundary_end_no_newline)):
                return JSONResponse(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    content={"detail": "Invalid multipart formatting"},
                )

        return await call_next(request)

    @app.middleware("http")
    async def forwarded_prefix_middleware(request: Request, call_next):
        """Honour X-Forwarded-Prefix set by a reverse proxy.

        When a reverse proxy (e.g. Nginx) strips a URL prefix before forwarding
        the request, it can advertise the original prefix via X-Forwarded-Prefix.
        We propagate this into the ASGI ``root_path`` so that transports like
        MCP SSE include the prefix in the POST-back URLs they hand to clients.

        This middleware is only active when ``root_path`` is configured in
        settings (i.e. the operator has explicitly opted into reverse-proxy
        mode).  The header value takes precedence over the static setting
        because the proxy is the runtime source of truth for the prefix.
        """
        if not settings.root_path:
            return await call_next(request)

        prefix = request.headers.get("X-Forwarded-Prefix", "").rstrip("/")
        if prefix and prefix.startswith("/") and "://" not in prefix and "?" not in prefix and "#" not in prefix:
            request.scope["root_path"] = prefix
        return await call_next(request)

    @app.middleware("http")
    async def flatten_query_string_lists(request: Request, call_next):
        flattened: list[tuple[str, str]] = []
        for key, value in request.query_params.multi_items():
            flattened.extend((key, entry) for entry in value.split(","))

        request.scope["query_string"] = urlencode(flattened, doseq=True).encode("utf-8")

        return await call_next(request)

    if prome_port_str := os.environ.get("PORTALS_PROMETHEUS_PORT"):
        # set here for create_app() entry point
        prome_port = int(prome_port_str)
        if prome_port > 0 or prome_port < MAX_PORT:
            logger.debug(f"Starting Prometheus server on port {prome_port}...")
            settings.prometheus_enabled = True
            settings.prometheus_port = prome_port
        else:
            msg = f"Invalid port number {prome_port_str}"
            raise ValueError(msg)

    if settings.prometheus_enabled:
        from prometheus_client import start_http_server

        start_http_server(settings.prometheus_port)

    if settings.mcp_server_enabled:
        from portals.api.v1 import mcp_router

        router.include_router(mcp_router)

    app.include_router(router)
    app.include_router(health_check_router)
    app.include_router(log_router)

    # Discover and register additional routers from plugins (portals.plugins entry-point)
    load_plugin_routes(app)

    @app.exception_handler(DeploymentGuardError)
    async def deployment_guard_exception_handler(_request: Request, exc: DeploymentGuardError):
        return JSONResponse(
            status_code=HTTPStatus.CONFLICT,
            content={"detail": exc.detail},
        )

    @app.exception_handler(Exception)
    async def exception_handler(_request: Request, exc: Exception):
        if isinstance(exc, HTTPException):
            await logger.aerror(f"HTTPException: {exc}", exc_info=exc)
            return JSONResponse(
                status_code=exc.status_code,
                content={"message": str(exc.detail)},
            )
        await logger.aerror(f"unhandled error: {exc}", exc_info=exc)

        await log_exception_to_telemetry(exc, "handler")

        return JSONResponse(
            status_code=HTTPStatus.INTERNAL_SERVER_ERROR,
            content={"message": str(exc)},
        )

    FastAPIInstrumentor.instrument_app(app)

    add_pagination(app)

    return app


def setup_sentry(app: FastAPI) -> None:
    settings = get_settings_service().settings
    if settings.sentry_dsn:
        import sentry_sdk
        from sentry_sdk.integrations.asgi import SentryAsgiMiddleware

        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            traces_sample_rate=settings.sentry_traces_sample_rate,
            profiles_sample_rate=settings.sentry_profiles_sample_rate,
        )
        app.add_middleware(SentryAsgiMiddleware)


def setup_static_files(app: FastAPI, static_files_dir: Path) -> None:
    """Setup the static files directory.

    Args:
        app (FastAPI): FastAPI app.
        static_files_dir (str): Path to the static files directory.
    """
    # Mount the nap-core content-addressed asset store BEFORE the SPA
    # catch-all so /api/assets/{hash} requests are handled here rather
    # than falling through to index.html.
    nap_storage = get_settings_service().settings.nap_storage_dir
    nap_assets_dir = Path(nap_storage).expanduser() / ".nap-assets"
    if nap_assets_dir.exists():
        app.mount(
            "/api/assets",
            StaticFiles(directory=str(nap_assets_dir)),
            name="nap-assets",
        )

    app.mount(
        "/",
        StaticFiles(directory=static_files_dir, html=True),
        name="static",
    )

    @app.exception_handler(404)
    async def custom_404_handler(_request, _exc):
        # Return JSON for all API endpoints to prevent HTML responses
        if _request.url.path.startswith("/api"):
            # Extract detail from HTTPException if available
            detail = _exc.detail if isinstance(_exc, HTTPException) else "Not Found"
            return JSONResponse(
                status_code=404,
                content=detail if isinstance(detail, dict) else {"detail": detail},
            )

        path = anyio.Path(static_files_dir) / "index.html"

        if not await path.exists():
            msg = f"File at path {path} does not exist."
            raise RuntimeError(msg)
        return FileResponse(path)


def get_static_files_dir():
    """Get the static files directory relative to Portals's main.py file."""
    frontend_path = Path(__file__).parent
    return frontend_path / "frontend"


def setup_app(static_files_dir: Path | None = None, *, backend_only: bool = False) -> FastAPI:
    """Setup the FastAPI app."""
    # get the directory of the current file
    if not static_files_dir:
        static_files_dir = get_static_files_dir()

    if not backend_only and (not static_files_dir or not static_files_dir.exists()):
        msg = f"Static files directory {static_files_dir} does not exist."
        raise RuntimeError(msg)
    app = create_app()

    if not backend_only and static_files_dir is not None:
        setup_static_files(app, static_files_dir)
    return app


if __name__ == "__main__":
    import uvicorn

    from portals.__main__ import get_number_of_workers

    configure()
    uvicorn.run(
        "portals.main:create_app",
        host="localhost",
        port=7860,
        workers=get_number_of_workers(),
        log_level="error",
        reload=True,
        loop="asyncio",
    )
