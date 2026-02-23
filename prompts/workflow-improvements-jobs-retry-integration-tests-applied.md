The generative workflow in cinematic canvas needs comprehensive reintegration tests to control the intended functionality.

The architecture is described in `content/docs/architecture/core-system.md`.

Task 1: Review all code in src/pipeline and src/worker and src/shared, find weird bugs in the workflow, find structural errors that lead to multiplicative bugs. Look for extra retries, unacknowledged messages, control flow gaps, extraneous api calls, unhandled promises, unhandled exceptions.
Then, make a list of all the strcutural errors and bugs that are found. Do not change any code, simply compile the list and give it to me.

Task 2: Thoughtfully arrange and produce optimal integration tests to effectively test the end-to-end functionality. Test all common errors and fatal cases.

Task 3:
content/docs/deterministic-system-improvements.md
