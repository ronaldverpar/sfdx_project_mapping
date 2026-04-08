import * as vscode from 'vscode';
import * as path from 'path';
import { DependencyNode, DependencyEdge, NodeMetadata, ParseError } from './types';

const BUILT_IN_TYPES = new Set([
  'String', 'Integer', 'Long', 'Double', 'Decimal', 'Boolean', 'Date',
  'Datetime', 'Time', 'Id', 'Blob', 'Object', 'SObject', 'void',
  'List', 'Set', 'Map', 'System', 'Trigger', 'Database', 'Schema',
  'Type', 'JSON', 'Math', 'Limits', 'UserInfo', 'Test', 'Assert',
  'ApexPages', 'Messaging', 'Auth', 'ConnectApi', 'Site',
]);

const STANDARD_SOBJECTS = new Set([
  'Account', 'Contact', 'Lead', 'Opportunity', 'Case', 'Task', 'Event',
  'User', 'Profile', 'RecordType', 'Campaign', 'CampaignMember',
  'Contract', 'Order', 'OrderItem', 'Product2', 'Pricebook2',
  'PricebookEntry', 'Asset', 'Solution', 'ContentDocument',
  'ContentVersion', 'Attachment', 'Note', 'FeedItem', 'EmailMessage',
  'Group', 'GroupMember', 'PermissionSet', 'PermissionSetAssignment',
  'UserRole', 'Organization', 'BusinessHours', 'Holiday',
  'OpportunityLineItem', 'OpportunityContactRole', 'AccountContactRole',
  'CaseComment', 'TaskRelation', 'EventRelation',
  'ContentDocumentLink', 'FeedComment', 'CollaborationGroup',
  'Document', 'Folder', 'Report', 'Dashboard',
]);

export class ApexParser {
  private errors: ParseError[] = [];

  async findApexFiles(workspacePath: string): Promise<string[]> {
    const pattern = new vscode.RelativePattern(workspacePath, '**/classes/*.cls');
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

    const className = path.basename(filePath, '.cls');
    const cleaned = this.stripCommentsAndStrings(source);

    const metadata = this.extractMetadata(source, cleaned);
    const isInterface = /\binterface\s+\w+/i.test(cleaned);

    const node: DependencyNode = {
      id: `apex:${className}`,
      name: className,
      type: isInterface ? 'apex-interface' : 'apex-class',
      filePath,
      metadata,
      isUnused: false,
    };

    const edges = this.extractEdges(cleaned, node.id);
    return { node, edges };
  }

  getErrors(): ParseError[] {
    return [...this.errors];
  }

