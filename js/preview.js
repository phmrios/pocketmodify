// Renderiza as folhas geradas com pdf.js para a pré-visualização.

const SheetPreview = (() => {
    const MAX_PIXEL_RATIO = 2; // Acima disso o canvas fica pesado sem ganho visível

    /**
     * @param {Uint8Array} pdfBytes
     * @param {number} targetWidth largura disponível em pixels CSS
     * @returns {Promise<HTMLCanvasElement[]>} um canvas por folha
     */
    async function renderSheets(pdfBytes, targetWidth) {
        // O pdf.js transfere o buffer para o worker, por isso recebe uma cópia
        const doc = await pdfjsLib.getDocument({ data: pdfBytes.slice() }).promise;
        const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
        const canvases = [];

        try {
            for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
                const page = await doc.getPage(pageNumber);
                const baseViewport = page.getViewport({ scale: 1 });
                const viewport = page.getViewport({ scale: (targetWidth / baseViewport.width) * pixelRatio });

                const canvas = document.createElement('canvas');
                canvas.width = Math.ceil(viewport.width);
                canvas.height = Math.ceil(viewport.height);
                canvas.className = 'sheet-canvas';
                canvas.setAttribute('role', 'img');
                canvas.setAttribute('aria-label', `Pré-visualização da folha ${pageNumber}`);

                await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
                canvases.push(canvas);
            }
        } finally {
            doc.destroy();
        }

        return canvases;
    }

    return { renderSheets };
})();
