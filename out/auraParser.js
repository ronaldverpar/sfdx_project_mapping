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
exports.AuraParser = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
/**
 * Parses Aura components (.cmp bundles).
 *
 * Scans:
 *  - .cmp markup for <c:ChildComponent /> composition and <aura:dependency>
 *  - Controller.js / Helper.js for Apex action calls: action.setParams, c.MyApexController
 *  - .design file for design attributes
 *  - Component .cmp for aura:attribute, implements interfaces
 */
class AuraParser {
    constructor() {
        this.errors = [];
    }
    /**
     * Find all Aura component bundles by locating .cmp files.
     */
    async findAuraComponents(workspacePath) {
        const pattern = new vscode.RelativePattern(workspacePath, '**/aura/*/*.cmp');
        const exclude = new vscode.RelativePattern(workspacePath, '**/{.sfdx,node_modules}/**');
        const uris = await vscode.workspace.findFiles(pattern, exclude);
        return uris.map(u => u.fsPath);
    }
    async parseComponent(cmpFilePath) {
        const componentDir = path.dirname(cmpFilePath);
        const componentName = path.basename(componentDir);
        // Read bundle files
        const cmpSource = await this.readFile(cmpFilePath);
        const controllerPath = path.join(componentDir, `${componentName}Controller.js`);
        const helperPath = path.join(componentDir, `${componentName}Helper.js`);
        const designPath = path.join(componentDir, `${componentName}.design`);
        const controllerSource = await this.readFileSafe(controllerPath);
        const helperSource = await this.readFileSafe(helperPath);
        const designSource = await this.readFileSafe(designPath);
        const metadata = this.extractMetadata(cmpSource, controllerSource, helperSource, designSource);
        const node = {
            id: `aura:${componentName}`,
            name: componentName,
            type: 'aura',
            filePath: cmpFilePath,
            metadata,
            isUnused: false,
        };
        const edges = [
            ...this.extractMarkupEdges(cmpSource, node.id),
            ...this.extractJsEdges(controllerSource, helperSource, node.id),
        ];
        return { node, edges };
    }
    getErrors() {
        return [...this.errors];
    }
    // ─── Metadata ─────────────────────────────────────────────
    extractMetadata(cmp, controller, helper, design) {
        const meta = {
            linesOfCode: cmp.split('\n').length +
                controller.split('\n').length +
                helper.split('\n').length,
        };
        // Apex controller reference: controller="MyApexController"
        const ctrlMatch = cmp.match(/controller\s*=\s*"(\w+)"/i);
        if (ctrlMatch) {
            meta.superClass = ctrlMatch[1]; // repurpose field for Apex controller
        }
        // Interfaces: implements="flexipage:availableForAllPageTypes,force:hasRecordId"
        const implMatch = cmp.match(/implements\s*=\s*"([^"]+)"/i);
        if (implMatch) {
            meta.interfaces = implMatch[1].split(',').map(s => s.trim());
        }
        // aura:attribute tags
        const attrRegex = /<aura:attribute\s+name\s*=\s*"(\w+)"/g;
        const attrs = [];
        let m;
        while ((m = attrRegex.exec(cmp)) !== null) {
            attrs.push(m[1]);
        }
        meta.apiProperties = attrs;
        // Check if exposed via design file
        meta.isExposed = design.length > 0;
        // Extract targets from design file
        if (design) {
            const targetRegex = /<design:component\s[^>]*>/i;
            meta.targets = targetRegex.test(design) ? ['aura:designComponent'] : [];
        }
        return meta;
    }
    // ─── Markup Edge Extraction ───────────────────────────────
    extractMarkupEdges(cmp, sourceId) {
        const edges = [];
        const seen = new Set();
        // <c:ChildComponent /> — custom component composition
        const cTagRegex = /<c:(\w+)/g;
        let m;
        while ((m = cTagRegex.exec(cmp)) !== null) {
            const childName = m[1];
            if (!seen.has(childName)) {
                seen.add(childName);
                edges.push({
                    source: sourceId,
                    target: `aura:${childName}`,
                    type: 'lwc-composition', // reuse edge type for aura composition
                });
            }
        }
        // <namespace:componentName /> — other namespace references
        const nsTagRegex = /<(?!aura:|ui:|force:|lightning:|c:)(\w+):(\w+)/g;
        while ((m = nsTagRegex.exec(cmp)) !== null) {
            const refName = `${m[1]}:${m[2]}`;
            if (!seen.has(refName)) {
                seen.add(refName);
                // External namespace reference — we note it but can't resolve
            }
        }
        // <aura:dependency resource="..."/>
        const depRegex = /<aura:dependency\s+resource\s*=\s*"markup:\/\/c:(\w+)"/g;
        while ((m = depRegex.exec(cmp)) !== null) {
            const depName = m[1];
            if (!seen.has(depName)) {
                seen.add(depName);
                edges.push({
                    source: sourceId,
                    target: `aura:${depName}`,
                    type: 'lwc-composition',
                });
            }
        }
        // Apex controller binding: controller="MyApexController"
        const ctrlMatch = cmp.match(/controller\s*=\s*"(\w+)"/i);
        if (ctrlMatch) {
            edges.push({
                source: sourceId,
                target: `apex:${ctrlMatch[1]}`,
                type: 'apex-import',
            });
        }
        // <lightning:empApi /> and other standard Lightning components referenced
        // (not tracked as custom deps, but could be useful for completeness)
        return edges;
    }
    // ─── JS Edge Extraction ───────────────────────────────────
    extractJsEdges(controller, helper, sourceId) {
        const edges = [];
        const allJs = controller + '\n' + helper;
        // Apex action calls: action = cmp.get("c.apexMethodName")
        const actionRegex = /\.get\(\s*["']c\.(\w+)["']\s*\)/g;
        let m;
        const seen = new Set();
        while ((m = actionRegex.exec(allJs)) !== null) {
            // The method name alone doesn't tell us the controller class,
            // but the controller attribute on the .cmp does — that edge
            // is already captured in markup edges. We note the method call.
        }
        // $A.createComponent("c:ComponentName", ...)
        const createRegex = /\$A\.createComponent\w*\(\s*["']c:(\w+)["']/g;
        while ((m = createRegex.exec(allJs)) !== null) {
            const compName = m[1];
            if (!seen.has(compName)) {
                seen.add(compName);
                edges.push({
                    source: sourceId,
                    target: `aura:${compName}`,
                    type: 'instantiates',
                });
            }
        }
        // component.find("childAuraId") — can't resolve to component name from JS alone
        // but we track it for potential future enhancement
        // Event references: $A.get("e.c:MyEvent") or cmp.getEvent("myEvent")
        const eventRegex = /["']e\.c:(\w+)["']/g;
        while ((m = eventRegex.exec(allJs)) !== null) {
            const eventName = m[1];
            if (!seen.has(eventName)) {
                seen.add(eventName);
                edges.push({
                    source: sourceId,
                    target: `aura-event:${eventName}`,
                    type: 'type-reference',
                });
            }
        }
        return edges;
    }
    // ─── File Helpers ─────────────────────────────────────────
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
exports.AuraParser = AuraParser;
//# sourceMappingURL=auraParser.js.map