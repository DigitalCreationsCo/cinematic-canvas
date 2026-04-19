export async function generateStoryBlocks() {

}

import { StateGraph, StateSchema, MessagesValue, GraphNode, ConditionalEdgeRouter } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import {
  SystemMessage,
  ToolMessage
} from "@langchain/core/messages";
import { TextModelController } from "#shared/lm/text-model-controller.js";

// Graph state
const State = new StateSchema({
  messages: MessagesValue,
});

// const llm = new ChatAnthropic({
//   model: "claude-sonnet-4-6",
//   apiKey: "<your_anthropic_key>"
// });

const llm = new TextModelController();

// const llmWithTools = llm.bindTools(tools);
const llmWithTools = llm.bindTools([]);

// Nodes
const llmCall: GraphNode<typeof State> = async (state) => {
  // LLM decides whether to call a tool or not
  const result = await llmWithTools.invoke([
    {
      role: "system",
      content: "You are a helpful assistant tasked with performing arithmetic on a set of inputs."
    },
    ...state.messages
  ]);

  return {
    messages: [result]
  };
};

// const toolNode = new ToolNode(tools);
const toolNode = new ToolNode([]);

// Conditional edge function to route to the tool node or end
const shouldContinue: ConditionalEdgeRouter<typeof State, "toolNode"> = (state) => {
  const messages = state.messages;
  const lastMessage = messages.at(-1);

  // If the LLM makes a tool call, then perform an action
  if (lastMessage?.tool_calls?.length) {
    return "toolNode";
  }
  // Otherwise, we stop (reply to the user)
  return "__end__";
};

// Build workflow
const agentBuilder = new StateGraph(State)
  .addNode("llmCall", llmCall)
  .addNode("toolNode", toolNode)
  // Add edges to connect nodes
  .addEdge("__start__", "llmCall")
  .addConditionalEdges(
    "llmCall",
    shouldContinue,
    ["toolNode", "__end__"]
  )
  .addEdge("toolNode", "llmCall")
  .compile();

// Invoke
const messages = [{
  role: "user",
  content: "Add 3 and 4."
}];
const result = await agentBuilder.invoke({ messages });
console.log(result.messages);