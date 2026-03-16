import { useStore } from '../../store/useStore';
import { useShallow } from 'zustand/react/shallow';

export const EdgesLayer = () => {
    const { nodes, edges, folders, theme, selectedEdgeIds, setSelectedEdgeIds, animationsDisabled } = useStore(useShallow(state => ({
        nodes: state.nodes,
        edges: state.edges,
        folders: state.folders,
        theme: state.theme,
        selectedEdgeIds: state.selectedEdgeIds,
        setSelectedEdgeIds: state.setSelectedEdgeIds,
        animationsDisabled: state.animationsDisabled
    })));

    // Default node radius for collision math (to stop arrow at edge, not center)
    const DEFAULT_NODE_RADIUS = 24;

    const strokeColor = theme === 'dark' ? '#737373' : '#404040';

    // Pre-build lookup maps: O(1) per edge instead of O(N) find()
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const folderMap = new Map(folders.map(f => [f.id, f]));

    return (
        <svg
            className="absolute inset-0 w-full h-full pointer-events-none overflow-visible z-10"
        >
            <defs>
                <marker
                    id="arrowhead"
                    markerWidth="10"
                    markerHeight="7"
                    refX="9"
                    refY="3.5"
                    orient="auto"
                >
                    <polygon points="0 0, 10 3.5, 0 7" fill={strokeColor} />
                </marker>
            </defs>

            {edges.map(edge => {
                // Determine if source and target are nodes or folders
                const sourceNode = nodeMap.get(edge.source);
                const sourceFolder = !sourceNode ? folderMap.get(edge.source) : undefined;

                const targetNode = nodeMap.get(edge.target);
                const targetFolder = !targetNode ? folderMap.get(edge.target) : undefined;

                const sourceItem = sourceNode || sourceFolder;
                const targetItem = targetNode || targetFolder;

                if (!sourceItem || !targetItem) return null;

                // Adjust origin points based on whether it's a node or a folder
                // Nodes are circles starting from center x/y. Folders are rects starting top-left x/y.
                let sOriginX = sourceNode ? sourceNode.x : sourceFolder!.x + (sourceFolder!.w / 2);
                let sOriginY = sourceNode ? sourceNode.y : sourceFolder!.y + (sourceFolder!.h / 2);

                let tOriginX = targetNode ? targetNode.x : targetFolder!.x + (targetFolder!.w / 2);
                let tOriginY = targetNode ? targetNode.y : targetFolder!.y + (targetFolder!.h / 2);

                const isFolderLink = edge.type === 'folder-link';
                const currentStrokeColor = strokeColor; // Use standard neutral visual hierarchy

                let startX, startY, endX, endY;

                if (isFolderLink && sourceFolder && targetFolder) {
                    // Smart Adaptive Geometry for Folder Relationships
                    const sCenter = { x: sourceFolder.x + sourceFolder.w / 2, y: sourceFolder.y + sourceFolder.h / 2 };
                    const tCenter = { x: targetFolder.x + targetFolder.w / 2, y: targetFolder.y + targetFolder.h / 2 };

                    const dxCenter = tCenter.x - sCenter.x;
                    const dyCenter = tCenter.y - sCenter.y;

                    // Choose origin points based on relative positions (Right/Left or Top/Bottom)
                    if (Math.abs(dxCenter) > Math.abs(dyCenter)) {
                        // Horizontal layout: target is to the right or left
                        if (dxCenter > 0) {
                            startX = sourceFolder.x + sourceFolder.w; startY = sCenter.y;
                            endX = targetFolder.x; endY = tCenter.y;
                        } else {
                            startX = sourceFolder.x; startY = sCenter.y;
                            endX = targetFolder.x + targetFolder.w; endY = tCenter.y;
                        }
                    } else {
                        // Vertical layout: target is below or above
                        if (dyCenter > 0) {
                            startX = sCenter.x; startY = sourceFolder.y + sourceFolder.h;
                            endX = tCenter.x; endY = targetFolder.y;
                        } else {
                            startX = sCenter.x; startY = sourceFolder.y;
                            endX = tCenter.x; endY = targetFolder.y + targetFolder.h;
                        }
                    }
                } else {
                    const dx = tOriginX - sOriginX;
                    const dy = tOriginY - sOriginY;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    // If they are too close, don't draw inner lines that overlap wildly
                    if (distance < DEFAULT_NODE_RADIUS * 2) return null;

                    // Nodes have radius, folders have widths. For folders, just attach near the bounds.
                    const targetRadius = targetNode ? (targetNode.radius || DEFAULT_NODE_RADIUS) : Math.min(targetFolder!.w, targetFolder!.h) / 2;
                    const sourceRadius = sourceNode ? (sourceNode.radius || DEFAULT_NODE_RADIUS) : Math.min(sourceFolder!.w, sourceFolder!.h) / 2;

                    // Calculate ratios to move start/end points to the edges of the bounding boxes
                    const sourceRatio = sourceRadius / distance;
                    const targetRatio = targetRadius / distance;

                    startX = sOriginX + dx * sourceRatio;
                    startY = sOriginY + dy * sourceRatio;
                    endX = tOriginX - dx * targetRatio;
                    endY = tOriginY - dy * targetRatio;
                }

                let pathD = "";
                const routingStyle = edge.routing || 'straight';

                if (isFolderLink) {
                    // Folder edges: use routing property, default to bezier S-curve
                    const folderRouting = edge.routing || 'bezier';

                    if (folderRouting === 'straight') {
                        pathD = `M ${startX} ${startY} L ${endX} ${endY}`;
                    } else if (folderRouting === 'step') {
                        const isHorizontal = Math.abs(endX - startX) > Math.abs(endY - startY);
                        if (isHorizontal) {
                            const midX = startX + (endX - startX) / 2;
                            pathD = `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`;
                        } else {
                            const midY = startY + (endY - startY) / 2;
                            pathD = `M ${startX} ${startY} L ${startX} ${midY} L ${endX} ${midY} L ${endX} ${endY}`;
                        }
                    } else {
                        // bezier S-curve (default for folders)
                        const isHorizontal = Math.abs(endX - startX) > Math.abs(endY - startY);
                        let cp1x, cp1y, cp2x, cp2y;
                        if (isHorizontal) {
                            cp1x = startX + (endX - startX) / 2; cp1y = startY;
                            cp2x = startX + (endX - startX) / 2; cp2y = endY;
                        } else {
                            cp1x = startX; cp1y = startY + (endY - startY) / 2;
                            cp2x = endX; cp2y = startY + (endY - startY) / 2;
                        }
                        pathD = `M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`;
                    }
                } else {
                    // Node Dependencies
                    if (routingStyle === 'straight') {
                        pathD = `M ${startX} ${startY} L ${endX} ${endY}`;
                    } else if (routingStyle === 'bezier') {
                        const distOptions = Math.abs(endX - startX) * 0.5;
                        pathD = `M ${startX} ${startY} C ${startX + distOptions} ${startY}, ${endX - distOptions} ${endY}, ${endX} ${endY}`;
                    } else if (routingStyle === 'step') {
                        const midX = startX + (endX - startX) / 2;
                        pathD = `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`;
                    }
                }

                const isSelected = selectedEdgeIds.includes(edge.id);
                const finalStrokeColor = isSelected ? '#3b82f6' : currentStrokeColor;
                const finalStrokeWidth = isSelected ? (isFolderLink ? "4" : "3") : (isFolderLink ? "3" : "2");
                const finalOpacity = isSelected ? 1 : (isFolderLink ? 0.3 : 1);

                let finalDasharray = 'none';
                if (edge.stroke === 'dashed') {
                    finalDasharray = '8,8';
                } else if (edge.stroke === 'dotted') {
                    finalDasharray = '2,6';
                } else if (!edge.stroke && edge.type === 'dependency') {
                    finalDasharray = '8,8';
                }

                return (
                    <g key={edge.id} data-edge-id={edge.id} data-edge-source={edge.source} data-edge-target={edge.target} data-edge-routing={edge.routing || (isFolderLink ? 'bezier' : 'straight')} data-edge-type={edge.type || 'dependency'}>
                        {/* Invisible thicker path for easier clicking */}
                        <path
                            d={pathD}
                            fill="none"
                            stroke="transparent"
                            strokeWidth="15"
                            className="cursor-pointer pointer-events-auto"
                            onPointerDown={(e) => {
                                e.stopPropagation();
                                if (e.shiftKey) {
                                    setSelectedEdgeIds(prev => prev.includes(edge.id) ? prev.filter(id => id !== edge.id) : [...prev, edge.id]);
                                } else {
                                    setSelectedEdgeIds([edge.id]);
                                }
                            }}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                useStore.getState().setContextMenu({
                                    x: e.clientX,
                                    y: e.clientY,
                                    type: 'edge',
                                    targetId: edge.id
                                });
                            }}
                        />
                        {/* Visible path */}
                        <path
                            d={pathD}
                            fill="none"
                            stroke={finalStrokeColor}
                            strokeWidth={finalStrokeWidth}
                            strokeDasharray={finalDasharray}
                            strokeLinecap={edge.stroke === 'dotted' ? 'round' : 'butt'}
                            markerEnd={isSelected ? "none" : "url(#arrowhead)"}
                            className={(!animationsDisabled && finalDasharray !== 'none') ? "animated-path" : ""}
                            opacity={finalOpacity}
                            pointerEvents="none"
                        />
                    </g>
                );
            })}
        </svg>
    );
};
