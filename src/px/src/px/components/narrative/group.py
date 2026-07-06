"""Group narrative component.

A *group* is a named collection of references and can be assigned to entities
(outfits, styles, world-building references, mood boards, ...).

Each piece carries:

* ``type``        — ``"image"`` or ``"prop"``
* ``name``        — a display name (filename for images, prop name for props)
* ``description`` — the piece's description from the origin (the prop's own
  description, or a description supplied with the image)
* ``caption``     — inherited from the piece's origin description
* ``image``       — the reference image (base64 data-URL, http URL, or a
  storage path like ``"{flow_id}/{file_name}"``)

The group component assembles all pieces into a combined prompt with references, invokes an
image-generation model using the piece images as reference inputs.
The group + generated image is persisted using nap.

The group itself is **ephemeral**: it is reassembled from its inputs on each
execution. The generated image is what gets persisted; the pieces always
remain tracked in the returned payload so the group never loses its members.

Outputs
-------
* **group_data** — assembled group payload (name, description, generated image,
  and the resolved list of pieces). Suitable for assigning to a Character,
  Location, Scene, etc.
"""

from __future__ import annotations

import re
import uuid
from typing import Any, TypedDict

from portals.schema import Data

from px.base.models.model import LCModelComponent
from px.base.models.unified_models import (
    get_image_generation_model_options,
    get_llm,
    handle_model_input_update,
)
from px.components.narrative.base_state_aware import BaseStateAwareComponent
from px.io import (
    DataInput,
    DictInput,
    FloatInput,
    IntInput,
    MessageTextInput,
    ModelInput,
    Output,
    StrInput,
)
from px.log.logger import logger

# Maximum number of pieces included in a single group output. When more than
# this many pieces are provided, only the first MAX_GROUP_PIECES are used.
MAX_GROUP_PIECES = 6


class GroupPiece(TypedDict):
    name: str
    type: str
    file_name: str
    file_id: str
    image: str
    description: str
    custom_description: str


def _slugify(value: str) -> str:
    """Normalize a group name into a stable asset-key suffix."""
    slug = re.sub(r"[^a-zA-Z0-9]+", "_", value.strip()).strip("_").lower()
    return slug or "unnamed"


def _deep_find_file_id_in_data(data: Any, target_name: str, _depth: int = 0) -> str | None:
    """Recursive search for a ``file_id`` value within graph node data.

    Walks dict values up to *MAX_DEPTH* levels, looking for a node whose
    ``display_name`` matches *target_name*.  When found it extracts the
    ``file_id`` from the node's ``template`` dict (the shape that graph
    processing code produces).
    """
    MAX_DEPTH = 8  # noqa: N806
    if _depth > MAX_DEPTH or not isinstance(data, dict):
        return None

    # Check display_name at the current level.
    display_name = data.get("display_name")
    if not display_name:
        nested = data.get("node")
        if isinstance(nested, dict):
            display_name = nested.get("display_name")

    if display_name == target_name:
        # Locate template — may be at data["node"]["template"] or data["template"].
        template: dict | None = None
        nested = data.get("node")
        if isinstance(nested, dict):
            template = nested.get("template")
        if not template:
            template = data.get("template")
        if isinstance(template, dict) and "file_id" in template:
            file_id_entry = template["file_id"]
            if isinstance(file_id_entry, dict):
                return file_id_entry.get("value")
            return file_id_entry

    # Recurse into every dict value.
    for value in data.values():
        if isinstance(value, dict):
            result = _deep_find_file_id_in_data(value, target_name, _depth + 1)
            if result is not None:
                return result
    return None


def _extract_image_data(result: Any, _depth: int = 0) -> tuple[bytes | None, str | None]:
    """Normalize an image-model invocation result into (bytes, data_or_url).

    Image-generation bindings return a variety of shapes; this mirrors the
    extraction strategy used by ``generate_characters.py`` and additionally
    tries to surface raw bytes when available so the image can be persisted.

    Returns ``(image_bytes, image_data)`` where exactly one may be populated.
    """
    # Depth guard to prevent infinite recursion on circular references.
    if _depth > 10:  # noqa: PLR2004
        return None, None

    if result is None:
        return None, None

    # Raw bytes → encode for storage / transport.
    if isinstance(result, bytes):
        return result, None

    if isinstance(result, str):
        # A bare base64 / URL string.
        return None, result

    if isinstance(result, list):
        # LangChain multimodal responses sometimes wrap the payload in a list.
        for item in result:
            image_bytes, image_data = _extract_image_data(item, _depth + 1)
            if image_bytes or image_data:
                return image_bytes, image_data
        return None, None

    if isinstance(result, dict):
        for key in ("image", "data", "b64_json", "url", "image_url"):
            value = result.get(key)
            if value:
                return _extract_image_data(value, _depth + 1)
        return None, None

    # Objects exposing `.content` (e.g. AIMessage).
    content = getattr(result, "content", None)
    if content is not None:
        return _extract_image_data(content, _depth + 1)

    return None, None


