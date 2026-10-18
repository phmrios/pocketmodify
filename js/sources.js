// Transforma arquivos (PDF e imagens) em páginas prontas para o PocketMod.generatePocketModPdf,
// cada uma com uma miniatura para o editor.

const PageSources = (() => {
    const { PDFDocument } = PDFLib;

    pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';

    const PDF_SIGNATURE = '%PDF-';
    const PDF_SIGNATURE_SEARCH_BYTES = 1024; // A especificação permite lixo antes do cabeçalho
    const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|gif|bmp|avif)$/i;

    // Uma célula tem ~74 mm de largura; 2400 px dá folga de sobra para impressão
    const IMAGE_MAX_SIDE = 2400;
    const JPEG_QUALITY = 0.9;
    const THUMBNAIL_WIDTH = 240;

    let nextPageId = 1;

    class SourceError extends Error {
        constructor(message) {
            super(message);
            this.name = 'SourceError';
        }
    }

    function hasPdfSignature(bytes) {
        const header = bytes.subarray(0, PDF_SIGNATURE_SEARCH_BYTES);
        return String.fromCharCode(...header).includes(PDF_SIGNATURE);
    }

    function isImageFile(file) {
        return file.type.startsWith('image/') || IMAGE_EXTENSIONS.test(file.name);
    }

    function createPage(kind, label, props) {
        return { id: nextPageId++, kind, label, ...props };
    }

    // Miniaturas são geradas sob demanda e guardadas, para não travar ao abrir PDFs grandes
    function memoize(fn) {
        let promise = null;
        return () => (promise ??= fn());
    }

    async function renderPdfThumbnail(pdfjsDoc, pageNumber) {
        const page = await pdfjsDoc.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: THUMBNAIL_WIDTH / baseViewport.width });

        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        return canvas.toDataURL('image/jpeg', 0.8);
    }

    // O pdf-lib pode aceitar um arquivo corrompido no load e só falhar ao ler as páginas.
    // ignoreEncryption permite detectar a criptografia via isEncrypted, já que o
    // EncryptedPDFError do pdf-lib não funciona com instanceof.
    async function loadPdfLibPages(bytes, name) {
        let doc;
        try {
            doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        } catch (error) {
            throw new SourceError(`"${name}" não pôde ser lido. Verifique se o arquivo não está corrompido.`);
        }

        if (doc.isEncrypted) {
            throw new SourceError(`"${name}" está protegido por senha. Remova a proteção e tente novamente.`);
        }

        try {
            return doc.getPages();
        } catch (error) {
            throw new SourceError(`"${name}" não pôde ser lido. Verifique se o arquivo não está corrompido.`);
        }
    }

    /**
     * @param {Uint8Array} bytes
     * @param {string} name nome exibido no editor e nas mensagens de erro
     */
    async function loadPdfBytes(bytes, name) {
        const pdfPages = await loadPdfLibPages(bytes, name);

        if (pdfPages.length === 0) {
            throw new SourceError(`"${name}" não tem nenhuma página.`);
        }

        // O pdf.js transfere o buffer para o worker, por isso recebe uma cópia
        const getPdfjsDoc = memoize(() => pdfjsLib.getDocument({ data: bytes.slice() }).promise);

        return pdfPages.map((pdfPage, index) => createPage('pdf', `${name} · p. ${index + 1}`, {
            pdfPage,
            getThumbnailUrl: memoize(async () => renderPdfThumbnail(await getPdfjsDoc(), index + 1)),
        }));
    }

    function canvasToJpegBytes(canvas) {
        return new Promise((resolve, reject) => {
            canvas.toBlob(blob => {
                if (!blob) return reject(new Error('Falha ao converter imagem'));
                resolve(blob);
            }, 'image/jpeg', JPEG_QUALITY);
        });
    }

    // Toda imagem passa pelo canvas: aplica a orientação EXIF das fotos de celular,
    // troca a transparência por branco e converte para JPEG (único formato que o pipeline usa).
    async function loadImageFile(file) {
        let bitmap;
        try {
            bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        } catch (error) {
            throw new SourceError(`"${file.name}": formato de imagem não suportado pelo navegador. Use JPG ou PNG.`);
        }

        const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);

        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();

        const blob = await canvasToJpegBytes(canvas);
        const jpegBytes = new Uint8Array(await blob.arrayBuffer());
        const thumbnailUrl = URL.createObjectURL(blob);

        return [createPage('image', file.name, {
            jpegBytes,
            getThumbnailUrl: () => Promise.resolve(thumbnailUrl),
        })];
    }

    /**
     * @param {File} file PDF ou imagem
     * @returns {Promise<Array<object>>} páginas na ordem do arquivo
     */
    async function loadFile(file) {
        const bytes = new Uint8Array(await file.arrayBuffer());

        if (hasPdfSignature(bytes)) return loadPdfBytes(bytes, file.name);
        if (isImageFile(file)) return loadImageFile(file);

        throw new SourceError(`"${file.name}" não é um PDF nem uma imagem.`);
    }

    function createBlankPage() {
        return createPage('blank', 'Página em branco', {});
    }

    return { loadFile, loadPdfBytes, createBlankPage, SourceError };
})();
