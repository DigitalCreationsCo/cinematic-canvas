# Interactive CLI v2 - Continuous Session Guide

## What's New in v2

The enhanced Interactive CLI provides a **continuous session experience** with smart state management. Unlike v1, it doesn't exit after each command — instead, it automatically returns to the menu so you can chain operations seamlessly.

## Key Features

### 🔄 Continuous Operation
- **Auto-return to menu** after each command (2-second countdown)
- **Press Enter anytime** to skip the countdown
- No more restarting the CLI for each operation
- Perfect for testing workflows with multiple steps

### 📊 Session State Management
- **Operation history** tracking (last 20 operations)
- **Recent operations** displayed at the top of each screen
- **Session statistics** showing success/failure rates
- **Runtime duration** tracking

### 🎯 Smart ID Memory
- **Remembers last project ID** — option to reuse it
- **Remembers last job ID** — quick reuse for lifecycle testing
- Reduces repetitive typing
- Great for testing job chains on same project

### 📜 Session History Viewer
- View all operations in current session
- See timestamps, success/failure status
- Review project and job IDs used
- Track what you've tested

### ⚡ Quick Navigation
- **Breadcrumb navigation** shows where you are
- **Recent operations banner** on every screen
- **Session stats** in main menu
- Seamless flow between menus

## Usage

### Starting the CLI

```bash
# Run the enhanced interactive CLI
npx tsx scripts/pubsub-testing/interactive-cli-v2.ts

# Or add to package.json
npm run test:interactive
```

### Auto-Return Behavior

After each operation:
```
✅ Published rich storyboard: 01932b4e-7c8a-7890

⏎  Returning to menu in 2s (press Enter to continue now)
```

- **Wait 2 seconds** → Automatically returns to menu
- **Press Enter** → Immediately returns to menu
- No interruption to your workflow!

### Using Smart ID Memory

When prompted for a project ID:
```
? Project ID:
❯ Use last project ID (01932b4e-7c8a...)
  Generate new UUID
  Enter custom ID
```

Simply select the first option to reuse the last project ID — perfect for testing multiple jobs on the same project!

## Complete Workflow Example

Here's a typical testing workflow showing the continuous session in action:

### Scenario: Test Complete Pipeline

**Step 1: Create Project**
```
Main Menu → Full State Events → Publish Rich Storyboard
  → Generate new UUID
  → Creates project-001

✅ Published rich storyboard
⏎  Returning to menu in 2s...
```

**Step 2: Dispatch Initial Job**
```
Main Menu → Job Events → Dispatch Single Job
  → Select "Expand Creative Prompt"
  → Use last project ID (project-001)  ← Smart memory!
  
✅ Dispatched EXPAND_CREATIVE_PROMPT
⏎  Returning to menu in 2s...
```

**Step 3: Simulate Job Completion**
```
Main Menu → Job Events → Job Lifecycle Events → Job Completed
  → Use last job ID  ← Smart memory!
  → Use last project ID  ← Smart memory!

✅ Published JOB_COMPLETED
⏎  Returning to menu in 2s...
```

**Step 4: View History**
```
Main Menu → View Session History

📊 Session Statistics:
   Started: 2:30:15 PM
   Duration: 3m 42s
   Total Operations: 3
   Successful: 3 ✅
   Failed: 0 ❌
   Last Project ID: project-001

📋 Operation History:
   1. ✅ 2:33:57 PM - JOB-EVENT
      JOB_COMPLETED
      Project: project-001...
   2. ✅ 2:32:45 PM - DISPATCH-JOB
      EXPAND_CREATIVE_PROMPT
      Project: project-001...
   3. ✅ 2:30:23 PM - FULL-STATE
      Rich storyboard (5 scenes)
      Project: project-001...
```

All of this happens **without exiting the CLI** — smooth, continuous flow!

## Common Use Cases

### Use Case 1: Testing Job Lifecycle

Perfect for testing a complete job from dispatch to completion:

1. **Dispatch job** → remembers job ID
2. **Start job** → reuse job ID
3. **Complete job** → reuse job ID + project ID
4. All in one session, no ID copying!

### Use Case 2: Multi-Project Testing

Test multiple projects quickly:

1. **Create Project A** → rich scenario
2. **Create Project B** → audio scenario
3. **Create Project C** → minimal scenario
4. **View history** → see all projects created

### Use Case 3: Debugging Workflows

When debugging, iterate rapidly:

1. **Publish full state** → generate ID
2. **Dispatch job chain** → reuse project ID
3. **Check if issue reproduces**
4. **Repeat** with different scenarios

### Use Case 4: Learning the System

Perfect for exploration:

1. **Try different scenarios** → see what they create
2. **Experiment with job types** → understand the flow
3. **View session history** → review what you learned
4. No pressure — just explore!

## Menu Structure

```
Main Menu
├── 📦 Full State Events
│   ├── Publish Minimal Project
│   ├── Publish Rich Storyboard
│   └── Publish Audio Project
│
├── 🎯 Job Events
│   ├── Dispatch Single Job (10 types)
│   ├── Dispatch Job Chain
│   └── Job Lifecycle Events
│       ├── Job Dispatched
│       ├── Job Started
│       ├── Job Completed
│       ├── Job Failed
│       └── Job Cancelled
│
├── 🎬 Workflows
│   ├── Standard Workflow
│   └── Audio Workflow
│
├── 📜 View Session History
├── 📊 View Publisher Status
└── 👋 Exit (with session summary)
```

