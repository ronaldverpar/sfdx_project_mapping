# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A VS Code extension that builds a visual dependency graph for Salesforce DX projects. It parses Apex classes, LWC components, Aura components, and triggers using regex-based parsers, then constructs a directed graph to detect unused code, circular dependencies, and impact analysis.

## Commands

```bash
npm run compile        # TypeScript compilation (tsc -p ./) — currently passes clean
npm run watch          # Continuous compilation
npm run lint           # ESLint — BROKEN: targets src/ but no src/ directory exists
npm test               # Jest — BROKEN: see "Current Project State" below
npx jest <filename>    # Run a single test file (also broken due to config)
```

Press F5 in VS Code to launch the Extension Development Host for manual testing.

## Current Project State

**All source files are implemented** but live flat at the project root, not in the `src/` subdirectory structure that the README describes and tooling expects.

**What's broken and why:**

1. **Jest won't run.** `jest.config.js` sets `roots: ['<rootDir>/test']` but test files are at root. The vscode mock mapper also points to `test/__mocks__/vscode.ts` instead of `./vscode.ts`.
2. **Test imports don't resolve.** All 5 test files import from paths like `../../src/parsers/apexParser` which don't exist — source files are at root, not `src/parsers/`.
3. **ESLint has no targets.** `npm run lint` targets `src/` which doesn't exist.

**To fix:** Either (a) move files into the `src/` and `test/` directories to match the README structure, or (b) update jest.config.js, test imports, and lint config to match the flat layout. Option (a) is preferred since tsconfig/package.json already expect `out/` output.

## Architecture

The extension activates when a workspace contains `sfdx-project.json`.

**Analysis pipeline** (in `DependencyAnalyzer.analyze`):
1. Each parser scans for its file type (`.cls`, `.cmp`, `.html`, `.trigger`)
2. Each parser returns `{ node: DependencyNode, edges: DependencyEdge[] }`
3. DependencyAnalyzer collects all nodes/edges, prunes edges to known targets, builds a `DependencyGraph`
4. Unused detection: nodes with no incoming edges, minus known entry points (Schedulable, @RestResource, @AuraEnabled, exposed LWC, triggers, user-configured)
5. Results feed into the webview graph (D3.js), sidebar tree views, and VS Code diagnostics

**Parser contract** — all parsers follow:
```
findXxxFiles(workspacePath): Promise<string[]>
parseFile|parseComponent(filePath): Promise<{ node, edges }>
getErrors(): ParseError[]
```

**Node IDs** use prefixed format: `apex:ClassName`, `lwc:componentName`, `aura:ComponentName`, `trigger:TriggerName`, `sobject:ObjectName`, `aura-event:EventName`.

**Edge types:** extends, implements, instantiates, static-call, type-reference, apex-import, lwc-composition, trigger-object, wire-adapter.

## Testing Pattern

**VS Code mock** (`vscode.ts` at root): Provides jest.fn() mocks for all VS Code APIs. Tests control file content by mocking `workspace.fs.readFile`:

```typescript
(workspace.fs.readFile as jest.Mock).mockImplementation((uri) => {
  if (uri.fsPath.endsWith('.cmp')) return Buffer.from(cmpMarkup);
});
```

Then assert on returned nodes (id, type, metadata) and edges (source, target, type).

DependencyAnalyzer tests build hand-constructed graphs directly (no filesystem mocking needed).
