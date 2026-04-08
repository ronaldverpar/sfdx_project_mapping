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
exports.LwcParser = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
class LwcParser {
    constructor() {
        this.errors = [];
    }
    async findLwcComponents(workspacePath) {
        const pattern = new vscode.RelativePattern(workspacePath, '**/lwc/*/*.js');
        const exclude = new vscode.RelativePattern(workspacePath, '**/{.sfdx,node_modules,__tests__}/**');
        const uris = await vscode.workspace.findFiles(pattern, exclude);
        // Filter to only component entry points (name matches folder)
        return uris
            .filter(u => {
            const dir = path.basename(path.dirname(u.fsPath));
            const file = path.basename(u.fsPath, '.js');
            return dir === file;
        })
            .map(u => u.fsPath);
    }
    async parseComponent(jsFilePath) {
        const componentDir = path.dirname(jsFilePath);
        const componentName = path.basename(componentDir);
        const jsSource = await this.readFile(jsFilePath);
        const htmlPath = path.join(componentDir, `${componentName}.html`);
        const metaPath = path.join(componentDir, `${componentName}.js-meta.xml`);
        const htmlSource = await this.readFileSafe(htmlPath);
        const metaSource = await this.readFileSafe(metaPath);
        const metadata = this.extractMetadata(jsSource, htmlSource, metaSource);
        const node = {
            id: `lwc:${componentName}`,
            name: componentName,
            type: 'lwc',
            filePath: jsFilePath,
            metadata,
            isUnused: false,
        };
        const edges = [
            ...this.extractJsEdges(jsSource, node.id),
            ...this.extractHtmlEdges(htmlSource, node.id),
        ];
        return { node, edges };
    }
    getErrors() {
        return [...this.errors];
    }
    extractMetadata(js, html, meta) {
        const metadata = {
            linesOfCode: js.split('\n').length + html.split('\n').length,
        };
        // @api properties
        const apiRegex = /@api\s+(?:get\s+)?(\w+)/g;
        const apiProps = [];
        let m;
        while ((m = apiRegex.exec(js)) !== null) {
            apiProps.push(m[1]);
        }
        metadata.apiProperties = apiProps;
        // @wire adapters
        const wireRegex = /@wire\(\s*(\w+)/g;
        const wires = [];
        while ((m = wireRegex.exec(js)) !== null) {
            wires.push(m[1]);
        }
        metadata.wireAdapters = wires;
        // XML metadata
        if (meta) {
            metadata.isExposed = /<isExposed>true<\/isExposed>/i.test(meta);
            const targetRegex = /<target>([^<]+)<\/target>/g;
            const targets = [];
            while ((m = targetRegex.exec(meta)) !== null) {
                targets.push(m[1].trim());
            }
            metadata.targets = targets;
        }
        return metadata;
    }
    extractJsEdges(js, sourceId) {
        const edges = [];
        const seen = new Set();
        // Apex imports: import x from '@salesforce/apex/Controller.method'
        const apexRegex = /@salesforce\/apex\/(\w+)\.\w+/g;
        let m;
        while ((m = apexRegex.exec(js)) !== null) {
            const controller = m[1];
            if (!seen.has(`apex:${controller}`)) {
                seen.add(`apex:${controller}`);
                edges.push({ source: sourceId, target: `apex:${controller}`, type: 'apex-import' });
            }
        }
        // LWC JS imports: import X from 'c/componentName'
        const lwcImportRegex = /from\s+['"]c\/(\w+)['"]/g;
        while ((m = lwcImportRegex.exec(js)) !== null) {
            const comp = m[1];
            if (!seen.has(`lwc:${comp}`)) {
                seen.add(`lwc:${comp}`);
                edges.push({ source: sourceId, target: `lwc:${comp}`, type: 'lwc-composition' });
            }
        }
        // @wire adapters
        const wireImportRegex = /import\s+\{[^}]*\}\s+from\s+['"]([^'"]+)['"]/g;
        const wireRegex = /@wire\(\s*(\w+)/g;
        const wireAdapters = [];
        while ((m = wireRegex.exec(js)) !== null) {
            wireAdapters.push(m[1]);
        }
        for (const adapter of wireAdapters) {
            const key = `wire:${adapter}`;
            if (!seen.has(key)) {
                seen.add(key);
                edges.push({ source: sourceId, target: key, type: 'wire-adapter' });
            }
        }
        return edges;
    }
    extractHtmlEdges(html, sourceId) {
        const edges = [];
        const seen = new Set();
        // <c-child-component> → lwc:childComponent
        const childRegex = /<c-([a-z][a-z0-9-]*)/g;
        let m;
        while ((m = childRegex.exec(html)) !== null) {
            const camelName = m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
            if (!seen.has(camelName)) {
                seen.add(camelName);
                edges.push({ source: sourceId, target: `lwc:${camelName}`, type: 'lwc-composition' });
            }
        }
        return edges;
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
    async readFileSafe(filePath) {
        try {
            const uri = vscode.Uri.file(filePath);
            const bytes = await vscode.workspace.fs.readFile(uri);
            return Buffer.from(bytes).toString('utf-8');
        }
        catch {
            return '';
        }
    }
}
exports.LwcParser = LwcParser;
//# sourceMappingURL=lwcParser.js.map