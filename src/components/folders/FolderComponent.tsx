import React, { useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import { useShallow } from 'zustand/react/shallow';
import { Folder } from '../../types';

interface FolderProps {
    folder: Folder;
}

export const FolderComponent: React.FC<FolderProps> = React.memo(({ folder }) => {
    const { updateFolderSize, updateFolderPos, updateFolder, addEdge, selectedFolderIds, setSelectedFolderIds, theme } = useStore(useShallow(state => ({
        updateFolderSize: state.updateFolderSize,
        updateFolderPos: state.updateFolderPos,
        updateFolder: state.updateFolder,
        addEdge: state.addEdge,
        selectedFolderIds: state.selectedFolderIds,
        setSelectedFolderIds: state.setSelectedFolderIds,
        theme: state.theme
    })));
    const folderRef = useRef<HTMLDivElement>(null);
    const [isResizing, setIsResizing] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [isRenamingHeader, setIsRenamingHeader] = useState(false);
    const [renameValue, setRenameValue] = useState(folder.name);
    const renameInputRef = useRef<HTMLInputElement>(null);

    // Connection drawing state (for folder-to-folder edges)
    const [isDrawingConnection, setIsDrawingConnection] = useState(false);
    const [mouseWorldPos, setMouseWorldPos] = useState({ x: 0, y: 0 });

    // Initial drag states
    const startPos = useRef({ x: 0, y: 0 });
    const startSize = useRef({ w: folder.w, h: folder.h });

    // Store elements that are inside the folder(s) when dragging starts
    const insideNodes = useRef<{ id: string, startX: number, startY: number }[]>([]);
    const insideFolders = useRef<{ id: string, startX: number, startY: number }[]>([]);
    const startFolderMap = useRef(new Map<string, { x: number, y: number }>());

    const handleResizeStart = (e: React.PointerEvent) => {
        e.stopPropagation();
        setIsResizing(true);
        startPos.current = { x: e.clientX, y: e.clientY };
        startSize.current = { w: folder.w, h: folder.h };
        (e.target as Element).setPointerCapture(e.pointerId);
    };

    const handleResizeMove = (e: React.PointerEvent) => {
        if (!isResizing) return;
        e.stopPropagation();

        const currentTransform = useStore.getState().transform;
        const dx = (e.clientX - startPos.current.x) / currentTransform.scale;
        const dy = (e.clientY - startPos.current.y) / currentTransform.scale;

        const newW = Math.max(100, startSize.current.w + dx);
        const newH = Math.max(100, startSize.current.h + dy);

        updateFolderSize(folder.id, newW, newH);
    };

    const handleResizeEnd = (e: React.PointerEvent) => {
        if (!isResizing) return;
        e.stopPropagation();
        setIsResizing(false);
        (e.target as Element).releasePointerCapture(e.pointerId);
    };

    const handleDragStart = (e: React.PointerEvent) => {
        e.stopPropagation();

        let currentlySelected = [...selectedFolderIds];
        if (e.shiftKey || e.ctrlKey) {
            if (currentlySelected.includes(folder.id)) {
                currentlySelected = currentlySelected.filter(id => id !== folder.id);
            } else {
                currentlySelected.push(folder.id);
            }
        } else {
            if (!currentlySelected.includes(folder.id)) {
                currentlySelected = [folder.id];
            }
        }
        setSelectedFolderIds(currentlySelected);

        setIsDragging(true);
        startPos.current = { x: e.clientX, y: e.clientY };

        const currentFolders = useStore.getState().folders;
        const currentNodes = useStore.getState().nodes;
        const activeFolders = currentFolders.filter(f => currentlySelected.includes(f.id));

        const innerNodes = new Map();
        const innerFolders = new Map();

        activeFolders.forEach(f => {
            currentNodes.forEach(n => {
                if (n.x >= f.x && n.x <= f.x + f.w && n.y >= f.y && n.y <= f.y + f.h) {
                    innerNodes.set(n.id, { id: n.id, startX: n.x, startY: n.y });
                }
            });
            currentFolders.forEach(childF => {
                if (childF.id !== f.id &&
                    childF.x >= f.x && childF.x + childF.w <= f.x + f.w &&
                    childF.y >= f.y && childF.y + childF.h <= f.y + f.h) {
                    if (!innerFolders.has(childF.id) && !currentlySelected.includes(childF.id)) {
                        innerFolders.set(childF.id, { id: childF.id, startX: childF.x, startY: childF.y });
                    }
                }
            });
        });

        insideNodes.current = Array.from(innerNodes.values());
        insideFolders.current = Array.from(innerFolders.values());
        startFolderMap.current = new Map(activeFolders.map(f => [f.id, { x: f.x, y: f.y }]));

        (e.target as Element).setPointerCapture(e.pointerId);
    };

    const handleDragMove = (e: React.PointerEvent) => {
        if (!isDragging) return;
        e.stopPropagation();

        const currentTransform = useStore.getState().transform;
        const dx = (e.clientX - startPos.current.x) / currentTransform.scale;
        const dy = (e.clientY - startPos.current.y) / currentTransform.scale;

        useStore.setState((state) => {
            const newFolders = state.folders.map(f => {
                if (startFolderMap.current.has(f.id)) {
                    const origin = startFolderMap.current.get(f.id)!;
                    return { ...f, x: origin.x + dx, y: origin.y + dy };
                }
                const innerF = insideFolders.current.find(inf => inf.id === f.id);
                if (innerF) {
                    return { ...f, x: innerF.startX + dx, y: innerF.startY + dy };
                }
                return f;
            });

            const newNodes = state.nodes.map(n => {
                const innerN = insideNodes.current.find(inn => inn.id === n.id);
                if (innerN) {
                    return { ...n, x: innerN.startX + dx, y: innerN.startY + dy };
                }
                return n;
            });

            return { folders: newFolders, nodes: newNodes };
        });
    };

    const handleDragEnd = (e: React.PointerEvent) => {
        if (!isDragging) return;
        e.stopPropagation();
        setIsDragging(false);
        (e.target as Element).releasePointerCapture(e.pointerId);

        // Commit final positions to Yjs so they are persisted and synced
        const currentState = useStore.getState();
        // Commit folder positions
        for (const f of currentState.folders) {
            if (startFolderMap.current.has(f.id)) {
                updateFolderPos(f.id, f.x, f.y);
            }
            const innerF = insideFolders.current.find(inf => inf.id === f.id);
            if (innerF) {
                updateFolderPos(f.id, f.x, f.y);
            }
        }
        // Commit node positions
        for (const inn of insideNodes.current) {
            const n = currentState.nodes.find(node => node.id === inn.id);
            if (n) {
                useStore.getState().moveNode(n.id, n.x, n.y);
            }
        }
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setRenameValue(folder.name);
        setIsRenamingHeader(true);
        setTimeout(() => {
            renameInputRef.current?.focus();
            renameInputRef.current?.select();
        }, 0);
    };

    const commitRename = () => {
        const trimmed = renameValue.trim();
        if (trimmed && trimmed !== folder.name) {
            updateFolder(folder.id, { name: trimmed });
        }
        setIsRenamingHeader(false);
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        useStore.getState().setContextMenu({
            x: e.clientX,
            y: e.clientY,
            type: 'folder',
            targetId: folder.id
        });
    };

    const isSelected = selectedFolderIds.includes(folder.id);

    // --- Connection Ring Handlers (folder-to-folder edges) ---
    const updateMouseWorld = (clientX: number, clientY: number) => {
        const canvasEl = document.getElementById('canvas-background');
        if (canvasEl) {
            const t = useStore.getState().transform;
            const rect = canvasEl.getBoundingClientRect();
            setMouseWorldPos({
                x: (clientX - rect.left - t.x) / t.scale,
                y: (clientY - rect.top - t.y) / t.scale
            });
        }
    };

    const handleConnRingDown = (e: React.PointerEvent) => {
        e.stopPropagation();
        setIsDrawingConnection(true);
        updateMouseWorld(e.clientX, e.clientY);
        (e.target as Element).setPointerCapture(e.pointerId);
    };

    const handleConnRingMove = (e: React.PointerEvent) => {
        if (!isDrawingConnection) return;
        e.stopPropagation();
        updateMouseWorld(e.clientX, e.clientY);
    };

    const handleConnRingUp = (e: React.PointerEvent) => {
        if (!isDrawingConnection) return;
        e.stopPropagation();
        setIsDrawingConnection(false);
        (e.target as Element).releasePointerCapture(e.pointerId);

        const canvasEl = document.getElementById('canvas-background');
        if (!canvasEl) return;

        const t = useStore.getState().transform;
        const rect = canvasEl.getBoundingClientRect();
        const finalX = (e.clientX - rect.left - t.x) / t.scale;
        const finalY = (e.clientY - rect.top - t.y) / t.scale;

        // Only target folders — NOT nodes
        const dropRadius = 40;
        const currentFolders = useStore.getState().folders;
        const targetFolder = currentFolders.find(f => {
            if (f.id === folder.id) return false;
            // Check if drop is inside the folder bounds (with padding)
            return finalX >= f.x - dropRadius && finalX <= f.x + f.w + dropRadius &&
                finalY >= f.y - dropRadius && finalY <= f.y + f.h + dropRadius;
        });

        if (targetFolder) {
            // Create folder-to-folder edge
            addEdge({
                id: crypto.randomUUID(),
                source: folder.id,
                target: targetFolder.id,
                type: 'folder-link'
            });
        } else {
            // Dropped on empty space: open TagWheel to create a new folder
            useStore.getState().setTagWheel({
                x: e.clientX,
                y: e.clientY,
                sourceFolderIdForNew: folder.id
            });
        }
    };

    // Center point of the folder (for drawing the temp connection line)
    const folderCenterX = folder.w / 2;
    const folderCenterY = folder.h / 2;

    const getFolderStyle = () => {
        if (!folder.color) return {};
        const hex = ({
            'red': '#ef4444', 'orange': '#f97316', 'emerald': '#10b981',
            'cyan': '#06b6d4', 'blue': '#3b82f6', 'purple': '#a855f7'
        } as Record<string, string>)[folder.color];
        if (!hex) return {};
        return { borderColor: hex, backgroundColor: `${hex}15` };
    };

    const getHeaderStyle = () => {
        if (!folder.color) return {};
        const hex = ({
            'red': '#ef4444', 'orange': '#f97316', 'emerald': '#10b981',
            'cyan': '#06b6d4', 'blue': '#3b82f6', 'purple': '#a855f7'
        } as Record<string, string>)[folder.color];
        if (!hex) return {};
        return {
            borderColor: hex,
            backgroundColor: isSelected ? hex : `${hex}30`,
            color: isSelected ? '#ffffff' : hex
        };
    };

    return (
        <div
            ref={folderRef}
            className={`absolute pointer-events-none border-2 border-dashed ${!folder.color ? (isSelected ? 'border-blue-500 bg-blue-500/10 z-10' : theme === 'dark' ? 'border-neutral-600 bg-neutral-900/10' : 'border-neutral-300 bg-white/10') : (isSelected ? 'z-10' : '')}`}
            style={{
                left: folder.x,
                top: folder.y,
                width: folder.w,
                height: folder.h,
                pointerEvents: 'none',
                ...getFolderStyle()
            }}
        >
            {/* Temporary Connection Line While Drawing */}
            {isDrawingConnection && (
                <svg className="absolute overflow-visible pointer-events-none" style={{ left: folderCenterX, top: folderCenterY, zIndex: 100 }}>
                    <line
                        x1={0}
                        y1={0}
                        x2={mouseWorldPos.x - (folder.x + folderCenterX)}
                        y2={mouseWorldPos.y - (folder.y + folderCenterY)}
                        stroke={theme === 'dark' ? '#525252' : '#a3a3a3'}
                        strokeWidth={2}
                        strokeDasharray="6,4"
                        opacity={0.6}
                    />
                </svg>
            )}

            {/* Connection Ring — 4 border strips for folder-to-folder edge creation */}
            {/* These sit just outside the folder edges and don't block the interior */}
            {(() => {
                const ringProps = {
                    className: `absolute cursor-crosshair transition-colors duration-200`,
                    style: {
                        pointerEvents: 'auto' as const,
                        backgroundColor: isHovered || isDrawingConnection ? (theme === 'dark' ? 'rgba(64,64,64,0.4)' : 'rgba(212,212,212,0.4)') : 'transparent'
                    },
                    onMouseEnter: () => setIsHovered(true),
                    onMouseLeave: () => setIsHovered(false),
                    onPointerDown: handleConnRingDown,
                    onPointerMove: handleConnRingMove,
                    onPointerUp: handleConnRingUp
                };
                const RING_W = 10;
                return (
                    <>
                        {/* Top edge */}
                        <div {...ringProps} style={{ ...ringProps.style, left: -RING_W, top: -RING_W, right: -RING_W, height: RING_W }} />
                        {/* Bottom edge */}
                        <div {...ringProps} style={{ ...ringProps.style, left: -RING_W, bottom: -RING_W, right: -RING_W, height: RING_W }} />
                        {/* Left edge */}
                        <div {...ringProps} style={{ ...ringProps.style, left: -RING_W, top: 0, width: RING_W, bottom: 0 }} />
                        {/* Right edge */}
                        <div {...ringProps} style={{ ...ringProps.style, right: -RING_W, top: 0, width: RING_W, bottom: 0 }} />
                    </>
                );
            })()}
            {/* Folder Header / Drag Handle */}
            <div
                className={`absolute top-0 left-0 -mt-7 h-7 px-3 flex items-center justify-center font-bold text-sm select-none cursor-grab active:cursor-grabbing pointer-events-auto rounded-t-lg shadow-sm border-2 ${!folder.color ? (isSelected ? 'bg-blue-600 text-white border-blue-500' : theme === 'dark' ? 'bg-neutral-800 text-neutral-300 border-neutral-700' : 'bg-white text-neutral-600 border-neutral-200') : ''}`}
                style={getHeaderStyle()}
                onPointerDown={handleDragStart}
                onPointerMove={handleDragMove}
                onPointerUp={handleDragEnd}
                onPointerCancel={handleDragEnd}
                onDoubleClick={handleDoubleClick}
                onContextMenu={handleContextMenu}
            >
                {isRenamingHeader ? (
                    <input
                        ref={renameInputRef}
                        type="text"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => {
                            e.stopPropagation();
                            if (e.key === 'Enter') commitRename();
                            if (e.key === 'Escape') setIsRenamingHeader(false);
                        }}
                        onBlur={commitRename}
                        onClick={e => e.stopPropagation()}
                        onPointerDown={e => e.stopPropagation()}
                        className="bg-transparent outline-none text-center font-bold text-sm w-full min-w-[60px] border-b border-current"
                        style={{ cursor: 'text' }}
                    />
                ) : (
                    folder.name
                )}
                {folder.tags && folder.tags.length > 0 && (
                    <div className="flex gap-1 ml-3">
                        {folder.tags.map(tag => (
                            <span key={tag} className={`text-[10px] font-bold px-1.5 py-0.5 rounded-sm ${isSelected ? 'bg-blue-500 text-white' : theme === 'dark' ? 'bg-neutral-700 text-neutral-300' : 'bg-neutral-200 text-neutral-600'}`}>
                                {tag}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Resize Handle */}
            <div
                className={`absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize pointer-events-auto flex items-end justify-end p-1`}
                onPointerDown={handleResizeStart}
                onPointerMove={handleResizeMove}
                onPointerUp={handleResizeEnd}
                onPointerCancel={handleResizeEnd}
            >
                <div className={`w-3 h-3 ${theme === 'dark' ? 'bg-neutral-600' : 'bg-neutral-400'} rounded-tl-sm clip-triangle`} style={{ clipPath: 'polygon(100% 0, 0% 100%, 100% 100%)' }} />
            </div>
        </div>
    );
});
