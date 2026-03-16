import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../../store/useStore';
import { useShallow } from 'zustand/react/shallow';
import { Plus, Search } from 'lucide-react';

export const TagWheel = () => {
    const { tagWheel, setTagWheel, updateNode, nodes, addRecentTag, addNode, addEdge, addFolder, recentTags, addGlobalTag, theme, folders, updateFolder } = useStore(useShallow(state => ({
        tagWheel: state.tagWheel,
        setTagWheel: state.setTagWheel,
        updateNode: state.updateNode,
        nodes: state.nodes,
        addRecentTag: state.addRecentTag,
        addNode: state.addNode,
        addEdge: state.addEdge,
        addFolder: state.addFolder,
        recentTags: state.recentTags,
        addGlobalTag: state.addGlobalTag,
        theme: state.theme,
        folders: state.folders,
        updateFolder: state.updateFolder
    })));

    const [isAddingNew, setIsAddingNew] = useState(false);
    const [newTagInput, setNewTagInput] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    // Close on click outside
    useEffect(() => {
        if (!tagWheel) return;
        const handleGlobalClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest('.tag-wheel-container')) {
                setTagWheel(null);
            }
        };
        // Small delay to prevent immediate close from the click that opened it
        setTimeout(() => window.addEventListener('click', handleGlobalClick), 50);
        return () => window.removeEventListener('click', handleGlobalClick);
    }, [tagWheel, setTagWheel]);

    useEffect(() => {
        if (isAddingNew && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isAddingNew]);

    // Reset input state when wheel opens
    useEffect(() => {
        if (tagWheel) {
            setIsAddingNew(false);
            setNewTagInput('');
        }
    }, [tagWheel]);

    if (!tagWheel) return null;

    const targetNode = tagWheel.targetNodeId ? nodes.find(n => n.id === tagWheel.targetNodeId) : null;
    const targetFolder = tagWheel.targetFolderId ? folders.find(f => f.id === tagWheel.targetFolderId) : null;

    const currentTags = targetNode ? (targetNode.tags || []) : (targetFolder ? (targetFolder.tags || []) : []);

    const handleSelectTag = (tag: string | null) => {
        const canvasElement = document.getElementById('canvas-background');
        const rect = canvasElement?.getBoundingClientRect() || { left: 0, top: 0 };
        const transform = useStore.getState().transform;

        const worldX = (tagWheel.x - rect.left - transform.x) / transform.scale;
        const worldY = (tagWheel.y - rect.top - transform.y) / transform.scale;

        if (!tag) {
            // No Tag Selected
            if (targetNode) {
                // Clear all tags
                updateNode(targetNode.id, { tags: [] });
            } else if (targetFolder) {
                updateFolder(targetFolder.id, { tags: [] });
            } else if (tagWheel.sourceFolderIdForNew) {
                // Spawn new folder with no tags
                const newFolderId = crypto.randomUUID();
                addFolder({
                    id: newFolderId,
                    x: worldX - 150,
                    y: worldY - 100,
                    w: 300,
                    h: 200,
                    name: 'New Folder',
                    tags: []
                });
                addEdge({
                    id: crypto.randomUUID(),
                    source: tagWheel.sourceFolderIdForNew,
                    target: newFolderId,
                    type: 'folder-link'
                });
                setTagWheel(null);
            } else if (tagWheel.sourceNodeIdForNew) {
                // Spawn new node with no tags
                const newNodeId = crypto.randomUUID();
                addNode({
                    id: newNodeId,
                    x: worldX,
                    y: worldY,
                    name: "New Node",
                    type: 'text',
                    summary: '',
                    tags: []
                });
                if (tagWheel.sourceNodeIdForNew !== 'KEYBOARD_SPAWN') {
                    addEdge({
                        id: crypto.randomUUID(),
                        source: tagWheel.sourceNodeIdForNew,
                        target: newNodeId,
                        type: 'dependency'
                    });
                }
                setTagWheel(null); // Close to avoid spam
            }
            return;
        }

        if (tagWheel.targetNodeId || tagWheel.targetFolderId) {
            // Toggle on existing node or folder
            let newTags = [...currentTags];
            if (newTags.includes(tag)) {
                newTags = newTags.filter(t => t !== tag);
            } else {
                newTags.push(tag);
                addRecentTag(tag);
                addGlobalTag(tag);
            }

            if (tagWheel.targetNodeId) updateNode(tagWheel.targetNodeId, { tags: newTags });
            if (tagWheel.targetFolderId) updateFolder(tagWheel.targetFolderId, { tags: newTags });
        } else if (tagWheel.sourceFolderIdForNew) {
            // Spawn new folder and link it
            const newFolderId = crypto.randomUUID();
            addFolder({
                id: newFolderId,
                x: worldX - 150,
                y: worldY - 100,
                w: 300,
                h: 200,
                name: 'New Folder',
                tags: [tag]
            });
            addEdge({
                id: crypto.randomUUID(),
                source: tagWheel.sourceFolderIdForNew,
                target: newFolderId,
                type: 'folder-link'
            });
            addRecentTag(tag);
            addGlobalTag(tag);
            setTagWheel(null);
        } else if (tagWheel.sourceNodeIdForNew) {
            // Spawn new node and link it
            const newNodeId = crypto.randomUUID();
            addNode({
                id: newNodeId,
                x: worldX,
                y: worldY,
                name: "New Node",
                type: 'text',
                summary: '',
                tags: [tag]
            });
            addEdge({
                id: crypto.randomUUID(),
                source: tagWheel.sourceNodeIdForNew,
                target: newNodeId,
                type: 'dependency'
            });
            addRecentTag(tag);
            addGlobalTag(tag);
            setTagWheel(null);
        }
    };

    const handleAddNewSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const tag = newTagInput.trim().substring(0, 6);
        if (tag) {
            handleSelectTag(tag);
            setNewTagInput('');
            // Do not reset isAddingNew as per user request: 
            // "When you click to add a new tag, the add menu is always saved and every time you open it, the + and the magnifying glass should appear again"
            // Actually wait, the user meant: IT CLOSES so you see + and lupa next time.
            setIsAddingNew(false);
        } else {
            setIsAddingNew(false);
        }
    };

    // Math for SVG Wedges
    const RADIUS_OUTER = 90;
    const RADIUS_INNER = 40;
    const CENTER = 100; // 200x200 SVG

    // 6 wedges: 60 degrees each. We rotate so wedge 0 is top-center.
    // SVG degrees go clockwise, 0 is right. Top is -90.
    const getWedgePath = (index: number) => {
        const startAngle = (index * 60 - 90 - 30) * (Math.PI / 180);
        const endAngle = (index * 60 - 90 + 30) * (Math.PI / 180);

        const x1 = CENTER + RADIUS_OUTER * Math.cos(startAngle);
        const y1 = CENTER + RADIUS_OUTER * Math.sin(startAngle);
        // Instead of an Arc (A) to x2,y2, we want a Line (L) to make a straight edge connecting the outer hexagon points
        const x2 = CENTER + RADIUS_OUTER * Math.cos(endAngle);
        const y2 = CENTER + RADIUS_OUTER * Math.sin(endAngle);

        const x3 = CENTER + RADIUS_INNER * Math.cos(endAngle);
        const y3 = CENTER + RADIUS_INNER * Math.sin(endAngle);
        // Inner circle remains an Arc, or we can make it a Line too for a strict hex block. The user sketch shows an inner circle. Let's keep inner circle round.
        const x4 = CENTER + RADIUS_INNER * Math.cos(startAngle);
        const y4 = CENTER + RADIUS_INNER * Math.sin(startAngle);

        return `M ${x1} ${y1} L ${x2} ${y2} L ${x3} ${y3} A ${RADIUS_INNER} ${RADIUS_INNER} 0 0 0 ${x4} ${y4} Z`;
    };

    const getLabelPos = (index: number) => {
        const midAngle = (index * 60 - 90) * (Math.PI / 180);
        const r = (RADIUS_OUTER + RADIUS_INNER) / 2;
        return {
            x: CENTER + r * Math.cos(midAngle),
            y: CENTER + r * Math.sin(midAngle)
        };
    };

    // Position the wheel centered on the click
    const style: React.CSSProperties = {
        left: tagWheel.x,
        top: tagWheel.y,
        transform: 'translate(-50%, -50%)'
    };

    // Wedge 0 is No Tag. Wedge 1-5 are recentTags [0]-[4]
    const wedges = [
        { label: 'No Tag', value: null },
        ...Array.from({ length: 5 }).map((_, i) => ({
            label: recentTags[i] || '',
            value: recentTags[i] || ''
        }))
    ];

    const isDark = theme === 'dark';

    return (
        <div
            className="absolute z-[200] tag-wheel-container animate-in zoom-in-95 duration-200"
            style={style}
        >
            <svg width="200" height="200" className="drop-shadow-2xl">
                {wedges.map((w, i) => {
                    if (i > 0 && !w.value) return null; // Don't render empty recent wedges

                    const isActive = w.value && currentTags.includes(w.value);
                    const isNoTag = i === 0;

                    let fillClass = isDark ? 'fill-neutral-900' : 'fill-white';
                    let hoverClass = isDark ? 'hover:fill-neutral-800' : 'hover:fill-neutral-100';
                    let strokeClass = isDark ? 'stroke-neutral-700' : 'stroke-neutral-300';
                    let textClass = isDark ? 'fill-neutral-300' : 'fill-neutral-700';

                    if (isActive) {
                        fillClass = 'fill-blue-500/20';
                        strokeClass = 'stroke-blue-500';
                        textClass = isDark ? 'fill-blue-400' : 'fill-blue-600';
                    }

                    if (isNoTag) {
                        textClass = isDark ? 'fill-neutral-500' : 'fill-neutral-400';
                    }

                    const pos = getLabelPos(i);

                    return (
                        <g
                            key={i}
                            className={`cursor-pointer transition-all ${hoverClass} group`}
                            onClick={(e) => { e.stopPropagation(); handleSelectTag(w.value); }}
                        >
                            <path
                                d={getWedgePath(i)}
                                className={`${fillClass} ${strokeClass} stroke-2 transition-colors`}
                            />
                            <text
                                x={pos.x}
                                y={pos.y}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                className={`text-xs font-bold pointer-events-none select-none ${textClass} group-hover:scale-110 transition-transform origin-center`}
                                style={{ transformOrigin: `${pos.x}px ${pos.y}px` }}
                            >
                                {w.label.length > 8 ? w.label.substring(0, 6) + '..' : w.label}
                            </text>
                        </g>
                    );
                })}

                {/* Center Circle Background */}
                <circle cx={CENTER} cy={CENTER} r={RADIUS_INNER - 4} className={`${isDark ? 'fill-neutral-800' : 'fill-neutral-100'} stroke-2 ${isDark ? 'stroke-neutral-700' : 'stroke-neutral-300'}`} />
            </svg>

            {/* Center HTML Overlay */}
            <div
                className="absolute flex items-center justify-center flex-col gap-1 w-[72px] h-[72px] rounded-full"
                style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
            >
                {isAddingNew ? (
                    <form onSubmit={handleAddNewSubmit} className="w-full px-2" onClick={e => e.stopPropagation()}>
                        <input
                            ref={inputRef}
                            type="text"
                            maxLength={6}
                            value={newTagInput}
                            onChange={e => setNewTagInput(e.target.value)}
                            placeholder="Tag"
                            className={`w-full text-center text-[10px] p-1 rounded font-bold outline-none ${isDark ? 'bg-neutral-900 text-white' : 'bg-white text-black'}`}
                            onKeyDown={e => {
                                if (e.key === 'Escape') setIsAddingNew(false);
                            }}
                        />
                    </form>
                ) : (
                    <>
                        <button
                            onClick={(e) => { e.stopPropagation(); setIsAddingNew(true); }}
                            className={`p-1.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors ${isDark ? 'text-neutral-300' : 'text-neutral-600'}`}
                            title="Add New Tag"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                        <div className={`w-8 h-px ${isDark ? 'bg-neutral-700' : 'bg-neutral-300'}`} />
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                window.dispatchEvent(new CustomEvent('open-tag-search'));
                            }}
                            className={`p-1.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors ${isDark ? 'text-neutral-300' : 'text-neutral-600'}`}
                            title="Search All Tags"
                        >
                            <Search className="w-4 h-4" />
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};
