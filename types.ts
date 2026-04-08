export interface NodeMetadata {
  linesOfCode?: number;
  superClass?: string;
  interfaces?: string[];
  annotations?: string[];
  apiProperties?: string[];
  isExposed?: boolean;
  isAbstract?: boolean;
  isVirtual?: boolean;
  isTest?: boolean;
  targets?: string[];
  sharingModel?: string;
  wireAdapters?: string[];
}

export interface DependencyNode {
  id: string;
  name: string;
  type: 'apex-class' | 'apex-interface' | 'apex-trigger' | 'lwc' | 'aura' | 'sobject';
  filePath: string;
  metadata: NodeMetadata;
  isUnused: boolean;
}

export interface DependencyEdge {
  source: string;
  target: string;
  type: string;
}

export interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  edges: DependencyEdge[];
  analyzedAt: Date;
  workspacePath: string;
}

export interface UnusedItem {
  node: DependencyNode;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

export interface ParseError {
  filePath: string;
  message: string;
}

export interface AnalysisResult {
  graph: DependencyGraph;
  unused: UnusedItem[];
  stats: {
    totalApexClasses: number;
    totalLwcComponents: number;
    totalAuraComponents: number;
    totalTriggers: number;
    totalEdges: number;
    unusedCount: number;
  };
  errors: ParseError[];
}
