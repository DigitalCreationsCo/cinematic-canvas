1st time i used dthis framework

I want to implement a helper functon ( or an llm function tool ) that enables outputting storyboard elemements and assets into native UI nodes. 

The goal is to enable a semi-autonomous workflow, such as cinematic canvas already features, within the node-based UI to create the initial storyboard given user-rpovided ledgers and assts, such as character and location, style references. 
the intended flow is 1 user provides world assets and world ledgers, intial prompt, other assets such as set pieces, music, etc. 2 agent creates storyboard pieces, character, and frame images, enrichs the user provided storyboard, preps for video generation. 3 user review s the generated storyboard assets, makes adjustments. 4 user runs the workflow to generate video elements, the workflow autonomously bridges scene clips together, using previous frame images and other compositonal methods in the backend.

For now, let's chat to clarify the reuqirements and intednded functionality.
Ask me creative and technical questions exhaustively until you have 100% certainty of the requirements. Don't generate any code.
We are working to refine a master refactoring prompt for the coding agent to one-shot the refactoring.

Note: This is a massive refacotring job, touching client code and backend code, database schemas, and application schema. 
Ask me questions exhaustively in order to define a comprehensive prompt with fine-grained technical implementation details.
We should continue the questioning to understand all requirmeents for a successful and complete refactoring to the node-based UI workflow.

The goal is to produce a single comprehensive coding assistant prompt to complete the refactor to a node-basd UI workflow. The coding agent must on-eshot the implmentation usccessfully with minimal guidance. All nstrcutions and technical details must be contained the prompt or documentation. Boilerplate code for the node-based workflow will be provided to the agent in ./node-based/src. The boilerplate must be integrated in the client app, integrating and enhacnign existing interfaces and state management where applicable.

node-based ui will be implemented in the world builder component, as well as the porject dashboard component. The components will be similar in presentation, while the project screen has an emphasis on generating video using world assets. the emphasis on world build is to generate world assets, define world lore, and create immutable scene as code ledgers (.sac). The scene-as-code ledgers are the immutable record through which world creation is enabled and protected. The node-based ui will be used to create and edit these ledgers, as well as to generate and edit storyboard assets. The node-based ui will also be used to generate and edit video elements, as well as to generate and edit storyboard assets.

.sac files are json files that are used to store scene-as-code ledgers. They are stored in tenant-owned version-controlled repositories. 
They are versioned using git. They are immutable, meaning that they cannot be changed once they are created. They are used to store the scene-as-code ledgers. 
The scene-as-code implmentaton must support creating remote repositories via the application's backend, and managing them via the frontend.
There are two types of ledgers - base ledgers and project ledgers. base ledgers feature granular role-based access control - controls decide who can edit a ledger, and who can produce a project from a ledger. Project ledgers are created by users who are given access to base ledgers.
Think "licensing" an IP for a spin-off - An originator can license the world to other creators to build projects - create characters and locations in the world, and reference existing characters, locations, in-world-events and items, given the respective permissisons.

All of this functionality is enabled within the application's world builder and proejct builder.
Ask questions exhaustively to fully understand the requirements and produce the final comprehensive coding prompt to refactor the application to a node-based UI workflow. The coding prompt must be self-contained and include all necessary instructions and technical details for the coding agent to successfully implement the refactoring in a single pass.

====
2nd attempt with this freamwork

The goal is to refine useEntityStore, the existing store.ts, api.ts, and server routes to handle updating entities in db and updating versioned assets (entity-scoped in a different table).
I also need effciently update these records, and update the store. 
Also, I need a debounce to optimize the updates and mitigate query overhead. 
Ideally, I would like to one-shot this again with a single, detailed coding assistant prompt.

The coding prompt must be self-contained and include all necessary instructions and technical details for the coding agent to successfully implement the enhancements in a single pass.
For now, let's chat to clarify the reuqirements and intednded functionality. Ask me creative and technical questions exhaustively until you have 100% certainty of the requirements. Don't generate any code. We are working to refine a master refactoring prompt for the coding agent to one-shot the improvements