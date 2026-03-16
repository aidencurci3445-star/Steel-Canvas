import React, { useCallback, useRef, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { NodeComponent } from '../nodes/Node';
import { EdgesLayer } from './EdgesLayer';
import { FolderComponent } from '../folders/FolderComponent';
import { WeldKeyNode } from '../nodes/WeldKeyNode';
import { GhostCursors } from './GhostCursors';

export const Canvas = () => {
    // Subscribe to nodes so we render them
    const nodes = useStore((state) => state.nodes);
    const folders = useStore((state) => state.folders);


    const canvasRef = useRef<HTMLDivElement>(null);
    const panWrapperRef = useRef<HTMLDivElement>(null);
    const patternRef = useRef<HTMLDivElement>(null);

    const isDragging = useRef(false);
    const lastPos = useRef({ x: 0, y: 0 });

    // --- TRANSIENT UPDATE HELPERS ---
    const applyTransformVisually = useCallback((x: number, y: number, scale: number) => {
        if (panWrapperRef.current) {
            panWrapperRef.current.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
        }
        if (patternRef.current) {
            patternRef.current.style.backgroundSize = `${30 * scale}px ${30 * scale}px`;
            patternRef.current.style.backgroundPosition = `${x}px ${y}px`;
        }
    }, []);

    // Sync on mount
    useEffect(() => {
        const { x, y, scale } = useStore.getState().transform;
        applyTransformVisually(x, y, scale);
    }, [applyTransformVisually]);


    // --- EVENT HANDLERS ---
    const handleWheel = useCallback((e: WheelEvent | React.WheelEvent) => {
        e.preventDefault();
        if (!canvasRef.current) return;

        const currentTransform = useStore.getState().transform;
        const zoomSensitivity = 0.001;
        const delta = e.deltaY;
        const newScale = Math.min(Math.max(currentTransform.scale - delta * zoomSensitivity, 0.2), 3);

        const rect = canvasRef.current.getBoundingClientRect();
        const cursorX = e.clientX - rect.left;
        const cursorY = e.clientY - rect.top;

        const worldX = (cursorX - currentTransform.x) / currentTransform.scale;
        const worldY = (cursorY - currentTransform.y) / currentTransform.scale;

        const newX = cursorX - worldX * newScale;
        const newY = cursorY - worldY * newScale;

        // Visual instantaneous update without React Render
        applyTransformVisually(newX, newY, newScale);

        // Sync to Zustand silently (no re-renders for Canvas, only for components that explicitly listen to transform if any)
        useStore.setState(() => ({ transform: { x: newX, y: newY, scale: newScale } }));
    }, [applyTransformVisually]);

    // Native wheel listener for passive: false
    useEffect(() => {
        const el = canvasRef.current;
        if (!el) return;

        const listener = (e: WheelEvent) => handleWheel(e);
        el.addEventListener('wheel', listener, { passive: false });
        return () => el.removeEventListener('wheel', listener);
    }, [handleWheel]);

    // Global Keybind and Mouse Tracking for Shortcuts
    const lastMousePosScreen = useRef({ x: 0, y: 0 });
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            lastMousePosScreen.current = { x: e.clientX, y: e.clientY };
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ctrl+S → save
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                import('../../lib/persistence').then(m => m.saveStateToFile());
                return;
            }
            // Ctrl+Z → undo, Ctrl+Shift+Z → redo
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
                e.preventDefault();
                if (e.shiftKey) {
                    import('../../lib/weldNetwork').then(m => m.weldRedo());
                } else {
                    import('../../lib/weldNetwork').then(m => m.weldUndo());
                }
                return;
            }
            if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
            if (e.key.toLowerCase() === 'a') {
                useStore.getState().setTagWheel({
                    x: lastMousePosScreen.current.x,
                    y: lastMousePosScreen.current.y,
                    sourceNodeIdForNew: 'KEYBOARD_SPAWN'
                });
            }
        };
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    const isDrawingSelection = useRef(false);
    const selectionStart = useRef({ x: 0, y: 0 });
    const [selectionBox, setSelectionBox] = React.useState<{ x: number; y: number; w: number; h: number } | null>(null);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        // Only drag if clicking exactly on the canvas background, not on nodes
        if (e.target !== canvasRef.current && (e.target as Element).id !== 'canvas-background') {
            return;
        }

        if (e.shiftKey) {
            const currentTransform = useStore.getState().transform;
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return;
            const startX = (e.clientX - rect.left - currentTransform.x) / currentTransform.scale;
            const startY = (e.clientY - rect.top - currentTransform.y) / currentTransform.scale;

            isDrawingSelection.current = true;
            selectionStart.current = { x: startX, y: startY };
            setSelectionBox({ x: startX, y: startY, w: 0, h: 0 });
            return;
        }

        useStore.getState().setSelectedNodeIds([]);
        useStore.getState().setSelectedEdgeIds([]);
        useStore.getState().setSelectedFolderIds([]);
        isDragging.current = true;
        lastPos.current = { x: e.clientX, y: e.clientY };
    }, []);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        const currentTransform = useStore.getState().transform;
        const rect = canvasRef.current?.getBoundingClientRect();

        // Broadcast cursor to Swarm
        if (rect) {
            const currentX = (e.clientX - rect.left - currentTransform.x) / currentTransform.scale;
            const currentY = (e.clientY - rect.top - currentTransform.y) / currentTransform.scale;
            import('../../lib/weldNetwork').then(({ getAwareness }) => {
                const aw = getAwareness();
                if (aw) aw.setLocalStateField('cursor', { x: currentX, y: currentY });
            });
        }

        if (isDrawingSelection.current) {
            if (!rect) return;

            const currentX = (e.clientX - rect.left - currentTransform.x) / currentTransform.scale;
            const currentY = (e.clientY - rect.top - currentTransform.y) / currentTransform.scale;

            const startX = selectionStart.current.x;
            const startY = selectionStart.current.y;

            const boxX1 = Math.min(startX, currentX);
            const boxY1 = Math.min(startY, currentY);
            const boxX2 = Math.max(startX, currentX);
            const boxY2 = Math.max(startY, currentY);

            setSelectionBox({
                x: boxX1,
                y: boxY1,
                w: boxX2 - boxX1,
                h: boxY2 - boxY1
            });

            const allNodes = useStore.getState().nodes;
            const selectedNodeIds = allNodes.filter(n =>
                n.x >= boxX1 && n.x <= boxX2 && n.y >= boxY1 && n.y <= boxY2
            ).map(n => n.id);

            useStore.getState().setSelectedNodeIds(selectedNodeIds);

            const allFolders = useStore.getState().folders;
            // Folders are entirely inside the selection box to be selected
            const selectedFolderIds = allFolders.filter(f =>
                f.x >= boxX1 && f.x + f.w <= boxX2 && f.y >= boxY1 && f.y + f.h <= boxY2
            ).map(f => f.id);

            useStore.getState().setSelectedFolderIds(selectedFolderIds);
            return;
        }

        if (!isDragging.current) return;

        const dx = e.clientX - lastPos.current.x;
        const dy = e.clientY - lastPos.current.y;

        const newX = currentTransform.x + dx;
        const newY = currentTransform.y + dy;

        // Visual update only
        applyTransformVisually(newX, newY, currentTransform.scale);

        // Update direct Zustand store silently
        useStore.setState((state) => ({ transform: { ...state.transform, x: newX, y: newY } }));

        lastPos.current = { x: e.clientX, y: e.clientY };
    }, [applyTransformVisually]);

    const handlePointerUp = useCallback(() => {
        isDragging.current = false;

        if (isDrawingSelection.current) {
            isDrawingSelection.current = false;
            setSelectionBox(null);
        }
    }, []);

    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
        if (e.target !== canvasRef.current && (e.target as Element).id !== 'canvas-background') {
            return;
        }

        if (!canvasRef.current) return;
        const currentTransform = useStore.getState().transform;
        const rect = canvasRef.current.getBoundingClientRect();

        const cursorX = e.clientX - rect.left;
        const cursorY = e.clientY - rect.top;

        const worldX = (cursorX - currentTransform.x) / currentTransform.scale;
        const worldY = (cursorY - currentTransform.y) / currentTransform.scale;

        useStore.getState().addNode({
            id: crypto.randomUUID(),
            x: worldX,
            y: worldY,
            name: "New Note",
            summary: "",
            type: "note"
        });
    }, []);


    // File Drag & Drop using Tauri API 
    // Uses [] deps so it doesn't re-mount and duplicate listeners constantly
    useEffect(() => {
        let unlistenFn: (() => void) | null = null;
        let isMounted = true;

        const setupDropListener = async () => {
            try {
                // In Tauri v2, we listen explicitly on the Webview for drag and drop
                const unlisten = await getCurrentWebview().onDragDropEvent(async (event: any) => {
                    if (!isMounted) return;

                    if (event.payload.type !== 'drop') return;
                    const paths: string[] = event.payload.paths || [];
                    if (!paths || paths.length === 0) return;

                    const rawPath = paths[0];
                    let isWeb = false;
                    let isDirectory = false;
                    let filename = rawPath.split('\\').pop()?.split('/').pop() || 'Unknown';
                    let extension = filename.includes('.') ? `.${filename.split('.').pop()}` : 'file';

                    if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) {
                        isWeb = true;
                        filename = rawPath;
                        extension = 'web';
                    } else if (extension === 'file') {
                        // Very likely a directory if no extension on Windows/Mac drops (tauri drop gives full path to dir)
                        // Or we can just try invoking the directory processor and letting it fail gracefully.
                        isDirectory = true;
                    }

                    let dropX = window.innerWidth / 2;
                    let dropY = window.innerHeight / 2;
                    if (event.payload.position) {
                        dropX = event.payload.position.x;
                        dropY = event.payload.position.y;
                    }

                    const currentTransform = useStore.getState().transform;
                    const rect = canvasRef.current?.getBoundingClientRect();
                    if (rect) {
                        dropX -= rect.left;
                        dropY -= rect.top;
                    }

                    const worldX = (dropX - currentTransform.x) / currentTransform.scale;
                    const worldY = (dropY - currentTransform.y) / currentTransform.scale;

                    if (isDirectory) {
                        try {
                            const { invoke } = await import('@tauri-apps/api/core');
                            const jsonContent: string = await invoke('process_directory_drop', { path: rawPath });
                            let dirData: {
                                folders: { id: string, name: string, parent_folder_id: string | null }[],
                                nodes: { id: string, name: string, node_type: string, file_path: string, folder_id: string | null }[],
                                edges: { source: string, target_name: string }[]
                            };
                            try {
                                dirData = JSON.parse(jsonContent);
                            } catch (parseErr) {
                                console.error('[Canvas] Failed to parse directory data:', parseErr);
                                return;
                            }

                            // Hierarchy & Dynamic Sizing Logic
                            const MIN_FOLDER_WIDTH = 300;
                            const MIN_FOLDER_HEIGHT = 150;
                            const SPACING_X = 60;
                            const SPACING_Y = 60;

                            const NODE_SPACING_X = 140;
                            const NODE_SPACING_Y = 80;

                            const createdFolders = new Map<string, string>(); // rust ID -> store ID
                            // Generate store IDs first
                            dirData.folders.forEach(f => {
                                createdFolders.set(f.id, crypto.randomUUID());
                            });

                            // Calculate required sizes for every folder based on its direct node count
                            const folderSizes = new Map<string, { w: number, h: number }>();

                            dirData.folders.forEach(f => {
                                const directNodesCount = dirData.nodes.filter(n => n.folder_id === f.id).length;
                                if (directNodesCount === 0) {
                                    folderSizes.set(f.id, { w: MIN_FOLDER_WIDTH, h: MIN_FOLDER_HEIGHT });
                                } else {
                                    // Let's aim for a max of 2 columns for a balanced look, expanding if tons of files
                                    let columns = Math.ceil(Math.sqrt(directNodesCount));
                                    columns = Math.max(2, Math.min(columns, 5)); // Between 2 and 5 columns

                                    const rows = Math.ceil(directNodesCount / columns);

                                    // Add padding for folder title and edges
                                    const calcW = Math.max(MIN_FOLDER_WIDTH, (columns * NODE_SPACING_X) + 60);
                                    const calcH = Math.max(MIN_FOLDER_HEIGHT, (rows * NODE_SPACING_Y) + 80);

                                    folderSizes.set(f.id, { w: calcW, h: calcH });
                                }
                            });

                            // Build Tree to calculate layout visually
                            const rootFolders = dirData.folders.filter(f => !f.parent_folder_id || !createdFolders.has(f.parent_folder_id));

                            // A simple recursive function to place folders
                            const placeFolder = (folder: typeof dirData.folders[0], startX: number, currentY: number): number => {
                                const newId = createdFolders.get(folder.id)!;
                                const size = folderSizes.get(folder.id)!;

                                // Children folders
                                const children = dirData.folders.filter(f => f.parent_folder_id === folder.id);

                                let currentX = startX;

                                if (children.length > 0) {
                                    // Place children below this folder
                                    children.forEach(child => {
                                        const childTotalWidth = placeFolder(child, currentX, currentY + size.h + SPACING_Y);
                                        currentX += childTotalWidth + SPACING_X;
                                    });
                                } else {
                                    currentX += size.w;
                                }

                                const totalWidthConsumed = Math.max(size.w, currentX - startX - (children.length > 0 ? SPACING_X : 0));

                                useStore.getState().addFolder({
                                    id: newId,
                                    name: folder.name,
                                    x: startX, // Anchor the parent folder to the start of its block
                                    y: currentY,
                                    w: size.w,
                                    h: size.h
                                });

                                return totalWidthConsumed;
                            };

                            let currentRootX = worldX;
                            rootFolders.forEach(rootFolder => {
                                const consumedWidth = placeFolder(rootFolder, currentRootX, worldY);
                                currentRootX += consumedWidth + SPACING_X;
                            });

                            // Nodes placement inside folders
                            const folderNodeCounts = new Map<string, number>();
                            const createdNodesMap = new Map<string, string>(); // Rust ID to Store ID

                            dirData.nodes.forEach(n => {
                                let nx = worldX;
                                let ny = worldY + 100;

                                if (n.folder_id && createdFolders.has(n.folder_id)) {
                                    const mappedFolderId = createdFolders.get(n.folder_id)!;
                                    const fData = useStore.getState().folders.find(folder => folder.id === mappedFolderId);
                                    if (fData) {
                                        const count = folderNodeCounts.get(mappedFolderId) || 0;
                                        // Retrieve dynamic columns
                                        const directNodesCount = dirData.nodes.filter(dn => dn.folder_id === n.folder_id).length;
                                        let columns = Math.ceil(Math.sqrt(directNodesCount));
                                        columns = Math.max(2, Math.min(columns, 5));

                                        const col = count % columns;
                                        const row = Math.floor(count / columns);
                                        // Offset inside folder
                                        nx = fData.x + 30 + (col * NODE_SPACING_X);
                                        ny = fData.y + 60 + (row * NODE_SPACING_Y);
                                        folderNodeCounts.set(mappedFolderId, count + 1);
                                    }
                                } else {
                                    // No folder, just stack them outside
                                    ny += (folderNodeCounts.get('root') || 0) * NODE_SPACING_Y;
                                    folderNodeCounts.set('root', (folderNodeCounts.get('root') || 0) + 1);
                                }

                                const storeNodeId = crypto.randomUUID();
                                createdNodesMap.set(n.id, storeNodeId);

                                useStore.getState().addNode({
                                    id: storeNodeId,
                                    x: nx,
                                    y: ny,
                                    name: n.name,
                                    summary: '',
                                    type: n.node_type,
                                    filePath: n.file_path
                                });
                            });

                            // Hierarchical Folder Edges
                            dirData.folders.forEach(childFolder => {
                                if (childFolder.parent_folder_id && createdFolders.has(childFolder.parent_folder_id)) {
                                    const sourceFolderId = createdFolders.get(childFolder.parent_folder_id)!;
                                    const targetFolderId = createdFolders.get(childFolder.id)!;

                                    useStore.getState().addEdge({
                                        id: crypto.randomUUID(),
                                        source: sourceFolderId,
                                        target: targetFolderId,
                                        type: 'folder-link'
                                    });
                                }
                            });

                            // Edges
                            dirData.edges.forEach(e => {
                                const sourceId = createdNodesMap.get(e.source);
                                if (!sourceId) return;

                                // Basic heuristic: find a created node whose name sans extension matches target_name exactly (case insensitive)
                                // or exact match with extension.
                                const allCurrentNodes = useStore.getState().nodes;
                                const targetNode = allCurrentNodes.find(n => {
                                    if (!Array.from(createdNodesMap.values()).some((v: string) => v === n.id)) return false; // Only link to newly created nodes in this drop

                                    const nodeNameLower = n.name.toLowerCase();
                                    const targetNameLower = e.target_name;

                                    if (nodeNameLower === targetNameLower) return true;

                                    // Strip extension 'MyComponent.tsx' -> 'mycomponent'
                                    const nodeNameSansExt = nodeNameLower.split('.')[0];
                                    if (nodeNameSansExt === targetNameLower) return true;

                                    return false;
                                });

                                if (targetNode) {
                                    useStore.getState().addEdge({
                                        id: crypto.randomUUID(),
                                        source: sourceId,
                                        target: targetNode.id,
                                        type: 'dependency'
                                    });
                                }
                            });

                        } catch (e) {
                            console.warn("Dropped item was not a valid directory or failed to parse", e);
                            // Fallback to single file drop
                            useStore.getState().addNode({
                                id: crypto.randomUUID(),
                                x: worldX,
                                y: worldY,
                                name: filename,
                                summary: '',
                                type: extension,
                                filePath: rawPath
                            });
                        }
                    } else {
                        // Standard Single File/Url
                        useStore.getState().addNode({
                            id: crypto.randomUUID(),
                            x: worldX,
                            y: worldY,
                            name: isWeb ? new URL(rawPath).hostname : filename,
                            summary: isWeb ? rawPath : '',
                            type: extension,
                            filePath: rawPath
                        });
                    }
                });

                if (isMounted) {
                    unlistenFn = unlisten;
                } else {
                    unlisten();
                }
            } catch (err) {
                console.error("Failed to setup drop listener", err);
            }
        };

        setupDropListener();

        return () => {
            isMounted = false;
            if (unlistenFn) {
                unlistenFn();
            }
        };
    }, []);

    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        if (e.target !== canvasRef.current && (e.target as Element).id !== 'canvas-background') {
            return;
        }
        e.preventDefault();

        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        const cursorX = e.clientX - rect.left;
        const cursorY = e.clientY - rect.top;

        const currentTransform = useStore.getState().transform;
        const worldX = (cursorX - currentTransform.x) / currentTransform.scale;
        const worldY = (cursorY - currentTransform.y) / currentTransform.scale;

        useStore.getState().setContextMenu({
            x: e.clientX,
            y: e.clientY,
            worldX,
            worldY,
            type: 'global'
        });
    }, []);


    const theme = useStore((state) => state.theme);
    const transform = useStore((state) => state.transform);

    // Global Keyboard listener for Selection deletion
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if typing in an input, textarea, or contenteditable
            const target = e.target as HTMLElement;
            if (['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable) return;

            if (e.key === 'Delete' || e.key === 'Backspace') {
                const selectedIds = useStore.getState().selectedNodeIds;
                if (selectedIds.length > 0) {
                    selectedIds.forEach(id => useStore.getState().deleteNode(id));
                    useStore.getState().setSelectedNodeIds([]);
                }

                const selectedEdges = useStore.getState().selectedEdgeIds;
                if (selectedEdges.length > 0) {
                    selectedEdges.forEach(id => useStore.getState().deleteEdge(id));
                    useStore.getState().setSelectedEdgeIds([]);
                }

                const selectedFolders = useStore.getState().selectedFolderIds;
                if (selectedFolders.length > 0) {
                    selectedFolders.forEach(id => useStore.getState().deleteFolder(id));
                    useStore.getState().setSelectedFolderIds([]);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Render Canvas content
    return (
        <div
            id="canvas-background"
            ref={canvasRef}
            className={`absolute inset-0 z-0 bg-transparent overflow-hidden touch-none select-none ${theme === 'dark' ? 'text-neutral-200' : 'text-black'}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onDoubleClick={handleDoubleClick}
            onContextMenu={handleContextMenu}
        >
            {/* Background Grid Pattern (Optimized GPU SVG) */}
            <div
                ref={patternRef}
                className={`absolute inset-0 pointer-events-none ${theme === 'dark' ? 'opacity-[0.1]' : 'opacity-[0.05]'}`}
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='30' height='30' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='1.5' cy='1.5' r='1.5' fill='${theme === 'dark' ? '%23ffffff' : '%23000000'}'/%3E%3C/svg%3E")`,
                }}
            />

            {/* Transform context for edges, folders and nodes */} {/* Updated comment */}
            <div
                ref={panWrapperRef}
                className="absolute inset-0 w-full h-full origin-top-left pointer-events-none will-change-transform" // Modified className
                style={{ // Added style attribute
                    transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                }}
            >
                {/* Selection Box */}
                {selectionBox && (
                    <div
                        className="absolute border border-blue-500 bg-blue-500/20 pointer-events-none z-[100]"
                        style={{
                            left: `${selectionBox.x}px`,
                            top: `${selectionBox.y}px`,
                            width: `${selectionBox.w}px`,
                            height: `${selectionBox.h}px`
                        }}
                    />
                )}

                {/* Folders Layer (below nodes and edges) */} {/* Added this section */}
                {folders.map(folder => (
                    <FolderComponent key={folder.id} folder={folder} />
                ))}

                <EdgesLayer />

                {/* Multiplayer Swarm Key */}
                <WeldKeyNode />
                <GhostCursors />

                {nodes.map((node) => (
                    <NodeComponent key={node.id} node={node} />
                ))}
            </div>
        </div>
    );
};
