import * as vscode from 'vscode';
import * as path from 'path';
import { DependencyNode, DependencyEdge, NodeMetadata, ParseError } from './types';

export class LwcParser {
  private errors: ParseError[] = [];

  async findLwcComponents(workspacePath: string): Promise<string[]> {
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

  async parseComponent(
    jsFilePath: string
  ): Promise<{ node: DependencyNode; edges: DependencyEdge[] }> {
    const componentDir = path.dirname(jsFilePath);
    const componentName = path.basename(componentDir);

    const jsSource = await this.readFile(jsFilePath);
    const htmlPath = path.join(componentDir, `${componentName}.html`);
    const metaPath = path.join(componentDir, `${componentName}.js-meta.xml`);

    const htmlSource = await this.readFileSafe(htmlPath);
    const metaSource = await this.readFileSafe(metaPath);

    const metadata = this.extractMetadata(jsSource, htmlSource, metaSource);
    const node: DependencyNode = {
      id: `lwc:${componentName}`,
      name: componentName,
      type: 'lwc',
      filePath: jsFilePath,
      metadata,
      isUnused: false,
    };

    const edges: DependencyEdge[] = [
      ...this.extractJsEdges(jsSource, node.id),
      ...this.extractHtmlEdges(htmlSource, node.id),
    ];

    return { node, edges };
  }

  getErrors(): ParseError[] {
    return [...this.errors];
  }

  private extractMetadata(js: string, html: string, meta: string): NodeMetadata {
    const metadata: NodeMetadata = {
      linesOfCode: js.split('\n').length + html.split('\n').length,
    };

    // @api properties
    const apiRegex = /@api\s+(?:get\s+)?(\w+)/g;
    const apiProps: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = apiRegex.exec(js)) !== null) {
      apiProps.push(m[1]);
    }
    metadata.apiProperties = apiProps;

    // @wire adapters
    const wireRegex = /@wire\(\s*(\w+)/g;
    const wires: string[] = [];
    while ((m = wireRegex.exec(js)) !== null) {
      wires.push(m[1]);
    }
    metadata.wireAdapters = wires;

    // XML metadata
    if (meta) {
      metadata.isExposed = /<isExposed>true<\/isExposed>/i.test(meta);

      const targetRegex = /<target>([^<]+)<\/target>/g;
      const targets: string[] = [];
      while ((m = targetRegex.exec(meta)) !== null) {
        targets.push(m[1].trim());
      }
      metadata.targets = targets;
    }

    return metadata;
  }

  private extractJsEdges(js: string, sourceId: string): DependencyEdge[] {
    const edges: DependencyEdge[] = [];
    const seen = new Set<string>();

    // Apex imports: import x from '@salesforce/apex/Controller.method'
    const apexRegex = /@salesforce\/apex\/(\w+)\.\w+/g;
    let m: RegExpExecArray | null;
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
    const wireAdapters: string[] = [];
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

  private extractHtmlEdges(html: string, sourceId: string): DependencyEdge[] {
    const edges: DependencyEdge[] = [];
    const seen = new Set<string>();

    // <c-child-component> → lwc:childComponent
    const childRegex = /<c-([a-z][a-z0-9-]*)/g;
    let m: RegExpExecArray | null;
    while ((m = childRegex.exec(html)) !== null) {
      const camelName = m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (!seen.has(camelName)) {
        seen.add(camelName);
        edges.push({ source: sourceId, target: `lwc:${camelName}`, type: 'lwc-composition' });
      }
    }

    return edges;
  }

  private async readFile(filePath: string): Promise<string> {
    try {
      const uri = vscode.Uri.file(filePath);
      const bytes = await vscode.workspace.fs.readFile(uri);
      return Buffer.from(bytes).toString('utf-8');
    } catch (err) {
      this.errors.push({ filePath, message: `Failed to read: ${err}` });
      return '';
    }
  }

  private async readFileSafe(filePath: string): Promise<string> {
    try {
      const uri = vscode.Uri.file(filePath);
      const bytes = await vscode.workspace.fs.readFile(uri);
      return Buffer.from(bytes).toString('utf-8');
    } catch {
      return '';
    }
  }
}
