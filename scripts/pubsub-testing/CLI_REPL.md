# PubSub Testing Tools - Complete Comparison Guide

## Overview

The PubSub testing toolkit provides four complementary interfaces for different use cases. This guide helps you choose the right tool for your needs.

## The Four Tools

### 1. Enhanced CLI (`cli.ts`)
**Command-line interface with comprehensive features**

```bash
tsx scripts/pubsub-testing/cli.ts <command> [options]
```

**Best For:**
- CI/CD automation
- Scripted test sequences
- Batch operations
- Production-like testing
- Team collaboration (consistent interface)

**Key Features:**
- ✅ Discovery commands (list-scenarios, list-jobs, preview)
- ✅ Professional output formatting
- ✅ Batch operations from JSON files
- ✅ Comprehensive help and documentation
- ✅ Dry-run mode for all commands
- ✅ Verbose and quiet modes
- ✅ Shell-scriptable

### 2. Interactive CLI v2 (`interactive-cli-v2.ts`) ⭐ RECOMMENDED
**Menu-driven choice-based interface with continuous session**

```bash
tsx scripts/pubsub-testing/interactive-cli-v2.ts
```

**Best For:**
- Learning the system
- Manual exploratory testing
- Testing complete workflows
- Onboarding new team members
- When you need to run multiple operations

