# SF Dependency Analysis

> Visual dependency graph for Salesforce DX projects — map Apex classes, LWC components, triggers, and **identify unused code**.

![VS Code Version](https://img.shields.io/badge/vscode-%3E%3D1.85.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

### Interactive Dependency Graph
- **Force-directed** interactive graph rendered with D3.js
- Click any node to see its connections highlighted
- Drag nodes to rearrange the layout
- Zoom, pan, and fit-to-view controls
- Search to find and highlight specific classes/components
- Export the graph as SVG

### Dependency Tracking
| Connection Type | Example |
|---|---|
| Apex → Apex (extends) | `class MyService extends BaseService` |
| Apex → Apex (implements) | `class MyBatch implements Database.Batchable` |
| Apex → Apex (instantiation) | `new MyHelper()` |
| Apex → Apex (static calls) | `MyUtils.doSomething()` |
| Apex → Apex (type references) | `MyDTO record;` |
| LWC → Apex (imports) | `import getRecords from '@salesforce/apex/MyController.getRecords'` |
| LWC → LWC (composition) | `<c-child-component>` in templates |
| Trigger → SObject | `trigger AccountTrigger on Account` |
| Trigger → Handler class | `AccountTriggerHandler.handle()` |
| Aura → Apex controller | `controller="AccountController"` |
| Aura → Aura (composition) | `<c:ChildComponent />` in markup |
| Aura → Aura (dynamic) | `$A.createComponent("c:Dialog")` |
| Aura → Events | `$A.get("e.c:RecordUpdated")` |

### Unused Code Detection
Classes and components are flagged as unused with **confidence levels**:

- **High confidence** — Regular class with no incoming references, no special annotations
- **Medium confidence** — Has some annotations but no references found
- **Low confidence** — Abstract/virtual classes or interfaces (may be used polymorphically)

**Smart entry point detection** — The analyzer knows that these are NOT unused:
- `Schedulable`, `Batchable`, `Queueable` implementations
- `@RestResource`, `@InvocableMethod`, `@AuraEnabled` annotated classes
- Exposed LWC components with targets in meta XML
- Triggers (platform-invoked)
- User-configured entry points

### Sidebar Panels
- **Unused Classes & Components** — Tree view grouped by confidence level
- **Dependencies** — Stats overview and selected-node detail

### Diagnostics
Unused classes appear as warnings/info in the VS Code Problems panel.

## How It Works

This extension runs **entirely locally** — it performs static analysis of source files on disk using VS Code's filesystem APIs. It does **not** connect to a Salesforce org, make API calls, or send any data over the network. All parsing is regex-based against your local `.cls`, `.cmp`, `.html`, and `.trigger` files.

## Getting Started

1. Open a Salesforce DX project (must have `sfdx-project.json`)
2. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
3. Run **"SF Analysis: Show Dependency Graph"**
4. The graph opens in a side panel — explore your codebase!

## Commands

| Command | Description |
|---|---|
| `SF Analysis: Show Dependency Graph` | Run analysis and open the interactive graph |
| `SF Analysis: Refresh Dependency Graph` | Re-run analysis (also triggered on file save) |
| `SF Analysis: Find Unused Classes & Components` | Quick-pick list of unused items |
| `SF Analysis: Focus on Class/Component` | Search and zoom to a specific node |
| `SF Analysis: Impact Analysis` | Select a class to see everything that would break if it changes |
| `SF Analysis: Find Circular Dependencies` | Detect and report all cycles in the graph |
| `SF Analysis: Export Dependency Report (JSON)` | Export full analysis to a JSON file |

## Screenshots
`SF Analysis: Show Dependency Graph`
![Description](media/Screenshot%202026-04-09%20at%205.51.59%20PM.png)
`SF Analysis: Find Circular Dependencies`
![Description](media/Screenshot%202026-04-09%20at%205.52.24%20PM.png)
`SF Analysis: Impact Analysis -- what breaks if I change this?`
![Description](media/Screenshot%202026-04-09%20at%205.53.45%20PM.png)

## Configuration

| Setting | Default | Description |
|---|---|---|
| `sfDependencyAnalysis.excludePatterns` | `["**/node_modules/**", "**/.sfdx/**"]` | Glob patterns to exclude |
| `sfDependencyAnalysis.entryPoints` | `[]` | Classes to always consider "used" |
| `sfDependencyAnalysis.includeTestClasses` | `false` | Include @IsTest classes in the graph |
| `sfDependencyAnalysis.graphLayout` | `"force-directed"` | Layout algorithm |

## Architecture

```
src/
├── extension.ts              # Entry point, command registration
├── types.ts                  # Shared TypeScript types
├── parsers/
│   ├── apexParser.ts         # Regex-based Apex class parser
│   ├── auraParser.ts         # Aura component bundle parser
│   ├── lwcParser.ts          # LWC HTML/JS/XML parser
│   └── triggerParser.ts      # Apex trigger parser
├── analyzers/
│   └── dependencyAnalyzer.ts # Graph builder, unused detection, traversal
├── providers/
│   └── treeProviders.ts      # Sidebar tree views
└── webview/
    └── graphWebview.ts       # D3.js interactive graph panel

test/
├── __mocks__/vscode.ts       # VS Code API mock
├── parsers/
│   ├── apexParser.test.ts
│   ├── auraParser.test.ts
│   ├── lwcParser.test.ts
│   └── triggerParser.test.ts
└── analyzers/
    └── dependencyAnalyzer.test.ts
```

## Development

```bash
# Install dependencies
npm install

# Compile
npm run compile

# Watch mode
npm run watch

# Run tests
npm test

# Run in VS Code
# Press F5 to launch Extension Development Host
```

## Roadmap

- [x] Aura component support
- [x] Circular dependency detection
- [x] Impact analysis ("what breaks if I change this?")
- [x] JSON report export
- [x] Unit test suite (Jest)
- [ ] Custom object / field dependency tracking
- [ ] Flow → Apex connections
- [ ] Managed package boundary detection
- [ ] Hierarchical layout mode
- [ ] Dependency depth slider (show N hops from selected node)
- [ ] Export dependency report as CSV
- [ ] VS Code CodeLens integration (inline reference counts)

## License

MIT
