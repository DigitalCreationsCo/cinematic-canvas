from .starter_projects import (
    basic_prompting_graph,
    blog_writer_graph,
    cinematic_project_graph,
    document_qa_graph,
    memory_chatbot_graph,
    vector_store_rag_graph,
)


def get_starter_projects_graphs():
    return [
        cinematic_project_graph(),
        basic_prompting_graph(),
        blog_writer_graph(),
        document_qa_graph(),
        memory_chatbot_graph(),
        vector_store_rag_graph(),
    ]


def get_starter_projects_dump():
    return [g.dump() for g in get_starter_projects_graphs()]
