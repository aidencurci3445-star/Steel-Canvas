import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';

const _initDoc = new Y.Doc();

export const weldState = {
    ydoc: _initDoc,
    yNodes: _initDoc.getMap('nodes'),
    yEdges: _initDoc.getMap('edges'),
    yFolders: _initDoc.getMap('folders'),
    undoManager: new Y.UndoManager(
        [_initDoc.getMap('nodes'), _initDoc.getMap('edges'), _initDoc.getMap('folders')],
        { captureTimeout: 300 }
    )
};

// Cap undo/redo stacks to prevent unbounded memory growth
const MAX_UNDO_STACK = 100;
const trimUndoStacks = () => {
    const um = weldState.undoManager;
    while (um.undoStack.length > MAX_UNDO_STACK) {
        um.undoStack.shift();
    }
    while (um.redoStack.length > MAX_UNDO_STACK) {
        um.redoStack.shift();
    }
};
weldState.undoManager.on('stack-item-added', trimUndoStacks);

export const weldUndo = () => {
    if (weldState.undoManager.undoStack.length > 0) {
        weldState.undoManager.undo();
    }
};

export const weldRedo = () => {
    if (weldState.undoManager.redoStack.length > 0) {
        weldState.undoManager.redo();
    }
};

let webrtcProvider: WebrtcProvider | null = null;

export const getAwareness = () => webrtcProvider?.awareness || null;

// ICE servers built from environment variables (see .env.example)
// Falls back to STUN-only if TURN credentials aren't configured
const buildIceServers = (): RTCIceServer[] => {
    const servers: RTCIceServer[] = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ];

    const turnUrl = import.meta.env.VITE_TURN_URL;
    const turnUser = import.meta.env.VITE_TURN_USERNAME;
    const turnCred = import.meta.env.VITE_TURN_CREDENTIAL;

    if (turnUrl && turnUser && turnCred) {
        servers.push({ urls: turnUrl, username: turnUser, credential: turnCred });
    } else {
        console.warn('[Weld] TURN credentials not configured — STUN-only mode. Cross-network connections may fail.');
    }

    return servers;
};

const getSignalingUrl = async () => {
    const { useStore } = await import('../store/useStore');
    const { weldServerUrl, licenseKey } = useStore.getState();
    const url = new URL(weldServerUrl);
    if (licenseKey) {
        url.searchParams.set('token', licenseKey);
    }
    return url.toString();
};

// Small delay helper to let y-webrtc clean up its internal rooms map
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

let _signalingPollInterval: ReturnType<typeof setInterval> | null = null;

/** Pings the signaling server via WebSocket; resolves true if reachable */
const pingSignaling = async (): Promise<boolean> => {
    try {
        const url = await getSignalingUrl();
        return new Promise((resolve) => {
            const ws = new WebSocket(url);
            const timer = setTimeout(() => { try { ws.close(); } catch { } resolve(false); }, 2000);
            ws.onopen = () => { clearTimeout(timer); ws.close(); resolve(true); };
            ws.onerror = () => { clearTimeout(timer); resolve(false); };
        });
    } catch {
        return false;
    }
};

/** Starts polling the signaling server every second until reachable */
const startSignalingPoller = () => {
    stopSignalingPoller();
    const poll = async () => {
        const reachable = await pingSignaling();
        import('../store/useStore').then(({ useStore }) => {
            useStore.getState().setWeldConnected(reachable);
        });
        if (reachable) {
            // Server is up — stop polling
            stopSignalingPoller();
        }
    };
    // First check immediately
    poll();
    // Then poll every second, tracking interval
    if (!_signalingPollInterval) {
        _signalingPollInterval = setInterval(poll, 1500);
    }
};

const stopSignalingPoller = () => {
    if (_signalingPollInterval) {
        clearInterval(_signalingPollInterval);
        _signalingPollInterval = null;
    }
};

export const stopWeld = () => {
    stopSignalingPoller();
    if (webrtcProvider) {
        webrtcProvider.awareness.setLocalState(null);
        webrtcProvider.disconnect();
        webrtcProvider.destroy();
        console.log('[Weld] Disconnected from Swarm. Zombie providers destroyed.');
        webrtcProvider = null;
    }
    // Reset connection state
    import('../store/useStore').then(({ useStore }) => {
        useStore.getState().setWeldConnected(false);
    });
    // Clear undo/redo stacks to free CRDT history
    weldState.undoManager.clear();
};

