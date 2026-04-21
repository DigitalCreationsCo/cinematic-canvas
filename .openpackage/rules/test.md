---
trigger: always_on
---

Test files are organized by domain and business requirements, not by files.
The test file heirachry is: application(server, client, pipeline, worker, shared) -> domain (e.g. projects, entities, assets, db, language models (lm), etc.) -> feature (e.g. scene-generation, asset-upload, etc.) -> test-type (e.g. unit, integration, e2e, etc.)

Always use vitest for testing.

Test mocks are centralized in 'src/shared/mocks/'. When mocking functions, objects, and classes, always check 'src/shared/mocks/' first to see if a mock already exists. If it does, import and use it. If not, create a new mock in 'src/shared/mocks/' and use it.