**Key Features:**
- ✅ Continuous session (doesn't exit after commands)
- ✅ Visual menu navigation
- ✅ Smart ID memory (remembers last project/job IDs)
- ✅ Session history tracking
- ✅ Auto-return to menu (2s countdown)
- ✅ Recent operations display
- ✅ No need to memorize commands

### 2b. Interactive CLI v1 (`interactive-cli.ts`)
**Original menu-driven interface**

```bash
tsx scripts/pubsub-testing/interactive-cli.ts
```

**Note:** v2 is recommended for most use cases. Use v1 only if you prefer manual "press enter" confirmations over auto-return behavior.

### 3. REPL (`repl.ts`)
**Interactive programming environment**

```bash
tsx scripts/pubsub-testing/repl.ts
```

**Best For:**
- Programmatic testing
- Building complex test scenarios
- Quick iterations
- Advanced users
- Custom test logic

**Key Features:**
- ✅ Full JavaScript/TypeScript access
- ✅ Chainable async operations
- ✅ Direct access to testing module
- ✅ Script development
- ✅ Flexible and powerful

### 4. Programmatic API (`index.ts`)
**Import and use in your code**

```typescript
import pubsubTesting from "./index.js";
```

**Best For:**
- Integration tests
- Custom tooling
- Test frameworks
- Advanced automation

**Key Features:**
- ✅ Type-safe API
- ✅ Full programmatic control
- ✅ Import into any TypeScript/JavaScript code
- ✅ Promise-based interface

## Feature Comparison Matrix

| Feature | Enhanced CLI | Interactive v2 | REPL | Programmatic |
|---------|-------------|----------------|------|--------------|
| **Ease of Use** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| **Speed** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Discoverability** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐ |
| **Automation** | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Documentation** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **CI/CD Ready** | ⭐⭐⭐⭐⭐ | ⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Learning Curve** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ |
| **Flexibility** | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Workflow Testing** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Session Memory** | ⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ |
| **Error Handling** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |

## Use Case Scenarios

### Scenario 1: "I'm new to the system"
**Best Choice: Interactive CLI v2**

Why:
- Visual menu shows all options
- No commands to memorize
- Continuous session for exploring multiple features
- Smart ID memory reduces friction
- Session history helps you learn what you did
- Auto-return keeps workflow smooth

```bash
tsx scripts/pubsub-testing/interactive-cli-v2.ts
# Then follow the menus and explore freely
```

### Scenario 2: "I need to automate tests in CI/CD"
**Best Choice: Enhanced CLI**

Why:
- Shell-scriptable
- Exit codes for success/failure
- Batch operations support
- Quiet mode for clean logs

```bash
# In your CI/CD pipeline
tsx cli.ts full-state proj-ci-001 --scenario=rich -q
tsx cli.ts job-chain proj-ci-001 --delay=1000 -q
```

### Scenario 3: "I want to test quickly during development"
**Best Choice: REPL or Interactive CLI v2**

REPL for power users:
- Instant feedback
- No command syntax needed
- Chain multiple operations
- Iterate rapidly

Interactive CLI v2 for visual workflow:
- Test complete flows without restarting
- Smart ID memory speeds up iteration
- See what you've done in session history
- No syntax to remember

```bash
# REPL
tsx scripts/pubsub-testing/repl.ts
await pubsubTesting.givenFullState({ scenario: "rich" })
await pubsubTesting.givenJobChain()

# Or Interactive CLI v2
tsx scripts/pubsub-testing/interactive-cli-v2.ts
# Multiple operations in one session
```

### Scenario 3b: "I'm testing a complete workflow with multiple steps"
**Best Choice: Interactive CLI v2**

Why:
- Continuous session perfect for workflows
- Smart ID memory means no copy/paste
- Session history shows all steps
- Auto-return keeps flow smooth

Example workflow in one session:
1. Create project (ID remembered)
2. Dispatch job (reuse project ID)
3. Complete job (reuse both IDs)
4. View history to verify

```bash
tsx scripts/pubsub-testing/interactive-cli-v2.ts
# All steps without exiting!
```

### Scenario 4: "I'm building a test suite"
**Best Choice: Programmatic API**

Why:
- Import into test files
- Type safety
- Full control
- Integration with test frameworks

```typescript
import pubsubTesting from "./pubsub-testing/index.js";

describe("Pipeline Tests", () => {
  it("should process full workflow", async () => {
    const result = await pubsubTesting.givenWorkflow({ 
      audio: true 
    });
    expect(result.success).toBe(true);
  });
});
```

### Scenario 5: "I need to run complex test sequences"
**Best Choice: Enhanced CLI with Batch Files**

Why:
- Define sequences in JSON
- Reusable test scenarios
- Version control friendly
- Easy to share with team

```bash
tsx cli.ts batch --file=./test-scenarios/full-pipeline.json
```

### Scenario 6: "I want to preview before publishing"
**Best Choice: Enhanced CLI**

Why:
- Preview commands
- Dry-run mode
- Verbose output
- Status checking

```bash
tsx cli.ts preview rich
tsx cli.ts full-state --dry-run -v
tsx cli.ts status
```

### Scenario 7: "I'm debugging a specific workflow"
**Best Choice: Interactive CLI or REPL**

Interactive CLI if you want guidance:
```bash
tsx scripts/pubsub-testing/interactive-cli.ts
# Navigate to specific operation
```

REPL if you know what you need:
```bash
tsx scripts/pubsub-testing/repl.ts
await pubsubTesting.givenJobFailed("job-123", "proj-456", "Debug error")
```

## Command Comparison

### Publishing Full State

**Enhanced CLI:**
```bash
tsx cli.ts full-state proj-123 --scenario=rich
```
- Pros: Fast, scriptable, comprehensive output
- Cons: Must know command syntax

**Interactive CLI:**
```
Main Menu → Full State Events → Publish Rich Storyboard
Enter project ID: proj-123
```
- Pros: Guided, visual, no syntax needed
- Cons: More steps, not scriptable

**REPL:**
```javascript
await pubsubTesting.givenFullState({ 
  scenario: "rich", 
  projectId: "proj-123" 
})
```
- Pros: Programmatic, chainable
- Cons: Must know function signature

**Programmatic:**
```typescript
import pubsubTesting from "./index.js";
const result = await pubsubTesting.givenFullState({ 
  scenario: "rich", 
  projectId: "proj-123" 
});
```
- Pros: Type-safe, testable
- Cons: Requires import, more setup

## Workflow Recommendations

### Daily Development Workflow
1. **Morning setup check**: `tsx cli.ts status`
2. **Quick test**: `tsx repl.ts` → run commands
3. **Full pipeline test**: `tsx cli.ts workflow --dry-run -v`

### Team Onboarding Workflow
1. **Day 1**: Use Interactive CLI exclusively
2. **Day 2-3**: Graduate to Enhanced CLI with --help
3. **Week 2+**: Introduce REPL for power users

### CI/CD Workflow
1. **PR validation**: `tsx cli.ts batch --file=pr-tests.json -q`
2. **Nightly full test**: `tsx cli.ts batch --file=nightly-tests.json`
3. **Deploy verification**: `tsx cli.ts workflow prod-verify-001 -q`

### Debug Workflow
1. **Identify issue**: `tsx cli.ts status`
2. **Preview scenario**: `tsx cli.ts preview <scenario>`
3. **Test with dry-run**: `tsx cli.ts <command> --dry-run -v`
4. **Test for real**: `tsx cli.ts <command> -v`

## Package.json Scripts Setup

Recommended scripts for different team roles:

```json
{
  "scripts": {
    "// General": "",
    "test:pubsub": "tsx scripts/pubsub-testing/cli.ts",
    "test:pubsub:status": "tsx scripts/pubsub-testing/cli.ts status",
    
    "// For Developers": "",
    "test:repl": "tsx scripts/pubsub-testing/repl.ts",
    "test:interactive": "tsx scripts/pubsub-testing/interactive-cli.ts",
    
    "// For QA/Testing": "",
    "test:workflow": "tsx scripts/pubsub-testing/cli.ts workflow --dry-run",
    "test:workflow:audio": "tsx scripts/pubsub-testing/cli.ts workflow --audio --dry-run",
    
    "// For CI/CD": "",
    "test:ci": "tsx scripts/pubsub-testing/cli.ts batch --file=./test-scenarios/ci.json -q",
    "test:nightly": "tsx scripts/pubsub-testing/cli.ts batch --file=./test-scenarios/nightly.json",
    
    "// For Learning": "",
    "test:list": "tsx scripts/pubsub-testing/cli.ts list-scenarios",
    "test:preview": "tsx scripts/pubsub-testing/cli.ts preview rich"
  }
}
```

## Integration Patterns

### Pattern 1: CI/CD Integration
```yaml
# .github/workflows/test.yml
- name: Test PubSub Pipeline
  run: |
    npm run test:pubsub -- batch --file=./test-scenarios/ci.json -q
    if [ $? -ne 0 ]; then
      echo "PubSub tests failed"
      exit 1
    fi
```

### Pattern 2: Pre-commit Hook
```bash
#!/bin/bash
# .git/hooks/pre-commit
npm run test:pubsub -- full-state --dry-run -q
```

### Pattern 3: Integration Test Suite
```typescript
// tests/integration/pubsub.test.ts
import pubsubTesting from "../../scripts/pubsub-testing/index.js";

beforeAll(async () => {
  await pubsubTesting.givenFullState({ scenario: "minimal" });
});

afterAll(async () => {
  await pubsubTesting.close();
});

test("workflow completes", async () => {
  const result = await pubsubTesting.givenWorkflow({ scenes: 3 });
  expect(result.success).toBe(true);
});
```

### Pattern 4: Development Scripts
```typescript
// scripts/dev-reset.ts
import pubsubTesting from "./pubsub-testing/index.js";

async function resetDevEnvironment() {
  console.log("🔄 Resetting dev environment...");
  
  await pubsubTesting.givenFullState({ 
    scenario: "rich", 
    projectId: "dev-001" 
  });
  
  console.log("✅ Dev environment ready");
  await pubsubTesting.close();
}

resetDevEnvironment();
```

## Summary Decision Tree

```
Start Here
    │
    ├─ Need automation? ──── YES ──→ Enhanced CLI or Programmatic
    │                        NO
    ├─ Know exact commands? ── YES ──→ Enhanced CLI or REPL
    │                         NO
    ├─ Learning the system? ── YES ──→ Interactive CLI
    │                         NO
    ├─ Quick one-off test? ─── YES ──→ REPL
    │                         NO
    ├─ Building test suite? ── YES ──→ Programmatic API
    │                         NO
    └─ Complex sequences? ──── YES ──→ Enhanced CLI (Batch)
```

## Quick Reference

| I want to... | Use this tool |
|--------------|---------------|
| Learn the system | Interactive CLI |
| Run quick tests | REPL |
| Automate in CI/CD | Enhanced CLI |
| See all options | Interactive CLI or `cli.ts list-*` |
| Preview data | `cli.ts preview` |
| Run batch tests | `cli.ts batch` |
| Build test suite | Programmatic API |
| Debug workflows | REPL or Interactive CLI |
| Script operations | Enhanced CLI or Programmatic |
| Share with team | Enhanced CLI (best docs) |