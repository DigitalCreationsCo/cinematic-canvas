"""Group narrative component.

A *group* is a named collection of image and prop *pieces*. Groups are used to
organize reference material that can be assigned to narrative entities
(outfits, styles, world-building references, mood boards, ...).

Each piece carries:

* ``type``        — ``"image"`` or ``"prop"``
* ``name``        — a display name (filename for images, prop name for props)
* ``description`` — the piece's **inherited** description (the prop's own
  description, or a description supplied with the image)
* ``image``       — the reference image (base64 data-URL, http URL, or a
  storage path like ``"{flow_id}/{file_name}"``)

A piece may additionally carry an inline ``custom_description``. Resolution
order for the *final* description used in the generated prompt is:

    inline ``custom_description``
        → ``piece_overrides[<name>]``
            → inherited ``description``

The component assembles all pieces into a combined prompt, invokes an
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
from typing import Any

from portals.schema import Data

from px.base.models.model import LCModelComponent
from px.base.models.unified_models import (
    get_image_generation_model_options,
    get_llm,
    handle_model_input_update,
)
from px.components.narrative.base_state_aware import BaseStateAwareComponent
from px.io import (
    BoolInput,
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

# ── Field name constants ─────────────────────────────────────────────

_GROUP_NAME = "group_name"
_GROUP_DESCRIPTION = "group_description"
_PIECES = "pieces"
_PIECE_OVERRIDES = "piece_overrides"

_IMAGE_MODEL = "image_model"
_ASPECT_RATIO = "aspect_ratio"
_NEGATIVE_PROMPT = "negative_prompt"
_GUIDANCE = "guidance"
_SEED = "seed"
_PERSIST_ASSET = "persist_asset"

_ASSET_KEY_PREFIX = "group"

# Maximum number of pieces included in a single group output. When more than
# this many pieces are provided, only the first MAX_GROUP_PIECES are used.
MAX_GROUP_PIECES = 6


def _slugify(value: str) -> str:
    """Normalize a group name into a stable asset-key suffix."""
    slug = re.sub(r"[^a-zA-Z0-9]+", "_", value.strip()).strip("_").lower()
    return slug or "unnamed"


def _extract_image_data(result: Any) -> tuple[bytes | None, str | None]:
    """Normalize an image-model invocation result into (bytes, data_or_url).

    Image-generation bindings return a variety of shapes; this mirrors the
    extraction strategy used by ``generate_characters.py`` and additionally
    tries to surface raw bytes when available so the image can be persisted.

    Returns ``(image_bytes, image_data)`` where exactly one may be populated.
    """
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
            image_bytes, image_data = _extract_image_data(item)
            if image_bytes or image_data:
                return image_bytes, image_data
        return None, None

    if isinstance(result, dict):
        for key in ("image", "data", "b64_json", "url", "image_url"):
            value = result.get(key)
            if value:
                return _extract_image_data(value)
        return None, None

    # Objects exposing `.content` (e.g. AIMessage).
    content = getattr(result, "content", None)
    if content is not None:
        return _extract_image_data(content)

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
            name=_GROUP_NAME,
            display_name="Group Name",
            info="Name of the collection (e.g. 'Outfits', 'Styles', 'World References').",
            required=True,
        ),
        MessageTextInput(
            name=_GROUP_DESCRIPTION,
            display_name="Group Description",
            info="Overall direction for what this group represents.",
        ),
        DataInput(
            name=_PIECES,
            display_name="Pieces",
            info=(
                "List of pieces. Each piece is a Data/dict with: "
                "{type: 'image'|'prop', name, description, image}. "
                "A piece may also carry an inline 'custom_description'."
            ),
            is_list=True,
        ),
        DictInput(
            name=_PIECE_OVERRIDES,
            display_name="Piece Captions",
            info="Captions applied to the attached pieces in the prompt. Each piece shows its image preview and an editable caption field. The caption is inherited from the piece filename; edit it to customize the reference description.",
            advanced=True,
        ),
        ModelInput(
            name=_IMAGE_MODEL,
            display_name="Image Model",
            info="The image-generation model used to produce the group's reference image.",
            model_type="image_generation",
            required=True,
            real_time_refresh=True,
        ),
        MessageTextInput(
            name=_ASPECT_RATIO,
            display_name="Aspect Ratio",
            info="Output aspect ratio (e.g. '1:1', '16:9', '9:16').",
            advanced=True,
        ),
        MessageTextInput(
            name=_NEGATIVE_PROMPT,
            display_name="Negative Prompt",
            info="Concepts to avoid in the generated image.",
            advanced=True,
        ),
        FloatInput(
            name=_GUIDANCE,
            display_name="Guidance",
            info="How closely the model should follow the prompt.",
            advanced=True,
        ),
        IntInput(
            name=_SEED,
            display_name="Seed",
            info="Reproducibility seed (0 or blank for random).",
            advanced=True,
        ),
        BoolInput(
            name=_PERSIST_ASSET,
            display_name="Persist Generated Image?",
            info=(
                "If true, the generated image is saved as a project asset "
                "(reusing the existing asset_entries system — no DB migration)."
            ),
            value=True,
        ),
    ]

    # ── Outputs ─────────────────────────────────────────────────────────
    outputs = [
        Output(
            display_name="Group Data",
            name="group_data",
            method="build",
        ),
    ]

    def build_config(self):
        return {
            _IMAGE_MODEL: {
                "display_name": "Image Model",
                "info": "The image-generation model used to produce the group's reference image.",
            },
            _PERSIST_ASSET: {
                "display_name": "Persist Generated Image?",
                "info": (
                    "If true, the generated image is saved as a project asset "
                    "(reusing the existing asset_entries system — no DB migration)."
                ),
            },
        }

    def update_build_config(self, build_config, field_name, field_value, session_id):
        # Wire real-time model-option refresh, mirroring ImageModelComponent.
        return handle_model_input_update(
            build_config,
            field_name,
            field_value,
            session_id,
            model_input_name=_IMAGE_MODEL,
            get_options_func=get_image_generation_model_options,
        )

    # ── Output method ───────────────────────────────────────────────────
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

        # 1. Normalize pieces and resolve each piece's final description.
        resolved_pieces = self._normalize_pieces(self.pieces, overrides)
        if not resolved_pieces:
            return Data(data={"error": "Group has no pieces to assemble."})

        # 2. Resolve project context for asset persistence.
        project_id, namespace = self._resolve_project_context()

        # 3. Build the combined prompt from the group + pieces.
        prompt = self._build_prompt(self.group_name, self.group_description, resolved_pieces)

        # 4. Resolve the image model and generate.
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
            # 5. Persist as a project asset (best-effort, never blocks output).
            generated = await self._persist_generated_image(
                image_bytes=image_bytes,
                image_data=image_data,
                group_name=self.group_name,
                project_id=project_id,
                namespace=namespace,
                persist_asset=self.persist_asset,
            )

        # 6. Persist group data to NAP (best-effort, never blocks output).
        nap_info = await self._persist_group_to_nap(
            group_name=self.group_name,
            group_description=self.group_description,
            resolved_pieces=resolved_pieces,
            generated_image=generated,
            project_id=project_id,
        )

        # 7. Return the assembled group payload — pieces always remain tracked.
        return Data(
            data={
                "name": self.group_name,
                "description": self.group_description,
                "generated_image": generated,
                "pieces": resolved_pieces,
                "project_id": str(project_id) if project_id else None,
                "nap_uri": nap_info.get("nap_uri") if nap_info else None,
                "nap_commit_hash": nap_info.get("nap_commit_hash") if nap_info else None,
            },
        )

    # ── Helpers ─────────────────────────────────────────────────────────
    def _normalize_pieces(self, pieces: Any, overrides: dict) -> list[dict]:
        """Resolve the raw pieces input into a list of piece dicts.

        Resolution order for each piece's final description (used as the
        ``caption``)::

            inline ``custom_description`` → overrides[name] → inherited description

        At most *MAX_GROUP_PIECES* (6) pieces are returned. Any additional
        pieces are silently truncated and a warning is logged.
        """
        if not pieces:
            return []

        # `pieces` may arrive as a single object, a list, or a tuple.
        if isinstance(pieces, (list, tuple)):
            raw_pieces = list(pieces)
        else:
            raw_pieces = [pieces]

        # Cap at MAX_GROUP_PIECES.
        if len(raw_pieces) > MAX_GROUP_PIECES:
            logger.warning(
                "Group received %d pieces; truncating to %d (first %d used).",
                len(raw_pieces),
                MAX_GROUP_PIECES,
                MAX_GROUP_PIECES,
            )
            raw_pieces = raw_pieces[:MAX_GROUP_PIECES]

        resolved: list[dict] = []
        for raw in raw_pieces:
            piece = self._coerce_piece(raw)
            if piece is None:
                continue

            name = piece.get("name") or piece.get("file_name") or ""
            inherited = piece.get("description") or ""
            custom_inline = piece.get("custom_description")
            override = overrides.get(name)

            # Attempt to recover file_id from graph if missing
            file_id = piece.get("file_id")
            if not file_id:
                file_id = self._find_file_id_in_graph(name)

            # Resolution order:
            #   inline custom_description → overrides[name] → inherited description → file_name → ""
            file_name = piece.get("file_name") or ""
            final_description = custom_inline or (override if override is not None else inherited) or file_name or ""
            caption = final_description  # the resolved caption

            resolved.append(
                {
                    "type": piece.get("type") or "image",
                    "name": name,
                    "description": final_description,
                    "caption": caption,
                    "inherited_description": inherited,
                    "image": piece.get("image"),
                    "file_id": file_id,
                    "file_name": file_name,
                }
            )
        return resolved

    def _find_file_id_in_graph(self, piece_name: str) -> str | None:
        """Attempt to find file_id for a piece in the graph."""
        if not self.graph or not hasattr(self.graph, "nodes"):
            return None

        for node in self.graph.nodes:
            # Check for display_name in node.data or node.data.node
            node_data = node.data
            if not node_data:
                continue

            # The node data structure can be complex, check both locations
            display_name = node_data.get("display_name")
            if not display_name and "node" in node_data:
                display_name = node_data["node"].get("display_name")

            if display_name == piece_name:
                template = node_data.get("node", {}).get("template", {})
                if "file_id" in template:
                    return template["file_id"].get("value")
        return None

    @staticmethod
    def _coerce_piece(raw: Any) -> dict | None:
        """Extract a piece dict from a Data/dict/object input."""
        if raw is None:
            return None

        # px Data objects expose a `.data` dict.
        if hasattr(raw, "data") and isinstance(raw.data, dict):
            return raw.data

        if isinstance(raw, dict):
            return raw

        # Objects that behave like mappings.
        if hasattr(raw, "items") and hasattr(raw, "get"):
            try:
                return dict(raw)  # type: ignore[arg-type]
            except Exception:  # pragma: no cover - defensive
                return None
        return None

    def _build_prompt(
        self,
        group_name: str,
        group_description: str,
        resolved_pieces: list[dict],
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
            name = piece.get("name") or "(unnamed)"
            caption = piece.get("caption") or piece.get("description") or ""
            piece_type = piece.get("type") or "image"
            has_image = bool(piece.get("image"))

            # Grid cell header
            lines.append(f"  [{i}] {name} ({piece_type})")

            # Caption — the piece description override becomes the visible caption
            if caption:
                lines.append(f"      Caption: {caption}")

            # Image indicator
            if has_image:
                lines.append(f"      Image: attached reference — {name}")
            else:
                lines.append("      Image: none")

        return "\n".join(lines)

    def _resolve_project_context(self) -> tuple[Any, str | None]:
        """Resolve (project_id, storage_namespace) from the active flow state.

        Falls back to (None, None) when project state can't be resolved (e.g.
        standalone/test runs) — image generation still works, persistence is
        skipped.
        """
        try:
            folder = self.get_folder()
        except Exception as e:  # pragma: no cover - defensive
            logger.warning(f"Could not resolve project state for group: {e}")
            return None, None

        if not folder:
            return None, None

        project_id = getattr(folder, "id", None)
        user_id = getattr(self, "user_id", None)

        namespace = None
        if project_id is not None and user_id is not None:
            # Mirrors portals.api.v2.files.get_storage_namespace for project files.
            namespace = f"{user_id}/{project_id}"

        return project_id, namespace

    async def _generate_image(
        self,
        *,
        image_model: Any,
        prompt: str,
        resolved_pieces: list[dict],
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
            return None, None

        # Build a multimodal message: text prompt + each piece image as a
        # reference content part. Not all image-generation bindings accept
        # multimodal content; fall back to a plain prompt string if assembling
        # the reference parts fails or no usable images are available.
        message = self._build_reference_message(prompt, resolved_pieces)

        try:
            result = image_llm.invoke(message)
        except Exception as first_err:
            logger.warning(
                "Multimodal invocation failed for group '%s': %s. Retrying with text-only prompt.",
                getattr(self, "group_name", "unknown"),
                first_err,
            )
            try:
                result = image_llm.invoke(prompt)
            except Exception as e:  # pragma: no cover - defensive
                logger.error(f"Image generation failed: {e}")
                return None, None

        # aspect_ratio / negative_prompt / guidance / seed are surfaced here for
        # future per-provider plumbing; the base invoke contract above does not
        # accept them as kwargs today.
        _ = (aspect_ratio, negative_prompt, guidance, seed)

        return _extract_image_data(result)

    def _build_reference_message(self, prompt: str, resolved_pieces: list[dict]):
        """Build a multimodal HumanMessage carrying the prompt + piece images.

        Each piece's caption text is placed *immediately before* its image in
        the content parts array so the model can associate each reference image
        with its caption.  Falls back to the plain prompt string when image
        references can't be resolved (so the caller can still attempt
        generation without refs).
        """
        content_parts: list[dict] = []

        # 1. Main group prompt
        if prompt:
            content_parts.append({"type": "text", "text": prompt})

        # 2. Per-piece reference — caption text then image, interleaved
        for piece in resolved_pieces:
            name = piece.get("name", "unnamed")
            caption = piece.get("caption") or ""

            # Caption text immediately before the image
            if caption:
                content_parts.append(
                    {
                        "type": "text",
                        "text": f"Reference — {name}: {caption}",
                    }
                )

            # Image reference
            image_ref = piece.get("image")
            if image_ref:
                try:
                    content_parts.append(self._image_ref_to_content(image_ref))
                except Exception as e:
                    logger.debug(f"Skipping piece image '{name}': {e}")

        if len(content_parts) <= 1:
            # No usable reference images — just use the text prompt.
            if not prompt:
                logger.warning("Group has no prompt text and no reference images — using a default prompt.")
                return "Generate an image based on the described group pieces."
            return prompt

        try:
            from langchain_core.messages import HumanMessage

            return HumanMessage(content=content_parts)
        except Exception:  # pragma: no cover - defensive
            return prompt

    def _image_ref_to_content(self, image_ref: str) -> dict:
        """Convert an image reference into a multimodal content part dict.

        Accepts data-URLs, http(s) URLs, or storage paths
        (``"{flow_id}/{file_name}"``). Storage paths are read via the storage
        service and embedded as base64 data-URLs using the existing
        ``create_image_content_dict`` utility.
        """
        if not isinstance(image_ref, str):
            msg = f"Unsupported image reference type: {type(image_ref)}"
            raise TypeError(msg)

        # Already a data URL or http(s) URL.
        if image_ref.startswith(("data:", "http://", "https://")):
            return {"type": "image_url", "image_url": {"url": image_ref}}

        # Treat as a storage path — resolve via the shared utility.
        from px.utils.image import create_image_content_dict

        return create_image_content_dict(image_ref)

    async def _persist_group_to_nap(
        self,
        *,
        group_name: str,
        group_description: str,
        resolved_pieces: list[dict],
        generated_image: dict | None,
        project_id: Any,
    ) -> dict | None:
        """Persist the entire group as a **narrative entity** via NAP.

        Stores the group name, description, resolved pieces (with captions),
        and generated image reference as a versioned NAP manifest.  The
        resulting ``nap_uri`` is returned in the group output so downstream
        narrative components (Characters, Locations, …) can reference it.

        Persistence is best-effort — on any failure the build still succeeds
        and the group is returned with ``nap_uri`` set to ``None``.
        """
        project_id_str = str(project_id) if project_id else None
        if not project_id_str:
            logger.debug("No project context — skipping NAP persistence.")
            return None

        try:
            from portals.services.nap import get_nap_service

            nap_service = get_nap_service()
            if nap_service is None:
                logger.warning("NAP service not available — skipping NAP persistence.")
                return None
        except Exception as e:
            logger.warning(f"NAP service unavailable: {e}")
            return None

        # Build the group manifest — mirrors the output payload schema.
        pieces_data: list[dict] = []
        for p in resolved_pieces:
            pieces_data.append(
                {
                    "name": p.get("name"),
                    "type": p.get("type"),
                    "description": p.get("description"),
                    "caption": p.get("caption"),
                    "inherited_description": p.get("inherited_description"),
                    "image": p.get("image"),
                    "file_id": p.get("file_id"),
                    "file_name": p.get("file_name"),
                }
            )

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
                project_id=project_id_str,
                initial_data=manifest,
            )
            logger.info(
                "Persisted group '%s' to NAP: uri=%s commit=%s",
                group_name,
                result.uri,
                result.commit_hash,
            )
            return {
                "nap_uri": result.uri,
                "nap_commit_hash": result.commit_hash,
            }
        except Exception as e:
            logger.warning(f"Failed to persist group to NAP: {e}")
            return None

    async def _persist_generated_image(
        self,
        *,
        image_bytes: bytes | None,
        image_data: str | None,
        group_name: str,
        project_id: Any,
        namespace: str | None,
        persist_asset: bool,
    ) -> dict:
        """Persist the generated image as a project-scoped asset.

        Reuses the existing ``asset_entries`` / ``asset_versions`` /
        ``media_objects`` tables (migration 0020_add_canvas_tables) via
        ``AssetVersionManager`` — no DB migration required.

        Persistence is best-effort: on any failure the image is still returned
        in the payload with ``persisted=False``.
        """
        asset_key = f"{_ASSET_KEY_PREFIX}:{_slugify(group_name)}"

        if not persist_asset or project_id is None or namespace is None:
            return {
                "data": image_data,
                "url": image_data,
                "asset_key": asset_key,
                "persisted": False,
            }

        # Normalize to a storable data string + bytes (for storage write).
        data_uri, storage_bytes = self._to_storable(image_bytes, image_data)
        if not data_uri:
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
                    data_uri = storage_path
                # else: keep data_uri as the base64 data URL or http URL
            # else: data_uri is already a URL — store that string directly.

            # 2. Record an asset version (project-scoped) via AssetVersionManager.
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
        except Exception as e:
            logger.warning(f"Failed to persist group image as asset: {e}")
            return {
                "data": image_data or data_uri,
                "url": image_data or data_uri,
                "asset_key": asset_key,
                "persisted": False,
            }

    @staticmethod
    def _to_storable(image_bytes: bytes | None, image_data: str | None) -> tuple[str | None, bytes | None]:
        """Normalize generation output into (data_uri, bytes_for_storage).

        - Raw bytes are stored as-is and addressed by the storage path.
        - A data-URL string is decoded back to bytes so it can be stored.
        - An http(s) URL is stored verbatim (no bytes needed).
        """
        if image_bytes is not None:
            return "pending", image_bytes

        if image_data:
            # Inline base64 data-URL → decode to bytes for storage.
            if image_data.startswith("data:") and ";base64," in image_data:
                import base64

                try:
                    _, b64 = image_data.split(";base64,", 1)
                    return "pending", base64.b64decode(b64)
                except Exception:  # pragma: no cover - defensive
                    return image_data, None
            # http(s) URL → store the string directly.
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

    async def _write_asset_version(
        self,
        *,
        project_id: Any,
        asset_key: str,
        data_uri: str,
        group_name: str,
    ) -> bool:
        """Create a project-scoped asset version for the generated image."""
        try:
            from portals.services.asset_version_manager import AssetVersionManager, Scope

            from px.services.deps import session_scope
        except Exception as e:  # pragma: no cover - defensive
            logger.warning(f"Asset persistence modules unavailable: {e}")
            return False

        try:
            async with session_scope() as session:
                manager = AssetVersionManager(session)
                await manager.create_versioned_assets(
                    scope=Scope(
                        project_id=project_id,
                        entity_type="project",
                    ),
                    asset_keys=[asset_key],
                    type_="image",
                    data_list=[data_uri],
                    metadata={"source": "group", "group_name": group_name},
                )
            return True
        except Exception as e:  # pragma: no cover - defensive
            logger.warning(f"AssetVersionManager write failed: {e}")
            return False
