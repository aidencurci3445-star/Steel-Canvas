import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import '@xterm/xterm/css/xterm.css';

interface TerminalNodeProps {
    nodeId: string;
}

export const TerminalNode: React.FC<TerminalNodeProps> = ({ nodeId }) => {
    const terminalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!terminalRef.current) return;

        const term = new Terminal({
            theme: {
                background: '#0a0a0a',
                foreground: '#ffffff',
                cursor: '#ffffff',
                selectionBackground: 'rgba(255, 255, 255, 0.3)',
            },
            fontFamily: 'Consolas, "Courier New", monospace',
            fontSize: 14,
            cursorBlink: true,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(terminalRef.current);
        fitAddon.fit();

        let unlistenOutput: Promise<UnlistenFn>;

        // Start PTY in backend
        invoke('spawn_pty', { nodeId }).then(() => {
            // Once spawned, we might want to fit immediately
            invoke('resize_pty', { nodeId, rows: term.rows, cols: term.cols }).catch(e => console.warn(e));
        }).catch(err => {
            term.write(`\r\n\x1b[31mFailed to start PTY: ${err}\x1b[0m\r\n`);
        });

        // Listen for output from Rust
        unlistenOutput = listen<string>(`pty_output_${nodeId}`, (event) => {
            term.write(event.payload);
        });

        // Send input to Rust
        const onDataDisposable = term.onData((data) => {
            invoke('write_pty', { nodeId, data }).catch(console.error);
        });

        const handleResize = () => {
            try {
                fitAddon.fit();
                invoke('resize_pty', { nodeId, rows: term.rows, cols: term.cols }).catch(console.error);
            } catch (e) { }
        };

        const resizeObserver = new ResizeObserver(handleResize);
        resizeObserver.observe(terminalRef.current);

        return () => {
            resizeObserver.disconnect();
            onDataDisposable.dispose();
            term.dispose();
            if (unlistenOutput) unlistenOutput.then(f => f());
        };
    }, [nodeId]);

    return (
        <div className="w-full h-full p-2 bg-[#0a0a0a] rounded flex flex-col">
            <div ref={terminalRef} className="flex-1 w-full h-full overflow-hidden" />
        </div>
    );
};
