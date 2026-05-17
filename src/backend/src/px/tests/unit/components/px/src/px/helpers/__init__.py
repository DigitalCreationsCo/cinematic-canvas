"""Helpers module for the px package.

This module automatically chooses between the full portals implementation
(when available) and the px implementation (when standalone).
"""

from px.utils.portals_utils import has_portals_memory

# Import the appropriate implementation
if has_portals_memory():
    try:
        # Import full portals implementation
        # Base Model
        from portals.helpers.base_model import (
            BaseModel,
            SchemaField,
            build_model_from_schema,
            coalesce_bool,
        )

        # Custom
        from portals.helpers.custom import (
            format_type,
        )

        # Data
        from portals.helpers.data import (
            clean_string,
            data_to_text,
            data_to_text_list,
            docs_to_data,
            safe_convert,
        )

        # Flow
        from portals.helpers.flow import (
            build_schema_from_inputs,
            get_arg_names,
            get_flow_by_id_or_name,
            get_flow_inputs,
            list_flows,
            list_flows_by_flow_folder,
            list_flows_by_folder_id,
            load_flow,
            run_flow,
        )
    except ImportError:
        # Fallback to px implementation if portals import fails
        # Base Model
        from px.helpers.base_model import (
            BaseModel,
            SchemaField,
            build_model_from_schema,
            coalesce_bool,
        )

        # Custom
        from px.helpers.custom import (
            format_type,
        )

        # Data
        from px.helpers.data import (
            clean_string,
            data_to_text,
            data_to_text_list,
            docs_to_data,
            safe_convert,
        )

        # Flow
        from px.helpers.flow import (
            build_schema_from_inputs,
            get_arg_names,
            get_flow_by_id_or_name,
            get_flow_inputs,
            list_flows,
            list_flows_by_flow_folder,
            list_flows_by_folder_id,
            load_flow,
            run_flow,
        )
else:
    # Use px implementation
    # Base Model
    from px.helpers.base_model import (
        BaseModel,
        SchemaField,
        build_model_from_schema,
        coalesce_bool,
    )

    # Custom
    from px.helpers.custom import (
        format_type,
    )

    # Data
    from px.helpers.data import (
        clean_string,
        data_to_text,
        data_to_text_list,
        docs_to_data,
        safe_convert,
    )

    # Flow
    from px.helpers.flow import (
        build_schema_from_inputs,
        get_arg_names,
        get_flow_by_id_or_name,
        get_flow_inputs,
        list_flows,
        list_flows_by_flow_folder,
        list_flows_by_folder_id,
        load_flow,
        run_flow,
    )

# Export the available functions
__all__ = [
    "BaseModel",
    "SchemaField",
    "build_model_from_schema",
    "build_schema_from_inputs",
    "clean_string",
    "coalesce_bool",
    "data_to_text",
    "data_to_text_list",
    "docs_to_data",
    "format_type",
    "get_arg_names",
    "get_flow_by_id_or_name",
    "get_flow_inputs",
    "list_flows",
    "list_flows_by_flow_folder",
    "list_flows_by_folder_id",
    "load_flow",
    "run_flow",
    "safe_convert",
]