  private extractMetadata(raw: string, cleaned: string): NodeMetadata {
    const meta: NodeMetadata = {
      linesOfCode: raw.split('\n').length,
      isTest: false,
      isAbstract: false,
      isVirtual: false,
    };

    // Sharing model
    const sharingMatch = cleaned.match(/\b(with\s+sharing|without\s+sharing|inherited\s+sharing)\b/i);
    if (sharingMatch) {
      meta.sharingModel = sharingMatch[1].toLowerCase().replace(/\s+/g, ' ');
    }

    // Abstract / virtual
    meta.isAbstract = /\babstract\s+class\b/i.test(cleaned);
    meta.isVirtual = /\bvirtual\s+class\b/i.test(cleaned);

    // Annotations
    const annotations: string[] = [];
    const annotRegex = /@(\w+)/g;
    let m: RegExpExecArray | null;
    while ((m = annotRegex.exec(raw)) !== null) {
      const name = `@${m[1]}`;
      if (!annotations.includes(name)) {
        annotations.push(name);
      }
    }
    meta.annotations = annotations;
    meta.isTest = annotations.some(a => a.toLowerCase() === '@istest');

    // Superclass
    const extendsMatch = cleaned.match(/\bclass\s+\w+\s+extends\s+(\w+)/i);
    if (extendsMatch) {
      meta.superClass = extendsMatch[1];
    }

    // Interfaces
    const implMatch = cleaned.match(/\bimplements\s+([^{]+)/i);
    if (implMatch) {
      meta.interfaces = implMatch[1].split(',').map(s => s.trim()).filter(Boolean);
    }

    return meta;
  }

  private extractEdges(cleaned: string, sourceId: string): DependencyEdge[] {
    const edges: DependencyEdge[] = [];
    const seen = new Set<string>();

    const addEdge = (target: string, type: string) => {
      const key = `${target}::${type}`;
      if (seen.has(key)) { return; }
      seen.add(key);
      edges.push({ source: sourceId, target, type });
    };

    // extends
    const extendsMatch = cleaned.match(/\bclass\s+\w+\s+extends\s+(\w+)/i);
    if (extendsMatch && !BUILT_IN_TYPES.has(extendsMatch[1])) {
      addEdge(`apex:${extendsMatch[1]}`, 'extends');
    }

    // implements
    const implMatch = cleaned.match(/\bimplements\s+([^{]+)/i);
    if (implMatch) {
      const ifaces = implMatch[1].split(',').map(s => s.trim());
      for (const iface of ifaces) {
        const name = iface.split('.')[0].split('<')[0].trim();
        if (name && !BUILT_IN_TYPES.has(name)) {
          addEdge(`apex:${name}`, 'implements');
        }
      }
    }

    // new ClassName()
    const newRegex = /\bnew\s+(\w+)\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = newRegex.exec(cleaned)) !== null) {
      if (!BUILT_IN_TYPES.has(m[1])) {
        addEdge(`apex:${m[1]}`, 'instantiates');
      }
    }

    // Static method calls: ClassName.methodName(
    const staticRegex = /\b([A-Z]\w+)\.(\w+)\s*\(/g;
    while ((m = staticRegex.exec(cleaned)) !== null) {
      const cls = m[1];
      if (!BUILT_IN_TYPES.has(cls) && cls !== sourceId.replace('apex:', '')) {
        addEdge(`apex:${cls}`, 'static-call');
      }
    }

    // Type references: ClassName varName; or ClassName<...>
    const typeRefRegex = /\b([A-Z]\w+)\s+\w+\s*[;=,)]/g;
    while ((m = typeRefRegex.exec(cleaned)) !== null) {
      if (!BUILT_IN_TYPES.has(m[1]) && m[1] !== sourceId.replace('apex:', '')) {
        addEdge(`apex:${m[1]}`, 'type-reference');
      }
    }

    // Generic type parameters: List<CustomType>, Map<String, CustomType>
    const genericRegex = /[<,]\s*([A-Z]\w+)\s*[>,]/g;
    while ((m = genericRegex.exec(cleaned)) !== null) {
      if (!BUILT_IN_TYPES.has(m[1]) && m[1] !== sourceId.replace('apex:', '')) {
        addEdge(`apex:${m[1]}`, 'type-reference');
      }
    }

    // SObject references from SOQL queries: [SELECT ... FROM ObjectName ...]
    // Any identifier after FROM in SOQL is definitively an SObject
    const soqlFromRegex = /\bFROM\s+(\w+)/gi;
    while ((m = soqlFromRegex.exec(cleaned)) !== null) {
      const obj = m[1];
      if (!BUILT_IN_TYPES.has(obj)) {
        addEdge(`sobject:${obj}`, 'sobject-reference');
      }
    }

    // Custom objects used as types: CustomObject__c varName
    const customObjRegex = /\b(\w+__c)\b/gi;
    while ((m = customObjRegex.exec(cleaned)) !== null) {
      addEdge(`sobject:${m[1]}`, 'sobject-reference');
    }

    // Standard SObjects used as variable types: Account acc; List<Contact>; new Opportunity()
    const typeCtxRegex = /\b([A-Z]\w+)\s+\w+\s*[;=,)]/g;
    while ((m = typeCtxRegex.exec(cleaned)) !== null) {
      if (STANDARD_SOBJECTS.has(m[1])) {
        addEdge(`sobject:${m[1]}`, 'sobject-reference');
      }
    }
    const genericSobjRegex = /[<,]\s*([A-Z]\w+)\s*[>,]/g;
    while ((m = genericSobjRegex.exec(cleaned)) !== null) {
      if (STANDARD_SOBJECTS.has(m[1])) {
        addEdge(`sobject:${m[1]}`, 'sobject-reference');
      }
    }
    const newSobjRegex = /\bnew\s+([A-Z]\w+)\s*\(/g;
    while ((m = newSobjRegex.exec(cleaned)) !== null) {
      if (STANDARD_SOBJECTS.has(m[1])) {
        addEdge(`sobject:${m[1]}`, 'sobject-reference');
      }
    }

    return edges;
  }

  private stripCommentsAndStrings(source: string): string {
    // Remove single-line comments
    let result = source.replace(/\/\/.*$/gm, '');
    // Remove multi-line comments
    result = result.replace(/\/\*[\s\S]*?\*\//g, '');
    // Remove string literals
    result = result.replace(/'[^']*'/g, "''");
    return result;
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
