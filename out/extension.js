"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const dependencyAnalyzer_1 = require("./dependencyAnalyzer");
const graphWebview_1 = require("./graphWebview");
const treeProviders_1 = require("./treeProviders");
let analysisResult;
function activate(context) {
    const analyzer = new dependencyAnalyzer_1.DependencyAnalyzer();
    const graphWebview = new graphWebview_1.GraphWebviewProvider(context.extensionUri);
    const unusedTree = new treeProviders_1.UnusedTreeProvider();
    const depTree = new treeProviders_1.DependencyTreeProvider();
    // Register tree views
    vscode.window.registerTreeDataProvider('sfdxDependencyMap.unusedItems', unusedTree);
    vscode.window.registerTreeDataProvider('sfdxDependencyMap.dependencies', depTree);
    // ─── Command: Show Dependency Graph ─────────────────────
    context.subscriptions.push(vscode.commands.registerCommand('sfdxDependencyMap.showGraph', async () => {
        const workspacePath = getWorkspacePath();
        if (!workspacePath) {
            return;
        }
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'SFDX Dependency Map',
            cancellable: false,
        }, async (progress) => {
            try {
                analysisResult = await analyzer.analyze(workspacePath, progress);
                graphWebview.show(analysisResult);
                unusedTree.refresh(analysisResult);
                depTree.refresh(analysisResult);
                // Show summary
                const { stats } = analysisResult;
                const parts = [
                    `${stats.totalApexClasses} Apex`,
                    `${stats.totalLwcComponents} LWC`,
                ];
                if (stats.totalAuraComponents > 0) {
                    parts.push(`${stats.totalAuraComponents} Aura`);
                }
                parts.push(`${stats.totalTriggers} triggers`);
                parts.push(`${stats.unusedCount} unused`);
                vscode.window.showInformationMessage(`Dependency Map: ${parts.join(', ')}.`);
                // Report errors if any
                if (analysisResult.errors.length > 0) {
                    const channel = vscode.window.createOutputChannel('SFDX Dependency Map');
                    channel.appendLine(`── Parse Errors (${analysisResult.errors.length}) ──`);
                    for (const err of analysisResult.errors) {
                        channel.appendLine(`  ${err.filePath}: ${err.message}`);
                    }
                    channel.show(true);
                }
            }
            catch (err) {
                vscode.window.showErrorMessage(`Analysis failed: ${err}`);
            }
        });
    }));
    // ─── Command: Refresh ───────────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand('sfdxDependencyMap.refresh', () => {
        vscode.commands.executeCommand('sfdxDependencyMap.showGraph');
    }));
    // ─── Command: Find Unused ───────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand('sfdxDependencyMap.findUnused', async () => {
        if (!analysisResult) {
            // Run analysis first
            await vscode.commands.executeCommand('sfdxDependencyMap.showGraph');
        }
        if (analysisResult && analysisResult.unused.length > 0) {
            // Show quick pick of unused items
            const items = analysisResult.unused.map(u => ({
                label: `$(${getIcon(u.node.type)}) ${u.node.name}`,
                description: `${u.confidence} confidence`,
                detail: u.reason,
                filePath: u.node.filePath,
                nodeId: u.node.id,
            }));
            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: `${items.length} unused items found. Select to open file.`,
                matchOnDetail: true,
            });
            if (selected) {
                const doc = await vscode.workspace.openTextDocument(selected.filePath);
                await vscode.window.showTextDocument(doc);
                graphWebview.focusNode(selected.nodeId);
            }
        }
        else {
            vscode.window.showInformationMessage('No unused classes or components detected!');
        }
    }));
    // ─── Command: Focus Node ────────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand('sfdxDependencyMap.focusNode', async () => {
        if (!analysisResult) {
            vscode.window.showWarningMessage('Run the dependency analysis first.');
            return;
        }
        const nodes = [...analysisResult.graph.nodes.values()];
        const items = nodes.map(n => ({
            label: `$(${getIcon(n.type)}) ${n.name}`,
            description: n.type + (n.isUnused ? ' (unused)' : ''),
            nodeId: n.id,
        }));
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Search for a class or component to focus on...',
        });
        if (selected) {
            graphWebview.focusNode(selected.nodeId);
            depTree.setActiveNode(selected.nodeId);
        }
    }));
    // ─── Command: Impact Analysis ────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand('sfdxDependencyMap.impactAnalysis', async () => {
        if (!analysisResult) {
            vscode.window.showWarningMessage('Run the dependency analysis first.');
            return;
        }
        const nodes = [...analysisResult.graph.nodes.values()];
        const items = nodes.map(n => ({
            label: `$(${getIcon(n.type)}) ${n.name}`,
            description: n.type,
            nodeId: n.id,
        }));
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a class/component to see what would be impacted by changes...',
        });
        if (!selected) {
            return;
        }
        const impacted = analyzer.getImpactedNodes(analysisResult.graph, selected.nodeId);
        if (impacted.length === 0) {
            vscode.window.showInformationMessage(`No other classes or components depend on "${selected.label.replace(/\$\([^)]+\)\s*/, '')}".`);
            return;
        }
        const channel = vscode.window.createOutputChannel('SFDX Impact Analysis');
        channel.clear();
        channel.appendLine(`═══ Impact Analysis: ${selected.label.replace(/\$\([^)]+\)\s*/, '')} ═══`);
        channel.appendLine(`If this ${selected.description} changes, ${impacted.length} item(s) could be affected:\n`);
        // Group by depth
        const depthMap = new Map();
        for (const node of impacted) {
            const reach = analyzer.getReachable(analysisResult.graph, selected.nodeId, 'incoming');
            const info = reach.get(node.id);
            const depth = info?.depth ?? 1;
            if (!depthMap.has(depth)) {
                depthMap.set(depth, []);
            }
            depthMap.get(depth).push(node);
        }
        for (const [depth, depthNodes] of [...depthMap.entries()].sort((a, b) => a[0] - b[0])) {
            const indent = '  '.repeat(depth);
            channel.appendLine(`── Depth ${depth} (${depth === 1 ? 'direct' : 'transitive'}) ──`);
            for (const node of depthNodes) {
                channel.appendLine(`${indent}• ${node.name} (${node.type}) — ${node.filePath}`);
            }
            channel.appendLine('');
        }
        channel.show(true);
        graphWebview.focusNode(selected.nodeId);
    }));
    // ─── Command: Find Cycles ──────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand('sfdxDependencyMap.findCycles', async () => {
        if (!analysisResult) {
            vscode.window.showWarningMessage('Run the dependency analysis first.');
            return;
        }
        const cycles = analyzer.findCycles(analysisResult.graph);
        if (cycles.length === 0) {
            vscode.window.showInformationMessage('No circular dependencies found — your codebase is clean!');
            return;
        }
        const channel = vscode.window.createOutputChannel('SFDX Circular Dependencies');
        channel.clear();
        channel.appendLine(`═══ Circular Dependencies Found: ${cycles.length} ═══\n`);
        cycles.forEach((cycle, i) => {
            const names = cycle.map(id => {
                const node = analysisResult.graph.nodes.get(id);
                return node?.name ?? id;
            });
            channel.appendLine(`Cycle ${i + 1}: ${names.join(' → ')} → ${names[0]}`);
        });
        channel.appendLine('\nCircular dependencies can cause issues with testing,');
        channel.appendLine('deployment order, and code maintainability.');
        channel.show(true);
    }));
    // ─── Command: Export Report ─────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand('sfdxDependencyMap.exportReport', async () => {
        if (!analysisResult) {
            vscode.window.showWarningMessage('Run the dependency analysis first.');
            return;
        }
        const report = {
            generatedAt: new Date().toISOString(),
            workspacePath: analysisResult.graph.workspacePath,
            stats: analysisResult.stats,
            nodes: [...analysisResult.graph.nodes.values()].map(n => ({
                id: n.id,
                name: n.name,
                type: n.type,
                filePath: n.filePath,
                isUnused: n.isUnused,
                metadata: n.metadata,
            })),
            edges: analysisResult.graph.edges.map(e => ({
                source: e.source,
                target: e.target,
                type: e.type,
            })),
            unused: analysisResult.unused.map(u => ({
                name: u.node.name,
                type: u.node.type,
                filePath: u.node.filePath,
                confidence: u.confidence,
                reason: u.reason,
            })),
            cycles: analyzer.findCycles(analysisResult.graph).map(cycle => cycle.map(id => analysisResult.graph.nodes.get(id)?.name ?? id)),
            errors: analysisResult.errors,
        };
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file('sfdx-dependency-report.json'),
            filters: { 'JSON': ['json'] },
        });
        if (uri) {
            const content = Buffer.from(JSON.stringify(report, null, 2), 'utf-8');
            await vscode.workspace.fs.writeFile(uri, content);
            vscode.window.showInformationMessage(`Report exported to ${uri.fsPath}`);
        }
    }));
    // ─── File Watcher: re-analyze on save ───────────────────
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.{cls,trigger,js,html,cmp}', true, // ignore create
    false, // watch change
    true);
    watcher.onDidChange(() => {
        if (analysisResult) {
            // Debounced re-analysis
            vscode.commands.executeCommand('sfdxDependencyMap.refresh');
        }
    });
    context.subscriptions.push(watcher);
    // ─── Diagnostics for unused items ───────────────────────
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('sfdx-unused');
    context.subscriptions.push(diagnosticCollection);
    // Update diagnostics when analysis runs
    context.subscriptions.push(vscode.commands.registerCommand('sfdxDependencyMap._updateDiagnostics', () => {
        diagnosticCollection.clear();
        if (!analysisResult) {
            return;
        }
        for (const item of analysisResult.unused) {
            if (item.confidence === 'low') {
                continue;
            } // skip low confidence
            const uri = vscode.Uri.file(item.node.filePath);
            const severity = item.confidence === 'high'
                ? vscode.DiagnosticSeverity.Warning
                : vscode.DiagnosticSeverity.Information;
            const diagnostic = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 0), `[SFDX Dep Map] ${item.reason}`, severity);
            diagnostic.source = 'sfdx-dependency-map';
            const existing = diagnosticCollection.get(uri) || [];
            diagnosticCollection.set(uri, [...existing, diagnostic]);
        }
    }));
    console.log('SFDX Dependency Map activated');
}
function deactivate() { }
// ─── Helpers ────────────────────────────────────────────────
function getWorkspacePath() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder open.');
        return undefined;
    }
    // Look for sfdx-project.json to confirm it's an SFDX project
    return folders[0].uri.fsPath;
}
function getIcon(type) {
    switch (type) {
        case 'apex-class': return 'symbol-class';
        case 'apex-interface': return 'symbol-interface';
        case 'apex-trigger': return 'zap';
        case 'lwc': return 'symbol-misc';
        case 'aura': return 'symbol-event';
        default: return 'file';
    }
}
//# sourceMappingURL=extension.js.map