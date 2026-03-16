
import { useStore } from '../../store/useStore';
import { useShallow } from 'zustand/react/shallow';
import { Network, Copy, Check, Loader2, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

export const WeldKeyNode = () => {
    const { swarmKey, playerName, setPlayerName, weldConnected } = useStore(useShallow((state) => ({
        swarmKey: state.swarmKey,
        playerName: state.playerName,
        setPlayerName: state.setPlayerName,
        weldConnected: state.weldConnected
    })));
    const [copied, setCopied] = useState(false);

    if (!swarmKey) return null;

    const handleCopy = () => {
        navigator.clipboard.writeText(swarmKey);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div
            className="absolute rounded-lg border-2 border-emerald-500/50 bg-neutral-900/95 backdrop-blur-sm p-4 shadow-[0_0_30px_rgba(16,185,129,0.15)] select-none"
            style={{
                transform: `translate(0px, 0px)`,
                width: 380,
                zIndex: 40
            }}
        >
            <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-2">
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Network className="w-5 h-5 text-emerald-400" />
                        <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
                        <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-400 rounded-full" />
                    </div>
                    <span className="text-emerald-400 font-bold tracking-wider text-sm">WELD SWARM ACTIVE</span>
                </div>
                {/* Connection status indicator */}
                <div className="flex items-center gap-1.5" title={weldConnected ? 'Connected to signaling server' : 'Connecting to signaling server...'}>
                    {weldConnected ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                        <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                    )}
                    <span className={`text-[10px] uppercase tracking-wider font-bold ${weldConnected ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {weldConnected ? 'Connected' : 'Connecting...'}
                    </span>
                </div>
            </div>

            <p className="text-neutral-400 text-xs mb-2">
                This project is broadcasting live. Share this key with collaborators to `/weld join`.
            </p>

            <div className="flex items-center gap-2 bg-black/50 rounded-md p-2 border border-white/5">
                <code className="flex-1 text-emerald-300 font-mono text-xs overflow-hidden text-ellipsis whitespace-nowrap">
                    {swarmKey}
                </code>
                <button
                    onClick={handleCopy}
                    className="p-1.5 hover:bg-white/10 rounded-md transition-colors text-neutral-300 pointer-events-auto"
                    title="Copy Swarm Key"
                >
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
            </div>

            <div className="mt-3 bg-black/30 rounded-md p-2 border border-white/5 flex items-center gap-2">
                <span className="text-neutral-500 text-[10px] uppercase tracking-wider font-bold">Name:</span>
                <input
                    type="text"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="Anonymous"
                    className="flex-1 bg-transparent text-xs text-neutral-300 outline-none placeholder:text-neutral-600 font-mono pointer-events-auto"
                    maxLength={15}
                />
            </div>

            <div className="mt-3 flex justify-between items-center text-[10px] text-neutral-500 uppercase tracking-widest px-1">
                <span>[0.0, 0.0]</span>
                <span>Read-Only Node</span>
            </div>
        </div>
    );
};
