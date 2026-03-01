interface TrackMetadata {
    request_id: number;
    metadata: Record<string, string>;
}
interface TrackScore {
    request_id: number;
    score: number;
    name?: string;
}
interface TrackPrompt {
    request_id: number;
    prompt_name: string;
    prompt_input_variables: Record<string, unknown>;
    version?: number;
    label?: string;
}
interface TrackGroup {
    request_id: number;
    group_id: number;
}
interface Pagination {
    page?: number;
    per_page?: number;
    label?: string;
}
interface CustomProvider {
    id: number;
    name: string;
    client: string;
    base_url: string;
    workspace_id: number;
    api_key: string;
}
interface GetPromptTemplateParams {
    version?: number;
    label?: string;
    provider?: string;
    input_variables?: Record<string, unknown>;
    metadata_filters?: Record<string, string>;
    model?: string;
    model_parameter_overrides?: Record<string, unknown>;
}
declare const templateFormat: readonly [ "f-string", "jinja2" ];
type TemplateFormat = (typeof templateFormat)[ number ];
type ImageUrl = {
    url: string;
};
type TextContent = {
    id?: string;
    type: "text";
    text: string;
    annotations?: Record<string, unknown>[];
};
type ThinkingContent = {
    id?: string;
    signature?: string;
    type: "thinking";
    thinking: string;
};
type CodeContent = {
    id?: string;
    container_id?: string;
    type: "code";
    code: string;
};
type ImageContent = {
    type: "image_url";
    image_url: ImageUrl;
};
type Media = {
    title: string;
    type: string;
    url: string;
};
type MediaContent = {
    type: "media";
    media: Media;
};
type MediaVariable = {
    type: "media_variable";
    name: string;
};
type Content = TextContent | ThinkingContent | CodeContent | ImageContent | MediaContent | MediaVariable;
type Function_ = {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
};
type Tool = {
    id: string;
    tool_id?: string;
    type: "function";
    function: Function_;
};
type FunctionCall = {
    name: string;
    arguments: string;
};
type SystemMessage = {
    role: "system";
    input_variables?: string[];
    template_format?: TemplateFormat;
    content: Content[];
    name?: string;
};
type UserMessage = {
    role: "user";
    input_variables?: string[];
    template_format?: TemplateFormat;
    content: Content[];
    name?: string;
};
type ToolCall = {
    id: string;
    type: "function";
    function: FunctionCall;
};
type AssistantMessage = {
    role: "assistant";
    input_variables?: string[];
    template_format?: TemplateFormat;
    content?: Content[];
    function_call?: FunctionCall;
    name?: string;
    tool_calls?: ToolCall[];
};
type FunctionMessage = {
    role: "function";
    input_variables?: string[];
    template_format?: TemplateFormat;
    content?: Content[];
    name: string;
};
type ToolMessage = {
    role: "tool";
    input_variables?: string[];
    template_format?: TemplateFormat;
    content: Content[];
    tool_call_id: string;
    name?: string;
};
type PlaceholderMessage = {
    role: "placeholder";
    name: string;
};
type DeveloperMessage = {
    role: "developer";
    input_variables?: string[];
    template_format?: TemplateFormat;
    content: Content[];
};
type Message = SystemMessage | UserMessage | AssistantMessage | FunctionMessage | ToolMessage | PlaceholderMessage | DeveloperMessage;
type ChatFunctionCall = {
    name: string;
};
type CompletionPromptTemplate = {
    type: "completion";
    template_format?: TemplateFormat;
    content: Content[];
    input_variables?: string[];
};
type ChatToolChoice = {
    type: "function";
    function: ChatFunctionCall;
};
type ToolChoice = string | ChatToolChoice;
type ChatPromptTemplate = {
    type: "chat";
    messages: Message[];
    functions?: Function_[];
    function_call?: "auto" | "none" | ChatFunctionCall;
    input_variables?: string[];
    tools?: Tool[];
    tool_choice?: ToolChoice;
};
type PromptTemplate = CompletionPromptTemplate | ChatPromptTemplate;
type Model = {
    api_type?: string;
    provider: string;
    name: string;
    parameters: Record<string, unknown>;
};
type Metadata = {
    model?: Model;
};
type BasePromptTemplate = {
    prompt_name: string;
    tags?: string[];
};
type PromptBlueprint = {
    prompt_template: PromptTemplate;
    commit_message?: string;
    metadata?: Metadata;
};
type PublishPromptTemplate = BasePromptTemplate & PromptBlueprint & {
    release_labels?: string[];
};
interface ProviderBaseURL {
    id: number;
    name: string;
    provider: string;
    url: string;
}
interface BasePromptTemplateResponse {
    id: number;
    prompt_name: string;
    tags: string[];
    prompt_template: PromptTemplate;
    commit_message?: string;
    metadata?: Metadata;
    provider_base_url?: ProviderBaseURL;
    custom_provider?: CustomProvider;
}
interface PublishPromptTemplateResponse extends BasePromptTemplateResponse {
}
interface GetPromptTemplateResponse extends BasePromptTemplateResponse {
    version: number;
    llm_kwargs: Record<string, unknown> | null;
}
interface ListPromptTemplatesResponse extends BasePromptTemplateResponse {
    version: number;
}
interface RunRequest {
    promptName: string;
    tags?: string[];
    metadata?: Record<string, string>;
    groupId?: number;
    stream?: boolean;
    promptVersion?: number;
    promptReleaseLabel?: string;
    inputVariables?: Record<string, unknown>;
    modelParameterOverrides?: Record<string, unknown>;
    provider?: string;
    model?: string;
}
interface LogRequest {
    provider: string;
    model: string;
    input: PromptTemplate;
    output: PromptTemplate;
    request_start_time: number;
    request_end_time: number;
    parameters?: Record<string, unknown>;
    tags?: string[];
    metadata?: Record<string, string>;
    prompt_name?: string;
    prompt_version_number?: number;
    prompt_input_variables?: Record<string, unknown>;
    input_tokens?: number;
    output_tokens?: number;
    price?: number;
    function_name?: string;
    score?: number;
    prompt_id?: number;
    score_name?: string;
    api_type?: string;
    status?: "SUCCESS" | "WARNING" | "ERROR";
    error_type?: string;
    error_message?: string;
}
interface RequestLog {
    id: number;
    prompt_version: PromptBlueprint;
}
interface WorkflowRequest {
    workflowName: string;
    inputVariables?: Record<string, any>;
    metadata?: Record<string, string>;
    workflowLabelName?: string | null;
    workflowVersion?: number | null;
    returnAllOutputs?: boolean;
}
interface WorkflowResponse {
    success?: boolean;
    message?: string;
    error?: string;
    status?: string;
    value?: string;
}

