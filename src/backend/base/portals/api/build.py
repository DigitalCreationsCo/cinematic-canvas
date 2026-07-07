import asyncio
import json
import time
import traceback
import uuid
from collections.abc import AsyncIterator

from fastapi import BackgroundTasks, HTTPException, Response
from px.components.tools.global_tools import inject_global_tools_into_vertex, is_agent_vertex
from px.graph.graph.base import Graph
from px.graph.utils import log_vertex_build
from px.log.logger import logger
from px.schema.schema import InputValueRequest
from sqlmodel import select

from portals.api.disconnect import DisconnectHandlerStreamingResponse
from portals.api.utils import (
    CurrentActiveUser,
    EventDeliveryType,
    build_graph_from_data,
    build_graph_from_db,
    format_elapsed_time,
    format_exception_message,
    get_top_level_vertices,
    parse_exception,
)
from portals.api.v1.schemas import FlowDataRequest, ResultDataResponse, VertexBuildResponse
from portals.events.event_manager import EventManager
from portals.exceptions.component import ComponentBuildError
from portals.schema.message import ErrorMessage
from portals.schema.schema import OutputValue
from portals.services.database.models.flow.model import Flow
from portals.services.deps import get_chat_service, get_telemetry_service, session_scope
from portals.services.job_queue.service import JobQueueNotFoundError, JobQueueService
from portals.services.telemetry.schema import ComponentInputsPayload, ComponentPayload, PlaygroundPayload


def _log_component_input_telemetry(
    vertex,
    vertex_id: str,
    component_run_id: str,
    background_tasks: BackgroundTasks,
    telemetry_service,
) -> None:
    """Log component input telemetry if available."""
    if hasattr(vertex, "custom_component") and vertex.custom_component:
        inputs_dict = vertex.custom_component.get_telemetry_input_values()
        if inputs_dict:
            background_tasks.add_task(
                telemetry_service.log_package_component_inputs,
                ComponentInputsPayload(
                    component_run_id=component_run_id,
                    component_id=vertex_id,
                    component_name=vertex_id.split("-", maxsplit=1)[0],
                    component_inputs=inputs_dict,
                ),
            )


async def start_flow_build(
    *,
    flow_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    inputs: InputValueRequest | None,
    data: FlowDataRequest | None,
    files: list[str] | None,
    stop_component_id: str | None,
    start_component_id: str | None,
    log_builds: bool,
    current_user: CurrentActiveUser,
    queue_service: JobQueueService,
    flow_name: str | None = None,
    source_flow_id: uuid.UUID | None = None,
) -> str:
    """Start the flow build process by setting up the queue and starting the build task."""
    job_id = str(uuid.uuid4())
    try:
        _, event_manager = queue_service.create_queue(job_id)
        task_coro = generate_flow_events(
            flow_id=flow_id,
            background_tasks=background_tasks,
            event_manager=event_manager,
            inputs=inputs,
            data=data,
            files=files,
            stop_component_id=stop_component_id,
            start_component_id=start_component_id,
            log_builds=log_builds,
            current_user=current_user,
            flow_name=flow_name,
            source_flow_id=source_flow_id,
        )
        queue_service.start_job(job_id, task_coro)
    except Exception as e:
        await logger.aexception("Failed to create queue and start task")
        raise HTTPException(status_code=500, detail=str(e)) from e
    return job_id


async def get_flow_events_response(
    *,
    job_id: str,
    queue_service: JobQueueService,
    event_delivery: EventDeliveryType,
):
    """Get events for a specific build job, either as a stream or single event."""
    try:
        main_queue, event_manager, event_task, _ = queue_service.get_queue_data(job_id)
        if event_delivery in (EventDeliveryType.STREAMING, EventDeliveryType.DIRECT):
            if event_task is None:
                await logger.aerror(f"No event task found for job {job_id}")
                raise HTTPException(status_code=404, detail="No event task found for job")
            return await create_flow_response(
                queue=main_queue,
                event_manager=event_manager,
                event_task=event_task,
            )

        # Polling mode — get all available events
        try:
            events: list = []
            while not main_queue.empty():
                _, value, _ = await main_queue.get()
                if value is None:
                    if event_task is not None:
                        event_task.cancel()
                    event_manager.on_end(data={})
                    events.append(None)
                    break
                events.append(value.decode("utf-8"))

            if not events:
                _, value, _ = await main_queue.get()
                if value is None:
                    if event_task is not None:
                        event_task.cancel()
                    event_manager.on_end(data={})
                else:
                    events.append(value.decode("utf-8"))

            content = "\n".join([event for event in events if event is not None])
            return Response(content=content, media_type="application/x-ndjson")
        except asyncio.CancelledError as exc:
            await logger.ainfo(f"Event polling was cancelled for job {job_id}")
            raise HTTPException(status_code=499, detail="Event polling was cancelled") from exc
        except asyncio.TimeoutError:
            await logger.awarning(f"Timeout while waiting for events for job {job_id}")
            return Response(content="", media_type="application/x-ndjson")

    except JobQueueNotFoundError as exc:
        await logger.aerror(f"Job not found: {job_id}. Error: {exc!s}")
        raise HTTPException(status_code=404, detail=f"Job not found: {exc!s}") from exc
    except Exception as exc:
        if isinstance(exc, HTTPException):
            raise
        await logger.aexception(f"Unexpected error processing flow events for job {job_id}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {exc!s}") from exc


