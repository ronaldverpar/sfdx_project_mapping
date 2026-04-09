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
exports.DependencyAnalyzer = void 0;
const vscode = __importStar(require("vscode"));
const apexParser_1 = require("./apexParser");
const lwcParser_1 = require("./lwcParser");
const triggerParser_1 = require("./triggerParser");
const auraParser_1 = require("./auraParser");
/**
 * Orchestrates parsing and builds the full dependency graph.
 * Identifies unused classes/components by performing reachability analysis.
 * Provides graph traversal utilities for impact analysis.
 */
class DependencyAnalyzer {
    constructor() {
        this.apexParser = new apexParser_1.ApexParser();
        this.lwcParser = new lwcParser_1.LwcParser();
        this.triggerParser = new triggerParser_1.TriggerParser();
        this.auraParser = new auraParser_1.AuraParser();
    }
    /**
     * Run a full workspace analysis.
     */
    async analyze(workspacePath, progress) {
        const nodes = new Map();
        const allEdges = [];
        const errors = [];
        const config = vscode.workspace.getConfiguration('sfDependencyAnalysis');
        const includeTests = config.get('includeTestClasses', false);
        // ── Step 1: Parse Apex classes ─────────────────────────
        progress?.report({ message: 'Scanning Apex classes...', increment: 0 });
        const apexFiles = await this.apexParser.findApexFiles(workspacePath);
        for (let i = 0; i < apexFiles.length; i++) {
            try {
                const { node, edges } = await this.apexParser.parseFile(apexFiles[i]);
                if (!includeTests && node.metadata.isTest) {
                    continue;
                }
                nodes.set(node.id, node);
                allEdges.push(...edges);
            }
            catch (err) {
                errors.push({ filePath: apexFiles[i], message: `${err}` });
            }
            progress?.report({
                message: `Parsing Apex (${i + 1}/${apexFiles.length})`,
                increment: (25 / Math.max(apexFiles.length, 1)),
            });
        }
        // ── Step 2: Parse Triggers ─────────────────────────────
        progress?.report({ message: 'Scanning triggers...', increment: 0 });
        const triggerFiles = await this.triggerParser.findTriggerFiles(workspacePath);
        for (const tf of triggerFiles) {
            try {
                const { node, edges } = await this.triggerParser.parseFile(tf);
                nodes.set(node.id, node);
                allEdges.push(...edges);
            }
            catch (err) {
                errors.push({ filePath: tf, message: `${err}` });
            }
        }
        // ── Step 3: Parse LWC ──────────────────────────────────
        progress?.report({ message: 'Scanning LWC components...', increment: 0 });
        const lwcFiles = await this.lwcParser.findLwcComponents(workspacePath);
        for (let i = 0; i < lwcFiles.length; i++) {
            try {
                const { node, edges } = await this.lwcParser.parseComponent(lwcFiles[i]);
                nodes.set(node.id, node);
                allEdges.push(...edges);
            }
            catch (err) {
                errors.push({ filePath: lwcFiles[i], message: `${err}` });
            }
            progress?.report({
                message: `Parsing LWC (${i + 1}/${lwcFiles.length})`,
                increment: (25 / Math.max(lwcFiles.length, 1)),
            });
        }
        // ── Step 4: Parse Aura ─────────────────────────────────
        progress?.report({ message: 'Scanning Aura components...', increment: 0 });
        const auraFiles = await this.auraParser.findAuraComponents(workspacePath);
        for (let i = 0; i < auraFiles.length; i++) {
            try {
                const { node, edges } = await this.auraParser.parseComponent(auraFiles[i]);
                nodes.set(node.id, node);
                allEdges.push(...edges);
            }
            catch (err) {
                errors.push({ filePath: auraFiles[i], message: `${err}` });
            }
            progress?.report({
                message: `Parsing Aura (${i + 1}/${auraFiles.length})`,
                increment: (10 / Math.max(auraFiles.length, 1)),
            });
        }
        // ── Step 5: Prune edges to known targets ───────────────
        const validEdges = allEdges.filter(e => nodes.has(e.source) && (nodes.has(e.target) ||
            e.target.startsWith('sobject:') ||
            e.target.startsWith('wire:') ||
            e.target.startsWith('aura-event:')));
        // ── Step 5b: Create synthetic nodes for SObjects ──────
        for (const edge of validEdges) {
            if (edge.target.startsWith('sobject:') && !nodes.has(edge.target)) {
                const objName = edge.target.replace('sobject:', '');
                nodes.set(edge.target, {
                    id: edge.target,
                    name: objName,
                    type: 'sobject',
                    filePath: '',
                    metadata: {},
                    isUnused: false,
                });
            }
        }
        // ── Step 6: Build graph ────────────────────────────────
        const graph = {
            nodes,
            edges: validEdges,
            analyzedAt: new Date(),
            workspacePath,
        };
        // ── Step 7: Find unused ────────────────────────────────
        progress?.report({ message: 'Identifying unused code...', increment: 10 });
        const unused = this.findUnused(graph);
        for (const item of unused) {
            const node = nodes.get(item.node.id);
            if (node) {
                node.isUnused = true;
            }
        }
        errors.push(...this.apexParser.getErrors(), ...this.lwcParser.getErrors(), ...this.triggerParser.getErrors(), ...this.auraParser.getErrors());
        const allNodes = [...nodes.values()];
        const stats = {
            totalApexClasses: allNodes.filter(n => n.type === 'apex-class' || n.type === 'apex-interface').length,
            totalLwcComponents: allNodes.filter(n => n.type === 'lwc').length,
            totalAuraComponents: allNodes.filter(n => n.type === 'aura').length,
            totalTriggers: allNodes.filter(n => n.type === 'apex-trigger').length,
            totalEdges: validEdges.length,
            unusedCount: unused.length,
        };
        progress?.report({ message: 'Analysis complete!', increment: 5 });
        return { graph, unused, stats, errors };
    }
    // ═══════════════════════════════════════════════════════════
    //  Graph Traversal Utilities
    // ═══════════════════════════════════════════════════════════
    /**
     * Get all nodes directly connected to a given node (both directions).
     */
    getNeighbors(graph, nodeId) {
        const dependsOn = [];
        const usedBy = [];
        for (const edge of graph.edges) {
            if (edge.source === nodeId) {
                const target = graph.nodes.get(edge.target);
                if (target) {
                    dependsOn.push({ node: target, edgeType: edge.type });
                }
            }
            if (edge.target === nodeId) {
                const source = graph.nodes.get(edge.source);
                if (source) {
                    usedBy.push({ node: source, edgeType: edge.type });
                }
            }
        }
        return { dependsOn, usedBy };
    }
    /**
     * BFS: Get all nodes reachable from a given node up to `maxDepth` hops.
     * Direction: 'outgoing' follows dependency direction, 'incoming' follows reverse.
     */
    getReachable(graph, startNodeId, direction, maxDepth = Infinity) {
        const result = new Map();
        const queue = [{ id: startNodeId, depth: 0 }];
        const visited = new Set([startNodeId]);
        while (queue.length > 0) {
            const { id, depth } = queue.shift();
            if (depth > maxDepth) {
                continue;
            }
            const node = graph.nodes.get(id);
            if (node && depth > 0) {
                result.set(id, { node, depth });
            }
            for (const edge of graph.edges) {
                const nextId = direction === 'outgoing'
                    ? (edge.source === id ? edge.target : null)
                    : (edge.target === id ? edge.source : null);
                if (nextId && !visited.has(nextId) && graph.nodes.has(nextId)) {
                    visited.add(nextId);
                    queue.push({ id: nextId, depth: depth + 1 });
                }
            }
        }
        return result;
    }
    /**
     * Impact analysis: if this node changes, which nodes could be affected?
     * Returns all nodes that directly or transitively depend on the given node.
     */
    getImpactedNodes(graph, nodeId) {
        const reachable = this.getReachable(graph, nodeId, 'incoming');
        return [...reachable.values()]
            .sort((a, b) => a.depth - b.depth)
            .map(r => r.node);
    }
    /**
     * Detect circular dependencies in the graph.
     * Returns arrays of node IDs forming cycles.
     */
    findCycles(graph) {
        const cycles = [];
        const visited = new Set();
        const recStack = new Set();
        // Build adjacency list
        const adj = new Map();
        for (const [id] of graph.nodes) {
            adj.set(id, []);
        }
        for (const edge of graph.edges) {
            if (adj.has(edge.source) && graph.nodes.has(edge.target)) {
                adj.get(edge.source).push(edge.target);
            }
        }
        const dfs = (nodeId, path) => {
            visited.add(nodeId);
            recStack.add(nodeId);
            path.push(nodeId);
            for (const neighbor of adj.get(nodeId) || []) {
                if (!visited.has(neighbor)) {
                    dfs(neighbor, [...path]);
                }
                else if (recStack.has(neighbor)) {
                    const cycleStart = path.indexOf(neighbor);
                    if (cycleStart >= 0) {
                        cycles.push(path.slice(cycleStart));
                    }
                }
            }
            recStack.delete(nodeId);
        };
        for (const [id] of graph.nodes) {
            if (!visited.has(id)) {
                dfs(id, []);
            }
        }
        return cycles;
    }
    /**
     * Find isolated clusters — groups of connected nodes.
     */
    findClusters(graph) {
        const visited = new Set();
        const clusters = new Map();
        let clusterIndex = 0;
        // Build undirected adjacency
        const adj = new Map();
        for (const [id] of graph.nodes) {
            adj.set(id, new Set());
        }
        for (const edge of graph.edges) {
            if (adj.has(edge.source) && adj.has(edge.target)) {
                adj.get(edge.source).add(edge.target);
                adj.get(edge.target).add(edge.source);
            }
        }
        for (const [id] of graph.nodes) {
            if (visited.has(id)) {
                continue;
            }
            const cluster = [];
            const queue = [id];
            visited.add(id);
            while (queue.length > 0) {
                const current = queue.shift();
                const node = graph.nodes.get(current);
                if (node) {
                    cluster.push(node);
                }
                for (const neighbor of adj.get(current) || []) {
                    if (!visited.has(neighbor)) {
                        visited.add(neighbor);
                        queue.push(neighbor);
                    }
                }
            }
            clusters.set(clusterIndex++, cluster);
        }
        return clusters;
    }
    /**
     * Compute graph metrics for a node.
     */
    getNodeMetrics(graph, nodeId) {
        let inDegree = 0;
        let outDegree = 0;
        for (const edge of graph.edges) {
            if (edge.target === nodeId) {
                inDegree++;
            }
            if (edge.source === nodeId) {
                outDegree++;
            }
        }
        const totalNodes = graph.nodes.size;
        const avgOutDegree = graph.edges.length / Math.max(totalNodes, 1);
        const isHub = outDegree > avgOutDegree * 2;
        // A "bridge" is a node whose removal would disconnect parts of the graph
        // Simplified heuristic: high in-degree AND high out-degree
        const avgInDegree = graph.edges.length / Math.max(totalNodes, 1);
        const isBridge = inDegree > avgInDegree * 1.5 && outDegree > avgOutDegree * 1.5;
        return { inDegree, outDegree, isHub, isBridge };
    }
    // ─── Unused Detection ───────────────────────────────────
    findUnused(graph) {
        const referenced = new Set();
        for (const edge of graph.edges) {
            referenced.add(edge.target);
        }
        const config = vscode.workspace.getConfiguration('sfDependencyAnalysis');
        const userEntryPoints = new Set(config.get('entryPoints', []).map(e => {
            return e.includes(':') ? e : `apex:${e}`;
        }));
        const unused = [];
        for (const [id, node] of graph.nodes) {
            if (referenced.has(id)) {
                continue;
            }
            if (userEntryPoints.has(id)) {
                continue;
            }
            const entryReason = this.isEntryPoint(node);
            if (entryReason) {
                continue;
            }
            unused.push({
                node,
                confidence: this.assessConfidence(node),
                reason: this.buildReason(node),
            });
        }
        unused.sort((a, b) => {
            const order = { high: 0, medium: 1, low: 2 };
            return (order[a.confidence] - order[b.confidence]) || a.node.name.localeCompare(b.node.name);
        });
        return unused;
    }
    isEntryPoint(node) {
        const meta = node.metadata;
        const annotations = (meta.annotations || []).map(a => a.toLowerCase());
        const interfaces = (meta.interfaces || []).map(i => i.toLowerCase());
        if (interfaces.some(i => ['schedulable', 'batchable', 'queueable', 'database.batchable'].includes(i))) {
            return 'Platform-invoked (Schedulable/Batchable/Queueable)';
        }
        if (annotations.some(a => [
            '@restresource', '@invocablemethod', '@invocablevariable',
            '@httpget', '@httppost', '@httppatch', '@httpput', '@httpdelete',
        ].includes(a))) {
            return 'Platform entry point (REST/Invocable)';
        }
        if (annotations.includes('@auraenabled')) {
            return 'Exposed to Lightning (AuraEnabled)';
        }
        if (node.type === 'lwc' && meta.isExposed && meta.targets && meta.targets.length > 0) {
            return 'Exposed LWC component (App Builder / Community)';
        }
        if (node.type === 'aura' && meta.interfaces && meta.interfaces.length > 0) {
            const pageInterfaces = meta.interfaces.some(i => i.includes('flexipage') || i.includes('appHostable') ||
                i.includes('availableForAllPageTypes'));
            if (pageInterfaces) {
                return 'Aura component with page interface (platform-placed)';
            }
        }
        if (node.type === 'aura' && meta.isExposed) {
            return 'Aura component with design file (App Builder)';
        }
        if (node.type === 'apex-trigger') {
            return 'Trigger (platform-invoked)';
        }
        return null;
    }
    assessConfidence(node) {
        const meta = node.metadata;
        if (node.type === 'apex-class' &&
            !meta.isAbstract &&
            !meta.isVirtual &&
            (!meta.annotations || meta.annotations.length <= 1) &&
            (!meta.interfaces || meta.interfaces.length === 0)) {
            return 'high';
        }
        if (meta.isAbstract || meta.isVirtual) {
            return 'low';
        }
        if (node.type === 'apex-interface') {
            return 'low';
        }
        return 'medium';
    }
    buildReason(node) {
        const parts = [`No incoming references found for ${node.type} "${node.name}".`];
        if (node.metadata.isAbstract) {
            parts.push('Note: abstract class — subclasses may exist outside this project.');
        }
        if (node.metadata.isVirtual) {
            parts.push('Note: virtual class — extensions may exist outside this project.');
        }
        if (node.type === 'lwc' && !node.metadata.isExposed) {
            parts.push('LWC is not marked as exposed in its meta XML.');
        }
        if (node.type === 'aura') {
            parts.push('Aura component has no incoming composition references.');
        }
        return parts.join(' ');
    }
}
exports.DependencyAnalyzer = DependencyAnalyzer;
//# sourceMappingURL=dependencyAnalyzer.js.map