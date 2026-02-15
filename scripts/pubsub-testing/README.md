# PubSub Testing Toolkit - Complete Suite

A comprehensive set of tools for testing Google Cloud PubSub events in your cinematic-canvas pipeline.

## 🎯 Quick Start

```bash
# Install dependencies
npm install inquirer @types/inquirer

# Choose your interface:

# 1. Interactive CLI (Recommended for new users)
npm run pubsub:interactive

# 2. Enhanced CLI (Best for automation)
npm run pubsub:cli -- list-scenarios

# 3. REPL (Power users)
npm run pubsub:repl

# 4. Programmatic (Integration tests)
# Import in your code
```

## 🛠️ The Four Tools

### 1. Interactive CLI v2 ⭐ Recommended for Most Users

**Continuous session with smart state management**

```bash
npm run pubsub:interactive
```

**Perfect for:**
- 🎓 Learning the system
- 🔬 Testing complete workflows
- 🎯 Manual exploratory testing
- 📚 Onboarding new team members

**Key Features:**
- ✅ Doesn't exit after commands (continuous session)
- ✅ Remembers project/job IDs (smart memory)
- ✅ Session history tracking
- ✅ Auto-return to menu (2s countdown)
- ✅ Recent operations display
- ✅ No commands to memorize

**[📖 Full Guide](./INTERACTIVE_CLI_V2_GUIDE.md)**

---

### 2. Enhanced CLI

**Professional command-line interface with comprehensive features**

```bash
npm run pubsub:cli -- <command> [options]
```

**Perfect for:**
- 🤖 CI/CD automation
- 📝 Scripted test sequences
- 📦 Batch operations
- 🎯 Precise control

**Key Features:**
- ✅ Discovery commands (list-scenarios, list-jobs, preview)
- ✅ Professional output formatting
- ✅ Batch operations from JSON files
- ✅ Comprehensive help and documentation
- ✅ Dry-run mode, verbose/quiet modes
- ✅ Shell-scriptable

**[📖 Full Guide](./CLI_GUIDE.md)** | **[⚡ Quick Reference](./CLI_QUICK_REFERENCE.md)**

---

### 3. REPL

**Interactive programming environment**

```bash
npm run pubsub:repl
```

**Perfect for:**
- ⚡ Power users
- 🔧 Building complex test scenarios
- 🔄 Quick iterations
- 💻 Custom test logic

**Key Features:**
- ✅ Full JavaScript/TypeScript access
- ✅ Chainable async operations
- ✅ Direct access to testing module
- ✅ Script development
- ✅ Flexible and powerful

---

### 4. Programmatic API

**Import and use in your code**

```typescript
import pubsubTesting from "./index.js";
```

**Perfect for:**
- 🧪 Integration tests
- 🛠️ Custom tooling
- 🎯 Test frameworks
- 🤖 Advanced automation

**Key Features:**
- ✅ Type-safe API
- ✅ Full programmatic control
- ✅ Promise-based interface
- ✅ Import into any TypeScript/JavaScript code

---

## 📊 Comparison Table

| Use Case | Best Tool |
|----------|-----------|
| 🎓 Learning the system | Interactive CLI v2 |
| 🔬 Testing workflows | Interactive CLI v2 |
| 🤖 CI/CD automation | Enhanced CLI |
| 📝 Batch operations | Enhanced CLI |
| ⚡ Quick one-off tests | REPL or Interactive v2 |
| 🧪 Integration tests | Programmatic API |
| 🔧 Complex scripting | REPL or Programmatic |
| 📚 Onboarding | Interactive CLI v2 |
| 🎯 Precise control | Enhanced CLI |

**[📖 Detailed Comparison](./TOOL_COMPARISON.md)**

## 🚀 Common Workflows

### Workflow 1: Learning the System

```bash
# Start interactive CLI
npm run pubsub:interactive

# Then explore:
Main Menu → Full State Events → Publish Rich Storyboard
Main Menu → Job Events → Dispatch Single Job
Main Menu → View Session History
```

### Workflow 2: Testing Complete Pipeline

```bash
# Option A: Interactive (visual)
npm run pubsub:interactive
# Create project → Dispatch jobs → View history

# Option B: CLI (scriptable)
npm run pubsub:cli -- workflow proj-001 --scenes=5
npm run pubsub:cli -- job-chain proj-001

# Option C: REPL (programmatic)
npm run pubsub:repl
await pubsubTesting.givenWorkflow({ scenes: 5 })
await pubsubTesting.givenJobChain()
```

### Workflow 3: CI/CD Integration

```bash
# Create batch file: ci-tests.json
# Then run:
npm run pubsub:cli -- batch --file=ci-tests.json -q

# Or use in scripts:
#!/bin/bash
npm run pubsub:cli -- full-state proj-ci --scenario=rich -q
npm run pubsub:cli -- job-chain proj-ci --delay=1000 -q
```

### Workflow 4: Debugging

```bash
# Interactive for iteration
npm run pubsub:interactive
# Try different scenarios, view results, adjust

# Enhanced CLI for precision
npm run pubsub:cli -- preview rich
npm run pubsub:cli -- full-state --dry-run -v
npm run pubsub:cli -- workflow test-001 --scenes=5
```

