import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { Node } from '../types';

export const exportNodes = async (nodesToExport: Node[], format: 'txt' | 'md' | 'pdf') => {
    try {
        let compiledContent = "";

        for (const node of nodesToExport) {
            let nodeContent = node.summary || "";

            // If it's a file, fetch actual content from Rust
            if (node.filePath) {
                const normalizedType = node.type.toLowerCase().replace(/^\./, '');
                const isMedia = /^(png|jpg|jpeg|gif|svg|webp|ico|mp4|webm|ogg)$/i.test(normalizedType);

                if (isMedia) {
                    if (format === 'md') {
                        compiledContent += `# ${node.name}\n\n![${node.name}](file://${node.filePath})\n\n---\n\n`;
                    } else if (format === 'pdf') {
                        compiledContent += `# ${node.name}\n\n![${node.name}](file://${node.filePath})\n\n`;
                    } else {
                        compiledContent += `# ${node.name}\n\n[Media File: ${node.filePath}]\n\n---\n\n`;
                    }
                    continue;
                } else if (normalizedType === 'web') {
                    if (format === 'pdf') {
                        compiledContent += `# ${node.name}\n\n[Web Link: ${node.filePath}]\n\n`;
                    } else {
                        compiledContent += `# ${node.name}\n\n[Web Link: ${node.filePath}]\n\n---\n\n`;
                    }
                    continue;
                } else {
                    try {
                        const fileContent: string = await invoke('load_file', { path: node.filePath });
                        nodeContent = fileContent;
                    } catch (e) {
                        console.error("Failed to read file during export", e);
                        nodeContent = `[Error reading file: ${node.filePath}]`;
                    }
                }
            }

            if (format === 'md') {
                compiledContent += `# ${node.name}\n\n${nodeContent}\n\n---\n\n`;
            } else if (format === 'pdf') {
                compiledContent += `# ${node.name}\n\n${nodeContent}\n\n`;
            } else {
                compiledContent += `=== ${node.name} ===\n\n${nodeContent}\n\n\n`;
            }
        }

        const extension = format === 'txt' ? 'txt' : (format === 'md' ? 'md' : 'pdf');

        const filePath = await save({
            filters: [{
                name: 'Export Format',
                extensions: [extension]
            }],
            defaultPath: `Steel_Export.${extension}`
        });

        if (!filePath) return; // User cancelled

        if (format === 'txt' || format === 'md') {
            await writeTextFile(filePath, compiledContent);
            console.log("Successfully exported to", filePath);
        } else if (format === 'pdf') {
            const container = document.createElement('div');

            // Sanitize user content to prevent XSS before inserting into DOM
            const escapeHtml = (str: string): string =>
                str.replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');

            // Escape first, then convert safe markdown patterns to HTML
            const safeContent = escapeHtml(compiledContent);
            const htmlContent = safeContent
                .replace(/^# (.*$)/gim, '<h1>$1</h1>')
                .replace(/^## (.*$)/gim, '<h2>$1</h2>')
                .replace(/\n\n/g, '<br/>')
                .replace(/!\[.*?\]\((.*?)\)/g, '<img src="$1" style="max-width:100%"/>')
                .replace(/---/g, '<hr/>');

            container.innerHTML = `
                <div style="font-family: sans-serif; padding: 40px; color: #000; background: #fff;">
                    ${htmlContent}
                </div>
            `;

            const opt = {
                margin: 0.5,
                filename: 'export.pdf',
                image: { type: 'jpeg' as const, quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true },
                jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' as const }
            };

            // Generate binary PDF
            // @ts-ignore - dynamic import for code splitting
            const html2pdf = (await import('html2pdf.js')).default;
            const pdfData = await html2pdf().set(opt).from(container).outputPdf('arraybuffer');

            // Save binary silently bypassing system print dialog
            await writeFile(filePath, new Uint8Array(pdfData));
            console.log("Successfully exported PDF to", filePath);
        }
    } catch (err: any) {
        console.error("Export failed:", err);
        alert(`Export failed. Details: ${err?.message || err}`);
    }
};
