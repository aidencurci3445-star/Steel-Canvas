import React, { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface NativeWebviewProps {
    id: string;
    url: string;
}

export const NativeWebview: React.FC<NativeWebviewProps> = ({ id, url }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [label] = useState(`web-${id}`);
    const isCreated = useRef(false);

    useEffect(() => {
        let animationFrameId: number;
        let lastRect = { x: 0, y: 0, w: 0, h: 0 };

        const syncPosition = () => {
            if (!containerRef.current || !isCreated.current) return;
            const rect = containerRef.current.getBoundingClientRect();

            // Only update if changed significantly (avoid micro-jitters)
            if (Math.abs(rect.x - lastRect.x) > 0.5 ||
                Math.abs(rect.y - lastRect.y) > 0.5 ||
                Math.abs(rect.width - lastRect.w) > 0.5 ||
                Math.abs(rect.height - lastRect.h) > 0.5) {

                lastRect = { x: rect.x, y: rect.y, w: rect.width, h: rect.height };

                // If it's effectively hidden/collapsed, move it offscreen
                if (rect.width <= 10 || rect.height <= 10) {
                    invoke('resize_webview', { label, x: -10000, y: -10000, width: 0, height: 0 }).catch(console.error);
                } else {
                    invoke('resize_webview', {
                        label,
                        x: rect.x,
                        y: rect.y,
                        width: rect.width,
                        height: rect.height
                    }).catch(console.error);
                }
            }
            animationFrameId = requestAnimationFrame(syncPosition);
        };

        const init = async () => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            lastRect = { x: rect.x, y: rect.y, w: rect.width, h: rect.height };

            try {
                await invoke('create_webview', {
                    label,
                    url,
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height
                });
                isCreated.current = true;
                syncPosition();
            } catch (err) {
                console.error("Failed to create webview:", err);
            }
        };

        init();

        return () => {
            cancelAnimationFrame(animationFrameId);
            isCreated.current = false;
            invoke('destroy_webview', { label }).catch(console.error);
        };
    }, []); // Emtpy dependency array: create once on mount

    useEffect(() => {
        if (isCreated.current) {
            invoke('navigate_webview', { label, url }).catch(console.error);
        }
    }, [url, label]);

    return (
        <div ref={containerRef} className="w-full h-full bg-white relative">
            <div className="absolute inset-0 flex items-center justify-center text-neutral-400 text-sm pointer-events-none">
                {/* Fallback space when native webview is hidden or loading */}
                Loading native webview...
            </div>
        </div>
    );
};