## 📦 Installation

### Add to package.json

```json
{
  "scripts": {
    "pubsub:interactive": "tsx scripts/pubsub-testing/interactive-cli-v2.ts",
    "pubsub:cli": "tsx scripts/pubsub-testing/cli.ts",
    "pubsub:repl": "tsx scripts/pubsub-testing/repl.ts",
    "pubsub:status": "tsx scripts/pubsub-testing/cli.ts status",
    "pubsub:list": "tsx scripts/pubsub-testing/cli.ts list-scenarios"
  },
  "dependencies": {
    "inquirer": "^9.2.12",
    "@types/inquirer": "^9.0.7"
  }
}
```

### Environment Variables

```bash
# Required
export GOOGLE_CLOUD_PROJECT=your-gcp-project

# Optional - for PubSub emulator
export PUBSUB_EMULATOR_HOST=localhost:8085
```

## 📚 Documentation

- **[Interactive CLI v2 Guide](./INTERACTIVE_CLI_V2_GUIDE.md)** - Continuous session interactive interface
- **[Enhanced CLI Guide](./CLI_GUIDE.md)** - Complete command reference
- **[CLI Quick Reference](./CLI_QUICK_REFERENCE.md)** - Cheat sheet
- **[Tool Comparison](./TOOL_COMPARISON.md)** - Detailed comparison with use cases
- **[Batch Operations Guide](./batch-example.json)** - Example batch files

## 🎓 Examples

### Example 1: Interactive Session

```
$ npm run pubsub:interactive

═══════════════════════════════════════════════════════════
  🎬 PubSub Testing - Interactive CLI
═══════════════════════════════════════════════════════════

? What would you like to do?
❯ 📦 Full State Events
  🎯 Job Events
  🎬 Workflows
  ─────────────────
  📜 View Session History
  📊 View Publisher Status
  ─────────────────
  👋 Exit

[Select Full State → Rich Storyboard]
✅ Published rich storyboard: 01932b4e-7c8a-7890

⏎  Returning to menu in 2s...

[Automatically returns to menu]

📋 Recent Operations:
   ✅ 2:30:23 PM - Rich storyboard (5 scenes)

? What would you like to do?
❯ 📦 Full State Events
  🎯 Job Events  ← Continues seamlessly!
```

### Example 2: CLI Commands

```bash
# List available scenarios
$ npm run pubsub:cli -- list-scenarios

Scenario  Description                                     Scenes  Characters
────────  ──────────────────────────────────────────────  ──────  ──────────
minimal   Empty project with no content                   0       0
rich      Full storyboard with scenes, chars, locations   5       3
audio     Project with audio analysis segments            3       2

# Preview before publishing
$ npm run pubsub:cli -- preview rich

# Publish
$ npm run pubsub:cli -- full-state proj-123 --scenario=rich

✅ FULL_STATE published for project: proj-123
   Title: The Urban Chronicles
   Scenes: 5
   Characters: 3
```

### Example 3: REPL

```bash
$ npm run pubsub:repl

pubsub-test> await pubsubTesting.givenFullState({ scenario: "rich" })
✅ FULL_STATE published for project: 01932b4e-7c8a-7890

pubsub-test> await pubsubTesting.givenJobChain(undefined, 500)
🔗 Dispatching job chain...
✅ All jobs dispatched successfully

pubsub-test> pubsubTesting.status()
{ projectId: 'test-project', ... }
```

### Example 4: Programmatic

```typescript
import pubsubTesting from "./pubsub-testing/index.js";

describe("Pipeline Tests", () => {
  it("should process full workflow", async () => {
    const result = await pubsubTesting.givenWorkflow({ 
      audio: true,
      sceneCount: 5
    });
    
    expect(result.success).toBe(true);
    expect(result.projectId).toBeDefined();
  });

  afterAll(async () => {
    await pubsubTesting.close();
  });
});
```

## 🎯 Quick Decision Guide

**Choose Interactive CLI v2 if you:**
- Are new to the system
- Want to test workflows without scripting
- Need to run multiple related operations
- Want visual guidance

**Choose Enhanced CLI if you:**
- Need automation/scripting
- Want batch operations
- Are integrating with CI/CD
- Want precise control

**Choose REPL if you:**
- Are a power user
- Want programmatic flexibility
- Need quick iterations
- Know exactly what you need

**Choose Programmatic API if you:**
- Are building test suites
- Need integration with test frameworks
- Want type safety
- Are creating custom tooling

## 🆘 Support

### Common Issues

**"inquirer not found"**
```bash
npm install inquirer @types/inquirer
```

**"Connection errors"**
- Check `PUBSUB_EMULATOR_HOST` environment variable
- Verify emulator is running
- Check `GOOGLE_CLOUD_PROJECT` is set

**"Events not appearing"**
- Verify subscriber services are running
- Check topic names with `npm run pubsub:status`
- Use `--dry-run` to test without publishing

### Getting Help

1. Check the relevant guide for your tool
2. Use `--help` flag with CLI
3. Run `status` command to check configuration
4. View session history in Interactive CLI

## 📝 License

[Your License Here]

---

**Happy Testing! 🎬**

Choose the tool that fits your workflow and start testing your PubSub pipeline with confidence.