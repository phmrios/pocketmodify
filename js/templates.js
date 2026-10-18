// Modelos prontos de 8 páginas. Cada modelo gera um PDF do tamanho exato de uma célula
// do PocketMod, que depois entra no editor como se fosse um arquivo enviado.

const Templates = (() => {
    const { PDFDocument, StandardFonts, rgb } = PDFLib;

    const MM_TO_PT = 72 / 25.4;
    const PAGE_WIDTH = PocketMod.CELL_WIDTH;
    const PAGE_HEIGHT = PocketMod.CELL_HEIGHT;
    const PADDING = 9 * MM_TO_PT;

    const TEXT_COLOR = rgb(0.13, 0.14, 0.18);
    const MUTED_COLOR = rgb(0.45, 0.47, 0.52);
    const LINE_COLOR = rgb(0.75, 0.77, 0.81);
    const LINE_THICKNESS = 0.5;
    const LINE_SPACING = 7 * MM_TO_PT;
    const CHECKBOX_SIZE = 3 * MM_TO_PT;

    const COVER_TITLE_SIZE = 22;
    const PAGE_TITLE_SIZE = 14;
    const SMALL_TEXT_SIZE = 8;

    function drawRuledLines(page, topY, { withCheckboxes = false } = {}) {
        const lineStartX = withCheckboxes ? PADDING + CHECKBOX_SIZE + 2 * MM_TO_PT : PADDING;

        for (let y = topY; y > PADDING; y -= LINE_SPACING) {
            page.drawLine({
                start: { x: lineStartX, y },
                end: { x: PAGE_WIDTH - PADDING, y },
                thickness: LINE_THICKNESS,
                color: LINE_COLOR,
            });
            if (withCheckboxes) {
                page.drawRectangle({
                    x: PADDING,
                    y: y + 1,
                    width: CHECKBOX_SIZE,
                    height: CHECKBOX_SIZE,
                    borderColor: MUTED_COLOR,
                    borderWidth: LINE_THICKNESS,
                });
            }
        }
    }

    function drawCover(doc, fonts, title, subtitle) {
        const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        const titleWidth = fonts.bold.widthOfTextAtSize(title, COVER_TITLE_SIZE);

        page.drawText(title, {
            x: (PAGE_WIDTH - titleWidth) / 2,
            y: PAGE_HEIGHT * 0.6,
            size: COVER_TITLE_SIZE,
            font: fonts.bold,
            color: TEXT_COLOR,
        });

        if (subtitle) {
            page.drawText(subtitle, {
                x: PADDING,
                y: PAGE_HEIGHT * 0.35,
                size: SMALL_TEXT_SIZE + 2,
                font: fonts.regular,
                color: MUTED_COLOR,
            });
            page.drawLine({
                start: { x: PADDING + fonts.regular.widthOfTextAtSize(subtitle, SMALL_TEXT_SIZE + 2) + 4, y: PAGE_HEIGHT * 0.35 },
                end: { x: PAGE_WIDTH - PADDING, y: PAGE_HEIGHT * 0.35 },
                thickness: LINE_THICKNESS,
                color: LINE_COLOR,
            });
        }
    }

    function drawTitledPage(doc, fonts, title, ruledOptions) {
        const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        const titleY = PAGE_HEIGHT - PADDING - PAGE_TITLE_SIZE;

        if (title) {
            page.drawText(title, {
                x: PADDING,
                y: titleY,
                size: PAGE_TITLE_SIZE,
                font: fonts.bold,
                color: TEXT_COLOR,
            });
        }

        const firstLineY = title ? titleY - LINE_SPACING : PAGE_HEIGHT - PADDING;
        drawRuledLines(page, firstLineY, ruledOptions);
    }

    const DEFINITIONS = {
        agenda: {
            label: 'Agenda semanal',
            cover: ['Minha semana', 'Semana de'],
            pages: ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'],
            ruledOptions: {},
        },
        compras: {
            label: 'Lista de compras',
            cover: ['Compras', 'Data'],
            pages: ['Hortifrúti', 'Padaria', 'Açougue e frios', 'Laticínios', 'Mercearia', 'Limpeza', 'Higiene'],
            ruledOptions: { withCheckboxes: true },
        },
        caderno: {
            label: 'Caderno pautado',
            cover: ['Caderno', 'Nome'],
            pages: ['', '', '', '', '', '', ''],
            ruledOptions: {},
        },
    };

    /**
     * @param {keyof typeof DEFINITIONS} templateId
     * @returns {Promise<{ name: string, bytes: Uint8Array }>}
     */
    async function buildTemplate(templateId) {
        const definition = DEFINITIONS[templateId];
        if (!definition) throw new Error(`Modelo desconhecido: ${templateId}`);

        const doc = await PDFDocument.create();
        const fonts = {
            regular: await doc.embedFont(StandardFonts.Helvetica),
            bold: await doc.embedFont(StandardFonts.HelveticaBold),
        };

        drawCover(doc, fonts, ...definition.cover);
        for (const title of definition.pages) {
            drawTitledPage(doc, fonts, title, definition.ruledOptions);
        }

        return { name: definition.label, bytes: await doc.save() };
    }

    return { buildTemplate };
})();
