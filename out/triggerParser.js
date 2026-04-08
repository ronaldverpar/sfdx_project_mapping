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
exports.TriggerParser = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const BUILT_IN_TYPES = new Set([
    'String', 'Integer', 'Long', 'Double', 'Decimal', 'Boolean', 'Date',
    'Datetime', 'Time', 'Id', 'Blob', 'Object', 'SObject', 'void',
    'List', 'Set', 'Map', 'System', 'Trigger', 'Database', 'Schema',
    'Type', 'JSON', 'Math', 'Limits', 'UserInfo', 'Test', 'Assert',
]);
class TriggerParser {
    constructor() {
        this.errors = [];
    }
    async findTriggerFiles(workspacePath) {
        const pattern = new vscode.RelativePattern(workspacePath, '**/triggers/*.trigger');
        const exclude = new vscode.RelativePattern(workspacePath, '**/{.sfdx,node_modules}/**');
        const uris = await vscode.workspace.findFiles(pattern, exclude);
        return uris.map(u => u.fsPath);
    }
    async parseFile(filePath, source) {
        if (!source) {
            source = await this.readFile(filePath);
        }
        const triggerName = path.basename(filePath, '.trigger');
        // Parse: trigger TriggerName on SObjectName (events) { body }
        const headerMatch = source.match(/trigger\s+(\w+)\s+on\s+(\w+)\s*\(([^)]+)\)/i);
        const sObjectName = headerMatch ? headerMatch[2] : 'Unknown';
        const events = headerMatch
            ? headerMatch[3].split(',').map(e => e.trim().toLowerCase())
            : [];
        const node = {
            id: `trigger:${triggerName}`,
            name: triggerName,
            type: 'apex-trigger',
            filePath,
            metadata: {
                linesOfCode: source.split('\n').length,
                annotations: events,
            },
            isUnused: false,
        };
        const edges = [];
        const seen = new Set();
        // Edge to SObject
        edges.push({
            source: node.id,
            target: `sobject:${sObjectName}`,
            type: 'trigger-object',
        });
        // Static calls: ClassName.method(
        const staticRegex = /\b([A-Z]\w+)\.(\w+)\s*\(/g;
        let m;
        while ((m = staticRegex.exec(source)) !== null) {
            const cls = m[1];
            if (!BUILT_IN_TYPES.has(cls) && !seen.has(`static:${cls}`)) {
                seen.add(`static:${cls}`);
                edges.push({ source: node.id, target: `apex:${cls}`, type: 'static-call' });
            }
        }
        // Instantiations: new ClassName(
        const newRegex = /\bnew\s+(\w+)\s*\(/g;
        while ((m = newRegex.exec(source)) !== null) {
            const cls = m[1];
            if (!BUILT_IN_TYPES.has(cls) && !seen.has(`new:${cls}`)) {
                seen.add(`new:${cls}`);
                edges.push({ source: node.id, target: `apex:${cls}`, type: 'instantiates' });
            }
        }
        return { node, edges };
    }
    getErrors() {
        return [...this.errors];
    }
    async readFile(filePath) {
        try {
            const uri = vscode.Uri.file(filePath);
            const bytes = await vscode.workspace.fs.readFile(uri);
            return Buffer.from(bytes).toString('utf-8');
        }
        catch (err) {
            this.errors.push({ filePath, message: `Failed to read: ${err}` });
            return '';
        }
    }
}
exports.TriggerParser = TriggerParser;
//# sourceMappingURL=triggerParser.js.map