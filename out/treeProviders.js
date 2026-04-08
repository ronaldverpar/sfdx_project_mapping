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
exports.DependencyTreeProvider = exports.UnusedTreeProvider = void 0;
const vscode = __importStar(require("vscode"));
class UnusedTreeProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }
    refresh(result) {
        this.result = result;
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren() {
        if (!this.result) {
            return [new vscode.TreeItem('Run analysis first')];
        }
        return this.result.unused.map(u => {
            const item = new vscode.TreeItem(u.node.name);
            item.description = `${u.node.type} — ${u.confidence} confidence`;
            item.tooltip = u.reason;
            item.command = {
                command: 'vscode.open',
                title: 'Open File',
                arguments: [vscode.Uri.file(u.node.filePath)],
            };
            return item;
        });
    }
}
exports.UnusedTreeProvider = UnusedTreeProvider;
class DependencyTreeProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }
    refresh(result) {
        this.result = result;
        this._onDidChangeTreeData.fire();
    }
    setActiveNode(nodeId) {
        this.activeNodeId = nodeId;
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren() {
        if (!this.result) {
            return [new vscode.TreeItem('Run analysis first')];
        }
        const { stats } = this.result;
        return [
            new vscode.TreeItem(`Apex classes: ${stats.totalApexClasses}`),
            new vscode.TreeItem(`LWC components: ${stats.totalLwcComponents}`),
            new vscode.TreeItem(`Aura components: ${stats.totalAuraComponents}`),
            new vscode.TreeItem(`Triggers: ${stats.totalTriggers}`),
            new vscode.TreeItem(`Edges: ${stats.totalEdges}`),
            new vscode.TreeItem(`Unused: ${stats.unusedCount}`),
        ];
    }
}
exports.DependencyTreeProvider = DependencyTreeProvider;
//# sourceMappingURL=treeProviders.js.map