import { useState, useEffect, useRef } from 'react';
import { useStore } from '../../store/useStore';
import { useShallow } from 'zustand/react/shallow';
import { Search, X, Tag as TagIcon } from 'lucide-react';

export const TagSearchModal = () => {
    const { nodes, tagWheel, setTagWheel, updateNode, addNode, addEdge, addRecentTag, allTags, addGlobalTag, theme } = useStore(useShallow(state => ({
        nodes: state.nodes,
        tagWheel: state.tagWheel,
        setTagWheel: state.setTagWheel,
        updateNode: state.updateNode,
        addNode: state.addNode,
        addEdge: state.addEdge,
        addRecentTag: state.addRecentTag,
        allTags: state.allTags,
        addGlobalTag: state.addGlobalTag,
        theme: state.theme
    })));

    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    // Expose a global event to open this from the TagWheel
    useEffect(() => {
        const handleOpenSearch = () => {
            setIsOpen(true);
            setSearchQuery('');
            setTimeout(() => inputRef.current?.focus(), 50);
        };
        window.addEventListener('open-tag-search', handleOpenSearch);
        return () => window.removeEventListener('open-tag-search', handleOpenSearch);
    }, []);

    // Close on escape
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                setIsOpen(false);
                setTagWheel(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, setTagWheel]);

    if (!isOpen || !tagWheel) return null;

    const filteredTags = allTags.filter(t => t.toLowerCase().includes(searchQuery.toLowerCase()));

    const targetNode = tagWheel.targetNodeId ? nodes.find(n => n.id === tagWheel.targetNodeId) : null;
    const currentTags = targetNode?.tags || [];

    const handleSelectTag = (tag: string) => {
        if (tagWheel.targetNodeId) {
            // Toggle on existing node
            let newTags = [...currentTags];
            if (newTags.includes(tag)) {
                newTags = newTags.filter(t => t !== tag);
            } else {
                newTags.push(tag);
                addRecentTag(tag);
                addGlobalTag(tag);
            }
            updateNode(tagWheel.targetNodeId, { tags: newTags });
            // Do NOT close Modal on simple select/deselect on existing node to allow multiple actions
        } else if (tagWheel.sourceNodeIdForNew) {
            // Spawn new node and link it
            const newNodeId = crypto.randomUUID();
            addNode({
                id: newNodeId,
                x: tagWheel.x,
                y: tagWheel.y,
                name: "New Node",
                type: 'text',
                summary: '',
                tags: [tag]
            });
            addEdge({
                id: crypto.randomUUID(),
                source: tagWheel.sourceNodeIdForNew,
                target: newNodeId
            });
            addRecentTag(tag);
            addGlobalTag(tag);
            setIsOpen(false);
            setTagWheel(null); // Close both because node spawned
        }
    };

    const isDark = theme === 'dark';

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => { setIsOpen(false); setTagWheel(null); }}>
            <div
                className={`w-[400px] max-h-[60vh] flex flex-col rounded-xl shadow-2xl border ${isDark ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200'} overflow-hidden`}
                onClick={e => e.stopPropagation()}
            >
                {/* Header / Search */}
                <div className={`flex items-center gap-3 p-4 border-b ${isDark ? 'border-neutral-800' : 'border-neutral-200'}`}>
                    <Search className={`w-5 h-5 ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`} />
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="Search tags..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className={`flex-1 bg-transparent outline-none font-mono text-sm ${isDark ? 'text-white placeholder:text-neutral-600' : 'text-black placeholder:text-neutral-400'}`}
                    />
                    <button onClick={() => { setIsOpen(false); setTagWheel(null); }} className={`p-1 rounded-md hover:bg-neutral-500/20 transition-colors ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tag List */}
                <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-neutral-700">
                    {filteredTags.length === 0 ? (
                        <div className={`p-6 text-center text-sm font-mono ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`}>
                            No tags found.
                        </div>
                    ) : (
                        <div className="flex flex-col gap-1">
                            {filteredTags.map(tag => {
                                const isActive = currentTags.includes(tag);
                                return (
                                    <button
                                        key={tag}
                                        onClick={() => handleSelectTag(tag)}
                                        className={`flex items-center gap-3 w-full p-3 rounded-lg text-sm font-mono text-left transition-colors
                                            ${isActive
                                                ? (isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-50 text-blue-600')
                                                : (isDark ? 'text-neutral-300 hover:bg-neutral-800' : 'text-neutral-700 hover:bg-neutral-100')
                                            }
                                        `}
                                    >
                                        <TagIcon className={`w-4 h-4 ${isActive ? 'text-blue-500' : (isDark ? 'text-neutral-500' : 'text-neutral-400')}`} />
                                        {tag}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
