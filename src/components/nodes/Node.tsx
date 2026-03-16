import React, { useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import { useShallow } from 'zustand/react/shallow';
import { Node } from '../../types';
import { File, FileCode, FileImage, FileJson, FileText, Link2, StickyNote, Globe, TerminalSquare } from 'lucide-react';

// Module-level transient drag positions — shared across all NodeComponent instances.
// Stores world-space positions during drag. Only populated while a drag is active.
const dragOffsets = new Map<string, { x: number; y: number }>();

const DEFAULT_NODE_RADIUS = 24;

/** Recalculate path string for a node-to-node edge */
function calcEdgePath(
    sx: number, sy: number,
    tx: number, ty: number,
    routing: string,
    sRadius = DEFAULT_NODE_RADIUS,
    tRadius = DEFAULT_NODE_RADIUS
): string {
    const dx = tx - sx;
    const dy = ty - sy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < (sRadius + tRadius)) return '';

    const sr = sRadius / dist;
    const tr = tRadius / dist;
    const startX = sx + dx * sr;
    const startY = sy + dy * sr;
    const endX = tx - dx * tr;
    const endY = ty - dy * tr;

    if (routing === 'bezier') {
        const d = Math.abs(endX - startX) * 0.5;
        return `M ${startX} ${startY} C ${startX + d} ${startY}, ${endX - d} ${endY}, ${endX} ${endY}`;
    }
    if (routing === 'step') {
        const midX = startX + (endX - startX) / 2;
        return `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`;
    }
    return `M ${startX} ${startY} L ${endX} ${endY}`;
}

/** DOM-only update of edges connected to currently-dragging nodes */
function updateConnectedEdges() {
    if (dragOffsets.size === 0) return;

    const movingIds = Array.from(dragOffsets.keys());
    const selector = movingIds.flatMap(id => [
        `g[data-edge-source="${id}"]`,
        `g[data-edge-target="${id}"]`
    ]).join(',');

    const edgeGroups = document.querySelectorAll(selector);
    if (edgeGroups.length === 0) return;

    const nodes = useStore.getState().nodes;

    edgeGroups.forEach(g => {
        if (g.getAttribute('data-edge-type') === 'folder-link') return;

        const srcId = g.getAttribute('data-edge-source')!;
        const tgtId = g.getAttribute('data-edge-target')!;
        const routing = g.getAttribute('data-edge-routing') || 'straight';

        // Resolve positions: transient for moving nodes, store for stationary
        const sp = dragOffsets.get(srcId);
        const tp = dragOffsets.get(tgtId);

        let sx: number, sy: number, tx: number, ty: number;

        if (sp) { sx = sp.x; sy = sp.y; }
        else {
            const sn = nodes.find(n => n.id === srcId);
            if (!sn) return;
            sx = sn.x; sy = sn.y;
        }

        if (tp) { tx = tp.x; ty = tp.y; }
        else {
            const tn = nodes.find(n => n.id === tgtId);
            if (!tn) return;
            tx = tn.x; ty = tn.y;
        }

        const pathD = calcEdgePath(sx, sy, tx, ty, routing);
        g.querySelectorAll('path').forEach(p => p.setAttribute('d', pathD));
    });
}

interface NodeProps {
    node: Node;
}

