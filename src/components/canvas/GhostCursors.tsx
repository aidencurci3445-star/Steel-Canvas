import { useEffect, useState } from 'react';
import { getAwareness } from '../../lib/weldNetwork';
import { useStore } from '../../store/useStore';
import { useShallow } from 'zustand/react/shallow';

interface Cursor {
    x: number;
    y: number;
    color: string;
    name?: string;
}

// A simple color palette for assigning to clients based on ID
const CURSOR_COLORS = [
    '#f87171', '#fb923c', '#fbbf24', '#a3e635',
    '#34d399', '#2dd4bf', '#38bdf8', '#818cf8',
    '#c084fc', '#f472b6'
];

export const GhostCursors = () => {
    const [cursors, setCursors] = useState<Map<number, Cursor>>(new Map());
    const { swarmKey, playerName } = useStore(useShallow(state => ({
        swarmKey: state.swarmKey,
        playerName: state.playerName
    })));

    useEffect(() => {
        if (!swarmKey) {
            setCursors(new Map());
            return;
        }

        let cleanup: (() => void) | null = null;
        let retryTimer: number | null = null;

        const bind = () => {
            const awareness = getAwareness();
            if (!awareness) {
                // Provider may not be ready yet — retry shortly
                retryTimer = window.setTimeout(bind, 300);
                return;
            }

            // Assign ourselves a color if we haven't already
            if (!awareness.getLocalState()?.color) {
                const myColor = CURSOR_COLORS[awareness.clientID % CURSOR_COLORS.length];
                awareness.setLocalStateField('color', myColor);
            }

            // Sync our custom name to the swarm
            if (awareness.getLocalState()?.name !== playerName) {
                awareness.setLocalStateField('name', playerName);
            }

            const handleChange = () => {
                const states = awareness.getStates();
                const newCursors = new Map<number, Cursor>();

                states.forEach((state: any, clientId: number) => {
                    // Don't draw our own cursor
                    if (clientId === awareness.clientID) return;

                    if (state.cursor && state.color) {
                        newCursors.set(clientId, {
                            x: state.cursor.x,
                            y: state.cursor.y,
                            color: state.color,
                            name: state.name
                        });
                    }
                });

                setCursors(newCursors);
            };

            awareness.on('change', handleChange);
            handleChange(); // Initial sync

            cleanup = () => {
                awareness.off('change', handleChange);
            };
        };

        bind();

        return () => {
            if (retryTimer) window.clearTimeout(retryTimer);
            if (cleanup) cleanup();
        };
    }, [swarmKey, playerName]);

    if (!swarmKey || cursors.size === 0) return null;

    return (
        <>
            {Array.from(cursors.entries()).map(([clientId, cursor]) => (
                <div
                    key={clientId}
                    className="absolute pointer-events-none z-[60] transition-transform duration-75 ease-linear will-change-transform"
                    style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }}
                >
                    <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        className="drop-shadow-md"
                    >
                        <path
                            d="M5.65376 21.3113C5.22851 21.603 4.63001 21.39 4.41727 20.898L1.10707 13.2359C0.871891 12.6918 1.13968 12.0622 1.68808 11.8596L20.4497 4.92723C20.9576 4.73963 21.4651 5.1634 21.365 5.692L16.4851 21.461C16.3268 21.9723 15.6521 22.149 15.2285 21.789L11.5168 18.632C11.3963 18.5295 11.2372 18.4842 11.0792 18.5074L5.65376 21.3113Z"
                            fill={cursor.color}
                            stroke="white"
                            strokeWidth="1.5"
                            strokeLinejoin="round"
                        />
                    </svg>
                    <div
                        className="absolute top-5 left-4 px-1.5 py-0.5 rounded text-[10px] font-bold text-white shadow-sm whitespace-nowrap"
                        style={{ backgroundColor: cursor.color }}
                    >
                        {cursor.name?.trim() ? cursor.name : `Peer-${clientId.toString().slice(-4)}`}
                    </div>
                </div>
            ))}
        </>
    );
};
