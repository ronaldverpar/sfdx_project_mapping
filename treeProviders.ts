import * as vscode from 'vscode';
import { AnalysisResult } from './types';

export class UnusedTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private result: AnalysisResult | undefined;

  refresh(result: AnalysisResult): void {
    this.result = result;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.TreeItem[] {
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

export class DependencyTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private result: AnalysisResult | undefined;
  private activeNodeId: string | undefined;

  refresh(result: AnalysisResult): void {
    this.result = result;
    this._onDidChangeTreeData.fire();
  }

  setActiveNode(nodeId: string): void {
    this.activeNodeId = nodeId;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.TreeItem[] {
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
