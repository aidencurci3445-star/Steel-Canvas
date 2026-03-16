import { weldState, getAwareness, setWeldSyncCallback } from '../lib/weldNetwork';
import { create } from 'zustand';
import { Node, Edge, Transform, CliState, Folder } from '../types';

export interface ContextMenuState {
    x: number;
    y: number;
    worldX?: number;
    worldY?: number;
    type: 'global' | 'node' | 'folder' | 'edge';
    targetId?: string;
}

interface GraphState {
    nodes: Node[];
    edges: Edge[];
    folders: Folder[];
    transform: Transform;
    addNode: (node: Node) => void;
    deleteNode: (id: string) => void;
    moveNode: (id: string, x: number, y: number) => void;
    updateNode: (id: string, data: Partial<Node>) => void;
    updateTransform: (transform: Partial<Transform>) => void;
    addEdge: (edge: Edge) => void;
    deleteEdge: (id: string) => void;
    addFolder: (folder: Folder) => void;
    deleteFolder: (id: string) => void;
    updateFolder: (id: string, data: Partial<Folder>) => void;
    updateFolderSize: (id: string, w: number, h: number) => void;
    updateFolderPos: (id: string, x: number, y: number) => void;
    updateEdgeStyle: (id: string, routing: 'straight' | 'bezier' | 'step') => void;
    updateEdgeStroke: (id: string, stroke: 'solid' | 'dashed' | 'dotted') => void;
    clearGraph: () => void;
    loadGraphState: (state: Omit<GraphState, 'addNode' | 'deleteNode' | 'moveNode' | 'updateNode' | 'updateTransform' | 'addEdge' | 'deleteEdge' | 'addFolder' | 'updateFolderSize' | 'updateFolderPos' | 'updateEdgeStyle' | 'updateEdgeStroke' | 'clearGraph' | 'loadGraphState' | 'setActiveNode' | 'setSelectedNodeIds'>) => void;
    activeNodeId: string | null;
    setActiveNode: (id: string | null) => void;
    selectedNodeIds: string[];
    setSelectedNodeIds: (ids: string[] | ((prev: string[]) => string[])) => void;
    selectedEdgeIds: string[];
    setSelectedEdgeIds: (ids: string[] | ((prev: string[]) => string[])) => void;
    selectedFolderIds: string[];
    setSelectedFolderIds: (ids: string[] | ((prev: string[]) => string[])) => void;
    recentTags: string[];
    addRecentTag: (tag: string) => void;
    allTags: string[];
    addGlobalTag: (tag: string) => void;
}

interface CliSliceState extends CliState {
    addToHistory: (command: string) => void;
    setHistoryIndex: (index: number) => void;
    setCurrentInput: (input: string) => void;
    showError: (error: string) => void;
    cliError: string | null;
}

export interface TagWheelState {
    x: number;
    y: number;
    targetNodeId?: string;
    targetFolderId?: string;
    sourceNodeIdForNew?: string;
    sourceFolderIdForNew?: string;
}

interface UIState {
    contextMenu: ContextMenuState | null;
    setContextMenu: (menu: ContextMenuState | null) => void;
    tagWheel: TagWheelState | null;
    setTagWheel: (wheel: TagWheelState | null) => void;
    activeNoteId: string | null;
    setActiveNoteId: (id: string | null) => void;
    theme: 'dark' | 'light';
    toggleTheme: () => void;
    activeWorkspacePath: string | null;
    setActiveWorkspacePath: (path: string | null) => void;
    swarmKey: string | null;
    setSwarmKey: (key: string | null) => void;
    weldConnected: boolean;
    setWeldConnected: (connected: boolean) => void;
    playerName: string;
    setPlayerName: (name: string) => void;
    animationsDisabled: boolean;
    setAnimationsDisabled: (disabled: boolean) => void;
    autosaveInterval: number; // ms, 0 = disabled
    setAutosaveInterval: (ms: number) => void;
    exportModal: { format: 'pdf' | 'md' | 'txt', nodes: string[] } | null;
    setExportModal: (modal: { format: 'pdf' | 'md' | 'txt', nodes: string[] } | null) => void;
    webNodeModal: { x: number, y: number } | null;
    setWebNodeModal: (modal: { x: number, y: number } | null) => void;
    licenseKey: string | null;
    setLicenseKey: (key: string | null) => void;
    weldServerUrl: string;
    setWeldServerUrl: (url: string) => void;
    autoUpdate: boolean;
    setAutoUpdate: (enabled: boolean) => void;
    syncFromYjs?: (nodes: any[], edges: any[], folders: any[]) => void;
}

