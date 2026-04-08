import * as vscode from 'vscode';
import * as path from 'path';
import { DependencyNode, DependencyEdge, ParseError } from './types';

const BUILT_IN_TYPES = new Set([
  'String', 'Integer', 'Long', 'Double', 'Decimal', 'Boolean', 'Date',
  'Datetime', 'Time', 'Id', 'Blob', 'Object', 'SObject', 'void',
  'List', 'Set', 'Map', 'System', 'Trigger', 'Database', 'Schema',
  'Type', 'JSON', 'Math', 'Limits', 'UserInfo', 'Test', 'Assert',
]);

export class TriggerParser {
  private errors: ParseError[] = [];

  async findTriggerFiles(workspacePath: string): Promise<string[]> {
    const pattern = new vscode.RelativePattern(workspacePath, '**/triggers/*.trigger');
    const exclude = new vscode.RelativePattern(workspacePath, '**/{.sfdx,node_modules}/**');
    const uris = await vscode.workspace.findFiles(pattern, exclude);
    return uris.map(u => u.fsPath);
  }

  async parseFile(
    filePath: string,
    source?: string
  ): Promise<{ node: DependencyNode; edges: DependencyEdge[] }> {
    if (!source) {
      source = await this.readFile(filePath);
    }

    const triggerName = path.basename(filePath, '.trigger');

    // Parse: trigger TriggerName on SObjectName (events) { body }
    const headerMatch = source.match(
      /trigger\s+(\w+)\s+on\s+(\w+)\s*\(([^)]+)\)/i
    );

    const sObjectName = headerMatch ? headerMatch[2] : 'Unknown';
    const events = headerMatch
      ? headerMatch[3].split(',').map(e => e.trim().toLowerCase())
      : [];

    const node: DependencyNode = {
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

    const edges: DependencyEdge[] = [];
    const seen = new Set<string>();

    // Edge to SObject
    edges.push({
      source: node.id,
      target: `sobject:${sObjectName}`,
      type: 'trigger-object',
    });

    // Static calls: ClassName.method(
    const staticRegex = /\b([A-Z]\w+)\.(\w+)\s*\(/g;
    let m: RegExpExecArray | null;
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

  getErrors(): ParseError[] {
    return [...this.errors];
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
}
