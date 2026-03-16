import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../../store/useStore';
import { useShallow } from 'zustand/react/shallow';
import { Globe } from 'lucide-react';

export const WebNodeModal = () => {
    const { webNodeModal, setWebNodeModal, addNode, theme } = useStore(useShallow(state => ({
        webNodeModal: state.webNodeModal,
        setWebNodeModal: state.setWebNodeModal,
        addNode: state.addNode,
        theme: state.theme
    })));

    const [url, setUrl] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (webNodeModal) {
            setUrl('');
            // Focus the input when modal opens
            setTimeout(() => {
                inputRef.current?.focus();
            }, 50);
        }
    }, [webNodeModal]);

    if (!webNodeModal) return null;

    const handleClose = () => {
        setWebNodeModal(null);
    };

    const handleSubmit = (e?: React.FormEvent) => {
        if (e) e.preventDefault();

        let finalUrl = url.trim();
        if (!finalUrl) {
            handleClose();
            return;
        }

        if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
            finalUrl = 'https://' + finalUrl;
        }

        try {
            const hostname = new URL(finalUrl).hostname;
            addNode({
                id: String(Date.now()),
                name: hostname || 'Web',
                type: 'web',
                filePath: finalUrl,
                x: webNodeModal.x || 0,
                y: webNodeModal.y || 0,
                summary: finalUrl
            });
            handleClose();
        } catch (error) {
            // Invalid URL fallback
            addNode({
                id: String(Date.now()),
                name: 'Web',
                type: 'web',
                filePath: finalUrl,
                x: webNodeModal.x || 0,
                y: webNodeModal.y || 0,
                summary: finalUrl
            });
            handleClose();
        }
    };

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={handleClose}
            onContextMenu={e => e.preventDefault()}
        >
            <div
                className={`w-[400px] rounded-xl shadow-2xl p-6 border ${theme === 'dark'
                        ? 'bg-[#1a1a1a] border-neutral-800 text-neutral-200'
                        : 'bg-white border-neutral-200 text-neutral-800'
                    }`}
                onClick={e => e.stopPropagation()} // Prevent close when clicking inside
            >
                <div className="flex items-center gap-3 mb-6">
                    <Globe className={`w-6 h-6 ${theme === 'dark' ? 'text-blue-400' : 'text-blue-500'}`} />
                    <h2 className="text-lg font-bold">New Web Node</h2>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="mb-6">
                        <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-500'}`}>
                            Enter Web URL (e.g. https://wikipedia.org):
                        </label>
                        <input
                            ref={inputRef}
                            type="text"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="https://"
                            className={`w-full px-4 py-2 font-mono text-sm rounded-lg border focus:ring-2 focus:outline-none transition-all ${theme === 'dark'
                                    ? 'bg-[#0f0f0f] border-neutral-700 focus:border-blue-500 focus:ring-blue-500/20 text-white placeholder-neutral-600'
                                    : 'bg-neutral-50 border-neutral-300 focus:border-blue-500 focus:ring-blue-500/20 text-black placeholder-neutral-400'
                                }`}
                            onKeyDown={e => {
                                if (e.key === 'Escape') handleClose();
                            }}
                        />
                    </div>

                    <div className="flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={handleClose}
                            className={`px-4 py-2 text-sm font-bold rounded-lg transition-colors ${theme === 'dark'
                                    ? 'hover:bg-neutral-800 text-neutral-400'
                                    : 'hover:bg-neutral-100 text-neutral-500'
                                }`}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!url.trim()}
                            className={`px-4 py-2 text-sm font-bold text-white rounded-lg transition-colors ${!url.trim()
                                    ? 'bg-blue-500/50 cursor-not-allowed'
                                    : 'bg-blue-600 hover:bg-blue-500'
                                }`}
                        >
                            Create Node
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
