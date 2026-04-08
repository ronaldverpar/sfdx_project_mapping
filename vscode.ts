/**
 * Mock for the 'vscode' module so tests can run outside VS Code.
 */

export const Uri = {
  file: (path: string) => ({ fsPath: path, scheme: 'file', path }),
};

export const workspace = {
  findFiles: jest.fn().mockResolvedValue([]),
  fs: {
    readFile: jest.fn().mockResolvedValue(Buffer.from('')),
  },
  getConfiguration: jest.fn().mockReturnValue({
    get: jest.fn((key: string, defaultValue: any) => defaultValue),
  }),
  workspaceFolders: [{ uri: { fsPath: '/mock-workspace' } }],
  openTextDocument: jest.fn(),
  createFileSystemWatcher: jest.fn().mockReturnValue({
    onDidChange: jest.fn(),
    onDidCreate: jest.fn(),
    onDidDelete: jest.fn(),
    dispose: jest.fn(),
  }),
};

export const window = {
  showInformationMessage: jest.fn(),
  showWarningMessage: jest.fn(),
  showErrorMessage: jest.fn(),
  showQuickPick: jest.fn(),
  createOutputChannel: jest.fn().mockReturnValue({
    appendLine: jest.fn(),
    show: jest.fn(),
  }),
  withProgress: jest.fn(),
  registerTreeDataProvider: jest.fn(),
  showTextDocument: jest.fn(),
  createWebviewPanel: jest.fn().mockReturnValue({
    webview: {
      html: '',
      onDidReceiveMessage: jest.fn(),
      postMessage: jest.fn(),
      cspSource: '',
    },
    reveal: jest.fn(),
    onDidDispose: jest.fn(),
    dispose: jest.fn(),
  }),
};

export const commands = {
  registerCommand: jest.fn(),
  executeCommand: jest.fn(),
};

export const languages = {
  createDiagnosticCollection: jest.fn().mockReturnValue({
    set: jest.fn(),
    get: jest.fn(),
    clear: jest.fn(),
    delete: jest.fn(),
    dispose: jest.fn(),
  }),
};

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export class TreeItem {
  label: string;
  collapsibleState: TreeItemCollapsibleState;
  description?: string;
  tooltip?: string;
  command?: any;
  iconPath?: any;
  contextValue?: string;
  constructor(label: string, collapsibleState?: TreeItemCollapsibleState) {
    this.label = label;
    this.collapsibleState = collapsibleState ?? TreeItemCollapsibleState.None;
  }
}

export class ThemeIcon {
  constructor(public id: string, public color?: any) {}
}

export class ThemeColor {
  constructor(public id: string) {}
}

export enum DiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3,
}

export class Diagnostic {
  range: any;
  message: string;
  severity: DiagnosticSeverity;
  source?: string;
  constructor(range: any, message: string, severity?: DiagnosticSeverity) {
    this.range = range;
    this.message = message;
    this.severity = severity ?? DiagnosticSeverity.Error;
  }
}

export class Range {
  constructor(
    public startLine: number,
    public startChar: number,
    public endLine: number,
    public endChar: number,
  ) {}
}

export enum ProgressLocation {
  SourceControl = 1,
  Window = 10,
  Notification = 15,
}

export class RelativePattern {
  constructor(public base: any, public pattern: string) {}
}

export enum ViewColumn {
  One = 1,
  Two = 2,
  Beside = -2,
}