## Screen Layouts

### Main Menu
```
═══════════════════════════════════════════════════════════
  🎬 PubSub Testing - Interactive CLI
═══════════════════════════════════════════════════════════

📋 Recent Operations:
   ✅ 2:33:57 PM - JOB_COMPLETED
   ✅ 2:32:45 PM - EXPAND_CREATIVE_PROMPT
   ✅ 2:30:23 PM - Rich storyboard (5 scenes)

📊 Session: 3 ops (3 ✅, 0 ❌) | 3m 42s

? What would you like to do?
❯ 📦 Full State Events
  🎯 Job Events
  🎬 Workflows
  ─────────────────
  📜 View Session History
  📊 View Publisher Status
  ─────────────────
  👋 Exit
```

### After Operation
```
✅ Published rich storyboard: 01932b4e-7c8a-7890

⏎  Returning to menu in 2s (press Enter to continue now)
```

### Session History View
```
═══════════════════════════════════════════════════════════
  Session History
═══════════════════════════════════════════════════════════

📊 Session Statistics:
   Started: 2:30:15 PM
   Duration: 5m 23s
   Total Operations: 5
   Successful: 4 ✅
   Failed: 1 ❌
   Last Project ID: 01932b4e-7c8a-7890-abcd-ef1234567890
   Last Job ID: 01932c1a-2b3c-7def-9876-543210fedcba

📋 Operation History:
   1. ❌ 2:35:30 PM - JOB-EVENT
      JOB_FAILED: Test error
      Project: 01932b4e...
   2. ✅ 2:34:12 PM - WORKFLOW
      Standard workflow (3 scenes)
      Project: 01932b4e...
   ...

Press Enter to continue...
```

## Tips & Best Practices

### 🎯 Efficient Testing
- Use **Smart ID Memory** to avoid retyping IDs
- Run **View Session History** periodically to track progress
- **Chain operations** without leaving the CLI

### 🔍 Debugging
- Check **Recent Operations** banner for quick status
- Use **Session History** to review what worked/failed
- **Project/Job ID memory** makes it easy to retry operations

### 📚 Learning
- Explore freely — the CLI stays open
- Try different scenarios without commitment
- Review history to understand what you did

### ⚡ Speed
- Press **Enter immediately** to skip countdown
- Use **arrow keys** for fast menu navigation
- **Remembered IDs** speed up repetitive operations

## Comparison: v1 vs v2

| Feature | v1 (Original) | v2 (Continuous) |
|---------|---------------|-----------------|
| **Session** | Exits after command | Continuous session |
| **Auto-return** | Manual "Press Enter" | 2s countdown + skip |
| **ID Memory** | No | Yes (project + job) |
| **History** | No | Full session history |
| **Stats** | No | Real-time statistics |
| **Recent Ops** | No | Shown on all screens |
| **Use Case** | One-off operations | Workflow testing |

## When to Use v2

**Perfect for:**
- Testing complete workflows
- Job lifecycle testing (dispatch → start → complete)
- Multi-project testing
- Learning and exploration
- Debugging and iteration

**Consider v1 or CLI for:**
- Single one-off operations
- CI/CD automation (use Enhanced CLI)
- Scripted testing (use Enhanced CLI or REPL)

## Package.json Setup

```json
{
  "scripts": {
    "test:interactive": "tsx scripts/pubsub-testing/interactive-cli-v2.ts",
    "test:interactive:v1": "tsx scripts/pubsub-testing/interactive-cli.ts",
    "test:cli": "tsx scripts/pubsub-testing/cli.ts",
    "test:repl": "tsx scripts/pubsub-testing/repl.ts"
  }
}
```

## Keyboard Shortcuts

- **↑/↓ Arrow Keys** - Navigate menu options
- **Enter** - Select option / Skip countdown
- **Ctrl+C** - Exit immediately (emergency)

## Exit Behavior

When you select **Exit** from the main menu:

```
👋 Session Summary:
   Duration: 12m 34s
   Total Operations: 15
   Successful: 14 ✅
   Failed: 1 ❌

Goodbye!
```

Clean exit with session summary!

## Troubleshooting

### "Operation history not showing"
- History only tracks operations done in current session
- Restart shows empty history
- Maximum 20 operations kept

### "Smart ID memory not working"
- IDs are only remembered within same session
- First operation won't have "last ID" option
- Use the ID from the operation you just ran

### "Auto-return too fast/slow"
- Default is 2 seconds
- Job chain uses 3 seconds (longer operation)
- Always press Enter to skip

## Summary

The Interactive CLI v2 provides a **seamless, continuous testing experience** with smart state management. Perfect for:

✅ Testing complete workflows without interruption  
✅ Rapid iteration during debugging  
✅ Learning the system through exploration  
✅ Tracking what you've tested in session history  
✅ Avoiding repetitive ID entry with smart memory  

Try it out and experience the difference!

```bash
npx tsx scripts/pubsub-testing/interactive-cli-v2.ts
```