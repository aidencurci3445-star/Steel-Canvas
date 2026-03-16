import { Node, Edge } from '../types';

/**
 * Performs a Breadth-First Search (BFS) to find all nodes connected 
 * to a starting node, traveling bi-directionally across edges.
 */
export const getConnectedSubgraph = (startNodeId: string, nodes: Node[], edges: Edge[]): Node[] => {
    const visited = new Set<string>();
    const queue = [startNodeId];
    visited.add(startNodeId);

    // Build Adjacency List (Bi-directional mapping)
    const adj = new Map<string, string[]>();

    // Ignore folder-links for document exports, we only care about data node connectivity
    edges.forEach(edge => {
        if (edge.type === 'folder-link') return;

        if (!adj.has(edge.source)) adj.set(edge.source, []);
        if (!adj.has(edge.target)) adj.set(edge.target, []);

        adj.get(edge.source)!.push(edge.target);
        adj.get(edge.target)!.push(edge.source);
    });

    while (queue.length > 0) {
        const current = queue.shift()!;
        const neighbors = adj.get(current) || [];

        for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push(neighbor);
            }
        }
    }

    return nodes.filter(n => visited.has(n.id));
};