export const NodeComponent: React.FC<NodeProps> = React.memo(({ node }) => {
    const { addEdge, selectedNodeIds, setSelectedNodeIds } = useStore(useShallow(state => ({
        addEdge: state.addEdge,
        selectedNodeIds: state.selectedNodeIds,
        setSelectedNodeIds: state.setSelectedNodeIds
    })));
    const nodeRef = useRef<HTMLDivElement>(null);
    const [isDraggingNode, setIsDraggingNode] = useState(false);

    // Sync DOM position from props when NOT dragging (e.g. external/multiplayer changes)
    React.useEffect(() => {
        if (!isDraggingNode && nodeRef.current) {
            nodeRef.current.style.transform = `translate(${node.x}px, ${node.y}px) translate(-50%, -50%)`;
        }
    }, [node.x, node.y, isDraggingNode]);

    // Connection Ring state
    const [isHovered, setIsHovered] = useState(false);
    const [isDrawingConnection, setIsDrawingConnection] = useState(false);
    const [mouseWorldPos, setMouseWorldPos] = useState({ x: 0, y: 0 });

    const isSelected = selectedNodeIds.includes(node.id);

    // Node Drag Logic — DOM-only during drag, batch commit on pointerUp
    const handlePointerDown = (e: React.PointerEvent) => {
        e.stopPropagation();
        if ((e.target as Element).classList.contains('connection-ring')) {
            return;
        }

        if (e.shiftKey || e.ctrlKey) {
            if (isSelected) {
                setSelectedNodeIds(prev => prev.filter(id => id !== node.id));
            } else {
                setSelectedNodeIds(prev => [...prev, node.id]);
            }
        } else {
            if (!isSelected) {
                setSelectedNodeIds([node.id]);
            }
        }

        setIsDraggingNode(true);

        // Initialize transient positions for all nodes that will move
        const state = useStore.getState();
        const idsToMove = state.selectedNodeIds.includes(node.id)
            ? state.selectedNodeIds
            : [node.id];

        dragOffsets.clear();
        for (const id of idsToMove) {
            const n = state.nodes.find(nd => nd.id === id);
            if (n) dragOffsets.set(id, { x: n.x, y: n.y });
        }
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDraggingNode) return;
        e.stopPropagation();

        const currentTransform = useStore.getState().transform;
        const movementXWorld = e.movementX / currentTransform.scale;
        const movementYWorld = e.movementY / currentTransform.scale;

        // Update all transient positions and apply DOM transforms directly
        dragOffsets.forEach((pos, id) => {
            pos.x += movementXWorld;
            pos.y += movementYWorld;

            const el = id === node.id
                ? nodeRef.current
                : document.querySelector(`[data-node-id="${id}"]`) as HTMLElement | null;

            if (el) {
                el.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%, -50%)`;
            }
        });

        // Recalculate connected edge paths via DOM (no React)
        updateConnectedEdges();
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (!isDraggingNode) return;
        e.stopPropagation();
        setIsDraggingNode(false);

        if (dragOffsets.size === 0) return;

        // 1. Batch commit all transient positions to Zustand (single state update)
        useStore.setState((state) => ({
            nodes: state.nodes.map(n => {
                const pos = dragOffsets.get(n.id);
                return pos ? { ...n, x: pos.x, y: pos.y } : n;
            })
        }));

        // 2. Commit to Yjs CRDT for multiplayer sync
        const state = useStore.getState();
        dragOffsets.forEach((pos, id) => {
            state.moveNode(id, pos.x, pos.y);
        });

        // 3. Edge Splitting Logic (only for single-node drags)
        if (dragOffsets.size === 1) {
            const movedNode = state.nodes.find(n => n.id === node.id);
            if (movedNode) {
                const threshold = 30;

                const distToSegment = (p: { x: number, y: number }, v: { x: number, y: number }, w: { x: number, y: number }) => {
                    const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
                    if (l2 === 0) return Math.sqrt((p.x - v.x) ** 2 + (p.y - v.y) ** 2);
                    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
                    t = Math.max(0, Math.min(1, t));
                    const proj = { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) };
                    return Math.sqrt((p.x - proj.x) ** 2 + (p.y - proj.y) ** 2);
                };

                for (const edge of state.edges) {
                    if (edge.type === 'folder-link') continue;
                    if (edge.source === node.id || edge.target === node.id) continue;

                    const sourceNode = state.nodes.find(n => n.id === edge.source);
                    const targetNode = state.nodes.find(n => n.id === edge.target);

                    if (sourceNode && targetNode) {
                        const dist = distToSegment(
                            { x: movedNode.x, y: movedNode.y },
                            { x: sourceNode.x, y: sourceNode.y },
                            { x: targetNode.x, y: targetNode.y }
                        );

                        if (dist < threshold) {
                            state.deleteEdge(edge.id);
                            state.addEdge({
                                id: crypto.randomUUID(),
                                source: sourceNode.id,
                                target: movedNode.id,
                                type: edge.type,
                                routing: edge.routing,
                                stroke: edge.stroke
                            });
                            state.addEdge({
                                id: crypto.randomUUID(),
                                source: movedNode.id,
                                target: targetNode.id,
                                type: edge.type,
                                routing: edge.routing,
                                stroke: edge.stroke
                            });
                            break;
                        }
                    }
                }
            }
        }

        dragOffsets.clear();
    };

    // Connection Drag Logic
    const handleRingPointerDown = (e: React.PointerEvent) => {
        e.stopPropagation();
        setIsDrawingConnection(true);
        // Start tracking mouse globally 
        updateMouseWorldPos(e.clientX, e.clientY);
        (e.target as Element).setPointerCapture(e.pointerId);
    };

    const handleRingPointerMove = (e: React.PointerEvent) => {
        if (!isDrawingConnection) return;
        e.stopPropagation();
        updateMouseWorldPos(e.clientX, e.clientY);
    };

    const handleRingPointerUp = (e: React.PointerEvent) => {
        if (!isDrawingConnection) return;
        e.stopPropagation();
        setIsDrawingConnection(false);
        (e.target as Element).releasePointerCapture(e.pointerId);

        const canvasElement = document.getElementById('canvas-background');
        if (!canvasElement) return;

        const currentTransform = useStore.getState().transform;
        const rect = canvasElement.getBoundingClientRect();
        const finalXWorld = (e.clientX - rect.left - currentTransform.x) / currentTransform.scale;
        const finalYWorld = (e.clientY - rect.top - currentTransform.y) / currentTransform.scale;

        const dropRadius = 60; // Generous drop radius
        const currentNodes = useStore.getState().nodes;
        const targetNode = currentNodes.find(n => {
            if (n.id === node.id) return false;
            const dx = n.x - finalXWorld;
            const dy = n.y - finalYWorld;
            return Math.sqrt(dx * dx + dy * dy) < dropRadius;
        });

        if (targetNode) {
            addEdge({
                id: crypto.randomUUID(),
                source: node.id,
                target: targetNode.id,
                type: 'dependency'
            });
        } else {
            // Dropped in empty space: Open TagWheel to create a new node
            useStore.getState().setTagWheel({
                x: e.clientX,
                y: e.clientY,
                sourceNodeIdForNew: node.id
            });
        }
    };

    const updateMouseWorldPos = (clientX: number, clientY: number) => {
        // Need to convert screen click to world to draw the temporary line natively or purely via state
        // For simplicity we will fetch the Canvas rect.
        const canvasElement = document.getElementById('canvas-background');
        if (canvasElement) {
            const currentTransform = useStore.getState().transform;
            const rect = canvasElement.getBoundingClientRect();
            const xWorld = (clientX - rect.left - currentTransform.x) / currentTransform.scale;
            const yWorld = (clientY - rect.top - currentTransform.y) / currentTransform.scale;
            setMouseWorldPos({ x: xWorld, y: yWorld });
        }
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        useStore.getState().setContextMenu({
            x: e.clientX,
            y: e.clientY,
            type: 'node',
            targetId: node.id
        });
    };

    const handleNodeDoubleClick = async (e: React.MouseEvent) => {
        e.stopPropagation();
        useStore.getState().setActiveNoteId(node.id);
    };

    const theme = useStore((state) => state.theme);

    // Render Helpers
    const getIcon = () => {
        const iconColor = theme === 'dark' ? 'text-neutral-200' : 'text-black';
        if (node.type === 'web') return <Globe className={`w-5 h-5 ${iconColor}`} />;
        if (node.type === 'terminal') return <TerminalSquare className={`w-5 h-5 ${iconColor}`} />;
        if (node.filePath) {
            if (node.type.includes('.ts') || node.type.includes('.js')) return <FileCode className={`w-5 h-5 ${iconColor}`} />;
            if (node.type.includes('.json')) return <FileJson className={`w-5 h-5 ${iconColor}`} />;
            if (node.type.includes('.md')) return <FileText className={`w-5 h-5 ${iconColor}`} />;
            if (node.type.includes('.png') || node.type.includes('.jpg')) return <FileImage className={`w-5 h-5 ${iconColor}`} />;
            return <File className={`w-5 h-5 ${iconColor}`} />;
        }
        return <StickyNote className={`w-5 h-5 ${iconColor}`} />;
    };

    return (
        <div
            ref={nodeRef}
            data-node-id={node.id}
            className="absolute pointer-events-none group"
            style={{
                transform: `translate(${node.x}px, ${node.y}px) translate(-50%, -50%)`,
                transition: isDraggingNode ? 'none' : 'transform 0.1s ease-out'
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Temporary Connection Line While Drawing */}
            {isDrawingConnection && (
                <svg className="absolute top-1/2 left-1/2 overflow-visible pointer-events-none" style={{ zIndex: 100 }}>
                    <line
                        x1={0}
                        y1={0}
                        x2={mouseWorldPos.x - node.x}
                        y2={mouseWorldPos.y - node.y}
                        stroke={theme === 'dark' ? '#737373' : '#a3a3a3'}
                        strokeWidth={2}
                        strokeDasharray="5,5"
                    />
                </svg>
            )}

            {/* Connection Ring */}
            <div
                className={`connection-ring absolute inset-[-18px] rounded-full border border-dashed border-transparent ${theme === 'dark' ? 'group-hover:border-neutral-600' : 'group-hover:border-neutral-400'} cursor-crosshair transition-colors duration-200`}
                onPointerDown={handleRingPointerDown}
                onPointerMove={handleRingPointerMove}
                onPointerUp={handleRingPointerUp}
                style={{ pointerEvents: isDrawingConnection || isHovered ? 'auto' : 'none' }}
            />

            {/* Main Node Circle */}
            <div
                className={`relative z-10 pointer-events-auto touch-none w-12 h-12 ${theme === 'dark' ? 'bg-[#1a1a1a] border-neutral-500' : 'bg-white border-black'} rounded-full border-[2.5px] flex flex-col items-center justify-center cursor-grab active:cursor-grabbing hover:shadow-[0_0_15px_rgba(0,0,0,0.1)] transition-all duration-200 select-none ${node.filePath && !node.color ? '!border-blue-500' : ''} ${!node.color && isSelected ? 'ring-4 ring-blue-500/50 shadow-lg scale-105' : isSelected ? 'scale-105' : ''}`}
                style={node.color ? {
                    borderColor: ({
                        'red': '#ef4444', 'orange': '#f97316', 'emerald': '#10b981',
                        'cyan': '#06b6d4', 'blue': '#3b82f6', 'purple': '#a855f7'
                    } as Record<string, string>)[node.color],
                    boxShadow: isSelected ? `0 0 0 4px ${({
                        'red': '#ef4444', 'orange': '#f97316', 'emerald': '#10b981',
                        'cyan': '#06b6d4', 'blue': '#3b82f6', 'purple': '#a855f7'
                    } as Record<string, string>)[node.color]}80, 0 10px 15px -3px rgba(0,0,0,0.1)` : 'none'
                } : undefined}
                onPointerDown={e => {
                    handlePointerDown(e);
                    e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={handlePointerMove}
                onPointerUp={e => {
                    handlePointerUp(e);
                    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (e) { }
                }}
                onPointerCancel={e => {
                    handlePointerUp(e);
                    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (e) { }
                }}
                onContextMenu={handleContextMenu}
                onDoubleClick={handleNodeDoubleClick}
            >
                {/* Node Icon */}
                {getIcon()}

                {/* File Link Indicator */}
                {node.filePath && (
                    <div className="absolute -top-1 -right-1 bg-blue-500 text-white rounded-full p-1 border border-black shadow">
                        <Link2 className="w-3 h-3" />
                    </div>
                )}
            </div>

            {/* Node Label (Below Node) */}
            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none text-center">
                <span className={`text-sm font-bold tracking-tighter px-1 whitespace-nowrap ${theme === 'dark' ? 'text-neutral-200 bg-[#0f0f0f]/80' : 'text-black bg-white/80'}`}>
                    {node.name}
                </span>

                {node.tags && node.tags.length > 0 && (
                    <div className="flex gap-1 mt-1 justify-center flex-wrap w-[150px]">
                        {node.tags.map(tag => (
                            <span key={tag} className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${theme === 'dark' ? 'bg-neutral-800 text-neutral-400 border border-neutral-700' : 'bg-neutral-200 text-neutral-600 border border-neutral-300'}`}>
                                {tag}
                            </span>
                        ))}
                    </div>
                )}
                {node.summary && (
                    <span className={`text-xs opacity-0 group-hover:opacity-100 transition-opacity max-w-[120px] px-2 py-1 mt-1 rounded border shadow-sm absolute top-full ${theme === 'dark' ? 'text-neutral-400 bg-neutral-900 border-neutral-800' : 'text-gray-500 bg-white/90 border-gray-100'}`}>
                        {node.summary}
                    </span>
                )}
            </div>
        </div>
    );
});
