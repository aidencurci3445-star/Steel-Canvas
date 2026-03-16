import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../../store/useStore';
import { dispatchCommand } from '../../lib/commandDispatcher';
import { Terminal } from 'lucide-react';

const AVAILABLE_COMMANDS = [
    { name: '/node', description: 'Create a new node', args: '[name] [x] [y]' },
    { name: '/link', description: 'Link two nodes', args: '[source_id] [target_id]' },
    { name: '/delete', description: 'Delete a node or edge', args: '[id]' },
    { name: '/clear', description: 'Clear the entire graph', args: '' },
    { name: '/edit', description: 'Edit node name', args: '[id] [new_name...]' },
    { name: '/folder', description: 'Create a folder', args: '[name] [x] [y] [w] [h]' },
    { name: '/save', description: 'Save the workspace to disk', args: '' },
    { name: '/load', description: 'Load a workspace from disk', args: '' },
    { name: '/new', description: 'Reset to a blank unsaved canvas', args: '' },
    { name: '/term', description: 'Create a fully native terminal node', args: '[name] [x] [y]' },
    { name: '/weld', description: 'Connect directly to a P2P Multiplayer Swarm', args: '[start|cut|join|test] [id?]' },
    { name: '/anim', description: 'Toggle edge animations globally', args: '[on|off]' },
    { name: '/autosave', description: 'Set autosave interval (0 = off)', args: '[seconds]' },
    { name: '/config', description: 'Configure system settings (eg: weld url)', args: '[module] [value]' },
    { name: '/register', description: 'Save your Official License Key', args: '[jwt_token]' },
    { name: '/update', description: 'Check for Official OTA Updates', args: '' },
    { name: '/autoupdate', description: 'Toggle automatic update checks on startup', args: '[on|off]' },
    { name: '/help', description: 'Show all available commands', args: '' },
];