declare class GroupManager {
    apiKey: string;
    baseURL: string;
    throwOnError: boolean;
    constructor(apiKey: string, baseURL: string, throwOnError?: boolean);
    create: () => Promise<number | boolean>;
}

declare const wrapWithSpan: (functionName: string, func: Function, attributes?: Record<string, any>) => (...args: any[]) => any;

declare class TemplateManager {
    apiKey: string;
    baseURL: string;
    throwOnError: boolean;
    constructor(apiKey: string, baseURL: string, throwOnError?: boolean);
    get: (promptName: string, params?: Partial<GetPromptTemplateParams>) => Promise<GetPromptTemplateResponse | null>;
    publish: (body: PublishPromptTemplate) => Promise<PublishPromptTemplateResponse>;
    all: (params?: Pagination) => Promise<ListPromptTemplatesResponse[]>;
}

declare class TrackManager {
    apiKey: string;
    baseURL: string;
    throwOnError: boolean;
    constructor(apiKey: string, baseURL: string, throwOnError?: boolean);
    group: (body: TrackGroup) => Promise<boolean>;
    metadata: (body: TrackMetadata) => Promise<boolean>;
    prompt: (body: TrackPrompt) => Promise<boolean>;
    score: (body: TrackScore) => Promise<boolean>;
}

interface ClientOptions {
    apiKey?: string;
    enableTracing?: boolean;
    workspaceId?: number;
    throwOnError?: boolean;
    baseURL?: string;
}
declare class PromptLayer {
    apiKey: string;
    baseURL: string;
    templates: TemplateManager;
    group: GroupManager;
    track: TrackManager;
    enableTracing: boolean;
    throwOnError: boolean;
    wrapWithSpan: typeof wrapWithSpan;
    constructor({ apiKey, baseURL, enableTracing, throwOnError, }?: ClientOptions);
    get Anthropic(): any;
    get OpenAI(): any;
    run({ promptName, promptVersion, promptReleaseLabel, inputVariables, tags, metadata, groupId, modelParameterOverrides, stream, provider, model, }: RunRequest): Promise<AsyncGenerator<{
        request_id: number | null;
        raw_response: any;
        prompt_blueprint: any;
    }, void, unknown> | {
        request_id: any;
        raw_response: any;
        prompt_blueprint: any;
    }>;
    runWorkflow({ workflowName, inputVariables, metadata, workflowLabelName, workflowVersion, // This is the version number, not the version ID
        returnAllOutputs, }: WorkflowRequest): Promise<WorkflowResponse>;
    logRequest(body: LogRequest): Promise<RequestLog | null>;
}

export { type ClientOptions, PromptLayer, LogRequest };

