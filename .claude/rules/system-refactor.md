---
trigger: always_on
---

The project is in the middle of a significant rebuild and refactor:

The new application directories are 'src/backend', 'src/frontend', 'src/px', 'src/sdk'.
The other directories, 'src/client', 'src/server', 'src/shared', 'src/worker', 'src/pipeline', and monolith files are deprecated. Active development will not continue in these directories, except to move old functionality into the new application systems. 

You may be asked to refactor old functionality from old source code into new application system - that will usually involve moving logic from an old source directory into the new refactored file indicated by the user.