export type StoreState = GraphState & CliSliceState & UIState;

export const useStore = create<StoreState>((set) => ({
    // Graph Slice
    nodes: [],
    edges: [],
    folders: [],
    recentTags: [],
    allTags: [],
    transform: { x: 0, y: 0, scale: 1 },
    activeNodeId: null,
    setActiveNode: (id) => set({ activeNodeId: id }),
    selectedNodeIds: [],
    setSelectedNodeIds: (ids) => set((state) => ({
        selectedNodeIds: typeof ids === 'function' ? ids(state.selectedNodeIds) : ids
    })),
    selectedEdgeIds: [],
    setSelectedEdgeIds: (ids) => set((state) => ({
        selectedEdgeIds: typeof ids === 'function' ? ids(state.selectedEdgeIds) : ids
    })),
    selectedFolderIds: [],
    setSelectedFolderIds: (ids) => set((state) => ({
        selectedFolderIds: typeof ids === 'function' ? ids(state.selectedFolderIds) : ids
    })),
    addNode: (node) => { weldState.yNodes.set(node.id, node); },
    deleteNode: (id) => {
        weldState.yNodes.delete(id);
        Array.from(weldState.yEdges.values()).forEach((e: any) => {
            if (e.source === id || e.target === id) weldState.yEdges.delete(e.id);
        });
    },
    moveNode: (id, x, y) => {
        const n = weldState.yNodes.get(id) as Node;
        if (n) weldState.yNodes.set(id, { ...n, x, y });
    },
    updateNode: (id, data) => {
        const n = weldState.yNodes.get(id) as Node;
        if (n) weldState.yNodes.set(id, { ...n, ...data });
    },
    updateTransform: (transform) => set((state) => ({
        transform: { ...state.transform, ...transform }
    })),
    addEdge: (edge) => { weldState.yEdges.set(edge.id, edge); },
    deleteEdge: (id) => { weldState.yEdges.delete(id); },
    addFolder: (folder) => { weldState.yFolders.set(folder.id, folder); },
    deleteFolder: (id) => {
        const foldersToDelete = new Set<string>();
        const queue = [id];
        while (queue.length > 0) {
            const current = queue.shift()!;
            foldersToDelete.add(current);
            Array.from(weldState.yEdges.values()).forEach((e: any) => {
                if (e.type === 'folder-link' && e.source === current) queue.push(e.target);
            });
        }

        foldersToDelete.forEach(fId => weldState.yFolders.delete(fId));
        Array.from(weldState.yEdges.values()).forEach((e: any) => {
            if (foldersToDelete.has(e.source) || foldersToDelete.has(e.target)) {
                weldState.yEdges.delete(e.id);
            }
        });
    },
    updateFolder: (id, data) => {
        const f = weldState.yFolders.get(id) as Folder;
        if (f) weldState.yFolders.set(id, { ...f, ...data });
    },
    updateFolderSize: (id, w, h) => {
        const f = weldState.yFolders.get(id) as Folder;
        if (f) weldState.yFolders.set(id, { ...f, w, h });
    },
    updateFolderPos: (id, x, y) => {
        const f = weldState.yFolders.get(id) as Folder;
        if (f) weldState.yFolders.set(id, { ...f, x, y });
    },
    updateEdgeStyle: (id, routing) => {
        const e = weldState.yEdges.get(id) as Edge;
        if (e) weldState.yEdges.set(id, { ...e, routing });
    },
    updateEdgeStroke: (id, stroke) => {
        const e = weldState.yEdges.get(id) as Edge;
        if (e) weldState.yEdges.set(id, { ...e, stroke });
    },
    addRecentTag: (tag) => set((state) => {
        const cleaned = state.recentTags.filter(t => t !== tag);
        return { recentTags: [tag, ...cleaned].slice(0, 5) };
    }),
    addGlobalTag: (tag) => set((state) => ({
        allTags: state.allTags.includes(tag) ? state.allTags : [...state.allTags, tag].sort()
    })),
    clearGraph: () => {
        Array.from(weldState.yNodes.keys()).forEach(k => weldState.yNodes.delete(k));
        Array.from(weldState.yEdges.keys()).forEach(k => weldState.yEdges.delete(k));
        Array.from(weldState.yFolders.keys()).forEach(k => weldState.yFolders.delete(k));
        set({ recentTags: [], allTags: [] });
    },
    loadGraphState: (state) => {
        Array.from(weldState.yNodes.keys()).forEach(k => weldState.yNodes.delete(k));
        Array.from(weldState.yEdges.keys()).forEach(k => weldState.yEdges.delete(k));
        Array.from(weldState.yFolders.keys()).forEach(k => weldState.yFolders.delete(k));

        if (state.nodes?.length) state.nodes.forEach(n => weldState.yNodes.set(n.id, n));
        if (state.edges?.length) state.edges.forEach(e => weldState.yEdges.set(e.id, e));
        if (state.folders?.length) state.folders.forEach(f => weldState.yFolders.set(f.id, f));

        const extractedTags = new Set(state.nodes?.flatMap(n => n.tags || []) || []);
        (state.allTags || []).forEach(t => extractedTags.add(t));

        set({
            recentTags: state.recentTags || [],
            allTags: Array.from(extractedTags).sort(),
            transform: state.transform || { x: 0, y: 0, scale: 1 },
            activeNodeId: null,
            selectedNodeIds: [],
            selectedEdgeIds: [],
            selectedFolderIds: []
        });
    },

    // CLI Slice
    history: [],
    historyIndex: -1,
    currentInput: '',
    cliError: null,
    addToHistory: (command) => set((state) => ({
        history: [command, ...state.history],
        historyIndex: -1
    })),
    setHistoryIndex: (index) => set({ historyIndex: index }),
    setCurrentInput: (input) => set({ currentInput: input }),
    showError: (error) => {
        set({ cliError: error });
        setTimeout(() => set({ cliError: null }), 3000); // clear after 3s
    },

    // UI State Slice
    contextMenu: null,
    setContextMenu: (menu) => set({ contextMenu: menu }),
    tagWheel: null,
    setTagWheel: (wheel) => set({ tagWheel: wheel }),
    activeNoteId: null,
    setActiveNoteId: (id) => set({ activeNoteId: id }),
    theme: 'dark',
    toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
    activeWorkspacePath: null,
    setActiveWorkspacePath: (path) => set({ activeWorkspacePath: path }),
    swarmKey: null,
    setSwarmKey: (key) => set({ swarmKey: key }),
    weldConnected: false,
    setWeldConnected: (connected) => set({ weldConnected: connected }),
    playerName: localStorage.getItem('steel_player_name') || '',
    setPlayerName: (name) => {
        localStorage.setItem('steel_player_name', name);
        set({ playerName: name });
        const aw = getAwareness();
        if (aw) aw.setLocalStateField('name', name);
    },
    animationsDisabled: localStorage.getItem('steel_anim_disabled') === 'true',
    setAnimationsDisabled: (disabled) => {
        localStorage.setItem('steel_anim_disabled', String(disabled));
        set({ animationsDisabled: disabled });
    },
    autosaveInterval: parseInt(localStorage.getItem('steel_autosave_ms') || '5000', 10),
    setAutosaveInterval: (ms) => {
        localStorage.setItem('steel_autosave_ms', String(ms));
        set({ autosaveInterval: ms });
    },
    exportModal: null,
    setExportModal: (modal) => set({ exportModal: modal }),
    webNodeModal: null,
    setWebNodeModal: (modal) => set({ webNodeModal: modal }),
    licenseKey: localStorage.getItem('steel_license_key') || null,
    setLicenseKey: (key) => {
        if (key) localStorage.setItem('steel_license_key', key);
        else localStorage.removeItem('steel_license_key');
        set({ licenseKey: key });
    },
    weldServerUrl: localStorage.getItem('steel_weld_url') || import.meta.env.VITE_SIGNALING_URL || 'wss://steelserver.onrender.com',
    setWeldServerUrl: (url) => {
        localStorage.setItem('steel_weld_url', url);
        set({ weldServerUrl: url });
    },
    autoUpdate: localStorage.getItem('steel_auto_update') !== 'false', // Default to true
    setAutoUpdate: (enabled) => {
        localStorage.setItem('steel_auto_update', String(enabled));
        set({ autoUpdate: enabled });
    },
    syncFromYjs: (nodes, edges, folders) => set({ nodes, edges, folders })
}));

// Bind CRDT Sync
setWeldSyncCallback((nodes, edges, folders) => {
    const syncFn = useStore.getState().syncFromYjs;
    if (syncFn) syncFn(nodes, edges, folders);
});
