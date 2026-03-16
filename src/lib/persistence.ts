import { invoke } from '@tauri-apps/api/core';
import { save, open } from '@tauri-apps/plugin-dialog';
import { useStore } from '../store/useStore';
import * as Y from 'yjs';
import * as base64 from 'base64-js';
import { weldState, startWeld, applyWeldBinary, stopWeld } from './weldNetwork';

/**
 * Resets to a blank, unsaved canvas.
 * Clears all nodes/edges/folders, disconnects multiplayer, and detaches the file path.
 */
export const newCanvas = () => {
    const store = useStore.getState();
    // Disconnect multiplayer if active
    if (store.swarmKey) {
        stopWeld();
        store.setSwarmKey(null);
    }
    // Reset Yjs to a clean doc
    applyWeldBinary(null, null);
    // Clear file association and metadata
    store.setActiveWorkspacePath(null);
    useStore.setState({
        recentTags: [],
        allTags: [],
        transform: { x: 0, y: 0, scale: 1 },
        activeNodeId: null,
        selectedNodeIds: [],
        selectedEdgeIds: [],
        selectedFolderIds: []
    });
};

export const saveStateToFile = async () => {
    const store = useStore.getState();

    try {
        let filePath = store.activeWorkspacePath;
        if (!filePath) {
            filePath = await save({
                filters: [{
                    name: 'Steel Knowledge Map',
                    extensions: ['steel']
                }]
            });
        }

        if (!filePath) return;

        // Serialize the YJS CRDT state as a binary snapshot
        const stateVector = Y.encodeStateAsUpdate(weldState.ydoc);
        const base64Yjs = base64.fromByteArray(stateVector);

        const dataToSave = {
            version: "1.2",
            swarm_key: store.swarmKey,
            recentTags: store.recentTags,
            allTags: store.allTags,
            transform: store.transform,
            yjs_binary: base64Yjs
        };

        const json = JSON.stringify(dataToSave, null, 2);
        await invoke('save_graph', { path: filePath, data: json });
        store.setActiveWorkspacePath(filePath);

    } catch (error) {
        console.error('Failed to save state:', error);
        store.showError(`Save failed: ${error}`);
    }
};

export const loadStateFromFile = async () => {
    const store = useStore.getState();

    try {
        const file = await open({
            multiple: false,
            filters: [{
                name: 'Steel Knowledge Map',
                extensions: ['steel']
            }]
        });

        if (!file) return;

        const filePath = Array.isArray(file) ? file[0] : file;
        const data: string = await invoke('load_graph', { path: filePath });
        const parsedData = JSON.parse(data);

        // -------------------------------------------------------------------
        // CASE 1: Modern v1.2 format — has yjs_binary
        // -------------------------------------------------------------------
        if (parsedData.yjs_binary) {
            const binary = base64.toByteArray(parsedData.yjs_binary);
            // This replaces the ydoc, hydrates yNodes/yEdges/yFolders,
            // and triggers handleYjsUpdate → syncFromYjs → React state updated.
            applyWeldBinary(binary, null);
        }
        // -------------------------------------------------------------------
        // CASE 2: Legacy format — plain JSON arrays for nodes/edges/folders
        // -------------------------------------------------------------------
        else if (parsedData.nodes || parsedData.edges || parsedData.folders) {
            console.log('[Persistence] Migrating legacy .steel file to v1.2 format...');
            // Reset the Yjs doc to a clean slate
            applyWeldBinary(null, null);
            // Inject legacy data into the fresh Yjs maps
            if (parsedData.nodes?.length) {
                parsedData.nodes.forEach((n: any) => weldState.yNodes.set(n.id, n));
            }
            if (parsedData.edges?.length) {
                parsedData.edges.forEach((e: any) => weldState.yEdges.set(e.id, e));
            }
            if (parsedData.folders?.length) {
                parsedData.folders.forEach((f: any) => weldState.yFolders.set(f.id, f));
            }
        }
        // -------------------------------------------------------------------
        // CASE 3: Completely empty / unrecognized file
        // -------------------------------------------------------------------
        else {
            console.warn('[Persistence] Empty or unrecognized file format.');
            applyWeldBinary(null, null);
        }

        // Hydrate Zustand metadata ONLY (tags, transform, selections)
        // DO NOT call loadGraphState — it would wipe the Yjs maps we just loaded!
        useStore.setState({
            recentTags: parsedData.recentTags || [],
            allTags: parsedData.allTags || [],
            transform: parsedData.transform || { x: 0, y: 0, scale: 1 },
            activeNodeId: null,
            selectedNodeIds: [],
            selectedEdgeIds: [],
            selectedFolderIds: []
        });

        // Resume multiplayer if swarm key exists
        const swarmKey = parsedData.swarm_key || null;
        store.setSwarmKey(swarmKey);
        if (swarmKey) {
            await startWeld(swarmKey);
        }

        store.setActiveWorkspacePath(filePath);

    } catch (error) {
        console.error('Failed to load state:', error);
        store.showError(`Load failed: ${error}`);
    }
};
