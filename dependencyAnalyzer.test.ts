import { DependencyAnalyzer } from '../../src/analyzers/dependencyAnalyzer';
import { DependencyGraph, DependencyNode, DependencyEdge } from '../../src/types';

/**
 * Tests for the graph traversal and unused detection logic.
 * These tests use hand-built graphs to avoid filesystem/VS Code dependencies.
 */
describe('DependencyAnalyzer — Graph Utilities', () => {
  let analyzer: DependencyAnalyzer;

  beforeEach(() => {
    analyzer = new DependencyAnalyzer();
  });

  // ─── Helper: build a test graph ───────────────────────────

  function buildGraph(
    nodeEntries: Array<Partial<DependencyNode> & { id: string }>,
    edges: DependencyEdge[]
  ): DependencyGraph {
    const nodes = new Map<string, DependencyNode>();
    for (const entry of nodeEntries) {
      nodes.set(entry.id, {
        id: entry.id,
        name: entry.name ?? entry.id.split(':')[1] ?? entry.id,
        type: entry.type ?? 'apex-class',
        filePath: entry.filePath ?? `/mock/${entry.id}.cls`,
        metadata: entry.metadata ?? {},
        isUnused: entry.isUnused ?? false,
      });
    }
    return {
      nodes,
      edges,
      analyzedAt: new Date(),
      workspacePath: '/mock',
    };
  }

  // ─── getNeighbors ─────────────────────────────────────────

  describe('getNeighbors', () => {
    it('should return direct dependencies and dependents', () => {
      const graph = buildGraph(
        [
          { id: 'apex:A' },
          { id: 'apex:B' },
          { id: 'apex:C' },
          { id: 'apex:D' },
        ],
        [
          { source: 'apex:A', target: 'apex:B', type: 'extends' },
          { source: 'apex:A', target: 'apex:C', type: 'instantiates' },
          { source: 'apex:D', target: 'apex:A', type: 'static-call' },
        ]
      );

      const { dependsOn, usedBy } = analyzer.getNeighbors(graph, 'apex:A');

      expect(dependsOn.map(d => d.node.id)).toEqual(['apex:B', 'apex:C']);
      expect(usedBy.map(d => d.node.id)).toEqual(['apex:D']);
    });

    it('should return empty arrays for isolated nodes', () => {
      const graph = buildGraph(
        [{ id: 'apex:Lonely' }],
        []
      );

      const { dependsOn, usedBy } = analyzer.getNeighbors(graph, 'apex:Lonely');
      expect(dependsOn).toHaveLength(0);
      expect(usedBy).toHaveLength(0);
    });
  });

  // ─── getReachable ─────────────────────────────────────────

  describe('getReachable', () => {
    it('should find all transitively reachable nodes (outgoing)', () => {
      // A → B → C → D
      const graph = buildGraph(
        [
          { id: 'apex:A' },
          { id: 'apex:B' },
          { id: 'apex:C' },
          { id: 'apex:D' },
        ],
        [
          { source: 'apex:A', target: 'apex:B', type: 'extends' },
          { source: 'apex:B', target: 'apex:C', type: 'instantiates' },
          { source: 'apex:C', target: 'apex:D', type: 'static-call' },
        ]
      );

      const reachable = analyzer.getReachable(graph, 'apex:A', 'outgoing');

      expect(reachable.size).toBe(3);
      expect(reachable.get('apex:B')?.depth).toBe(1);
      expect(reachable.get('apex:C')?.depth).toBe(2);
      expect(reachable.get('apex:D')?.depth).toBe(3);
    });

    it('should respect maxDepth', () => {
      const graph = buildGraph(
        [
          { id: 'apex:A' },
          { id: 'apex:B' },
          { id: 'apex:C' },
          { id: 'apex:D' },
        ],
        [
          { source: 'apex:A', target: 'apex:B', type: 'extends' },
          { source: 'apex:B', target: 'apex:C', type: 'extends' },
          { source: 'apex:C', target: 'apex:D', type: 'extends' },
        ]
      );

      const reachable = analyzer.getReachable(graph, 'apex:A', 'outgoing', 2);

      expect(reachable.size).toBe(2);
      expect(reachable.has('apex:B')).toBe(true);
      expect(reachable.has('apex:C')).toBe(true);
      expect(reachable.has('apex:D')).toBe(false);
    });

    it('should find all nodes reaching a target (incoming)', () => {
      // A → C, B → C, C → D
      const graph = buildGraph(
        [
          { id: 'apex:A' },
          { id: 'apex:B' },
          { id: 'apex:C' },
          { id: 'apex:D' },
        ],
        [
          { source: 'apex:A', target: 'apex:C', type: 'instantiates' },
          { source: 'apex:B', target: 'apex:C', type: 'instantiates' },
          { source: 'apex:C', target: 'apex:D', type: 'extends' },
        ]
      );

      const reachable = analyzer.getReachable(graph, 'apex:C', 'incoming');

      expect(reachable.size).toBe(2);
      expect(reachable.has('apex:A')).toBe(true);
      expect(reachable.has('apex:B')).toBe(true);
    });

    it('should handle cycles without infinite loops', () => {
      // A → B → C → A (cycle)
      const graph = buildGraph(
        [
          { id: 'apex:A' },
          { id: 'apex:B' },
          { id: 'apex:C' },
        ],
        [
          { source: 'apex:A', target: 'apex:B', type: 'instantiates' },
          { source: 'apex:B', target: 'apex:C', type: 'instantiates' },
          { source: 'apex:C', target: 'apex:A', type: 'instantiates' },
        ]
      );

      // Should not hang
      const reachable = analyzer.getReachable(graph, 'apex:A', 'outgoing');
      expect(reachable.size).toBe(2);
    });
  });

  // ─── getImpactedNodes ─────────────────────────────────────

  describe('getImpactedNodes', () => {
    it('should return all nodes that depend on a given node', () => {
      //   A
      //  / \
      // B   C
      //  \ /
      //   D
      const graph = buildGraph(
        [
          { id: 'apex:A' },
          { id: 'apex:B' },
          { id: 'apex:C' },
          { id: 'apex:D' },
        ],
        [
          { source: 'apex:B', target: 'apex:A', type: 'extends' },
          { source: 'apex:C', target: 'apex:A', type: 'extends' },
          { source: 'apex:D', target: 'apex:B', type: 'instantiates' },
          { source: 'apex:D', target: 'apex:C', type: 'instantiates' },
        ]
      );

      const impacted = analyzer.getImpactedNodes(graph, 'apex:A');

      // B and C depend on A; D depends on B and C
      const ids = impacted.map(n => n.id);
      expect(ids).toContain('apex:B');
      expect(ids).toContain('apex:C');
      expect(ids).toContain('apex:D');
    });
  });

  // ─── findCycles ───────────────────────────────────────────

  describe('findCycles', () => {
    it('should detect a simple cycle', () => {
      const graph = buildGraph(
        [
          { id: 'apex:A' },
          { id: 'apex:B' },
          { id: 'apex:C' },
        ],
        [
          { source: 'apex:A', target: 'apex:B', type: 'instantiates' },
          { source: 'apex:B', target: 'apex:C', type: 'instantiates' },
          { source: 'apex:C', target: 'apex:A', type: 'instantiates' },
        ]
      );

      const cycles = analyzer.findCycles(graph);
      expect(cycles.length).toBeGreaterThan(0);

      // The cycle should contain all three nodes
      const cycle = cycles[0];
      expect(cycle).toContain('apex:A');
      expect(cycle).toContain('apex:B');
      expect(cycle).toContain('apex:C');
    });

    it('should return empty array for acyclic graph', () => {
      const graph = buildGraph(
        [
          { id: 'apex:A' },
          { id: 'apex:B' },
          { id: 'apex:C' },
        ],
        [
          { source: 'apex:A', target: 'apex:B', type: 'extends' },
          { source: 'apex:B', target: 'apex:C', type: 'extends' },
        ]
      );

      const cycles = analyzer.findCycles(graph);
      expect(cycles.length).toBe(0);
    });
  });

  // ─── findClusters ─────────────────────────────────────────

  describe('findClusters', () => {
    it('should identify disconnected clusters', () => {
      const graph = buildGraph(
        [
          // Cluster 1: A ↔ B
          { id: 'apex:A' },
          { id: 'apex:B' },
          // Cluster 2: C ↔ D
          { id: 'apex:C' },
          { id: 'apex:D' },
          // Cluster 3: isolated E
          { id: 'apex:E' },
        ],
        [
          { source: 'apex:A', target: 'apex:B', type: 'extends' },
          { source: 'apex:C', target: 'apex:D', type: 'extends' },
        ]
      );

      const clusters = analyzer.findClusters(graph);
      expect(clusters.size).toBe(3);

      // One cluster has A+B, one has C+D, one has E
      const sizes = [...clusters.values()].map(c => c.length).sort();
      expect(sizes).toEqual([1, 2, 2]);
    });

    it('should return one cluster for fully connected graph', () => {
      const graph = buildGraph(
        [
          { id: 'apex:A' },
          { id: 'apex:B' },
          { id: 'apex:C' },
        ],
        [
          { source: 'apex:A', target: 'apex:B', type: 'extends' },
          { source: 'apex:B', target: 'apex:C', type: 'extends' },
        ]
      );

      const clusters = analyzer.findClusters(graph);
      expect(clusters.size).toBe(1);
    });
  });

  // ─── getNodeMetrics ───────────────────────────────────────

  describe('getNodeMetrics', () => {
    it('should compute in-degree and out-degree', () => {
      const graph = buildGraph(
        [
          { id: 'apex:Hub' },
          { id: 'apex:A' },
          { id: 'apex:B' },
          { id: 'apex:C' },
        ],
        [
          { source: 'apex:Hub', target: 'apex:A', type: 'instantiates' },
          { source: 'apex:Hub', target: 'apex:B', type: 'instantiates' },
          { source: 'apex:Hub', target: 'apex:C', type: 'instantiates' },
          { source: 'apex:A', target: 'apex:Hub', type: 'static-call' },
        ]
      );

      const metrics = analyzer.getNodeMetrics(graph, 'apex:Hub');

      expect(metrics.outDegree).toBe(3);
      expect(metrics.inDegree).toBe(1);
      expect(metrics.isHub).toBe(true); // 3 > avg*2 = 4/4*2 = 2
    });
  });
});