export const startWeld = async (roomId: string) => {
    stopWeld();
    // Reset connection state (show loading spinner)
    import('../store/useStore').then(({ useStore }) => {
        useStore.getState().setWeldConnected(false);
    });

    // wait for state cleanup
    await delay(300);

    try {
        const url = await getSignalingUrl();
        webrtcProvider = new WebrtcProvider(roomId, weldState.ydoc, {
            signaling: [url],
            // @ts-ignore - y-webrtc exposes peerOpts but misses types sometimes
            peerOpts: {
                config: { iceServers: buildIceServers() }
            }
        });

        console.log(`[Weld] Connected to Swarm Room: ${roomId}`);

        webrtcProvider.on('peers', (info: any) => {
            console.log(`[Weld] Peers update — WebRTC: ${info.webrtcPeers?.length || 0}, BC: ${info.bcPeers?.length || 0}`);
        });

        webrtcProvider.on('synced', (info: any) => {
            console.log(`[Weld] Synced with peers:`, info.synced);
        });

        // Start active polling to check signaling server reachability
        startSignalingPoller();

    } catch (e) {
        console.error('[Weld] Failed to create WebrtcProvider:', e);
    }
};


/**
 * Diagnostic: test signaling server connectivity and TURN credential fetching.
 * Returns a string with the results.
 */
export const testWeldConnectivity = async (): Promise<string> => {
    const results: string[] = [];

    const iceServers = buildIceServers();
    results.push(`ICE Servers configured: ${iceServers.length} (${iceServers.length > 2 ? 'STUN + TURN' : 'STUN-only'})`);

    // Test signaling servers
    // Test signaling servers
    try {
        const url = await getSignalingUrl();
        for (const targetUrl of [url]) {
            try {
                const ws = new WebSocket(targetUrl);
                const connected = await new Promise<boolean>((resolve) => {
                    ws.onopen = () => { ws.close(); resolve(true); };
                    ws.onerror = () => resolve(false);
                    setTimeout(() => { ws.close(); resolve(false); }, 3000);
                });
                results.push(connected ? `✓ Signaling ${url}: reachable` : `✗ Signaling ${url}: unreachable`);
            } catch (e) {
                results.push(`✗ Signaling ${url}: ${e}`);
            }
        }

        const report = results.join('\n');
        console.log('[Weld Diagnostics]\n' + report);
        return report;
    } catch (e) {
        return "✗ Failed to query signaling URL: " + e;
    }
};

let syncCallback: ((nodes: any[], edges: any[], folders: any[]) => void) | null = null;

export const setWeldSyncCallback = (cb: typeof syncCallback) => {
    syncCallback = cb;
};

const handleYjsUpdate = () => {
    if (!syncCallback) return;

    const newNodes = Array.from(weldState.yNodes.values()) as any[];
    const newEdges = Array.from(weldState.yEdges.values()) as any[];
    const newFolders = Array.from(weldState.yFolders.values()) as any[];

    syncCallback(newNodes, newEdges, newFolders);
};

weldState.ydoc.on('update', handleYjsUpdate);

/**
 * Replaces the entire local CRDT document with a loaded binary.
 */
export const applyWeldBinary = (binary: Uint8Array | null, currentRoomToRebind: string | null) => {
    if (webrtcProvider) {
        webrtcProvider.destroy();
        webrtcProvider = null;
    }

    weldState.ydoc.off('update', handleYjsUpdate);

    weldState.ydoc = new Y.Doc();
    weldState.yNodes = weldState.ydoc.getMap('nodes');
    weldState.yEdges = weldState.ydoc.getMap('edges');
    weldState.yFolders = weldState.ydoc.getMap('folders');

    weldState.ydoc.on('update', handleYjsUpdate);

    // Recreate UndoManager for the new doc
    weldState.undoManager = new Y.UndoManager(
        [weldState.yNodes, weldState.yEdges, weldState.yFolders],
        { captureTimeout: 300 }
    );

    if (binary) {
        try {
            Y.applyUpdate(weldState.ydoc, binary);
        } catch (e) {
            console.error("[Weld] Failed to apply Yjs binary update:", e);
        }
    }

    handleYjsUpdate();

    if (currentRoomToRebind) {
        startWeld(currentRoomToRebind);
    }
};
