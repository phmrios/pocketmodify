// Interface: upload, editor de páginas, opções, pré-visualização e download.

const PREVIEW_DEBOUNCE_MS = 300;
const DEFAULT_DOWNLOAD_NAME = 'PocketMod';
const FALLBACK_PREVIEW_WIDTH = 800; // Caso a seção ainda não tenha largura medida

document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const errorMessage = document.getElementById('error-message');
    const statusText = document.getElementById('status-text');
    const editorSection = document.getElementById('editor');
    const pageSummary = document.getElementById('page-summary');
    const pageGrid = document.getElementById('page-grid');
    const resultSection = document.getElementById('result');
    const preview = document.getElementById('preview');
    const downloadBtn = document.getElementById('download-btn');

    const state = {
        pages: [],
        baseName: null,
        pdfBytes: null,
        previewToken: 0,
        draggedPageId: null,
    };

    let previewTimer = null;

    registerServiceWorker();

    // --- Upload ---
    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInput.click();
        }
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
        });
    });

    dropZone.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));

    fileInput.addEventListener('change', () => {
        addFiles(fileInput.files);
        fileInput.value = '';
    });

    document.querySelectorAll('[data-template]').forEach(button => {
        button.addEventListener('click', () => addTemplate(button.dataset.template));
    });

    async function addFiles(fileList) {
        const files = Array.from(fileList);
        if (files.length === 0) return;

        hideError();
        const errors = [];

        for (const file of files) {
            setStatus(`Carregando ${file.name}...`);
            try {
                appendPages(await PageSources.loadFile(file), file.name);
            } catch (error) {
                errors.push(describeError(error, file.name));
            }
        }

        setStatus('');
        if (errors.length > 0) showError(errors.join('\n'));
    }

    async function addTemplate(templateId) {
        hideError();
        setStatus('Montando modelo...');
        try {
            const { name, bytes } = await Templates.buildTemplate(templateId);
            appendPages(await PageSources.loadPdfBytes(bytes, name), name);
        } catch (error) {
            showError(describeError(error, templateId));
        }
        setStatus('');
    }

    function appendPages(newPages, sourceName) {
        state.baseName ??= sourceName.replace(/\.[^.]+$/, '').trim() || DEFAULT_DOWNLOAD_NAME;
        state.pages.push(...newPages);
        onPagesChanged();
    }

    function describeError(error, sourceName) {
        if (error instanceof PageSources.SourceError) return error.message;
        console.error('Falha ao carregar', { sourceName, error });
        return `Erro inesperado ao carregar "${sourceName}".`;
    }

    // --- Editor ---
    document.getElementById('add-files-btn').addEventListener('click', () => fileInput.click());

    document.getElementById('add-blank-btn').addEventListener('click', () => {
        state.pages.push(PageSources.createBlankPage());
        onPagesChanged();
    });

    document.getElementById('clear-btn').addEventListener('click', () => {
        state.pages = [];
        state.baseName = null;
        hideError();
        onPagesChanged();
        dropZone.focus();
    });

    document.querySelectorAll('input[name="filler"], input[name="binding"]').forEach(input => {
        input.addEventListener('change', onOptionsChanged);
    });

    function selectedOption(name) {
        return document.querySelector(`input[name="${name}"]:checked`).value;
    }

    function onPagesChanged() {
        renderPageGrid();
        schedulePreview();
    }

    function onOptionsChanged() {
        renderPageGrid(); // As miniaturas de páginas em branco mostram o padrão escolhido
        schedulePreview();
    }

    function movePage(fromIndex, toIndex) {
        if (toIndex < 0 || toIndex >= state.pages.length || fromIndex === toIndex) return;
        const [page] = state.pages.splice(fromIndex, 1);
        state.pages.splice(toIndex, 0, page);
        onPagesChanged();
    }

    function removePage(index) {
        state.pages.splice(index, 1);
        if (state.pages.length === 0) state.baseName = null;
        onPagesChanged();
    }

    function positionLabel(index) {
        const positionInSheet = index % PocketMod.PAGES_PER_SHEET;
        const sheetNumber = Math.floor(index / PocketMod.PAGES_PER_SHEET) + 1;
        const pageName = positionInSheet === 0 ? 'Capa'
            : positionInSheet === PocketMod.PAGES_PER_SHEET - 1 ? 'Contracapa'
            : `Pág. ${positionInSheet + 1}`;
        const isMultiSheet = state.pages.length > PocketMod.PAGES_PER_SHEET;
        return isMultiSheet ? `Folha ${sheetNumber} · ${pageName}` : pageName;
    }

    function describePageSummary() {
        const pageCount = state.pages.length;
        const sheetCount = PocketMod.sheetCountFor(pageCount);
        const missing = sheetCount * PocketMod.PAGES_PER_SHEET - pageCount;
        const pagesText = pageCount === 1 ? '1 página' : `${pageCount} páginas`;
        const sheetsText = sheetCount === 1 ? '1 folha' : `${sheetCount} folhas`;
        const missingText = missing > 0 ? ` (${missing} em branco para completar)` : '';
        return `${pagesText} → ${sheetsText}${missingText}`;
    }

    function createIconButton(text, ariaLabel, onClick, disabled = false) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'icon-btn';
        button.textContent = text;
        button.setAttribute('aria-label', ariaLabel);
        button.disabled = disabled;
        button.addEventListener('click', onClick);
        return button;
    }

    function createThumbnail(page) {
        const thumb = document.createElement('div');
        thumb.className = 'thumb';

        if (page.kind === 'blank') {
            thumb.classList.add('blank', `filler-${selectedOption('filler')}`);
            return thumb;
        }

        const img = document.createElement('img');
        img.alt = '';
        thumb.appendChild(img);
        page.getThumbnailUrl()
            .then(url => { img.src = url; })
            .catch(error => console.error('Falha ao gerar miniatura', { label: page.label, error }));
        return thumb;
    }

    function createPageCard(page, index) {
        const card = document.createElement('li');
        card.className = 'page-card';
        card.draggable = true;
        card.dataset.pageId = page.id;

        const meta = document.createElement('div');
        meta.className = 'card-meta';
        const position = document.createElement('strong');
        position.textContent = positionLabel(index);
        const label = document.createElement('span');
        label.className = 'card-label';
        label.textContent = page.label;
        label.title = page.label;
        meta.append(position, label);

        const actions = document.createElement('div');
        actions.className = 'card-actions';
        actions.append(
            createIconButton('←', `Mover ${page.label} para trás`, () => movePage(index, index - 1), index === 0),
            createIconButton('→', `Mover ${page.label} para frente`, () => movePage(index, index + 1), index === state.pages.length - 1),
            createIconButton('×', `Remover ${page.label}`, () => removePage(index)),
        );

        card.append(createThumbnail(page), meta, actions);
        addCardDragHandlers(card);
        return card;
    }

    function addCardDragHandlers(card) {
        card.addEventListener('dragstart', (e) => {
            state.draggedPageId = Number(card.dataset.pageId);
            e.dataTransfer.effectAllowed = 'move';
            card.classList.add('dragging');
        });

        card.addEventListener('dragend', () => {
            state.draggedPageId = null;
            card.classList.remove('dragging');
        });

        card.addEventListener('dragover', (e) => {
            if (state.draggedPageId === null) return; // Arquivos externos não reordenam
            e.preventDefault();
            card.classList.add('drop-target');
        });

        card.addEventListener('dragleave', () => card.classList.remove('drop-target'));

        card.addEventListener('drop', (e) => {
            if (state.draggedPageId === null) return;
            e.preventDefault();
            card.classList.remove('drop-target');
            const fromIndex = state.pages.findIndex(page => page.id === state.draggedPageId);
            const toIndex = state.pages.findIndex(page => page.id === Number(card.dataset.pageId));
            movePage(fromIndex, toIndex);
        });
    }

    function renderPageGrid() {
        const hasPages = state.pages.length > 0;
        editorSection.classList.toggle('hidden', !hasPages);
        resultSection.classList.toggle('hidden', !hasPages);
        pageSummary.textContent = hasPages ? describePageSummary() : '';
        pageGrid.replaceChildren(...state.pages.map(createPageCard));
    }

    // --- Pré-visualização ---
    function schedulePreview() {
        clearTimeout(previewTimer);
        state.pdfBytes = null;
        downloadBtn.disabled = true;

        if (state.pages.length === 0) {
            preview.replaceChildren();
            return;
        }

        previewTimer = setTimeout(updatePreview, PREVIEW_DEBOUNCE_MS);
    }

    async function updatePreview() {
        // Se as páginas mudarem durante a geração, o resultado antigo é descartado
        const token = ++state.previewToken;
        preview.classList.add('loading');

        try {
            const pdfBytes = await PocketMod.generatePocketModPdf(state.pages, {
                filler: selectedOption('filler'),
                binding: selectedOption('binding'),
            });
            const canvases = await SheetPreview.renderSheets(pdfBytes, preview.clientWidth || FALLBACK_PREVIEW_WIDTH);
            if (token !== state.previewToken) return;

            state.pdfBytes = pdfBytes;
            preview.replaceChildren(...canvases);
            downloadBtn.disabled = false;
        } catch (error) {
            if (token !== state.previewToken) return;
            console.error('Falha ao gerar PocketMod', { pageCount: state.pages.length, error });
            showError('Não foi possível gerar o PocketMod. Tente remover a última página adicionada.');
        } finally {
            if (token === state.previewToken) preview.classList.remove('loading');
        }
    }

    // --- Download ---
    downloadBtn.addEventListener('click', () => {
        if (!state.pdfBytes) return;

        const blob = new Blob([state.pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `${state.baseName ?? DEFAULT_DOWNLOAD_NAME}_PocketMod.pdf`;
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    });

    // --- Feedback ---
    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.classList.remove('hidden');
    }

    function hideError() {
        errorMessage.textContent = '';
        errorMessage.classList.add('hidden');
    }

    function setStatus(message) {
        statusText.textContent = message;
    }

    // Service worker só funciona via http(s); abrindo o arquivo direto (file://) o site roda sem modo offline
    function registerServiceWorker() {
        if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
        navigator.serviceWorker.register('sw.js').catch(error => {
            console.error('Falha ao registrar service worker', error);
        });
    }
});