class GroupComponent(BaseStateAwareComponent, LCModelComponent):
    """Assemble image/prop pieces into a group and generate a reference image.

    The group is a named collection of pieces (images and/or props) that can be
    used to generate a new image where every piece is provided as a reference
    input. After generation the pieces remain tracked inside the group so it
    can be assigned to other entities (characters, locations, scenes, ...).
    """

    # Override LCModelComponent._validate_outputs since our output names are
    # group-specific (group_data) rather than the generic model-output names
    # (text_output, model_output).
    def _validate_outputs(self) -> None:
        """Validate that every declared output has a corresponding method."""
        if self.selected_output is not None and self.selected_output not in self._outputs_map:
            output_names = ", ".join(self._outputs_map)
            msg = f"selected_output '{self.selected_output}' is not valid. Must be one of: {output_names}"
            raise ValueError(msg)

    display_name = "Group"
    description = (
        "A named collection of image and prop pieces. Generates a reference "
        "image from the assembled pieces and persists it as a project asset."
    )
    icon = "box-select"
    name = "Group"

    # ── Inputs ──────────────────────────────────────────────────────────

    inputs = [
        StrInput(
            name="group_name",
            display_name="Group Name",
            info="Name of the collection (e.g. 'Outfits', 'Styles', 'World References').",
            required=True,
        ),
        MessageTextInput(
            name="group_description",
            display_name="Group Description",
            info="Overall direction for what this group represents.",
        ),
        DataInput(
            name="pieces",
            display_name="Pieces",
            info=(
                "List of pieces. Each piece is a Data/dict with: "
                "{type: 'image'|'prop', name, description, image}. "
                "A piece may also carry an inline 'custom_description'."
            ),
            is_list=True,
        ),
        DictInput(
            name="piece_overrides",
            display_name="Piece Captions",
            info="""Captions applied to the attached pieces in the prompt.
            Each piece shows its image preview and an editable caption field.
            The caption is inherited from the piece filename; edit it to customize the reference description.""",
            advanced=True,
        ),
        ModelInput(
            name="image_model",
            display_name="Image Model",
            info="The image-generation model used to produce the group's reference image.",
            model_type="image_generation",
            required=True,
            real_time_refresh=True,
        ),
        MessageTextInput(
            name="aspect_ratio",
            display_name="Aspect Ratio",
            info="Output aspect ratio (e.g. '1:1', '16:9', '9:16').",
            advanced=True,
        ),
        MessageTextInput(
            name="negative_prompt",
            display_name="Negative Prompt",
            info="Concepts to avoid in the generated image.",
            advanced=True,
        ),
        FloatInput(
            name="guidance",
            display_name="Guidance",
            info="How closely the model should follow the prompt.",
            advanced=True,
        ),
        IntInput(
            name="seed",
            display_name="Seed",
            info="Reproducibility seed (0 or blank for random).",
            advanced=True,
        ),
    ]

    outputs = [
        Output(
            display_name="Group Data",
            name="group_data",
            method="build",
        ),
    ]

    def build_config(self):
        return {
            "image_model": {
                "display_name": "Image Model",
                "info": "The image-generation model used to produce the group's reference image.",
            },
        }

    def update_build_config(self, build_config, field_value, field_name=None):
        return handle_model_input_update(
            self,
            dict(build_config),
            field_value,
            field_name,
            cache_key_prefix="image_model_options",
            model_field_name="image_model",
            get_options_func=get_image_generation_model_options,
        )

    async def build(
        self,
    ) -> Data:
        """Assemble the group, generate the reference image, and persist it.

        Returns a ``Data`` payload with the group name, description, generated
        image, and the resolved list of pieces. Pieces always remain tracked
        in the returned payload.
        """
        if not self.group_name or not str(self.group_name).strip():
            return Data(data={"error": "Group name is required."})

        overrides = self.piece_overrides or {}

        resolved_pieces = self._normalize_pieces(self.pieces, overrides)
        if not resolved_pieces:
            return Data(data={"error": "Group has no pieces to assemble."})

        project_id, namespace = self._resolve_project_context()

        prompt = self._build_prompt(self.group_name, self.group_description, resolved_pieces)

        image_bytes, image_data = await self._generate_image(
            image_model=self.image_model,
            prompt=prompt,
            resolved_pieces=resolved_pieces,
            aspect_ratio=self.aspect_ratio,
            negative_prompt=self.negative_prompt,
            guidance=self.guidance,
            seed=self.seed,
        )

        if not image_bytes and not image_data:
            logger.warning("Group image generation returned no image.")
            generated = {"data": None, "url": None, "asset_key": None, "persisted": False}
        else:
            generated = await self._persist_generated_image(
                image_bytes=image_bytes,
                image_data=image_data,
                group_name=self.group_name,
                project_id=project_id,
                namespace=namespace,
            )

        nap_info = await self._persist_group_to_nap(
            group_name=self.group_name,
            group_description=self.group_description,
            resolved_pieces=resolved_pieces,
            generated_image=generated,
            project_id=project_id,
        )

        return Data(
            data={
                "name": self.group_name,
                "description": self.group_description,
                "generated_image": generated,
                "pieces": resolved_pieces,
                "project_id": str(project_id),
                "nap_uri": nap_info.get("nap_uri"),
                "nap_commit_hash": nap_info.get("nap_commit_hash"),
                # Provide a standardized image_view payload so the frontend
                # can open a gallery viewer for the group's pieces. Each
                # entry includes a url (data-url, http url or storage path),
                # optional file_id, filename and a caption to show in the
                # viewer. "current" defaults to 0.
                "image_view": {
                    "type": "group",
                    "images": [
                        {
                            "url": p.get("image"),
                            "file_id": p.get("file_id"),
                            "file_name": p.get("file_name"),
                            "caption": p.get("custom_description") or p.get("description") or p.get("name"),
                        }
                        for p in resolved_pieces
                    ],
                    "current": 0,
                },
            },
        )

    def _normalize_pieces(self, pieces: Any, overrides: dict) -> list[GroupPiece]:
        """Resolve the raw pieces input into a list of piece dicts.

        Each piece's caption is resolved independently using this order::

            inline ``custom_description`` → overrides[name] → file_name
            → inherited description → name → ""

        * ``file_name`` is the filename from the origin component and is used
          as the default caption. It always takes priority over the inherited
          description so that the caption is never contaminated by long prop
          description text from a different component.
        * The ``overrides`` dict is keyed by piece name; only matches for the
          current piece's name are applied (never cross-contaminate).
        * ``custom_description`` is an inline override carried on the piece
          Data itself (set programmatically by upstream components).

        At most *MAX_GROUP_PIECES* (6) pieces are returned. Any additional
        pieces are silently truncated and a warning is logged.
        """
        if not pieces:
            return []

        raw_pieces = list(pieces) if isinstance(pieces, (list, tuple)) else [pieces]

        if len(raw_pieces) > MAX_GROUP_PIECES:
            logger.warning(
                "Group received %d pieces; truncating to %d (first %d used).",
                len(raw_pieces),
                MAX_GROUP_PIECES,
                MAX_GROUP_PIECES,
            )
            raw_pieces = raw_pieces[:MAX_GROUP_PIECES]

        resolved: list[GroupPiece] = []
        for raw in raw_pieces:
            piece = self._coerce_piece(raw)
            if piece is None:
                continue

            raw_name = piece.get("name") or piece.get("file_name") or piece.get("image", "").rsplit("/", 1)[-1] or ""
            file_name = piece.get("file_name") or ""
            if not file_name:
                image_path = piece.get("image") or ""
                file_name = image_path.rsplit("/", 1)[-1] if "/" in image_path else image_path

            inherited_desc = piece.get("description") or ""
            custom_inline = piece.get("custom_description")

            # Override lookup — ONLY match when the piece has a non-empty name
            # so pieces without a name never accidentally share an override.
            override = overrides.get(raw_name) if raw_name else None

            # Attempt to recover file_id from graph if missing.
            file_id = piece.get("file_id")
            if not file_id:
                file_id = self._find_file_id_in_graph(raw_name)

            # ── Caption resolution ─────────────────────────────────────────
            # Each step is evaluated per-piece.  file_name always beats
            # inherited_description so that the default caption is the filename
            # from the origin component, NEVER a different piece's description.
            final_caption = (
                custom_inline
                or (override if override is not None else None)
                or file_name
                or inherited_desc
                or raw_name
                or ""
            )

            resolved.append(
                {
                    "name": raw_name,
                    "type": piece.get("type") or "image",
                    "description": inherited_desc,
                    "custom_description": final_caption,
                    "image": piece.get("image"),
                    "file_id": file_id,
                    "file_name": file_name,
                }
            )
        return resolved

    def _find_file_id_in_graph(self, piece_name: str) -> str | None:
        """Attempt to find file_id for a piece in the graph.

        Uses recursive traversal to search through the graph node data
        structure, which may be nested several levels deep depending on
        how nodes are serialised.  Falls back silently when the graph is
        not available or the piece name is not found.
        """
        if not self.graph or not hasattr(self.graph, "nodes"):
            return None

        for node in self.graph.nodes:
            node_data = node.data
            if not node_data:
                continue
            file_id = _deep_find_file_id_in_data(node_data, piece_name)
            if file_id:
                return file_id

        logger.debug("file_id not found in graph for piece '%s'", piece_name)
        return None

    @staticmethod
    def _coerce_piece(raw: Any) -> dict | None:
        """Returns a *copy* of the underlying dict so that callers always get
        an independent snapshot — two calls for the same Data object will
        never share a mutable reference.
        This prevents subtle bugs where
        the same ``.data`` dict is reused across pieces or mutated by
        graph-processing code between iterations.
        """  # noqa: D205
        if raw is None:
            return None

        # px Data objects expose a ``.data`` dict — copy it so each piece
        # carries its own snapshot independent of the Data object's state.
        if hasattr(raw, "data") and isinstance(raw.data, dict):
            return dict(raw.data)

        if isinstance(raw, dict):
            return dict(raw)

        # Objects that behave like mappings.
        if hasattr(raw, "items") and hasattr(raw, "get"):
            try:
                return dict(raw)  # type: ignore[arg-type]
            except Exception:  # pragma: no cover - defensive # noqa: BLE001
                return None
        return None

    def _build_prompt(
        self,
        group_name: str,
        group_description: str,
        resolved_pieces: list[GroupPiece],
    ) -> str:
        """Compose a text prompt describing the group and its pieces.

        Pieces are formatted as a structured grid where each entry includes the
        piece name, its caption (resolved description), type, and an image
        reference. This gives the model clear per-piece context alongside the
        reference images passed as multimodal content.
        """
        lines: list[str] = [f"Group: {group_name}"]
        if group_description:
            lines.append(group_description)
        lines.append("")
        lines.append("Pieces (grid):")
        for i, piece in enumerate(resolved_pieces, 1):
            name = piece["name"]
            description = piece["custom_description"]
            piece_type = piece["type"]
            has_image = bool(piece["image"])

            # Grid cell header
            lines.append(f"  [{i}] {name} ({piece_type})")
            lines.append(f"      Description: {description}")
            # Image indicator
            if has_image:
                lines.append(f"      Image: attached reference — {name}")
            else:
                lines.append("      Image: none")
        return "\n".join(lines)

    def _resolve_project_context(self) -> tuple[str, str]:
        """Resolve (project_id, storage_namespace) from the active flow state.

        Falls back to (None, None) when project state can't be resolved (e.g.
        standalone/test runs) — image generation still works, persistence is
        skipped.
        """
        try:
            folder = self.get_folder()
        except Exception as e:  # pragma: no cover - defensive # noqa: BLE001
            logger.warning(f"Could not resolve project state for group: {e}")
            return None, None

        project_id = folder.id
        user_id = self.user_id

        # Mirrors portals.api.v2.files.get_storage_namespace for project files.
        namespace = f"{user_id}/{project_id}"

        return project_id, namespace

    async def _generate_image(
        self,
        *,
        image_model: Any,
        prompt: str,
        resolved_pieces: list[GroupPiece],
        aspect_ratio: str | None,
        negative_prompt: str | None,
        guidance: float | None,
        seed: int | None,
    ) -> tuple[bytes | None, str | None]:
        """Invoke the image model with the pieces as reference inputs.

        Returns ``(image_bytes, image_data)`` where one may be populated.
        """
        try:
            image_llm = get_llm(model=image_model, user_id=getattr(self, "user_id", None))
        except Exception as e:  # pragma: no cover - defensive
            logger.error(f"Failed to resolve image model: {e}")
            raise

        # Build a multimodal message: text prompt + each piece image as a
        # reference content part. Not all image-generation bindings accept
        # multimodal content; fall back to a plain prompt string if assembling
        # the reference parts fails or no usable images are available.
        message = await self._build_reference_message(prompt, resolved_pieces)

        try:
            result = image_llm.invoke(message)
        except Exception as first_err:  # noqa: BLE001
            logger.warning(
                "Multimodal invocation failed for group '%s': %s. Retrying with text-only prompt.",
                getattr(self, "group_name", "unknown"),
                first_err,
            )
            try:
                result = image_llm.invoke(prompt)
            except Exception as e:  # pragma: no cover - defensive # noqa: BLE001
                logger.error(f"Image generation failed: {e}")
                return None, None

        # aspect_ratio / negative_prompt / guidance / seed are surfaced here for
        # future per-provider plumbing; the base invoke contract above does not
        # accept them as kwargs today.
        _ = (aspect_ratio, negative_prompt, guidance, seed)

        return _extract_image_data(result)

    async def _build_reference_message(self, prompt: str, resolved_pieces: list[GroupPiece]):
        """Build a multimodal HumanMessage carrying the prompt + piece images.

        Each piece's caption text is placed *immediately before* its image in
        the content parts array so the model can associate each reference image
        with its caption.  Always returns a ``HumanMessage`` (never a bare
        string), so callers can rely on a consistent type.
        """
        from langchain_core.messages import HumanMessage

        content_parts: list[dict] = []

        # 1. Main group prompt
        if prompt:
            content_parts.append({"type": "text", "text": prompt})

        # 2. Per-piece reference — caption text then image, interleaved
        for piece in resolved_pieces:
            name = piece.get("name", "unnamed")
            caption = piece.get("custom_description") or ""

            # Caption text immediately before the image
            if caption:
                content_parts.append(
                    {
                        "type": "text",
                        "text": f"Reference — {name}: {caption}",
                    }
                )

            # Image reference — pass both image_ref and file_id so the
            # resolution layer can prefer the v2 API when available.
            image_ref = piece.get("image")
            file_id = piece.get("file_id")
            if image_ref:
                try:
                    content_parts.append(await self._image_ref_to_content(image_ref, file_id))
                except Exception as e:  # noqa: BLE001
                    logger.debug(f"Skipping piece image '{name}': {e}")

        if len(content_parts) <= 1:
            # No usable reference images — still return a HumanMessage with
            # just the text prompt so the caller always gets a consistent type.
            text = prompt or "Generate an image based on the described group pieces."
            if not prompt:
                logger.warning("Group has no prompt text and no reference images — using a default prompt.")
            return HumanMessage(content=[{"type": "text", "text": text}])

        return HumanMessage(content=content_parts)

    async def _image_ref_to_content(self, image_ref: str, file_id: str | None = None) -> dict:
        """Convert an image reference into a multimodal content part dict.

        Accepts data-URLs, http(s) URLs, or storage paths
        (``"{flow_id}/{file_name}"``). Storage paths are read via the storage
        service and embedded as base64 data-URLs.

        When a ``file_id`` is available the v2 API construct
        ``/api/v2/files/images/{file_id}`` is preferred for efficiency — the
        model provider fetches the image directly instead of embedding base64.
        When no ``file_id`` is present the image is fetched asynchronously
        from storage and embedded as a data URL.
        """
        if not isinstance(image_ref, str):
            msg = f"Unsupported image reference type: {type(image_ref)}"
            raise TypeError(msg)

        # Already a data URL or http(s) URL — use as-is.
        if image_ref.startswith(("data:", "http://", "https://")):
            return {"type": "image_url", "image_url": {"url": image_ref}}

        # Prefer the v2 API by-ID endpoint when a file_id is available.
        # The model provider will fetch the image from this URL itself,
        # avoiding the overhead of base64-embedding in the request.
        if file_id:
            return {
                "type": "image_url",
                "image_url": {"url": f"/api/v2/files/images/{file_id}"},
            }

        # Fall back to fetching from storage and embedding as a data URL.
        # This is the safe universal path that works everywhere (local dev,
        # air-gapped networks, etc.), but produces larger request payloads.
        from px.utils.image import async_create_image_content_dict

        return await async_create_image_content_dict(image_ref)

    async def _persist_group_to_nap(
        self,
        *,
        group_name: str,
        group_description: str,
        resolved_pieces: list[GroupPiece],
        generated_image: dict | None,
        project_id: str,
    ) -> dict | None:
        """Persist the entire group as a **narrative entity** via NAP.

        Stores the group name, description, resolved pieces (with captions),
        and generated image reference as a versioned NAP manifest.  The
        resulting ``nap_uri`` is returned in the group output so downstream
        narrative components (Characters, Locations, …) can reference it.

        """
        try:
            from portals.services.nap import get_nap_service

            nap_service = get_nap_service()
            if nap_service is None:
                logger.warning("NAP service not available — skipping NAP persistence.")
                return None
        except Exception as e:  # noqa: BLE001
            logger.warning(f"NAP service unavailable: {e}")
            return None

        # Build the group manifest — mirrors the output payload schema.
        pieces_data: list[dict] = [
            {
                "name": p.get("name"),
                "type": p.get("type"),
                "description": p.get("description"),
                "caption": p.get("custom_description"),
                "inherited_description": p.get("description"),
                "image": p.get("image"),
                "file_id": p.get("file_id"),
                "file_name": p.get("file_name"),
            }
            for p in resolved_pieces
        ]

        manifest: dict[str, Any] = {
            "name": group_name,
            "description": group_description or "",
            "pieces": pieces_data,
        }

        if generated_image and generated_image.get("url"):
            manifest["generated_image"] = {
                "url": generated_image["url"],
                "data": generated_image.get("data"),
                "asset_key": generated_image.get("asset_key"),
                "persisted": generated_image.get("persisted", False),
            }

        try:
            result = await nap_service.create_entity(
                entity_type="group",
                project_id=project_id,
                initial_data=manifest,
            )
            logger.info(
                "Persisted group '%s' to NAP: uri=%s commit=%s",
                group_name,
                result.uri,
                result.commit_hash,
            )
            return {  # noqa: TRY300
                "nap_uri": result.uri,
                "nap_commit_hash": result.commit_hash,
            }
        except Exception as e:  # noqa: BLE001
            logger.warning(f"Failed to persist group to NAP: {e}")
            return None

    async def _write_asset_version(
        self,
        *,
        project_id: Any,
        asset_key: str,
        data_uri: str,
        group_name: str,
    ) -> bool:
        """Record a project-scoped asset version in the database.

        The generated image is already saved to storage by the caller
        (``_persist_generated_image``).  This method creates the metadata
        entry (``AssetEntry`` + ``AssetVersionRow``) so the asset appears
        in the project's asset registry.

        Best-effort: returns ``True`` on success, ``False`` on any failure
        (the image remains usable via the storage path).
        """
        try:
            from uuid import UUID

            from portals.services.database.models.asset_entry.model import AssetEntry
            from portals.services.database.models.asset_version.model import AssetVersionRow
            from sqlmodel import select

            from px.services.deps import get_db_service

            project_uuid = UUID(str(project_id)) if not isinstance(project_id, UUID) else project_id

            db_service = get_db_service()
            with db_service.with_session() as session:
                # Find existing asset entry for this project + key.
                stmt = select(AssetEntry).where(
                    AssetEntry.project_id == project_uuid,
                    AssetEntry.asset_key == asset_key,
                )
                entry = session.exec(stmt).first()

                if not entry:
                    entry = AssetEntry(
                        project_id=project_uuid,
                        asset_key=asset_key,
                        head=0,
                        best=0,
                    )
                    session.add(entry)
                    session.commit()
                    session.refresh(entry)

                next_version = (entry.head or 0) + 1

                version = AssetVersionRow(
                    asset_entry_id=entry.id,
                    version=next_version,
                    data=data_uri,
                    type="image",
                    metadata={"name": group_name},
                )
                session.add(version)

                entry.head = next_version
                session.add(entry)
                session.commit()

            return True  # noqa: TRY300
        except Exception as e:  # noqa: BLE001
            logger.warning(f"Failed to record asset version for group '{group_name}': {e}")
            return False

    async def _persist_generated_image(
        self,
        *,
        image_bytes: bytes | None,
        image_data: str | None,
        group_name: str,
        project_id: Any,
        namespace: str | None,
    ) -> dict:
        """Persist the generated image as a project-scoped asset.

        Persistence is best-effort: on any failure the image is still returned
        in the payload with ``persisted=False``.

        Returns a dict with keys ``data``, ``url``, ``asset_key``, ``persisted``.
        ``data`` / ``url`` are always the *original* model output (data URL,
        http URL, or storage path after a successful write) and are never a
        sentinel value.
        """
        asset_key = f"group:{_slugify(group_name)}"

        if project_id is None or namespace is None:
            return {
                "data": image_data,
                "url": image_data,
                "asset_key": asset_key,
                "persisted": False,
            }

        data_uri, storage_bytes = self._to_storable(image_bytes, image_data)
        if data_uri is None and storage_bytes is None:
            return {
                "data": image_data,
                "url": image_data,
                "asset_key": asset_key,
                "persisted": False,
            }

        try:
            file_name = f"group_{uuid.uuid4().hex}.png"
            storage_path = f"{namespace}/{file_name}"

            # 1. Write bytes to storage (produces the addressable handle).
            if storage_bytes is not None:
                if await self._save_to_storage(namespace, file_name, storage_bytes):
                    data_uri = storage_path  # now set to the real path
                else:
                    # Storage save failed — can't persist without a storage URI.
                    # Return the original model output with persisted=False.
                    return {
                        "data": image_data,
                        "url": image_data,
                        "asset_key": asset_key,
                        "persisted": False,
                    }
            else:
                # else: data_uri is already a URL (http/data URL) — store that string.

                # 2. Record an asset version (project-scoped) via direct DB session.
                persisted = await self._write_asset_version(
                    project_id=project_id,
                    asset_key=asset_key,
                    data_uri=data_uri,
                    group_name=group_name,
                )

                return {
                    "data": data_uri,
                    "url": data_uri,
                    "asset_key": asset_key,
                    "persisted": persisted,
                }
        except Exception as e:  # noqa: BLE001
            logger.warning(f"Failed to persist group image as asset: {e}")
            # data_uri is already resolved to the storage path (if storage
            # save succeeded) or the original URL/data-URL — return it so the
            # caller never loses the addressable handle after a successful
            # storage write.
            return {
                "data": data_uri,
                "url": data_uri,
                "asset_key": asset_key,
                "persisted": False,
            }

    @staticmethod
    def _to_storable(image_bytes: bytes | None, image_data: str | None) -> tuple[str | None, bytes | None]:
        """Normalize generation output into (data_uri, bytes_for_storage).

        * ``data_uri`` is ``None`` when bytes need to be stored first — it is
          set to the actual storage path only after a successful save.
        * ``data_uri`` is the http(s) URL string when no bytes are involved.
        * ``data_uri`` is the base64 ``data:`` URL when the input was already
          a data URL but decoding failed (defensive fallback).

        Returns ``(None, None)`` when there is nothing to persist.
        """
        if image_bytes is not None:
            # Raw bytes — data_uri is unknown until we save to storage.
            return None, image_bytes

        if image_data:
            # Inline base64 data-URL → decode to bytes for storage.
            if image_data.startswith("data:") and ";base64," in image_data:
                import base64

                try:
                    _, b64 = image_data.split(";base64,", 1)
                    return None, base64.b64decode(b64)
                except Exception:  # pragma: no cover - defensive # noqa: BLE001
                    # Decoding failed — keep the original data URL as fallback.
                    return image_data, None
            # http(s) URL → store the string directly (no bytes needed).
            return image_data, None

        return None, None

    async def _save_to_storage(self, namespace: str, file_name: str, data: bytes) -> bool:
        """Write image bytes to the storage service under the project namespace.

        Returns True if the file was written successfully, False otherwise.
        """
        from px.services.deps import get_storage_service

        storage = get_storage_service()
        if storage is None:
            logger.warning("No storage service available; skipping storage write.")
            return False
        await storage.save_file(flow_id=namespace, file_name=file_name, data=data)
        return True