async def create_flow_response(
    queue: asyncio.Queue,
    event_manager: EventManager,
    event_task: asyncio.Task,
) -> DisconnectHandlerStreamingResponse:
    """Create a streaming response for the flow build process."""

    async def consume_and_yield() -> AsyncIterator[str]:
        while True:
            try:
                event_id, value, put_time = await queue.get()
                if value is None:
                    break
                get_time = time.time()
                yield value.decode("utf-8")
                await logger.adebug(f"Event {event_id} consumed in {get_time - put_time:.4f}s")
            except Exception as exc:  # noqa: BLE001
                await logger.aexception(f"Error consuming event: {exc}")
                break

    def on_disconnect() -> None:
        logger.debug("Client disconnected, closing tasks")
        event_task.cancel()
        event_manager.on_end(data={})

    return DisconnectHandlerStreamingResponse(
        consume_and_yield(),
        media_type="application/x-ndjson",
        on_disconnect=on_disconnect,
    )


async def generate_flow_events(
    *,
    flow_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    event_manager: EventManager,
    inputs: InputValueRequest | None,
    data: FlowDataRequest | None,
    files: list[str] | None,
    stop_component_id: str | None,
    start_component_id: str | None,
    log_builds: bool,
    current_user: CurrentActiveUser,
    flow_name: str | None = None,
    source_flow_id: uuid.UUID | None = None,
) -> None:
    """Generate events for flow building process."""
    chat_service = get_chat_service()
    telemetry_service = get_telemetry_service()
    if not inputs:
        inputs = InputValueRequest(session=str(flow_id))

    async def build_graph_and_get_order() -> tuple[list[str], list[str], Graph]:
        start_time = time.perf_counter()
        components_count = 0
        graph = None
        run_id = str(uuid.uuid4())
        try:
            flow_id_str = str(flow_id)
            async with session_scope() as fresh_session:
                graph = await create_graph(fresh_session, flow_id_str, flow_name)

            graph.set_run_id(run_id)
            first_layer = sort_vertices(graph)

            for vertex_id in first_layer:
                graph.run_manager.add_to_vertices_being_run(vertex_id)

            components_count = len(graph.vertices)
            vertices_to_run = list(graph.vertices_to_run.union(get_top_level_vertices(graph, graph.vertices_to_run)))

            await chat_service.set_cache(flow_id_str, graph)
            await log_telemetry(start_time, components_count, run_id=run_id, success=True)

        except Exception as exc:
            await log_telemetry(start_time, components_count, run_id=run_id, success=False, error_message=str(exc))

            if "stream or streaming set to True" in str(exc):
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            await logger.aexception("Error checking build status: " + str(exc))
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        return first_layer, vertices_to_run, graph

    async def log_telemetry(
        start_time: float,
        components_count: int,
        *,
        run_id: str | None = None,
        success: bool,
        error_message: str | None = None,
    ):
        background_tasks.add_task(
            telemetry_service.log_package_playground,
            PlaygroundPayload(
                playground_seconds=int(time.perf_counter() - start_time),
                playground_component_count=components_count,
                playground_success=success,
                playground_error_message=str(error_message) if error_message else "",
                playground_run_id=run_id,
            ),
        )

    async def create_graph(fresh_session, flow_id_str: str, flow_name: str | None) -> Graph:
        if inputs is not None and getattr(inputs, "session", None) is not None:
            effective_session_id = inputs.session
        else:
            effective_session_id = flow_id_str

        if not data:
            db_flow_id = source_flow_id if source_flow_id is not None else flow_id
            graph = await build_graph_from_db(
                flow_id=db_flow_id,
                session=fresh_session,
                chat_service=chat_service,
                user_id=str(current_user.id),
                session_id=effective_session_id,
            )
            if source_flow_id is not None:
                graph.flow_id = str(flow_id)
            return graph

        if not flow_name:
            result = await fresh_session.exec(select(Flow.name).where(Flow.id == flow_id))
            flow_name = result.first()

        return await build_graph_from_data(
            flow_id=flow_id_str,
            payload=data.model_dump(),
            user_id=str(current_user.id),
            flow_name=flow_name,
            session_id=effective_session_id,
        )

    def sort_vertices(graph: Graph) -> list[str]:
        try:
            return graph.sort_vertices(stop_component_id, start_component_id)
        except Exception:  # noqa: BLE001
            logger.exception("Error sorting vertices")
            return graph.sort_vertices()

    async def _build_vertex(vertex_id: str, graph: Graph, event_manager: EventManager) -> VertexBuildResponse:
        flow_id_str = str(flow_id)
        next_runnable_vertices = []
        top_level_vertices = []
        start_time = time.perf_counter()
        error_message = None

        try:
            vertex = graph.get_vertex(vertex_id)

            if is_agent_vertex(vertex):
                try:
                    inject_global_tools_into_vertex(
                        vertex,
                        flow_id=flow_id,  # already available here
                        event_manager=event_manager,  # already available here
                    )
                    await logger.adebug(f"Global tools injected into agent vertex {vertex_id}")
                except Exception as exc:  # noqa: BLE001
                    # Tool injection is non-critical — log and continue
                    await logger.awarning(f"Global tool injection failed for {vertex_id}: {exc}")
            # ─────────────────────────────────────────────────────────────────

            try:
                lock = chat_service.async_cache_locks[flow_id_str]
                vertex_build_result = await graph.build_vertex(
                    vertex_id=vertex_id,
                    user_id=str(current_user.id),
                    inputs_dict=inputs.model_dump() if inputs else {},
                    files=files,
                    get_cache=chat_service.get_cache,
                    set_cache=chat_service.set_cache,
                    event_manager=event_manager,
                )
                result_dict = vertex_build_result.result_dict
                params = vertex_build_result.params
                valid = vertex_build_result.valid
                artifacts = vertex_build_result.artifacts
                next_runnable_vertices = await graph.get_next_runnable_vertices(lock, vertex=vertex, cache=False)
                top_level_vertices = graph.get_top_level_vertices(next_runnable_vertices)

                result_data_response = ResultDataResponse.model_validate(result_dict, from_attributes=True)
            except Exception as exc:  # noqa: BLE001
                if isinstance(exc, ComponentBuildError):
                    params = exc.message
                    tb = exc.formatted_traceback
                else:
                    tb = traceback.format_exc()
                    await logger.aexception("Error building Component")
                    params = format_exception_message(exc)
                message = {"errorMessage": params, "stackTrace": tb}
                valid = False
                error_message = params
                output_label = vertex.outputs[0]["name"] if vertex.outputs else "output"
                outputs = {output_label: OutputValue(message=message, type="error")}
                result_data_response = ResultDataResponse(results={}, outputs=outputs)
                artifacts = {}
                background_tasks.add_task(graph.end_all_traces_in_context(error=exc))

            result_data_response.message = artifacts

            if not vertex.will_stream and log_builds:
                background_tasks.add_task(
                    log_vertex_build,
                    flow_id=flow_id_str,
                    vertex_id=vertex_id,
                    valid=valid,
                    params=params,
                    data=result_data_response,
                    artifacts=artifacts,
                )
            else:
                await chat_service.set_cache(flow_id_str, graph)

            timedelta = time.perf_counter() - start_time
            duration = format_elapsed_time(timedelta)
            result_data_response.duration = duration
            result_data_response.timedelta = timedelta
            vertex.add_build_time(timedelta)

            inactivated_vertices = list(graph.inactivated_vertices.union(graph.conditionally_excluded_vertices))
            graph.reset_inactivated_vertices()
            graph.reset_activated_vertices()

            if graph.stop_vertex and graph.stop_vertex in next_runnable_vertices:
                next_runnable_vertices = [graph.stop_vertex]

            if not graph.run_manager.vertices_being_run and not next_runnable_vertices:
                background_tasks.add_task(graph.end_all_traces_in_context())

            build_response = VertexBuildResponse(
                inactivated_vertices=list(set(inactivated_vertices)),
                next_vertices_ids=list(set(next_runnable_vertices)),
                top_level_vertices=list(set(top_level_vertices)),
                valid=valid,
                params=params,
                id=vertex.id,
                data=result_data_response,
            )

            _log_component_input_telemetry(vertex, vertex_id, graph.run_id, background_tasks, telemetry_service)

            background_tasks.add_task(
                telemetry_service.log_package_component,
                ComponentPayload(
                    component_name=vertex_id.split("-", maxsplit=1)[0],
                    component_id=vertex_id,
                    component_seconds=int(time.perf_counter() - start_time),
                    component_success=valid,
                    component_error_message=error_message,
                    component_run_id=graph.run_id,
                ),
            )
        except Exception as exc:
            if "vertex" in locals():
                _log_component_input_telemetry(vertex, vertex_id, graph.run_id, background_tasks, telemetry_service)

            background_tasks.add_task(
                telemetry_service.log_package_component,
                ComponentPayload(
                    component_name=vertex_id.split("-", maxsplit=1)[0],
                    component_id=vertex_id,
                    component_seconds=int(time.perf_counter() - start_time),
                    component_success=False,
                    component_error_message=str(exc),
                    component_run_id=graph.run_id,
                ),
            )
            await logger.aexception("Error building Component")
            message = parse_exception(exc)
            raise HTTPException(status_code=500, detail=message) from exc

        return build_response

    async def build_vertices(
        vertex_id: str,
        graph: Graph,
        event_manager: EventManager,
        vertex_timedeltas: list[float],
    ) -> None:
        try:
            vertex_build_response: VertexBuildResponse = await _build_vertex(vertex_id, graph, event_manager)
        except asyncio.CancelledError as exc:
            await logger.ainfo(f"Build cancelled: {exc}")
            raise

        if vertex_build_response.data.timedelta is not None:
            vertex_timedeltas.append(vertex_build_response.data.timedelta)

        try:
            vertex_build_response_json = vertex_build_response.model_dump_json()
            build_data = json.loads(vertex_build_response_json)
        except Exception as exc:
            msg = f"Error serializing vertex build response: {exc}"
            raise ValueError(msg) from exc

        event_manager.on_end_vertex(data={"build_data": build_data})

        if vertex_build_response.valid and vertex_build_response.next_vertices_ids:
            tasks = []
            for next_vertex_id in vertex_build_response.next_vertices_ids:
                task = asyncio.create_task(
                    build_vertices(
                        next_vertex_id,
                        graph,
                        event_manager,
                        vertex_timedeltas,
                    )
                )
                tasks.append(task)
            await asyncio.gather(*tasks)

    try:
        ids, vertices_to_run, graph = await build_graph_and_get_order()
    except Exception as e:
        error_message = ErrorMessage(
            flow_id=flow_id,
            exception=e,
            session_id=inputs.session,
        )
        event_manager.on_error(data=error_message.data)
        raise

    event_manager.on_vertices_sorted(data={"ids": ids, "to_run": vertices_to_run})

    # ── Inject NAP narrative payload ──────────────────────────────
    # The frontend reads entities from the local NAP repository and
    # includes them in the build request as `nap_payload`.  We extract
    # it here and place it on the graph's flow_state so that
    # BaseStateAwareComponent._get_nap_context() can read it from
    # self.graph.flow_state["nap_payload"].
    #
    # This is a remote backend — the frontend does the filesystem I/O.
    if inputs is not None and inputs.nap_payload is not None:
        graph.flow_state["nap_payload"] = inputs.nap_payload

    vertex_timedeltas: list[float] = []
    event_manager.on_build_start(data={})
    tasks = []
    for vertex_id in ids:
        task = asyncio.create_task(build_vertices(vertex_id, graph, event_manager, vertex_timedeltas))
        tasks.append(task)
    try:
        await asyncio.gather(*tasks)
    except asyncio.CancelledError:
        background_tasks.add_task(graph.end_all_traces_in_context())
        raise
    except Exception as e:
        await logger.aerror(f"Error building vertices: {e}")
        custom_component = graph.get_vertex(vertex_id).custom_component
        trace_name = getattr(custom_component, "trace_name", None)
        error_message = ErrorMessage(
            flow_id=flow_id,
            exception=e,
            session_id=graph.session_id,
            trace_name=trace_name,
        )
        event_manager.on_error(data=error_message.data)
        raise

    build_duration = sum(vertex_timedeltas)
    event_manager.on_end(data={"build_duration": build_duration})
    await graph.end_all_traces()
    await event_manager.queue.put((None, None, time.time()))


async def cancel_flow_build(
    *,
    job_id: str,
    queue_service: JobQueueService,
) -> bool:
    """Cancel an ongoing flow build job."""
    _, _, event_task, _ = queue_service.get_queue_data(job_id)

    if event_task is None:
        await logger.awarning(f"No event task found for job_id {job_id}")
        return True

    if event_task.done():
        await logger.ainfo(f"Task for job_id {job_id} is already completed")
        return True

    task_before_cleanup = event_task

    try:
        await queue_service.cleanup_job(job_id)
    except asyncio.CancelledError:
        if task_before_cleanup.cancelled():
            await logger.ainfo(f"Successfully cancelled flow build for job_id {job_id} (CancelledError caught)")
            return True
        await logger.aerror(f"CancelledError caught but task for job_id {job_id} was not cancelled")
        raise

    if task_before_cleanup.cancelled():
        await logger.ainfo(f"Successfully cancelled flow build for job_id {job_id}")
        return True

    await logger.aerror(f"Failed to cancel flow build for job_id {job_id}, task is still running")
    return False
