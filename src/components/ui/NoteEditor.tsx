import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useStore } from '../../store/useStore';
import { X, Save } from 'lucide-react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { marked } from 'marked';
import Editor from 'react-simple-code-editor';
import Prism from 'prismjs';
import { NativeWebview } from './NativeWebview';
import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-ruby';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-markup'; // HTML is included in markup

// Lazy-load heavy deps only (xterm ~332KB)
const LazyTerminalNode = React.lazy(() => import('../nodes/TerminalNode').then(m => ({ default: m.TerminalNode })));

export const NoteEditor = () => {
    const { activeNoteId, setActiveNoteId, nodes, edges, updateNode, theme } = useStore();
    const activeNode = nodes.find(n => n.id === activeNoteId);

    const [content, setContent] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isEditingType, setIsEditingType] = useState(false);
    const [typeValue, setTypeValue] = useState('');
    const typeInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (activeNode) {
            const loadContent = async () => {
                if (activeNode.filePath) {
                    const normalizedType = activeNode.type.toLowerCase().replace(/^\./, '');
                    const isMediaNode = /^(png|jpg|jpeg|gif|svg|webp|ico|mp4|webm|ogg|pdf)$/i.test(normalizedType) || normalizedType === 'web';
                    if (isMediaNode) {
                        return;
                    }
                    setIsLoading(true);
                    try {
                        const fileContent: string = await invoke('load_file', { path: activeNode.filePath });
                        setContent(fileContent);
                    } catch (error) {
                        console.error('Failed to load file content:', error);
                        setContent(`Error loading file: ${error}`);
                    } finally {
                        setIsLoading(false);
                    }
                } else {
                    setContent(activeNode.summary || '');
                }
            };

            loadContent();

            setTimeout(() => {
                textareaRef.current?.focus();
            }, 50);
        }
    }, [activeNode]);

    if (!activeNoteId || !activeNode) return null;

    const handleSave = async (closeAfterSave = false) => {
        if (activeNode.filePath) {
            try {
                await invoke('save_file', { path: activeNode.filePath, content });
                updateNode(activeNoteId, { summary: content.substring(0, 100) + (content.length > 100 ? '...' : '') });
            } catch (error) {
                console.error('Failed to save file:', error);
            }
        } else {
            updateNode(activeNoteId, { summary: content });
        }

        if (closeAfterSave) {
            setActiveNoteId(null);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            setActiveNoteId(null);
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            e.stopPropagation();
            handleSave(false);
        }
        if (e.key === 'Enter' && e.ctrlKey) {
            handleSave(false);
        }
    };

    const normalizedType = activeNode.type.toLowerCase().replace(/^\./, '');
    const isCode = /^(ts|js|json|rs|py|c|cpp|cs|go|rb|java|css|html)$/i.test(normalizedType);
    const isImage = /^(png|jpg|jpeg|gif|svg|webp|ico)$/i.test(normalizedType);
    const isVideo = /^(mp4|webm|ogg)$/i.test(normalizedType);
    const isPdf = normalizedType === 'pdf';
    const isWeb = normalizedType === 'web';
    const isTerminal = activeNode.type === 'terminal';
    const isMd = normalizedType === 'md';

    const languageMap: Record<string, string> = {
        'ts': 'typescript',
        'js': 'javascript',
        'json': 'json',
        'rs': 'rust',
        'py': 'python',
        'c': 'c',
        'cpp': 'cpp',
        'cs': 'csharp',
        'go': 'go',
        'rb': 'ruby',
        'java': 'java',
        'css': 'css',
        'html': 'html'
    };

    const language = languageMap[normalizedType] || 'markdown';

    // Phase 10: Derived Sidebar Nodes
    const incomingNodes = edges
        .filter(e => e.target === activeNoteId)
        .map(e => nodes.find(n => n.id === e.source))
        .filter((n): n is NonNullable<typeof n> => !!n)
        .sort((a, b) => a.y - b.y);

    const outgoingNodes = edges
        .filter(e => e.source === activeNoteId)
        .map(e => nodes.find(n => n.id === e.target))
        .filter((n): n is NonNullable<typeof n> => !!n)
        .sort((a, b) => a.y - b.y);

    /* 
        Internal Subcomponent for rendering Contextual Sidebar Tabs
        Renders outside the central Modal but inside the backdrop
    */
    const ContextSidebar = ({ direction, relatedNodes }: { direction: 'left' | 'right', relatedNodes: typeof nodes }) => {
        const [scrollY, setScrollY] = useState(0);

        // Reset scroll when active note changes
        useEffect(() => {
            setScrollY(0);
        }, [activeNoteId]);

        if (relatedNodes.length === 0) return null;

        const isLeft = direction === 'left';
        const positionClass = isLeft ? 'left-0' : 'right-0';
        const itemHoverTranslate = isLeft ? 'hover:translate-x-0' : 'hover:translate-x-0';
        const itemBaseTranslate = isLeft ? '-translate-x-[calc(100%-24px)]' : 'translate-x-[calc(100%-24px)]';
        const roundedClass = isLeft ? 'rounded-r-xl border-l-0' : 'rounded-l-xl border-r-0';

        // Ensure the padding side matches the direction so the invisible expander works
        const paddingClass = isLeft ? 'pr-6' : 'pl-6';

        const handleWheel = (e: React.WheelEvent) => {
            setScrollY(prev => {
                const newScroll = prev + e.deltaY;
                // Clamp scroll: roughly 0 to (list height - screen height), simplistic clamp for now
                // Allows up to 500px scroll for large lists, prevents going negative
                return Math.max(0, Math.min(newScroll, Math.max(0, relatedNodes.length * 80 - window.innerHeight + 100)));
            });
        };

        return (
            <div
                className={`absolute top-0 bottom-0 ${positionClass} w-[240px] pointer-events-none flex flex-col justify-center overflow-hidden z-[150]`}
                onWheel={handleWheel}
            >
                <div
                    className={`flex flex-col gap-2 pointer-events-auto transition-transform duration-100 ease-out ${paddingClass}`}
                    style={{ transform: `translateY(-${scrollY}px)` }}
                >
                    {relatedNodes.map(node => (
                        <div
                            key={node.id}
                            onClick={(e) => {
                                e.stopPropagation();
                                setActiveNoteId(node.id);
                            }}
                            className={`
                                group w-full h-[72px] cursor-pointer 
                                ${theme === 'dark' ? 'bg-[#1a1a1a] border-neutral-700 hover:bg-[#252525]' : 'bg-white border-neutral-200 hover:bg-neutral-50'}
                                border shadow-lg ${roundedClass} 
                                transition-all duration-300 ease-in-out
                                ${itemBaseTranslate} ${itemHoverTranslate}
                                flex flex-col justify-center px-4 relative
                            `}
                        >
                            {/* Hitbox extender to prevent hover jitter */}
                            <div className={`absolute top-0 bottom-0 w-[50px] bg-transparent ${isLeft ? '-right-[20px]' : '-left-[20px]'}`} />

                            <div className={`font-mono text-sm font-bold truncate ${theme === 'dark' ? 'text-neutral-200' : 'text-neutral-800'}`}>
                                {node.name || 'Unnamed Node'}
                            </div>
                            <div className={`text-xs truncate mt-1 ${theme === 'dark' ? 'text-neutral-500' : 'text-neutral-400'}`}>
                                {node.summary || 'No content...'}
                            </div>

                            {/* Decorative Edge Indicator */}
                            <div
                                className={`absolute top-1/2 -translate-y-1/2 w-1 h-8 rounded-full ${isLeft ? 'right-1' : 'left-1'} ${theme === 'dark' ? 'bg-neutral-800' : 'bg-neutral-200'} transition-all duration-300`}
                                style={{
                                    backgroundColor: node.color ? ({
                                        'red': '#ef4444', 'orange': '#f97316', 'emerald': '#10b981',
                                        'cyan': '#06b6d4', 'blue': '#3b82f6', 'purple': '#a855f7'
                                    } as Record<string, string>)[node.color] : undefined
                                }}
                            />
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-md animate-in fade-in duration-300">
            <ContextSidebar direction="left" relatedNodes={incomingNodes} />
            <ContextSidebar direction="right" relatedNodes={outgoingNodes} />

            <div className={`${theme === 'dark' ? 'bg-[#1a1a1a] shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-neutral-800' : 'bg-white shadow-2xl'} w-[calc(100vw-540px)] min-w-[400px] h-full max-h-[85vh] rounded-2xl flex flex-col animate-in zoom-in-95 duration-300 overflow-hidden z-[200] mx-auto`}>
                {/* Header */}
                <div className={`h-14 flex items-center justify-between px-6 select-none ${theme === 'dark' ? 'bg-[#1a1a1a] border-b border-neutral-800' : 'bg-white border-b border-neutral-100'}`}>
                    <div className={`font-medium flex items-baseline gap-2 text-lg ${theme === 'dark' ? 'text-neutral-200' : 'text-neutral-800'}`}>
                        {activeNode.name}
                        {!activeNode.filePath && isEditingType && !activeNode.isReadonly ? (
                            <input
                                ref={typeInputRef}
                                type="text"
                                value={typeValue}
                                onChange={e => setTypeValue(e.target.value.replace(/[^a-zA-Z0-9.]/g, ''))}
                                onKeyDown={e => {
                                    e.stopPropagation();
                                    if (e.key === 'Enter') {
                                        const v = typeValue.trim().replace(/^\./, '') || 'text';
                                        updateNode(activeNoteId, { type: v });
                                        setIsEditingType(false);
                                    }
                                    if (e.key === 'Escape') setIsEditingType(false);
                                }}
                                onBlur={() => {
                                    const v = typeValue.trim().replace(/^\./, '') || 'text';
                                    updateNode(activeNoteId, { type: v });
                                    setIsEditingType(false);
                                }}
                                className={`text-sm font-normal px-2 py-0.5 rounded-md outline-none border ${theme === 'dark' ? 'text-neutral-300 bg-neutral-900 border-blue-500' : 'text-neutral-600 bg-neutral-100 border-blue-500'}`}
                                style={{ width: `${Math.max(typeValue.length, 3) * 8 + 20}px` }}
                            />
                        ) : (
                            <span
                                className={`text-sm font-normal px-2 py-0.5 rounded-md ${!activeNode.filePath && !activeNode.isReadonly ? 'cursor-pointer hover:ring-1 hover:ring-blue-500' : ''} ${theme === 'dark' ? 'text-neutral-400 bg-neutral-900' : 'text-neutral-400 bg-neutral-100'}`}
                                onClick={(e) => {
                                    if (!activeNode.filePath && !activeNode.isReadonly) {
                                        e.stopPropagation();
                                        setTypeValue(activeNode.type);
                                        setIsEditingType(true);
                                        setTimeout(() => {
                                            typeInputRef.current?.focus();
                                            typeInputRef.current?.select();
                                        }, 0);
                                    }
                                }}
                                title={!activeNode.filePath && !activeNode.isReadonly ? 'Click to change type' : ''}
                            >
                                .{activeNode.type || 'txt'}
                            </span>
                        )}
                    </div>
                    <div className="flex gap-1">
                        {activeNode.filePath && (
                            <button
                                onClick={async () => {
                                    try {
                                        await invoke('open_in_vscode', { path: activeNode.filePath! });
                                    } catch (e) {
                                        console.warn("VS Code not found or shell error, falling back to default opener", e);
                                        const { openPath } = await import('@tauri-apps/plugin-opener');
                                        await openPath(activeNode.filePath!);
                                    }
                                }}
                                className={`p-1.5 transition-colors rounded-lg flex items-center ${theme === 'dark' ? 'hover:bg-neutral-800 text-neutral-400 hover:text-white' : 'hover:bg-neutral-100 text-neutral-500 hover:text-black'}`}
                                title="Open in IDE (VS Code)"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>
                            </button>
                        )}
                        <button
                            onClick={async (e) => {
                                e.stopPropagation();
                                handleSave(false);
                            }}
                            className={`p-1.5 transition-colors rounded-lg flex items-center ${theme === 'dark' ? 'hover:bg-neutral-800 text-neutral-400 hover:text-white' : 'hover:bg-neutral-100 text-neutral-500 hover:text-black'}`}
                            title="Save (Ctrl+Enter)"
                        >
                            <Save className="w-4 h-4" />
                        </button>

                        {isWeb && activeNode.filePath && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    import('@tauri-apps/plugin-opener').then(({ openUrl }) => openUrl(activeNode.filePath!));
                                }}
                                className={`px-2 py-1 ml-1 text-xs font-bold transition-colors rounded-lg flex items-center ${theme === 'dark' ? 'hover:bg-neutral-800 text-neutral-400 hover:text-white' : 'hover:bg-neutral-100 text-neutral-500 hover:text-black'}`}
                                title="Open in external browser"
                            >
                                Open 🔗
                            </button>
                        )}


                        <button
                            onClick={() => setActiveNoteId(null)}
                            className={`p-1.5 transition-colors rounded-lg ml-1 flex items-center ${theme === 'dark' ? 'hover:bg-neutral-800 text-neutral-400 hover:text-white' : 'hover:bg-neutral-100 text-neutral-400 hover:text-black'}`}
                            title="Close (Esc)"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Editor Body */}
                <div className={`flex-1 w-full overflow-auto relative ${theme === 'dark' ? 'bg-[#0f0f0f]' : 'bg-white'}`}>
                    {isLoading ? (
                        <div className={`absolute inset-0 flex items-center justify-center ${theme === 'dark' ? 'text-neutral-500' : 'text-neutral-400'}`}>
                            Loading content...
                        </div>
                    ) : isWeb && activeNode.filePath ? (
                        <div className="w-full h-full bg-white relative">
                            <NativeWebview id={activeNode.id} url={activeNode.filePath} />
                        </div>
                    ) : isImage && activeNode.filePath ? (
                        <div className="w-full h-full flex items-center justify-center p-4">
                            <img src={convertFileSrc(activeNode.filePath)} alt={activeNode.name} className="max-w-full max-h-full object-contain rounded-lg" />
                        </div>
                    ) : isVideo && activeNode.filePath ? (
                        <div className="w-full h-full flex items-center justify-center p-4 bg-black">
                            <video src={convertFileSrc(activeNode.filePath)} controls className="max-w-full max-h-full object-contain rounded-lg shadow-xl" />
                        </div>
                    ) : isPdf && activeNode.filePath ? (
                        <div className="w-full h-full flex bg-[#525659]">
                            <iframe src={convertFileSrc(activeNode.filePath)} title={activeNode.name} className="w-full h-full border-0 select-none" />
                        </div>
                    ) : isTerminal ? (
                        <Suspense fallback={<div className="w-full h-full bg-[#0a0a0a] flex items-center justify-center text-neutral-500 text-sm">Loading terminal...</div>}>
                            <div className="w-full h-full bg-[#0a0a0a]">
                                <LazyTerminalNode nodeId={activeNode.id} />
                            </div>
                        </Suspense>
                    ) : isCode ? (
                        <div className="min-h-full w-full p-4" onKeyDown={handleKeyDown}>
                            <Editor
                                value={content}
                                onValueChange={setContent}
                                highlight={code => Prism.highlight(code, Prism.languages[language] || Prism.languages.javascript, language)}
                                padding={16}
                                className={`font-mono text-sm min-h-full ${theme === 'dark' ? 'text-neutral-300' : 'text-neutral-800'}`}
                                style={{
                                    fontFamily: 'inherit',
                                    outline: 'none',
                                    backgroundColor: 'transparent'
                                }}
                            />
                        </div>
                    ) : isMd ? (
                        <div className="flex w-full h-full" onKeyDown={handleKeyDown}>
                            {/* Markdown edit pane */}
                            <textarea
                                ref={textareaRef}
                                value={content}
                                onChange={(e) => {
                                    if (!activeNode.isReadonly) setContent(e.target.value);
                                }}
                                readOnly={activeNode.isReadonly}
                                onKeyDown={handleKeyDown}
                                className={`w-1/2 min-h-full p-6 font-mono text-sm outline-none resize-none leading-relaxed bg-transparent border-r ${theme === 'dark' ? 'text-neutral-300 border-neutral-800' : 'text-neutral-800 border-neutral-200'}`}
                                placeholder="Write markdown here..."
                                spellCheck="false"
                            />
                            {/* Markdown preview pane */}
                            <div
                                className={`w-1/2 min-h-full p-6 overflow-auto md-preview ${theme === 'dark' ? 'text-neutral-300' : 'text-neutral-800'}`}
                                dangerouslySetInnerHTML={{ __html: marked.parse(content, { async: false }) as string }}
                            />
                        </div>
                    ) : (
                        <textarea
                            ref={textareaRef}
                            value={content}
                            onChange={(e) => {
                                if (!activeNode.isReadonly) setContent(e.target.value);
                            }}
                            readOnly={activeNode.isReadonly}
                            onKeyDown={handleKeyDown}
                            className={`w-full min-h-full p-8 pt-6 font-sans text-base outline-none resize-none leading-relaxed bg-transparent ${theme === 'dark' ? 'text-neutral-300' : 'text-neutral-800'}`}
                            placeholder="Capture your thoughts here..."
                            spellCheck="false"
                        />
                    )}
                </div>
            </div>
        </div>
    );
};
