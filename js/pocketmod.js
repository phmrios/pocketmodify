// Montagem das folhas PocketMod com pdf-lib, sem dependência do DOM.
// Recebe uma lista de páginas já carregadas (ver sources.js) e devolve o PDF final.

const PocketMod = (() => {
    const { PDFDocument, degrees, rgb } = PDFLib;

    const MM_TO_PT = 72 / 25.4;

    // Dimensões do A4 em pontos (1/72 pol.)
    const A4_WIDTH_PORTRAIT = 595.28;
    const A4_HEIGHT_PORTRAIT = 841.89;

    const SHEET_WIDTH = A4_HEIGHT_PORTRAIT; // Folha final em paisagem
    const SHEET_HEIGHT = A4_WIDTH_PORTRAIT;
    const CELL_WIDTH = SHEET_WIDTH / 4;
    const CELL_HEIGHT = SHEET_HEIGHT / 2;
    const PAGES_PER_SHEET = 8;

    // A maioria das impressoras não imprime os ~4 mm da borda; a margem também
    // evita que o conteúdo caia em cima dos vincos.
    const CELL_MARGIN = 5 * MM_TO_PT;

    const CUT_LINE_COLOR = rgb(0.6, 0.6, 0.6);
    const CUT_LINE_THICKNESS = 0.5;
    const CUT_LINE_DASH = [4, 3];

    const PATTERN_COLOR = rgb(0.78, 0.8, 0.84);
    const PATTERN_LINE_THICKNESS = 0.4;
    const LINED_SPACING = 7 * MM_TO_PT;
    const GRID_SPACING = 5 * MM_TO_PT;
    const DOT_SPACING = 5 * MM_TO_PT;
    const DOT_RADIUS = 0.6;

    const FILLERS = ['blank', 'lined', 'grid', 'dots'];
    const BINDINGS = ['left', 'right'];

    /**
     * Layout padrão do PocketMod (folha em paisagem, impressão para fora):
     * Linha de cima (de cabeça para baixo): páginas 2, 3, 4, 5
     * Linha de baixo (em pé):               páginas 1 (capa), 8 (contracapa), 7, 6
     * Com a dobra descrita no guia, isso gera um caderno com lombada à esquerda.
     * Espelhar as colunas gera o mesmo caderno com lombada à direita.
     */
    const LAYOUT = [
        { pageIndex: 1, column: 0, row: 1, rotate: 180 },
        { pageIndex: 2, column: 1, row: 1, rotate: 180 },
        { pageIndex: 3, column: 2, row: 1, rotate: 180 },
        { pageIndex: 4, column: 3, row: 1, rotate: 180 },
        { pageIndex: 0, column: 0, row: 0, rotate: 0 },
        { pageIndex: 7, column: 1, row: 0, rotate: 0 },
        { pageIndex: 6, column: 2, row: 0, rotate: 0 },
        { pageIndex: 5, column: 3, row: 0, rotate: 0 },
    ];

    // Páginas em paisagem giram 90° anti-horário: para ler, gira-se o caderno no sentido horário
    const LANDSCAPE_ROTATION = 90;

    function normalizeAngle(angle) {
        return ((angle % 360) + 360) % 360;
    }

    function layoutFor(binding) {
        if (binding === 'right') {
            return LAYOUT.map(slot => ({ ...slot, column: 3 - slot.column }));
        }
        return LAYOUT;
    }

    // Área útil da célula (já descontada a margem)
    function contentBox(slot) {
        return {
            x: slot.column * CELL_WIDTH + CELL_MARGIN,
            y: slot.row * CELL_HEIGHT + CELL_MARGIN,
            width: CELL_WIDTH - 2 * CELL_MARGIN,
            height: CELL_HEIGHT - 2 * CELL_MARGIN,
        };
    }

    // Ponto de ancoragem para que o conteúdo girado ocupe a caixa que começa em (boxX, boxY).
    // O pdf-lib gira o conteúdo em torno do ponto (x, y) informado.
    function anchorForRotation(angle, boxX, boxY, width, height) {
        switch (angle) {
            case 90: return { x: boxX + height, y: boxY };
            case 180: return { x: boxX + width, y: boxY + height };
            case 270: return { x: boxX, y: boxY + width };
            default: return { x: boxX, y: boxY };
        }
    }

    /**
     * Desenha um conteúdo (página embutida ou imagem) centralizado na célula.
     * @param {number} sourceRotation rotação com que o conteúdo é exibido, em graus no sentido horário (/Rotate do PDF)
     */
    function drawFitted(sheet, drawable, sourceRotation, slot, drawFn) {
        const { width, height } = drawable.size();
        const displaySideways = normalizeAngle(sourceRotation) % 180 !== 0;
        const isLandscape = displaySideways ? height > width : width > height;

        // /Rotate é horário; o rotate do pdf-lib é anti-horário
        const extraRotation = isLandscape ? LANDSCAPE_ROTATION : 0;
        const drawAngle = normalizeAngle(slot.rotate - sourceRotation + extraRotation);
        const isSideways = drawAngle % 180 !== 0;

        const visibleWidth = isSideways ? height : width;
        const visibleHeight = isSideways ? width : height;

        const box = contentBox(slot);
        const scale = Math.min(box.width / visibleWidth, box.height / visibleHeight);
        const boxX = box.x + (box.width - visibleWidth * scale) / 2;
        const boxY = box.y + (box.height - visibleHeight * scale) / 2;
        const anchor = anchorForRotation(drawAngle, boxX, boxY, width * scale, height * scale);

        drawFn.call(sheet, drawable, {
            x: anchor.x,
            y: anchor.y,
            width: width * scale,
            height: height * scale,
            xScale: scale,
            yScale: scale,
            rotate: degrees(drawAngle),
        });
    }

    function drawLinedPattern(sheet, box) {
        for (let y = box.y + LINED_SPACING; y < box.y + box.height; y += LINED_SPACING) {
            sheet.drawLine({
                start: { x: box.x, y },
                end: { x: box.x + box.width, y },
                thickness: PATTERN_LINE_THICKNESS,
                color: PATTERN_COLOR,
            });
        }
    }

    function drawGridPattern(sheet, box) {
        for (let y = box.y; y <= box.y + box.height; y += GRID_SPACING) {
            sheet.drawLine({
                start: { x: box.x, y },
                end: { x: box.x + box.width, y },
                thickness: PATTERN_LINE_THICKNESS,
                color: PATTERN_COLOR,
            });
        }
        for (let x = box.x; x <= box.x + box.width; x += GRID_SPACING) {
            sheet.drawLine({
                start: { x, y: box.y },
                end: { x, y: box.y + box.height },
                thickness: PATTERN_LINE_THICKNESS,
                color: PATTERN_COLOR,
            });
        }
    }

    function drawDotsPattern(sheet, box) {
        for (let y = box.y + DOT_SPACING / 2; y < box.y + box.height; y += DOT_SPACING) {
            for (let x = box.x + DOT_SPACING / 2; x < box.x + box.width; x += DOT_SPACING) {
                sheet.drawCircle({ x, y, size: DOT_RADIUS, color: PATTERN_COLOR });
            }
        }
    }

    // Os padrões são simétricos, então funcionam também nas células de cabeça para baixo
    function drawFiller(sheet, filler, slot) {
        const box = contentBox(slot);
        if (filler === 'lined') drawLinedPattern(sheet, box);
        else if (filler === 'grid') drawGridPattern(sheet, box);
        else if (filler === 'dots') drawDotsPattern(sheet, box);
    }

    // Linha tracejada do corte: no vinco horizontal, só nas duas colunas do meio.
    function drawCutLine(sheet) {
        sheet.drawLine({
            start: { x: CELL_WIDTH, y: CELL_HEIGHT },
            end: { x: CELL_WIDTH * 3, y: CELL_HEIGHT },
            thickness: CUT_LINE_THICKNESS,
            color: CUT_LINE_COLOR,
            dashArray: CUT_LINE_DASH,
        });
    }

    async function drawPage(outDoc, sheet, page, slot, filler) {
        if (page.kind === 'pdf') {
            const { x, y, width, height } = page.pdfPage.getCropBox();
            const embedded = await outDoc.embedPage(page.pdfPage, {
                left: x, bottom: y, right: x + width, top: y + height,
            });
            const rotation = normalizeAngle(page.pdfPage.getRotation().angle);
            drawFitted(sheet, embedded, rotation, slot, sheet.drawPage);
        } else if (page.kind === 'image') {
            const image = await outDoc.embedJpg(page.jpegBytes);
            drawFitted(sheet, image, 0, slot, sheet.drawImage);
        } else {
            drawFiller(sheet, filler, slot);
        }
    }

    function sheetCountFor(pageCount) {
        return Math.max(1, Math.ceil(pageCount / PAGES_PER_SHEET));
    }

    /**
     * Gera o PDF com uma folha A4 por grupo de 8 páginas.
     * @param {Array<{kind: 'pdf', pdfPage: object} | {kind: 'image', jpegBytes: Uint8Array} | {kind: 'blank'}>} pages
     * @param {{ filler?: 'blank'|'lined'|'grid'|'dots', binding?: 'left'|'right' }} [options]
     *   filler: padrão das páginas em branco e das que faltam para completar a última folha
     * @returns {Promise<Uint8Array>}
     */
    async function generatePocketModPdf(pages, { filler = 'blank', binding = 'left' } = {}) {
        if (!FILLERS.includes(filler)) throw new Error(`Preenchimento desconhecido: ${filler}`);
        if (!BINDINGS.includes(binding)) throw new Error(`Lombada desconhecida: ${binding}`);

        const outDoc = await PDFDocument.create();
        const layout = layoutFor(binding);
        const sheetCount = sheetCountFor(pages.length);

        for (let sheetIndex = 0; sheetIndex < sheetCount; sheetIndex++) {
            const sheet = outDoc.addPage([SHEET_WIDTH, SHEET_HEIGHT]);
            const firstPage = sheetIndex * PAGES_PER_SHEET;

            for (const slot of layout) {
                const page = pages[firstPage + slot.pageIndex] ?? { kind: 'blank' };
                await drawPage(outDoc, sheet, page, slot, filler);
            }

            drawCutLine(sheet);
        }

        return outDoc.save();
    }

    return {
        generatePocketModPdf,
        sheetCountFor,
        PAGES_PER_SHEET,
        CELL_WIDTH,
        CELL_HEIGHT,
    };
})();