export const CliBar = () => {
    const {
        currentInput,
        setCurrentInput,
        history,
        historyIndex,
        setHistoryIndex,
        cliError
    } = useStore();

    const inputRef = useRef<HTMLInputElement>(null);
    const [suggestions, setSuggestions] = useState<typeof AVAILABLE_COMMANDS>([]);
    const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);

    const [showHelp, setShowHelp] = useState(false);

    // Focus input on mount and global '/' keypress
    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            const isTyping = ['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable;
            if (e.key === '/' && !isTyping) {
                e.preventDefault();
                inputRef.current?.focus();
                setCurrentInput('/');
                setShowHelp(false);
            }
        };

        document.addEventListener('keydown', handleGlobalKeyDown);
        return () => document.removeEventListener('keydown', handleGlobalKeyDown);
    }, [setCurrentInput]);

    // Update suggestions based on input
    useEffect(() => {
        if (currentInput.startsWith('/')) {
            const searchPart = currentInput.split(' ')[0].toLowerCase();
            const filtered = AVAILABLE_COMMANDS.filter(cmd =>
                cmd.name.startsWith(searchPart)
            );
            setSuggestions(filtered);
            setSelectedSuggestionIndex(0); // Reset selection
        } else {
            setSuggestions([]);
        }
        if (showHelp) setShowHelp(false); // Hide help if typing
    }, [currentInput]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Escape') {
            if (showHelp) {
                setShowHelp(false);
                e.preventDefault();
            }
            return;
        }

        // Autocomplete Navigation & Selection
        if (suggestions.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedSuggestionIndex((prev) =>
                    prev < suggestions.length - 1 ? prev + 1 : prev
                );
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedSuggestionIndex((prev) => prev > 0 ? prev - 1 : 0);
                return;
            }
            if (e.key === 'Tab') {
                e.preventDefault();
                setCurrentInput(suggestions[selectedSuggestionIndex].name + ' ');
                setSuggestions([]);
                return;
            }
        }

        // History Navigation
        if (e.key === 'ArrowUp' && suggestions.length === 0) {
            e.preventDefault();
            if (history.length > 0) {
                const nextIndex = historyIndex + 1;
                if (nextIndex < history.length) {
                    setHistoryIndex(nextIndex);
                    setCurrentInput(history[nextIndex]);
                }
            }
            return;
        }

        if (e.key === 'ArrowDown' && suggestions.length === 0) {
            e.preventDefault();
            if (historyIndex >= 0) {
                const nextIndex = historyIndex - 1;
                setHistoryIndex(nextIndex);
                if (nextIndex >= 0) {
                    setCurrentInput(history[nextIndex]);
                } else {
                    setCurrentInput('');
                }
            }
            return;
        }

        // Execution
        if (e.key === 'Enter') {
            e.preventDefault();
            if (currentInput.trim()) {
                if (currentInput.trim().toLowerCase() === '/help') {
                    const helpText = `# Command Reference\n\n` + AVAILABLE_COMMANDS.map(c => `**${c.name}**\n${c.description}\n\`Usage: ${c.name} ${c.args}\``).join('\n\n---\n\n');
                    const { transform, addNode } = useStore.getState();
                    const px = transform ? (transform.x * -1 + window.innerWidth / 2) / transform.scale : 0;
                    const py = transform ? (transform.y * -1 + window.innerHeight / 2) / transform.scale : 0;

                    addNode({
                        id: String(Date.now()),
                        name: 'Commands Guide',
                        type: 'md',
                        summary: helpText,
                        x: px,
                        y: py,
                        isReadonly: true,
                        color: 'blue'
                    });

                    setCurrentInput('');
                    setSuggestions([]);
                    setShowHelp(false);
                    return;
                }

                dispatchCommand(currentInput);
                setSuggestions([]);
            }
        }
    };

    return (
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] max-w-[90vw] z-50 flex flex-col-reverse gap-2 translate-y-[40px] hover:-translate-y-8 focus-within:-translate-y-8 transition-transform duration-300 group cursor-pointer lg:cursor-default">
            {/* Hitbox extender to prevent jitter when cursor is near the edge */}
            <div className="absolute top-full left-0 w-full h-12 bg-transparent" />
            {/* Main Bar */}
            <div className="h-14 bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] group-focus-within:shadow-[6px_6px_0px_0px_rgba(0,0,0,0.2)] transition-shadow flex items-center px-4 w-full">
                <Terminal className="w-5 h-5 text-black mr-3 flex-shrink-0" />
                <input
                    ref={inputRef}
                    type="text"
                    value={currentInput}
                    onChange={(e) => setCurrentInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type '/' to start a command..."
                    className="flex-grow bg-transparent text-black outline-none placeholder-neutral-400 text-base sm:text-lg font-mono w-full"
                    autoComplete="off"
                    spellCheck="false"
                />
            </div>

            {/* Error Message Toast inside Bar */}
            {cliError && (
                <div className="bg-red-50 border-2 border-red-500 text-red-700 px-4 py-3 text-sm shadow-[4px_4px_0px_0px_rgba(239,68,68,0.2)] font-bold">
                    {cliError}
                </div>
            )}

            {/* Autocomplete Suggestions Menu */}
            {suggestions.length > 0 && !showHelp && (
                <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] overflow-hidden flex flex-col">
                    {suggestions.map((cmd, idx) => (
                        <div
                            key={cmd.name}
                            className={`px-4 py-3 cursor-pointer flex justify-between items-center transition-colors border-b border-neutral-100 last:border-b-0 ${idx === selectedSuggestionIndex ? 'bg-neutral-100' : 'hover:bg-neutral-50'
                                }`}
                            onClick={() => {
                                setCurrentInput(cmd.name + ' ');
                                setSuggestions([]);
                                inputRef.current?.focus();
                            }}
                        >
                            <div className="flex gap-2 items-baseline">
                                <span className="text-black font-bold">{cmd.name}</span>
                                <span className="text-neutral-500 text-sm">{cmd.args}</span>
                            </div>
                            <span className="text-neutral-500 text-xs text-right ml-4 hidden sm:block">
                                {cmd.description}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* Help Menu */}
            {showHelp && (
                <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] overflow-hidden flex flex-col p-4 animate-in fade-in slide-in-from-bottom-2">
                    <div className="text-black font-bold mb-4 flex justify-between items-center border-b pb-2">
                        <span>Steel CLI Commands</span>
                        <button onClick={() => setShowHelp(false)} className="text-xs text-neutral-400 hover:text-black hover:underline uppercase tracking-wider">Close (Esc)</button>
                    </div>
                    <div className="flex flex-col gap-2 max-h-[40vh] overflow-y-auto">
                        {AVAILABLE_COMMANDS.map(cmd => (
                            <div key={cmd.name} className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
                                <span className="font-mono font-bold text-black min-w-[70px]">{cmd.name}</span>
                                <span className="font-mono text-sm text-blue-600 min-w-[120px]">{cmd.args}</span>
                                <span className="text-neutral-600 text-sm">{cmd.description}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
