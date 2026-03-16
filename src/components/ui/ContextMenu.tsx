import { useEffect, useState, useRef } from 'react';
import { useStore } from '../../store/useStore';
import { dispatchCommand } from '../../lib/commandDispatcher';
import { saveStateToFile, loadStateFromFile, newCanvas } from '../../lib/persistence';
import {
    MousePointerClick, Trash2, Plus,
    FolderPlus, Globe, XCircle, Save, Download,
    Minus, Spline, Activity, MoreHorizontal, Palette, Copy, DownloadCloud, FilePlus2
} from 'lucide-react';
import { getConnectedSubgraph } from '../../lib/graphUtils';
import { exportNodes } from '../../lib/exportEngine';

const PALETTE = [
    { name: 'Default', value: '' },
    { name: 'Red', value: 'red', hex: '#ef4444' },
    { name: 'Orange', value: 'orange', hex: '#f97316' },
    { name: 'Emerald', value: 'emerald', hex: '#10b981' },
    { name: 'Cyan', value: 'cyan', hex: '#06b6d4' },
    { name: 'Blue', value: 'blue', hex: '#3b82f6' },
    { name: 'Purple', value: 'purple', hex: '#a855f7' },
];

export const ContextMenu = () => {
    const { contextMenu, setContextMenu, deleteNode, nodes, folders } = useStore();
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState('');
    const renameInputRef = useRef<HTMLInputElement>(null);

    // Reset rename state when menu reopens
    useEffect(() => { setIsRenaming(false); }, [contextMenu]);

    // Close menu on clicks or escape
    useEffect(() => {
        const handleClickOutside = () => {
            if (contextMenu) setContextMenu(null);
        };
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setContextMenu(null);
        };

        window.addEventListener('click', handleClickOutside);
        window.addEventListener('keydown', handleEscape);

        return () => {
            window.removeEventListener('click', handleClickOutside);
            window.removeEventListener('keydown', handleEscape);
        };
    }, [contextMenu, setContextMenu]);

    if (!contextMenu) return null;

    const handleAction = (action: () => void | Promise<void>) => {
        action();
        setContextMenu(null);
    };

    const startRename = (currentName: string) => {
        setRenameValue(currentName);
        setIsRenaming(true);
        setTimeout(() => {
            renameInputRef.current?.focus();
            renameInputRef.current?.select();
        }, 0);
    };

    const renderRenameInput = (onSubmit: (name: string) => void) => (
        <div className="px-3 py-2" onClick={e => e.stopPropagation()}>
            <input
                ref={renameInputRef}
                type="text"
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onKeyDown={e => {
                    if (e.key === 'Enter' && renameValue.trim()) {
                        onSubmit(renameValue.trim());
                        setContextMenu(null);
                    }
                    if (e.key === 'Escape') setContextMenu(null);
                    e.stopPropagation();
                }}
                className="w-full bg-neutral-900 text-white text-sm px-2 py-1.5 rounded border border-neutral-600 focus:border-blue-500 outline-none font-mono"
            />
        </div>
    );

    const targetNode = contextMenu.type === 'node' ? nodes.find(n => n.id === contextMenu.targetId) : null;
    const targetFolder = contextMenu.type === 'folder' ? folders.find(f => f.id === contextMenu.targetId) : null;
    const targetEdgeId = contextMenu.type === 'edge' ? contextMenu.targetId : null;

    return (
        <div
            className="absolute z-[100] w-56 bg-neutral-900 border border-neutral-700 shadow-2xl rounded-lg py-1 flex flex-col animate-in fade-in zoom-in-95 duration-100"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onContextMenu={(e) => e.preventDefault()} // Prevent native menu chaining
            onClick={(e) => e.stopPropagation()}
        >
            {contextMenu.type === 'global' && (
                <>
                    <button onClick={() => handleAction(() => dispatchCommand(`/node New_Node ${contextMenu.worldX?.toFixed(0)} ${contextMenu.worldY?.toFixed(0)}`))} className="flex items-center gap-3 w-full px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors text-left">
                        <Plus className="w-4 h-4 text-neutral-500" /> New Node Here
                    </button>
                    <button onClick={() => handleAction(() => dispatchCommand(`/folder New_Folder ${contextMenu.worldX?.toFixed(0)} ${contextMenu.worldY?.toFixed(0)} 400 300`))} className="flex items-center gap-3 w-full px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors text-left">
                        <FolderPlus className="w-4 h-4 text-neutral-500" /> New Folder Here
                    </button>
                    <button onClick={() => handleAction(() => {
                        useStore.getState().setWebNodeModal({ x: contextMenu.worldX || 0, y: contextMenu.worldY || 0 });
                    })} className="flex items-center gap-3 w-full px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors text-left">
                        <Globe className="w-4 h-4 text-neutral-500" /> New Web Node
                    </button>
                    <div className="h-px bg-neutral-800 my-1"></div>
                    <button onClick={() => handleAction(() => saveStateToFile())} className="flex items-center gap-3 w-full px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors text-left">
                        <Save className="w-4 h-4 text-neutral-500" /> Save Workspace
                    </button>
                    <button onClick={() => handleAction(() => loadStateFromFile())} className="flex items-center gap-3 w-full px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors text-left">
                        <Download className="w-4 h-4 text-neutral-500" /> Load Workspace
                    </button>
                    <button onClick={() => handleAction(() => newCanvas())} className="flex items-center gap-3 w-full px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors text-left">
                        <FilePlus2 className="w-4 h-4 text-neutral-500" /> New Canvas
                    </button>
                    <div className="h-px bg-neutral-800 my-1"></div>
                    <button onClick={() => handleAction(() => useStore.getState().toggleTheme())} className="flex items-center gap-3 w-full px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors text-left">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-500"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></svg> Toggle Theme
                    </button>
                    <button onClick={() => handleAction(() => dispatchCommand('/clear'))} className="flex items-center gap-3 w-full px-4 py-2 text-sm text-red-500 hover:bg-red-950 transition-colors text-left">
                        <XCircle className="w-4 h-4" /> Clear Canvas
                    </button>
                </>
            )}

            {contextMenu.type === 'node' && targetNode && (
                <>
                    <div className="px-4 py-2 text-xs text-neutral-500 font-mono truncate border-b border-neutral-800 mb-1">
                        Node: {targetNode.name}
                    </div>
                    {targetNode.filePath && (
                        <button onClick={() => handleAction(() => { navigator.clipboard.writeText(targetNode.filePath!); })} className="flex items-center gap-3 w-full px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors text-left">
                            <Copy className="w-4 h-4 text-neutral-500" /> Copy Path
                        </button>
                    )}
                    {isRenaming ? (
                        targetNode.isReadonly ? null : renderRenameInput((name) => dispatchCommand(`/edit ${targetNode.id} ${name}`))
                    ) : (
                        !targetNode.isReadonly && <button onClick={(e) => { e.stopPropagation(); startRename(targetNode.name); }} className="flex items-center gap-3 w-full px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors text-left">
                            <MousePointerClick className="w-4 h-4 text-neutral-500" /> Rename
                        </button>
                    )}
                    {!targetNode.isReadonly && (
                        <button onClick={() => handleAction(() => {
                            useStore.getState().setTagWheel({
                                x: contextMenu.x,
                                y: contextMenu.y,
                                targetNodeId: targetNode.id
                            });
                        })} className="flex items-center gap-3 w-full px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors text-left">
                            <MousePointerClick className="w-4 h-4 text-neutral-500" /> Edit Tags
                        </button>
                    )}
                    <div className="h-px bg-neutral-800 my-1"></div>
                    <div className="px-4 py-1 flex items-center gap-2">
                        <Palette className="w-4 h-4 text-neutral-500" />
                        <div className="flex gap-1.5 flex-wrap">
                            {PALETTE.map(c => (
                                <button
                                    key={c.name}
                                    onClick={() => handleAction(() => {
                                        const { selectedNodeIds, updateNode: update } = useStore.getState();
                                        update(targetNode.id, { color: c.value });
                                        for (const id of selectedNodeIds) {
                                            if (id !== targetNode.id) update(id, { color: c.value });
                                        }
                                    })}
                                    title={c.name}
                                    className={`w-4 h-4 rounded-full border border-neutral-600 transition-transform hover:scale-125 ${targetNode.color === c.value ? 'ring-2 ring-white/50' : ''}`}
                                    style={{ backgroundColor: c.value ? c.hex : 'transparent' }}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="h-px bg-neutral-800 my-1"></div>

                    {/* EXPORT SUBMENU */}
                    <div className="relative group">
                        <button className="flex items-center justify-between w-full px-4 py-2 text-sm text-blue-400 hover:bg-neutral-800 transition-colors text-left">
                            <div className="flex items-center gap-3">
                                <DownloadCloud className="w-4 h-4" /> Export Graph
                            </div>
                            <span className="text-neutral-500 text-xs">▶</span>
                        </button>
                        <div className="absolute top-0 left-full hidden group-hover:block pl-1">
                            <div className="w-40 bg-neutral-900 border border-neutral-700 shadow-2xl rounded-lg py-1">
                                <button onClick={() => handleAction(() => {
                                    const { nodes, edges, setExportModal } = useStore.getState();
                                    const subgraph = getConnectedSubgraph(targetNode.id, nodes, edges);
                                    if (subgraph.length === 1) exportNodes(subgraph, 'txt');
                                    else setExportModal({ format: 'txt', nodes: subgraph.map(n => n.id) });
                                })} className="flex items-center w-full px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800 transition-colors">.TXT Plain Text</button>
                                <button onClick={() => handleAction(() => {
                                    const { nodes, edges, setExportModal } = useStore.getState();
                                    const subgraph = getConnectedSubgraph(targetNode.id, nodes, edges);
                                    if (subgraph.length === 1) exportNodes(subgraph, 'md');
                                    else setExportModal({ format: 'md', nodes: subgraph.map(n => n.id) });
                                })} className="flex items-center w-full px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800 transition-colors">.MD Markdown</button>
                                <button onClick={() => handleAction(() => {
                                    const { nodes, edges, setExportModal } = useStore.getState();
                                    const subgraph = getConnectedSubgraph(targetNode.id, nodes, edges);
                                    if (subgraph.length === 1) exportNodes(subgraph, 'pdf');
                                    else setExportModal({ format: 'pdf', nodes: subgraph.map(n => n.id) });
                                })} className="flex items-center w-full px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800 transition-colors">.PDF Document</button>
                            </div>
                        </div>
                    </div>

                    <div className="h-px bg-neutral-800 my-1"></div>

                    <button onClick={() => handleAction(() => deleteNode(targetNode.id))} className="flex items-center gap-3 w-full px-4 py-2 text-sm text-red-500 hover:bg-red-950 transition-colors text-left">
                        <Trash2 className="w-4 h-4" /> Delete Node
                    </button>
                </>
            )}

            {contextMenu.type === 'folder' && targetFolder && (
                <>
                    <div className="px-4 py-2 text-xs text-neutral-500 font-mono truncate border-b border-neutral-800 mb-1">
                        Folder: {targetFolder.name}
                    </div>
                    {isRenaming ? (
                        renderRenameInput((name: string) => useStore.getState().updateFolder(targetFolder.id, { name }))
                    ) : (
                        <button onClick={(e) => { e.stopPropagation(); startRename(targetFolder.name); }} className="flex items-center gap-3 w-full px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors text-left">
                            <MousePointerClick className="w-4 h-4 text-neutral-500" /> Rename Folder
                        </button>
                    )}
                    <button onClick={() => handleAction(() => {
                        useStore.getState().setTagWheel({
                            x: contextMenu.x,
                            y: contextMenu.y,
                            targetFolderId: targetFolder.id
                        });
                    })} className="flex items-center gap-3 w-full px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors text-left">
                        <MousePointerClick className="w-4 h-4 text-neutral-500" /> Edit Tags
                    </button>
                    <div className="h-px bg-neutral-800 my-1"></div>
                    <div className="px-4 py-1 flex items-center gap-2">
                        <Palette className="w-4 h-4 text-neutral-500" />
                        <div className="flex gap-1.5 flex-wrap">
                            {PALETTE.map(c => (
                                <button
                                    key={c.name}
                                    onClick={() => handleAction(() => {
                                        useStore.setState(state => ({
                                            folders: state.folders.map(f => f.id === targetFolder.id ? { ...f, color: c.value } : f)
                                        }));
                                    })}
                                    title={c.name}
                                    className={`w-4 h-4 rounded-full border border-neutral-600 transition-transform hover:scale-125 ${targetFolder.color === c.value ? 'ring-2 ring-white/50' : ''}`}
                                    style={{ backgroundColor: c.value ? c.hex : 'transparent' }}
                                />
                            ))}
                        </div>
                    </div>
                    <div className="h-px bg-neutral-800 my-1"></div>
                    <button onClick={() => handleAction(() => useStore.getState().deleteFolder(targetFolder.id))} className="flex items-center gap-3 w-full px-4 py-2 text-sm text-red-500 hover:bg-red-950 transition-colors text-left">
                        <Trash2 className="w-4 h-4" /> Delete Folder
                    </button>
                </>
            )}

            {contextMenu.type === 'edge' && targetEdgeId && (
                <>
                    <div className="px-4 py-2 text-xs text-neutral-500 font-mono border-b border-neutral-800 mb-1">
                        Edge Style
                    </div>
                    <button onClick={() => handleAction(() => useStore.getState().updateEdgeStyle(targetEdgeId, 'straight'))} className="flex items-center gap-3 w-full px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors text-left">
                        <Minus className="w-4 h-4 text-neutral-500" /> Straight Line
                    </button>
                    <button onClick={() => handleAction(() => useStore.getState().updateEdgeStyle(targetEdgeId, 'bezier'))} className="flex items-center gap-3 w-full px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors text-left">
                        <Spline className="w-4 h-4 text-neutral-500" /> Bezier Curve
                    </button>
                    <button onClick={() => handleAction(() => useStore.getState().updateEdgeStyle(targetEdgeId, 'step'))} className="flex items-center gap-3 w-full px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors text-left">
                        <Activity className="w-4 h-4 text-neutral-500" /> Orthogonal Step
                    </button>

                    <div className="h-px bg-neutral-800 my-1"></div>
                    <div className="px-4 py-2 text-xs text-neutral-500 font-mono border-b border-neutral-800 mb-1">
                        Stroke Style
                    </div>
                    <button onClick={() => handleAction(() => useStore.getState().updateEdgeStroke(targetEdgeId, 'solid'))} className="flex items-center gap-3 w-full px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors text-left">
                        <Minus className="w-4 h-4 text-neutral-500" /> Solid Line
                    </button>
                    <button onClick={() => handleAction(() => useStore.getState().updateEdgeStroke(targetEdgeId, 'dashed'))} className="flex items-center gap-3 w-full px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors text-left">
                        <svg className="w-4 h-4 text-neutral-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="5,5" strokeLinecap="round" strokeLinejoin="round"><line x1="2" y1="12" x2="22" y2="12"></line></svg> Dashed Line
                    </button>
                    <button onClick={() => handleAction(() => useStore.getState().updateEdgeStroke(targetEdgeId, 'dotted'))} className="flex items-center gap-3 w-full px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors text-left">
                        <MoreHorizontal className="w-4 h-4 text-neutral-500" /> Dotted Line
                    </button>

                    <div className="h-px bg-neutral-800 my-1"></div>
                    <button onClick={() => handleAction(() => useStore.getState().deleteEdge(targetEdgeId))} className="flex items-center gap-3 w-full px-4 py-2 text-sm text-red-500 hover:bg-red-950 transition-colors text-left">
                        <Trash2 className="w-4 h-4" /> Delete Edge
                    </button>
                </>
            )}
        </div>
    );
};
