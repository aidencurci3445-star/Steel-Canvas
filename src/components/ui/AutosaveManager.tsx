import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import { saveStateToFile } from '../../lib/persistence';
import { Check } from 'lucide-react';

export const AutosaveManager = () => {
    const timerRef = useRef<number | null>(null);
    const [showIndicator, setShowIndicator] = useState(false);
    const theme = useStore(state => state.theme);
    const autosaveInterval = useStore(state => state.autosaveInterval);

    useEffect(() => {
        const unsubscribe = useStore.subscribe((state, prevState) => {
            // Disabled or no saved workspace
            if (state.autosaveInterval <= 0) return;
            if (!state.activeWorkspacePath) return;

            // Check if actual topological data changed
            if (state.nodes !== prevState.nodes ||
                state.edges !== prevState.edges ||
                state.folders !== prevState.folders ||
                state.transform !== prevState.transform) {

                if (timerRef.current) window.clearTimeout(timerRef.current);

                timerRef.current = window.setTimeout(async () => {
                    const latestState = useStore.getState();
                    if (!latestState.activeWorkspacePath) return;
                    if (latestState.autosaveInterval <= 0) return;

                    try {
                        await saveStateToFile();
                        setShowIndicator(true);
                        setTimeout(() => setShowIndicator(false), 2000);
                    } catch (e) {
                        console.error("Autosave failed", e);
                    }
                }, state.autosaveInterval);
            }
        });

        return () => {
            unsubscribe();
            if (timerRef.current) window.clearTimeout(timerRef.current);
        };
    }, [autosaveInterval]);

    if (!showIndicator) return null;

    return (
        <div className={`absolute bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full shadow-lg border text-xs font-medium animate-in fade-in zoom-in slide-in-from-bottom-4 duration-300 ${theme === 'dark' ? 'bg-neutral-800 text-neutral-300 border-neutral-700' : 'bg-white text-neutral-600 border-neutral-200'}`}>
            <Check className="w-3.5 h-3.5 text-green-500" /> Autosaved
        </div>
    );
};
