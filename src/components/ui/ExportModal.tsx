import { useState, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { useShallow } from 'zustand/react/shallow';
import { X, GripVertical, FileDown } from 'lucide-react';
import { exportNodes } from '../../lib/exportEngine';
import { Node } from '../../types';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Sortable Item Component
const SortableNodeRow = ({ item, toggleSelection, getNodeColorHex }: any) => {
    const { node, selected } = item;
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: node.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 100 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`
                flex items-center gap-4 p-3 rounded-lg border transition-colors
                ${selected ? 'bg-[#1a1a1a] border-neutral-700' : 'bg-[#0a0a0a] border-neutral-800/50 opacity-60'}
                ${isDragging ? 'opacity-50 ring-2 ring-blue-500 shadow-xl' : ''}
            `}
        >
            <div
                {...attributes}
                {...listeners}
                className="text-neutral-600 cursor-grab active:cursor-grabbing hover:text-neutral-400 p-1"
            >
                <GripVertical className="w-5 h-5" />
            </div>
            <input
                type="checkbox"
                checked={selected}
                onChange={() => toggleSelection(node.id)}
                className="w-4 h-4 cursor-pointer accent-blue-500"
            />
            <div
                className="w-3 h-3 rounded-full border border-neutral-600 flex-shrink-0"
                style={{ backgroundColor: getNodeColorHex(node.color) || 'transparent' }}
            />
            <div className="flex-1 min-w-0">
                <div className="text-white font-bold text-sm truncate">
                    {node.name || 'Unnamed Node'}
                </div>
                <div className="text-neutral-500 text-xs truncate mt-0.5 max-w-[400px]">
                    {node.summary || node.filePath || 'No content preview available...'}
                </div>
            </div>
        </div>
    );
};

export const ExportModal = () => {
    const { exportModal, setExportModal, nodes } = useStore(useShallow(state => ({
        exportModal: state.exportModal,
        setExportModal: state.setExportModal,
        nodes: state.nodes
    })));

    const [orderedNodes, setOrderedNodes] = useState<{ node: Node, selected: boolean }[]>([]);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    useEffect(() => {
        if (exportModal) {
            const initialNodes = exportModal.nodes
                .map(id => nodes.find(n => n.id === id))
                .filter((n): n is Node => !!n)
                .map(node => ({ node, selected: true }));

            setOrderedNodes(initialNodes);
        }
    }, [exportModal, nodes]);

    const toggleSelection = (nodeId: string) => {
        setOrderedNodes(prev => prev.map(item =>
            item.node.id === nodeId ? { ...item, selected: !item.selected } : item
        ));
    };

    if (!exportModal) return null;

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            setOrderedNodes((items) => {
                const oldIndex = items.findIndex(i => i.node.id === active.id);
                const newIndex = items.findIndex(i => i.node.id === over.id);
                return arrayMove(items, oldIndex, newIndex);
            });
        }
    };

    const handleExport = () => {
        const finalNodesList = orderedNodes.filter(n => n.selected).map(n => n.node);
        exportNodes(finalNodesList, exportModal.format);
        setExportModal(null);
    };

    const getNodeColorHex = (colorName?: string) => {
        if (!colorName) return undefined;
        const cmap: Record<string, string> = {
            'red': '#ef4444', 'orange': '#f97316', 'emerald': '#10b981',
            'cyan': '#06b6d4', 'blue': '#3b82f6', 'purple': '#a855f7'
        };
        return cmap[colorName];
    };

    const fileFormatStr = exportModal.format.toUpperCase();

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-[#111111] border border-neutral-800 rounded-xl overflow-hidden shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">

                {/* Header */}
                <div className="h-14 border-b border-neutral-800 flex items-center justify-between px-6 bg-[#161616]">
                    <div className="flex items-center gap-3">
                        <FileDown className="w-5 h-5 text-blue-400" />
                        <h2 className="text-white font-mono font-bold">Export Subgraph as .{fileFormatStr}</h2>
                    </div>
                    <button
                        onClick={() => setExportModal(null)}
                        className="p-2 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body - Draggable List */}
                <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-2">
                    <p className="text-neutral-400 text-sm mb-4">
                        Drag to reorder the structural sequence of the document. Uncheck nodes to exclude them from the export.
                    </p>

                    <div className="flex flex-col gap-2">
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleDragEnd}
                        >
                            <SortableContext
                                items={orderedNodes.map(i => i.node.id)}
                                strategy={verticalListSortingStrategy}
                            >
                                {orderedNodes.map((item) => (
                                    <SortableNodeRow
                                        key={item.node.id}
                                        item={item}
                                        toggleSelection={toggleSelection}
                                        getNodeColorHex={getNodeColorHex}
                                    />
                                ))}
                            </SortableContext>
                        </DndContext>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-neutral-800 bg-[#161616] flex justify-end gap-3">
                    <button
                        onClick={() => setExportModal(null)}
                        className="px-4 py-2 text-sm font-medium text-neutral-300 hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleExport}
                        disabled={orderedNodes.filter(n => n.selected).length === 0}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg shadow-lg flex items-center gap-2 transition-colors"
                    >
                        <FileDown className="w-4 h-4" /> Export {orderedNodes.filter(n => n.selected).length} Nodes
                    </button>
                </div>
            </div>
        </div>
    );
};
