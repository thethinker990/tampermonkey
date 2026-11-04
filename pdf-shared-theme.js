/**
 * PdfSharedTheme – gemeinsame Design-, Layout- & Komponenten-Bibliothek (pdfmake) für alle
 * Marktplatz-PDF-Exporter (eBay, Kleinanzeigen, später z. B. Vinted).
 * Version: 3.1.1
 *
 * Verantwortung: NUR Darstellung. Plattform-Adapter liefern ein einheitliches Datenmodell
 * (siehe specs/001-marketplace-pdf-export/plan.md "Data Model"), diese Bibliothek baut daraus das komplette PDF-Dokument
 * (buildExportDocument, buildInvoiceDocument, buildReportDocument). Ablauf/DB/Settings/Toast liegen in marketplace-export-core.js.
 *
 * Einbindung (Versions-Parameter erzwingt Neuladen aus dem Tampermonkey-Cache):
 * // @require https://raw.githubusercontent.com/thethinker990/tampermonkey/main/pdf-shared-theme.js?v=3.1.1
 */
(function (global) {
    'use strict';

    const LIB_VERSION = '3.1.1';

    const MONTH_SHORT_DE = Object.freeze([
        'Jan.', 'Feb.', 'Mär.', 'Apr.', 'Mai', 'Jun.',
        'Jul.', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'
    ]);

    /** Einheitliche Feldbezeichnungen (ohne Doppelpunkt) für alle Plattformen. */
    const META_LABELS = Object.freeze({
        SOURCE: 'Quelle',
        CREATED_WITH: 'Erstellt mit',
        AD_ID: 'Anzeigen-ID',
        CONV_ID: 'Nachrichten-ID',
        ORDER_ID: 'Bestellnummer',
        AD_TYPE: 'Anzeigentyp',
        CATEGORY: 'Kategorie',
        BUYER_NAME: 'Käufername',
        SELLER_NAME: 'Verkäufername',
        SELLER_TYPE: 'Verkäufer-Typ',
        SELLER_SINCE: 'Aktiv seit',
        LOCATION: 'Ort',
        CREATED_DATE: 'Eingestellt am',
        LISTED_PRICE: 'Preis (Anzeige)',
        LISTED_SHIPPING: 'Versand (Anzeige)',
        LISTED_TOTAL: 'Gesamtbetrag (Anzeige)',
        AGREED_PRICE: 'Preis',
        BUYER_PROTECTION: 'Käuferschutz',
        AGREED_SHIPPING: 'Versand',
        TOTAL_AMOUNT: 'Gesamtbetrag',
        PAYMENT_METHOD: 'Zahlungsart',
        TRACKING_ID: 'Sendungsverfolgungsnummer',
        REFUND: 'Rückerstattung',
        TRANSACTION_FEE: 'Transaktionsgebühren',
        AD_FEE: 'Anzeigengebühr',
        SHIPPING_ACTUAL: 'Versandkosten (tatsächlich)',
        EARNINGS: 'Erlös',
        LISTING_DURATION: 'Angebotsdauer',
        PICKUP: 'Abholung',
        EXPORTED_AT: 'Exportiert / Erstellt am'
    });

    const TOKENS = Object.freeze({
        page: {
            size: 'A4',
            orientation: 'portrait',
            margins: [28, 28, 28, 38],
            contentWidthPt: 539,
            defaultFontSize: 9.5,
            defaultLineHeight: 1.25
        },
        themes: {
            kleinanzeigen: {
                headerFill: '#f0fdf4',
                headerBorder: '#1d4b00',
                headerText: '#111827',
                sectionHeaderColor: '#1d4b00',
                bubble: {
                    radiusPt: 12,
                    padX: 8.5,
                    padY: 4.5,
                    outboundFill: '#b5e941',
                    outboundBorder: '',
                    outboundText: '#1d4b00',
                    inboundFill: '#f4f2ef',
                    inboundBorder: '',
                    inboundText: '#0c0c0b',
                    sharpCornerOnSendersSide: true
                },
                card: { border: '#bebcb7', fill: '#ffffff', radiusPt: 6, eyebrowSize: 10.5, amountSize: 19.5 },
                offer: { ownBorder: '#1d4b00', partnerBorder: '#bebcb7', fill: '#ffffff', titleSize: 9.5, amountSize: 15 },
                avatar: { bg: '#bebcb7', fg: '#33322e' },
                securityPill: { fill: '#e9f7c9', text: '#1d4b00' }
            },
            ebay: {
                headerFill: '#d4e5fe',
                headerBorder: '#0968f6',
                headerText: '#111827',
                sectionHeaderColor: '#111827',
                bubble: {
                    radiusPt: 12,
                    padX: 9,
                    padY: 5,
                    outboundFill: '#f7f7f7',
                    outboundBorder: '',
                    outboundText: '#191919',
                    inboundFill: '#ffffff',
                    inboundBorder: '#e5e5e5',
                    inboundText: '#191919',
                    sharpCornerOnSendersSide: false
                },
                card: { border: '#e5e5e5', fill: '#ffffff', radiusPt: 9, eyebrowSize: 10, amountSize: 15 },
                offer: { ownBorder: '#191919', partnerBorder: '#e5e5e5', fill: '#ffffff', titleSize: 9, amountSize: 15 },
                avatar: { bg: '#44ccd5', fg: '#07465a' },
                securityPill: { fill: '#f7f7f7', text: '#191919' }
            }
        },
        colors: {
            textPrimary: '#111111',
            textDark: '#111827',
            textDesc: '#1f2937',
            textLabel: '#222222',
            textExportedAt: '#374151',
            textMuted: '#4b5563',
            textTimestamp: '#707070',
            textWarning: '#dc2626',
            link: '#0b57d0',
            tableBorder: '#d1d5db',
            tableRowEven: '#f9fafb',
            tableRowOdd: '#ffffff',
            descBoxBg: '#f9fafb',
            descBoxBorder: '#e5e7eb',
            noticeFill: '#fff7e6',
            noticeBorder: '#f0a500',
            translationRule: '#c7c7c7'
        },
        typography: {
            titleHeaderSize: 13,
            sectionHeaderSize: 12,
            tableFontSize: 9.5,
            bodyFontSize: 9.5,
            exportTimestampSize: 8.5,
            dateSeparatorSize: 9,
            messageTimestampSize: 8,
            endOfChatSize: 10,
            footerFontSize: 9,
            galleryCaptionSize: 8.5,
            attachmentCaptionSize: 7
        },
        table: {
            defaultLabelWidth: 150,
            priceBlockGapPt: 14,
            padX: 4,
            padY: 3.5,
            borderWidth: 0.5,
            cellLineHeight: 1.15
        },
        gallery: {
            boxWidthPt: 245,
            boxHeightPt: 200,
            columnGapPt: 14,
                    },
        chat: {
            maxBubbleShare: 0.62,
            minBubbleWidthPt: 78,
            avatarSizePt: 24,
            avatarColWidthPt: 30,
            singleImageFitPt: 180,
            multiImageFitPt: 96
        }
    });

    let measureCtx = null;

    function getMeasureContext() {
        if (!measureCtx && typeof document !== 'undefined') {
            const canvas = document.createElement('canvas');
            measureCtx = canvas.getContext('2d');
        }
        return measureCtx;
    }

    function measureTextWidthPt(text, fontSizePt = 9.5, isBold = false) {
        const ctx = getMeasureContext();
        if (!ctx) return String(text || '').length * (fontSizePt * 0.52);
        ctx.font = `${isBold ? 'bold ' : ''}${fontSizePt}px Roboto, Arial, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
        const lines = String(text || '').split(/\r?\n/);
        let maxW = 0;
        for (const line of lines) {
            const w = ctx.measureText(line).width;
            if (w > maxW) maxW = w;
        }
        return maxW;
    }

    function extractPlainTextFromCell(cellVal) {
        if (cellVal === null || cellVal === undefined) return '';
        if (typeof cellVal === 'string' || typeof cellVal === 'number') return String(cellVal);
        if (Array.isArray(cellVal)) return cellVal.map(extractPlainTextFromCell).join('');
        if (typeof cellVal === 'object') {
            if (cellVal.text !== undefined) return extractPlainTextFromCell(cellVal.text);
            if (Array.isArray(cellVal.stack)) return cellVal.stack.map(extractPlainTextFromCell).join('\n');
        }
        return '';
    }

    function estimateWrappedLineCount(rawText, maxWidthPt, fontSizePt = 9.5, isBold = false) {
        const clean = String(rawText || '').replace(/\r\n/g, '\n').trim();
        if (!clean || maxWidthPt <= 10) return 1;
        const paragraphs = clean.split('\n');
        let totalLines = 0;

        for (const para of paragraphs) {
            if (!para.trim()) {
                totalLines += 1;
                continue;
            }
            const words = para.split(/\s+/);
            let currentLine = '';
            for (const word of words) {
                const candidate = currentLine ? `${currentLine} ${word}` : word;
                if (measureTextWidthPt(candidate, fontSizePt, isBold) <= maxWidthPt) {
                    currentLine = candidate;
                } else {
                    if (currentLine) totalLines += 1;
                    const wordW = measureTextWidthPt(word, fontSizePt, isBold);
                    if (wordW > maxWidthPt) {
                        const extraChunks = Math.ceil(wordW / maxWidthPt);
                        totalLines += Math.max(1, extraChunks - 1);
                    }
                    currentLine = word;
                }
            }
            if (currentLine) totalLines += 1;
        }
        return Math.max(1, totalLines);
    }

    /**
     * Entfernt abschließende Doppelpunkte aus jedem Tabellen-Label (Anforderung: Doppelpunkt überall weg).
     */
    function stripTrailingColon(labelStr) {
        if (labelStr === null || labelStr === undefined) return '';
        return String(labelStr).replace(/\s*:\s*$/, '').trim();
    }

    function cleanTextPreserveEmojis(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/\u00a0/g, ' ')
            .replace(/[ \t]+/g, ' ')
            .trim();
    }

    /**
     * Extrahiert Text inkl. Emojis (Unicode, <img alt="😊">, [data-emoji]) und Zeilenumbrüchen aus einem DOM-Knoten.
     */
    function extractTextFromNodePreserveEmojis(rootNode, removeSelectors = []) {
        if (!rootNode) return '';
        const clone = rootNode.cloneNode(true);

        const defaultRemove = ['script', 'style', 'noscript', '.clipped', ...removeSelectors];
        clone.querySelectorAll(defaultRemove.join(', ')).forEach((el) => el.remove());

        clone.querySelectorAll('img').forEach((img) => {
            const emojiAlt = (img.getAttribute('data-emoji') || img.getAttribute('alt') || '').trim();
            if (emojiAlt && !/\.(jpg|jpeg|png|webp|gif|svg)$/i.test(emojiAlt) && emojiAlt.length <= 16) {
                img.replaceWith(document.createTextNode(emojiAlt));
            } else {
                img.remove();
            }
        });

        clone.querySelectorAll('[data-emoji]').forEach((el) => {
            const em = (el.getAttribute('data-emoji') || '').trim();
            if (em && !el.textContent?.trim()) {
                el.replaceWith(document.createTextNode(em));
            }
        });

        clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
        clone.querySelectorAll('p, div, li').forEach((block) => block.append('\n'));

        const raw = (clone.textContent || '').replace(/\u00a0/g, ' ');
        const lines = raw.split('\n').map((line) => line.replace(/[ \t]+/g, ' ').trim());

        const cleanedLines = [];
        let emptyCount = 0;
        for (const line of lines) {
            if (!line) {
                emptyCount += 1;
                if (emptyCount <= 1 && cleanedLines.length > 0) {
                    cleanedLines.push('');
                }
            } else {
                emptyCount = 0;
                cleanedLines.push(line);
            }
        }
        return cleanedLines.join('\n').trim();
    }

    /* ==========================================================================
     * FARBIGE EMOJIS (PNG-DATA-URL / SVG) & THREE-EM DASH (U+2E3B) FÜR PDFMAKE
     * ========================================================================== */

    const EMOJI_TOKEN_REGEX = /(\u2E3B|(?:[\u2700-\u27BF]|(?:\uD83C[\uDDE6-\uDDFF]){2}|[\uD83C-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u26FF\u2300-\u23FF\u2B50\u2B55\u203C\u2049\u2122\u2139\u2194-\u21AA\u2934-\u2935\u3030\u303D\u3297\u3299])(?:\uFE0F)?(?:\uD83C[\uDFFB-\uDFFF])?(?:\u200D(?:[\u2700-\u27BF]|[\uD83C-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u26FF\u2300-\u23FF])(?:\uFE0F)?(?:\uD83C[\uDFFB-\uDFFF])?)*)/g;

    function buildThreeEmDashFontBase64() {
        const glyphs = [
            { advanceWidth: 600, rects: [[60, 0, 540, 700]] },
            { advanceWidth: 2600, rects: [[40, 250, 2560, 335]] }
        ];
        const sortedCps = [0x2E3B];
        const cpToGid = new Map([[0x2E3B, 1]]);
        const numGlyphs = glyphs.length;
        const glyfParts = [];
        const locaOffsets = [0];

        for (const g of glyphs) {
            const rects = g.rects;
            const numContours = rects.length;
            const numPts = numContours * 4;
            const [x1, y1, x2, y2] = rects[0];
            const rawLen = 10 + numContours * 2 + 2 + numPts + numPts * 2 + numPts * 2;
            const paddedLen = (rawLen + 3) & ~3;
            const buf = new ArrayBuffer(paddedLen);
            const dv = new DataView(buf);
            let pos = 0;

            dv.setInt16(pos, numContours, false); pos += 2;
            dv.setInt16(pos, x1, false); pos += 2;
            dv.setInt16(pos, y1, false); pos += 2;
            dv.setInt16(pos, x2, false); pos += 2;
            dv.setInt16(pos, y2, false); pos += 2;
            dv.setUint16(pos, 3, false); pos += 2;
            dv.setUint16(pos, 0, false); pos += 2;
            for (let i = 0; i < numPts; i++) {
                dv.setUint8(pos, 0x01); pos += 1;
            }
            let prevX = 0;
            for (const px of [x1, x1, x2, x2]) {
                dv.setInt16(pos, px - prevX, false); pos += 2; prevX = px;
            }
            let prevY = 0;
            for (const py of [y1, y2, y2, y1]) {
                dv.setInt16(pos, py - prevY, false); pos += 2; prevY = py;
            }
            glyfParts.push(new Uint8Array(buf));
            locaOffsets.push(locaOffsets[locaOffsets.length - 1] + paddedLen);
        }

        const totalGlyfBytes = locaOffsets[locaOffsets.length - 1];
        const glyfTable = new Uint8Array(totalGlyfBytes);
        let gOff = 0;
        for (const part of glyfParts) {
            glyfTable.set(part, gOff);
            gOff += part.length;
        }

        const locaTable = new Uint8Array(locaOffsets.length * 4);
        const locaDv = new DataView(locaTable.buffer);
        locaOffsets.forEach((off, idx) => locaDv.setUint32(idx * 4, off, false));

        const headTable = new Uint8Array(54);
        const headDv = new DataView(headTable.buffer);
        headDv.setUint32(0, 0x00010000, false);
        headDv.setUint32(4, 0x00010000, false);
        headDv.setUint32(12, 0x5F0F3CF5, false);
        headDv.setUint16(16, 0x000B, false);
        headDv.setUint16(18, 1000, false);
        headDv.setInt16(36, 0, false);
        headDv.setInt16(38, -200, false);
        headDv.setInt16(40, 2700, false);
        headDv.setInt16(42, 900, false);
        headDv.setUint16(46, 8, false);
        headDv.setInt16(48, 2, false);
        headDv.setInt16(50, 1, false);

        const hheaTable = new Uint8Array(36);
        const hheaDv = new DataView(hheaTable.buffer);
        hheaDv.setUint32(0, 0x00010000, false);
        hheaDv.setInt16(4, 800, false);
        hheaDv.setInt16(6, -200, false);
        hheaDv.setUint16(10, 2700, false);
        hheaDv.setInt16(16, 2700, false);
        hheaDv.setInt16(18, 1, false);
        hheaDv.setUint16(34, numGlyphs, false);

        const maxpTable = new Uint8Array(32);
        const maxpDv = new DataView(maxpTable.buffer);
        maxpDv.setUint32(0, 0x00010000, false);
        maxpDv.setUint16(4, numGlyphs, false);
        maxpDv.setUint16(6, 4, false);
        maxpDv.setUint16(8, 1, false);
        maxpDv.setUint16(14, 2, false);

        const hmtxTable = new Uint8Array(numGlyphs * 4);
        const hmtxDv = new DataView(hmtxTable.buffer);
        glyphs.forEach((g, idx) => {
            hmtxDv.setUint16(idx * 4, g.advanceWidth, false);
            hmtxDv.setInt16(idx * 4 + 2, 0, false);
        });

        const numGroups = sortedCps.length;
        const fmt12Len = 16 + numGroups * 12;
        const cmapTable = new Uint8Array(12 + fmt12Len);
        const cmapDv = new DataView(cmapTable.buffer);
        cmapDv.setUint16(0, 0, false);
        cmapDv.setUint16(2, 1, false);
        cmapDv.setUint16(4, 3, false);
        cmapDv.setUint16(6, 10, false);
        cmapDv.setUint32(8, 12, false);
        cmapDv.setUint16(12, 12, false);
        cmapDv.setUint16(14, 0, false);
        cmapDv.setUint32(16, fmt12Len, false);
        cmapDv.setUint32(20, 0, false);
        cmapDv.setUint32(24, numGroups, false);
        sortedCps.forEach((cp, idx) => {
            const base = 28 + idx * 12;
            cmapDv.setUint32(base, cp, false);
            cmapDv.setUint32(base + 4, cp, false);
            cmapDv.setUint32(base + 8, cpToGid.get(cp), false);
        });

        const os2Table = new Uint8Array(78);
        const os2Dv = new DataView(os2Table.buffer);
        os2Dv.setUint16(0, 0, false);
        os2Dv.setInt16(2, 800, false);
        os2Dv.setUint16(4, 400, false);
        os2Dv.setUint16(6, 5, false);
        os2Dv.setUint16(62, 0x0040, false);
        os2Dv.setUint16(64, 0x0020, false);
        os2Dv.setUint16(66, 0xFFFF, false);
        os2Dv.setInt16(68, 800, false);
        os2Dv.setInt16(70, -200, false);
        os2Dv.setUint16(74, 800, false);
        os2Dv.setUint16(76, 200, false);

        const encodeUtf16Be = (s) => {
            const out = new Uint8Array(s.length * 2);
            for (let i = 0; i < s.length; i++) {
                const c = s.charCodeAt(i);
                out[i * 2] = (c >> 8) & 0xFF;
                out[i * 2 + 1] = c & 0xFF;
            }
            return out;
        };
        const famBytes = encodeUtf16Be('ChatEmoji');
        const subBytes = encodeUtf16Be('Regular');
        const nameRecs = [[1, famBytes], [2, subBytes], [4, famBytes], [6, famBytes]];
        const strTotal = nameRecs.reduce((acc, r) => acc + r[1].length, 0);
        const nameHeaderLen = 6 + nameRecs.length * 12;
        const nameTable = new Uint8Array(nameHeaderLen + strTotal);
        const nameDv = new DataView(nameTable.buffer);
        nameDv.setUint16(0, 0, false);
        nameDv.setUint16(2, nameRecs.length, false);
        nameDv.setUint16(4, nameHeaderLen, false);
        let strOff = 0;
        nameRecs.forEach(([nameId, bytes], idx) => {
            const rBase = 6 + idx * 12;
            nameDv.setUint16(rBase, 3, false);
            nameDv.setUint16(rBase + 2, 1, false);
            nameDv.setUint16(rBase + 4, 0x0409, false);
            nameDv.setUint16(rBase + 6, nameId, false);
            nameDv.setUint16(rBase + 8, bytes.length, false);
            nameDv.setUint16(rBase + 10, strOff, false);
            nameTable.set(bytes, nameHeaderLen + strOff);
            strOff += bytes.length;
        });

        const postTable = new Uint8Array(32);
        const postDv = new DataView(postTable.buffer);
        postDv.setUint32(0, 0x00030000, false);

        const tables = [
            ['OS/2', os2Table], ['cmap', cmapTable], ['glyf', glyfTable],
            ['head', headTable], ['hhea', hheaTable], ['hmtx', hmtxTable],
            ['loca', locaTable], ['maxp', maxpTable], ['name', nameTable], ['post', postTable]
        ];

        const numTables = tables.length;
        const dirSize = 12 + numTables * 16;
        let totalSize = dirSize;
        for (const [, data] of tables) totalSize += (data.length + 3) & ~3;

        const ttf = new Uint8Array(totalSize);
        const ttfDv = new DataView(ttf.buffer);
        ttfDv.setUint32(0, 0x00010000, false);
        ttfDv.setUint16(4, numTables, false);
        ttfDv.setUint16(6, 128, false);
        ttfDv.setUint16(8, 3, false);
        ttfDv.setUint16(10, numTables * 16 - 128, false);

        let dataOffset = dirSize;
        tables.forEach(([tag, data], idx) => {
            const paddedLen = (data.length + 3) & ~3;
            ttf.set(data, dataOffset);
            let csum = 0;
            for (let p = 0; p < paddedLen; p += 4) {
                csum = (csum + ttfDv.getUint32(dataOffset + p, false)) >>> 0;
            }
            const entryBase = 12 + idx * 16;
            for (let c = 0; c < 4; c++) ttf[entryBase + c] = tag.charCodeAt(c);
            ttfDv.setUint32(entryBase + 4, csum, false);
            ttfDv.setUint32(entryBase + 8, dataOffset, false);
            ttfDv.setUint32(entryBase + 12, data.length, false);
            dataOffset += paddedLen;
        });

        let binary = '';
        for (let i = 0; i < ttf.length; i++) binary += String.fromCharCode(ttf[i]);
        return btoa(binary);
    }

    function ensurePdfMakeEmojiFontRegistered() {
        const pdfMake = global.pdfMake || (typeof window !== 'undefined' ? window.pdfMake : null);
        if (!pdfMake) return false;

        try {
            const b64 = buildThreeEmDashFontBase64();
            pdfMake.vfs = pdfMake.vfs || {};
            pdfMake.vfs['ChatEmoji-Regular.ttf'] = b64;
            pdfMake.fonts = pdfMake.fonts || {};
            if (!pdfMake.fonts.Roboto) {
                pdfMake.fonts.Roboto = {
                    normal: 'Roboto-Regular.ttf',
                    bold: 'Roboto-Medium.ttf',
                    italics: 'Roboto-Italic.ttf',
                    bolditalics: 'Roboto-MediumItalic.ttf'
                };
            }
            pdfMake.fonts.ChatEmoji = {
                normal: 'ChatEmoji-Regular.ttf',
                bold: 'ChatEmoji-Regular.ttf',
                italics: 'ChatEmoji-Regular.ttf',
                bolditalics: 'ChatEmoji-Regular.ttf'
            };
            return true;
        } catch (err) {
            console.warn('[PdfSharedTheme] Font-Registrierung fehlgeschlagen:', err);
            return false;
        }
    }

    const emojiPngCache = new Map();

    /** Ein einzelnes Emoji (Graphem) als transparentes Farb-PNG, gecacht. Null ohne Canvas. */
    function renderEmojiPng(grapheme) {
        if (emojiPngCache.has(grapheme)) return emojiPngCache.get(grapheme);
        if (typeof document === 'undefined') return null;
        const size = 72;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.font = '60px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(grapheme, size / 2, size / 2 + 3);
        const url = canvas.toDataURL('image/png');
        emojiPngCache.set(grapheme, url);
        return url;
    }

    function hasColorEmoji(str) {
        if (!str || typeof str !== 'string') return false;
        const withoutThreeEm = str.replace(/\u2E3B/g, '');
        EMOJI_TOKEN_REGEX.lastIndex = 0;
        return EMOJI_TOKEN_REGEX.test(withoutThreeEm);
    }

    /**
     * Zerlegt einen String mit ⸻ (U+2E3B) in ein pdfmake-Text-Inline-Array.
     */
    function buildRichTextWithEmojis(rawStr) {
        const cleaned = cleanTextPreserveEmojis(rawStr);
        if (!cleaned) return '';

        if (!cleaned.includes('\u2E3B')) {
            return cleaned;
        }

        ensurePdfMakeEmojiFontRegistered();

        const parts = cleaned.split(/(\u2E3B+)/);
        const runs = [];
        for (const p of parts) {
            if (!p) continue;
            if (/^\u2E3B+$/.test(p)) {
                runs.push({ text: p, font: 'ChatEmoji' });
            } else {
                runs.push(p);
            }
        }
        return runs.length === 1 ? runs[0] : runs;
    }

    /** Zerlegt eine Zeile in Text- und Emoji-Tokens (⸻ bleibt Text, es hat eine eigene Schrift). */
    function splitEmojiTokens(line) {
        const tokens = [];
        let last = 0;
        EMOJI_TOKEN_REGEX.lastIndex = 0;
        let m;
        while ((m = EMOJI_TOKEN_REGEX.exec(line)) !== null) {
            if (m[0] === '\u2E3B') continue;
            if (m.index > last) tokens.push({ text: line.slice(last, m.index) });
            tokens.push({ emoji: m[0] });
            last = m.index + m[0].length;
        }
        if (last < line.length) tokens.push({ text: line.slice(last) });
        return tokens;
    }

    /**
     * Absatz für Nachrichten und Beschreibungen. Text bleibt echter (markierbarer) Text; nur jedes einzelne
     * Farb-Emoji wird als kleines Bild an seine Stelle gesetzt. Zeilen mit Emoji werden dafür selbst umbrochen
     * und als Spalten (Text | Emoji | Text …) gesetzt.
     */
    function buildParagraphNodeWithColorEmojis(rawText, options = {}) {
        const cleaned = String(rawText || '').replace(/\r\n/g, '\n').trim();
        if (!cleaned) return { text: '' };

        const fontSize = options.fontSize || TOKENS.typography.bodyFontSize;
        const lineHeight = options.lineHeight || TOKENS.page.defaultLineHeight;
        const color = options.color || TOKENS.colors.textPrimary;
        const bold = Boolean(options.bold);
        const italics = Boolean(options.italics);
        const maxWidthPt = (options.maxWidthPt || 310) * 0.94;
        const toRuns = (s) => (options.withLinks ? buildRichTextWithLinks(s) : buildRichTextWithEmojis(s));
        const style = { fontSize, lineHeight, color, bold, italics };

        if (!hasColorEmoji(cleaned)) return { text: toRuns(cleaned), ...style };

        const emojiW = +(fontSize * 1.2).toFixed(2);
        const keepSpaces = (s) => s.replace(/^ +| +$/g, (sp) => '\u00a0'.repeat(sp.length));
        const visualLine = (parts) => {
            const columns = [];
            let buf = '';
            const flush = () => {
                if (buf) columns.push({ width: 'auto', text: toRuns(keepSpaces(buf)), ...style });
                buf = '';
            };
            for (const p of parts) {
                if (p.emoji) {
                    flush();
                    const img = renderEmojiPng(p.emoji);
                    columns.push(img ? { width: emojiW, image: img, fit: [emojiW, emojiW], margin: [0, -1, 0, 0] } : { width: 'auto', text: p.emoji, ...style });
                } else {
                    buf += p.text;
                }
            }
            flush();
            columns.push({ width: '*', text: '' });
            return { columns, columnGap: 0 };
        };

        const stack = [];
        for (const line of cleaned.split('\n')) {
            if (!line.trim()) {
                stack.push({ text: ' ', ...style });
                continue;
            }
            if (!hasColorEmoji(line)) {
                stack.push({ text: toRuns(line), ...style });
                continue;
            }
            // Wörter und Emojis greedy auf Zeilenbreite verteilen
            const words = [];
            for (const tok of splitEmojiTokens(line)) {
                if (tok.emoji) words.push({ emoji: tok.emoji, w: emojiW });
                else for (const piece of tok.text.split(/(\s+)/)) if (piece) words.push({ text: piece, w: measureTextWidthPt(piece, fontSize, bold) });
            }
            let current = [];
            let width = 0;
            for (const word of words) {
                if (width + word.w > maxWidthPt && current.length && !/^\s+$/.test(word.text || '')) {
                    stack.push(visualLine(current));
                    current = [];
                    width = 0;
                }
                if (!current.length && /^\s+$/.test(word.text || '')) continue;
                current.push(word);
                width += word.w;
            }
            if (current.length) stack.push(visualLine(current));
        }
        return stack.length === 1 ? stack[0] : { stack };
    }

    /* ==========================================================================
     * DATUMS- & ZEITSTEMPEL-NORMALISIERUNG (<dd.mm.yyyy, hh:mm> & <dd. mmm. yyyy>)
     * ========================================================================== */

    function parseAnyDateParts(rawInput, fallbackDateStr = '') {
        const combined = `${String(rawInput || '')} ${String(fallbackDateStr || '')}`.trim();
        if (!combined) return null;

        const now = new Date();
        let day = null;
        let monthIndex = null;
        let year = null;

        const deNumericMatch = /\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b/.exec(combined);
        if (deNumericMatch) {
            day = parseInt(deNumericMatch[1], 10);
            monthIndex = parseInt(deNumericMatch[2], 10) - 1;
            year = parseInt(deNumericMatch[3], 10);
            if (year < 100) year += 2000;
        }

        if (day === null) {
            const isoMatch = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(combined);
            if (isoMatch) {
                year = parseInt(isoMatch[1], 10);
                monthIndex = parseInt(isoMatch[2], 10) - 1;
                day = parseInt(isoMatch[3], 10);
            }
        }

        if (day === null) {
            const namedMonthMatch = /\b(\d{1,2})\.?\s*([A-Za-zÄÖÜäöü]{3,})\.?\s*(\d{4})?\b/.exec(combined);
            if (namedMonthMatch) {
                const token = namedMonthMatch[2].toLowerCase().slice(0, 3);
                const monthMap = {
                    jan: 0, feb: 1, mär: 2, mae: 2, mar: 2, mrz: 2,
                    apr: 3, mai: 4, may: 4, jun: 5, jul: 6,
                    aug: 7, sep: 8, okt: 9, oct: 9, nov: 10, dez: 11, dec: 11
                };
                if (monthMap[token] !== undefined) {
                    day = parseInt(namedMonthMatch[1], 10);
                    monthIndex = monthMap[token];
                    year = namedMonthMatch[3] ? parseInt(namedMonthMatch[3], 10) : now.getFullYear();
                }
            }
        }

        if (day === null) {
            // eBay-Verkäuferansicht: "Oct 30, 2026 12:45:59 PM CET"
            const us = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),\s*(\d{4})\b/i.exec(combined);
            if (us) {
                day = parseInt(us[2], 10);
                monthIndex = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(us[1].toLowerCase());
                year = parseInt(us[3], 10);
            }
        }

        if (day === null) {
            if (/\bvorgestern\b/i.test(combined)) {
                const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2);
                day = d.getDate();
                monthIndex = d.getMonth();
                year = d.getFullYear();
            } else if (/\bgestern\b/i.test(combined)) {
                const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
                day = d.getDate();
                monthIndex = d.getMonth();
                year = d.getFullYear();
            } else if (/\bheute\b/i.test(combined)) {
                day = now.getDate();
                monthIndex = now.getMonth();
                year = now.getFullYear();
            }
        }

        const timeMatch = /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(combined);
        let hour = timeMatch ? parseInt(timeMatch[1], 10) : null;
        if (hour !== null && /\bPM\b/.test(combined) && hour < 12) hour += 12;
        if (hour === 12 && /\bAM\b/.test(combined)) hour = 0;
        const hh = timeMatch ? String(hour).padStart(2, '0') : null;
        const min = timeMatch ? String(timeMatch[2]).padStart(2, '0') : null;

        if (day === null || monthIndex === null || year === null) {
            return {
                hasDate: false,
                hh,
                min
            };
        }

        const dd = String(day).padStart(2, '0');
        const mm = String(monthIndex + 1).padStart(2, '0');
        const mmm = MONTH_SHORT_DE[monthIndex] || `${mm}.`;

        return {
            hasDate: true,
            day,
            monthIndex,
            year,
            dd,
            mm,
            numericDate: `${dd}.${mm}.${year}`,
            groupLabel: `${dd}. ${mmm} ${year}`,
            hh,
            min
        };
    }

    /**
     * Formatiert ein Datum + relative Altersangabe ("09.12.2014 (vor 11 Jahren)" bzw. "28.10.2026 (vor 2 Tagen)").
     */
    function formatDateWithRelativeAge(rawDateStr, mode = 'days') {
        if (!rawDateStr || rawDateStr === 'n/a') return 'n/a';
        const parsed = parseAnyDateParts(rawDateStr);
        if (!parsed || !parsed.hasDate) return String(rawDateStr).trim();

        const target = new Date(parsed.year, parsed.monthIndex, parsed.day, 0, 0, 0, 0);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const diffDays = Math.max(0, Math.floor((today.getTime() - target.getTime()) / 86400000));

        let label = '';
        if (mode === 'activeSince') {
            if (diffDays > 365) {
                const years = Math.max(1, Math.floor(diffDays / 365));
                label = years === 1 ? 'vor 1 Jahr' : `vor ${years} Jahren`;
            } else if (diffDays >= 30) {
                const months = Math.max(1, Math.floor(diffDays / 30));
                label = months === 1 ? 'vor 1 Monat' : `vor ${months} Monaten`;
            } else {
                label = diffDays === 1 ? 'vor 1 Tag' : `vor ${diffDays} Tagen`;
            }
        } else {
            label = diffDays === 1 ? 'vor 1 Tag' : `vor ${diffDays} Tagen`;
        }

        const timeSuffix = parsed.hh !== null && parsed.min !== null ? `, ${parsed.hh}:${parsed.min}` : '';
        return `${parsed.numericDate}${timeSuffix} (${label})`;
    }

    function normalizeMessageTimestamp(rawTimestamp, fallbackDateStr = '') {
        if (!rawTimestamp && !fallbackDateStr) return '';
        const raw = String(rawTimestamp || '')
            .replace(/·\s*Automatische Nachricht/gi, '')
            .replace(/Datum der Nachricht:/gi, '')
            .trim();

        const parsed = parseAnyDateParts(raw, fallbackDateStr);
        if (!parsed) return cleanTextPreserveEmojis(raw);

        if (parsed.hasDate && parsed.hh !== null && parsed.min !== null) {
            return `${parsed.numericDate}, ${parsed.hh}:${parsed.min}`;
        }
        if (parsed.hasDate) {
            return parsed.numericDate;
        }
        if (parsed.hh !== null && parsed.min !== null) {
            return `${parsed.hh}:${parsed.min}`;
        }
        return cleanTextPreserveEmojis(raw);
    }

    function formatDateGroupLabel(rawDateOrTimestamp, fallbackDateStr = '') {
        const parsed = parseAnyDateParts(rawDateOrTimestamp, fallbackDateStr);
        if (parsed && parsed.hasDate) {
            return parsed.groupLabel;
        }
        return '';
    }

    /* ==========================================================================
     * PLATTFORM / THEME
     * ========================================================================== */

    function resolvePlatform(platformParam) {
        if (platformParam && typeof platformParam === 'string') {
            const p = platformParam.toLowerCase().trim();
            if (p.includes('ebay')) return 'ebay';
            if (p.includes('kleinanzeigen') || p === 'ka') return 'kleinanzeigen';
        }
        if (typeof window !== 'undefined' && window.location && window.location.hostname) {
            const host = window.location.hostname.toLowerCase();
            if (host.includes('ebay')) return 'ebay';
            if (host.includes('kleinanzeigen')) return 'kleinanzeigen';
        }
        return 'kleinanzeigen';
    }

    function getTheme(platformParam) {
        const key = resolvePlatform(platformParam);
        return TOKENS.themes[key] || TOKENS.themes.kleinanzeigen;
    }

    const isNa = (v) => v === null || v === undefined || String(v).trim() === '' || /^n\/?a\b/i.test(String(v).trim());

    /* ==========================================================================
     * GELDBETRÄGE (Präfix VB/ab | Betrag rechtsbündig | EUR – als Block linksbündig, einheitliche Nachkommastellen)
     * ========================================================================== */

    /**
     * Zerlegt einen beliebigen Preis-String ("1 € VB", "EUR 15,00", "+ Versand ab 3,99 €", "15.00", "-0,54 €", "Kostenlos")
     * in { prefix, cents, special }. special = Klartext ohne Zahl (z. B. "Abholung"). Zahlen (Cent) werden durchgereicht.
     */
    function parseMoney(raw) {
        if (raw && typeof raw === 'object' && 'cents' in raw) return raw;
        if (typeof raw === 'number') return { special: '', cents: Math.round(raw), prefix: '' };
        const s = String(raw === null || raw === undefined ? '' : raw).replace(/\u00a0/g, ' ').trim();
        if (isNa(s)) return { special: 'n/a', cents: null, prefix: '' };
        if (/zu\s+verschenken/i.test(s)) return { special: 'Zu verschenken', cents: 0, prefix: '' };

        const prefix = /\b(VB|VHB|Verhandlungsbasis)\b/i.test(s) ? 'VB' : /(^|\s)ab(\s|$)/i.test(s) ? 'ab' : '';
        const sign = /(^|[\s(])[-−]\s*(EUR|€)?\s*\d/.test(s) ? -1 : 1;
        let m = /^-?(\d+)\.(\d{2})$/.exec(s);
        let cents = null;
        if (m) {
            cents = parseInt(m[1], 10) * 100 + parseInt(m[2], 10);
        } else {
            m = /(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?/.exec(s);
            if (m) {
                cents = parseInt(m[1].replace(/\./g, ''), 10) * 100 + (m[2] ? parseInt(m[2].padEnd(2, '0'), 10) : 0);
            }
        }
        if (cents === null) {
            if (/kostenlos|gratis|free/i.test(s)) return { special: 'Kostenlos', cents: 0, prefix: '' };
            if (/abhol/i.test(s)) return { special: 'Abholung', cents: 0, prefix: '' };
            if (/inkl/i.test(s)) return { special: 'inkl. Versand', cents: 0, prefix: '' };
            return { special: s, cents: null, prefix: '' };
        }
        return { special: '', cents: sign * cents, prefix };
    }

    function formatEuroNumber(cents, withDecimals) {
        const euros = Math.floor(Math.abs(cents) / 100);
        const rest = Math.abs(cents) % 100;
        const intStr = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        const sign = cents < 0 ? '-' : '';
        return withDecimals || rest !== 0 ? `${sign}${intStr},${String(rest).padStart(2, '0')}` : `${sign}${intStr}`;
    }

    const formatEuroAmount = (cents, withDecimals) => `${formatEuroNumber(cents, withDecimals)} EUR`;

    /** true, wenn mindestens ein Betrag der Gruppe Nachkommastellen hat -> dann zeigen alle ",00". */
    function moneyGroupNeedsDecimals(values) {
        return values.map(parseMoney).some((m) => m.cents !== null && !m.special && m.cents % 100 !== 0);
    }

    function formatMoneyText(raw, withDecimals = false) {
        const m = parseMoney(raw);
        if (m.special) return m.special;
        return `${m.prefix ? m.prefix + ' ' : ''}${formatEuroAmount(m.cents, withDecimals)}`;
    }

    /** Gemeinsame Spaltenbreiten einer Betragsgruppe, damit Präfix, Betrag und "EUR" untereinander stehen. */
    function moneyLayout(values) {
        const fs = TOKENS.typography.tableFontSize;
        const decimals = moneyGroupNeedsDecimals(values);
        let prefixW = 0;
        let amountW = 0;
        for (const m of values.map(parseMoney)) {
            if (m.special) continue;
            if (m.prefix) prefixW = Math.max(prefixW, Math.ceil(measureTextWidthPt(`${m.prefix}  `, fs, true) * 1.1));
            amountW = Math.max(amountW, Math.ceil(measureTextWidthPt(formatEuroNumber(m.cents, decimals), fs, true) * 1.1) + 1);
        }
        return { decimals, prefixW, amountW };
    }

    /** Tabellenzelle "VB | 10,00 | EUR" – als Block linksbündig, freier Platz bleibt rechts. */
    function buildMoneyCell(raw, layout, bold = false) {
        const m = parseMoney(raw);
        if (m.special) return { text: m.special, bold };
        const num = formatEuroNumber(m.cents, layout.decimals);
        const columns = [];
        if (layout.prefixW) columns.push({ width: layout.prefixW, text: m.prefix || '', bold });
        columns.push({ width: layout.amountW, text: num, alignment: 'right', bold }, { width: '*', text: 'EUR', margin: [3, 0, 0, 0], bold });
        return { columns, columnGap: 0, __plain: `${m.prefix ? `${m.prefix} ` : ''}${num} EUR` };
    }

    /** Summe aus Preis-Bestandteilen. Liefert '' wenn der Grundpreis fehlt. */
    function sumMoney(parts) {
        const parsed = parts.map(parseMoney);
        if (parsed.length === 0 || parsed[0].cents === null) return '';
        let total = 0;
        let prefix = '';
        for (const p of parsed) {
            if (p.cents === null) continue;
            total += p.cents;
            if (p.prefix === 'ab') prefix = 'ab';
            else if (p.prefix === 'VB' && !prefix) prefix = 'VB';
        }
        return { special: '', cents: total, prefix };
    }

    /* ==========================================================================
     * LINKS & RICH TEXT
     * ========================================================================== */

    const URL_REGEX = /(https?:\/\/[^\s<>"')]+[^\s<>"').,;:!?])/g;

    function linkRun(text, url) {
        return { text, link: url, color: TOKENS.colors.link, decoration: 'underline' };
    }

    /** Text -> pdfmake-Inline-Array, URLs werden klickbar. */
    function buildRichTextWithLinks(rawStr) {
        const str = String(rawStr || '');
        if (!URL_REGEX.test(str)) {
            URL_REGEX.lastIndex = 0;
            return buildRichTextWithEmojis(str);
        }
        URL_REGEX.lastIndex = 0;
        const runs = [];
        let last = 0;
        let m;
        while ((m = URL_REGEX.exec(str)) !== null) {
            if (m.index > last) runs.push(str.slice(last, m.index));
            runs.push(linkRun(m[1], m[1]));
            last = m.index + m[1].length;
        }
        if (last < str.length) runs.push(str.slice(last));
        return runs;
    }

    /** Runs aus dem DOM ({text, link}) -> pdfmake-Inline-Array. */
    function buildRunsNode(runs) {
        if (!Array.isArray(runs)) return buildRichTextWithLinks(runs);
        return runs.map((r) => (typeof r === 'string' ? r : r.link ? linkRun(r.text, r.link) : r.text || ''));
    }

    /** "Wert (Link)" bzw. "Wert (DHL Link)". */
    function buildLinkCell(labelValue, url, carrierPrefix = '') {
        const cleanVal = isNa(labelValue) ? 'n/a' : String(labelValue).trim();
        if (!url) {
            return carrierPrefix && cleanVal !== 'n/a' ? `${cleanVal} (${carrierPrefix})` : cleanVal;
        }
        const prefix = carrierPrefix ? `${carrierPrefix} ` : '';
        return {
            text: [`${cleanVal} (${prefix}`, linkRun('Link', url), ')'],
            __plain: `${cleanVal} (${prefix}Link)`
        };
    }

    /* ==========================================================================
     * TABELLEN
     * ========================================================================== */

    function plainOf(cellVal) {
        if (cellVal && typeof cellVal === 'object' && cellVal.__plain) return cellVal.__plain;
        return extractPlainTextFromCell(cellVal);
    }

    /**
     * Metadaten-Tabelle (2 Spalten). Optionen:
     *  - startIndex: Zebra-Streifen setzen die Zählung der vorherigen Tabelle fort
     *  - labelWidth / width: Spaltenbreiten (Label nie umbrechen: Breite wird gemessen)
     * Zeilen mit value === undefined werden ausgelassen.
     */
    function buildMetaTable(rows, options = {}) {
        const startIndex = options.startIndex || 0;
        const totalTableWidth = options.width || TOKENS.page.contentWidthPt;
        const fontSize = TOKENS.typography.tableFontSize;
        const lineHeight = TOKENS.table.cellLineHeight;
        const padX = TOKENS.table.padX;
        const basePadY = TOKENS.table.padY;
        const visible = rows.filter((r) => r && r[1] !== undefined);

        let labelWidth = options.labelWidth || TOKENS.table.defaultLabelWidth;
        for (const [rawLabel] of visible) {
            const measured = Math.ceil(measureTextWidthPt(stripTrailingColon(plainOf(rawLabel)), fontSize, true) * 1.08 + padX * 2 + 4);
            if (measured > labelWidth) labelWidth = measured;
        }
        labelWidth = Math.min(Math.round(totalTableWidth * 0.55), labelWidth);

        const singleLineHeightPt = +(fontSize * 1.17 * lineHeight).toFixed(2);
        const availLabelW = Math.max(30, labelWidth - padX * 2);
        const availValueW = Math.max(50, totalTableWidth - labelWidth - padX * 2);

        const body = visible.map(([rawLabel, val]) => {
            const cleanLabelStr = stripTrailingColon(plainOf(rawLabel));
            const valStr = plainOf(val);
            const isValBold = Boolean(val && typeof val === 'object' && val.bold);
            const labelLines = estimateWrappedLineCount(cleanLabelStr, availLabelW, fontSize, true);
            const valLines = estimateWrappedLineCount(valStr, availValueW, fontSize, isValBold);
            const maxLines = Math.max(labelLines, valLines);
            const labelExtra = ((maxLines - labelLines) * singleLineHeightPt) / 2;
            const valExtra = ((maxLines - valLines) * singleLineHeightPt) / 2;

            const labelCell = {
                text: buildRichTextWithEmojis(cleanLabelStr),
                bold: true,
                fontSize,
                lineHeight,
                color: TOKENS.colors.textLabel,
                margin: [padX, basePadY + labelExtra, padX, basePadY + labelExtra]
            };
            const valMargin = [padX, basePadY + valExtra, padX, basePadY + valExtra];
            let valueCell;
            if (val === null || typeof val === 'string' || typeof val === 'number') {
                valueCell = { text: buildRichTextWithLinks(isNa(val) ? 'n/a' : String(val)), fontSize, lineHeight, color: TOKENS.colors.textPrimary, margin: valMargin };
            } else {
                const clone = { ...val };
                delete clone.__plain;
                valueCell = { fontSize, lineHeight, color: TOKENS.colors.textPrimary, ...clone, margin: valMargin };
            }
            return [labelCell, valueCell];
        });

        if (body.length === 0) return { text: '' };
        return {
            table: { widths: [labelWidth, '*'], body, dontBreakRows: true },
            layout: {
                hLineWidth: () => TOKENS.table.borderWidth,
                vLineWidth: () => TOKENS.table.borderWidth,
                hLineColor: () => TOKENS.colors.tableBorder,
                vLineColor: () => TOKENS.colors.tableBorder,
                fillColor: (rowIndex) => ((rowIndex + startIndex) % 2 === 0 ? TOKENS.colors.tableRowEven : TOKENS.colors.tableRowOdd),
                paddingLeft: () => 0,
                paddingRight: () => 0,
                paddingTop: () => 0,
                paddingBottom: () => 0
            },
            __rowCount: body.length
        };
    }

    function rowCountOf(tableNode) {
        return tableNode && tableNode.__rowCount ? tableNode.__rowCount : 0;
    }

    function buildTitleBar(titleText, platform = 'auto', options = {}) {
        const theme = getTheme(platform);
        const node = {
            table: {
                widths: ['*'],
                body: [[{
                    text: buildRichTextWithEmojis(titleText || 'Unbekannter Artikel'),
                    fontSize: TOKENS.typography.titleHeaderSize,
                    lineHeight: 1.08,
                    bold: true,
                    color: theme.headerText,
                    fillColor: theme.headerFill,
                    margin: [8, 6, 8, 5]
                }]]
            },
            layout: {
                hLineWidth: () => 1,
                vLineWidth: () => 1,
                hLineColor: () => theme.headerBorder,
                vLineColor: () => theme.headerBorder,
                paddingLeft: () => 0,
                paddingRight: () => 0,
                paddingTop: () => 0,
                paddingBottom: () => 0
            },
            margin: [0, 0, 0, 8]
        };
        if (options.pageBreak) node.pageBreak = options.pageBreak;
        return node;
    }

    /** Abschnittsüberschrift. headlineLevel 1 => wird per pageBreakBefore nie allein unten auf einer Seite stehen gelassen. */
    function buildSectionHeader(titleText, platform = 'auto', options = {}) {
        const theme = getTheme(platform);
        return {
            text: buildRichTextWithEmojis(stripTrailingColon(titleText)),
            fontSize: TOKENS.typography.sectionHeaderSize,
            bold: true,
            color: options.color || theme.sectionHeaderColor || TOKENS.colors.textDark,
            margin: options.margin || [0, 10, 0, 6],
            headlineLevel: 1
        };
    }

    function formatExportTimestamp(date = new Date()) {
        const p2 = (n) => String(n).padStart(2, '0');
        const tzIana = (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'Europe/Berlin';
        const tzShort = new Intl.DateTimeFormat('de-DE', { timeZoneName: 'short' })
            .formatToParts(date)
            .find((part) => part.type === 'timeZoneName')?.value || 'MEZ';
        return `${p2(date.getDate())}.${p2(date.getMonth() + 1)}.${date.getFullYear()} ${p2(date.getHours())}:${p2(date.getMinutes())}:${p2(date.getSeconds())} ${tzShort} (${tzIana})`;
    }

    function buildExportedAtNode(exportedAtStr) {
        return {
            text: `${META_LABELS.EXPORTED_AT} ${exportedAtStr || formatExportTimestamp()}`,
            alignment: 'right',
            fontSize: TOKENS.typography.exportTimestampSize,
            bold: true,
            color: TOKENS.colors.textExportedAt,
            margin: [0, 4, 0, 10]
        };
    }

    /* ==========================================================================
     * META-SEKTIONEN (Nachrichtenverlauf & Anzeige)
     * ========================================================================== */

    const linkOrText = (value, url) => (isNa(value) ? 'n/a' : url ? buildLinkCell(value, url) : String(value));

    /**
     * Chat-Metadaten (Seite 1):
     * Oben:  Anzeigen-ID, Nachrichten-ID, [Bestellnummer], Quelle, Erstellt mit, Kategorie, Anzeigentyp
     * Mitte: links Preis/Versand/Gesamtbetrag (Anzeige) | rechts Preis/Versand/[Käuferschutz]/Gesamtbetrag
     * Unten: [Zahlungsart], Sendungsverfolgungsnummer, Eingestellt am, Käufername, Verkäufername, Verkäufer-Typ, Aktiv seit
     * Zebra-Streifen laufen über alle drei Tabellen durch.
     */
    function buildChatMetaSection(model) {
        const meta = model.meta || {};
        const caps = model.capabilities || {};
        const L = { ...META_LABELS, ...(model.labels || {}) };
        const width = TOKENS.page.contentWidthPt;

        const topRows = [
            [L.AD_ID, linkOrText(meta.adId, meta.adUrl)],
            [L.CONV_ID, linkOrText(meta.conversationId, meta.conversationUrl)],
            caps.orderId ? [L.ORDER_ID, linkOrText(meta.orderId, meta.orderUrl)] : null,
            [L.SOURCE, model.platformLabel || 'n/a'],
            [L.CREATED_WITH, model.scriptLabel || 'n/a'],
            [L.CATEGORY, meta.category || 'n/a'],
            [L.AD_TYPE, meta.adType || 'n/a']
        ];
        const top = buildMetaTable(topRows, { startIndex: 0, width });
        let idx = rowCountOf(top);

        const neg = (v) => {
            const m = parseMoney(v);
            return m.cents === null ? m : { ...m, cents: -Math.abs(m.cents) };
        };
        const fees = caps.fees && meta.role === 'SELLER' && !isNa(meta.orderId);
        const listedTotal = sumMoney([meta.listedPrice, meta.listedShipping]);
        const showFee = caps.buyerProtection && parseMoney(meta.buyerProtection).cents > 0;
        const agreedTotal = sumMoney([meta.price, meta.shipping, showFee ? meta.buyerProtection : 0, fees ? neg(meta.refund) : 0]);
        const feeParts = [meta.transactionFee, meta.adFee, meta.shippingActual];
        const earnings = !fees ? '' : feeParts.some(isNa) ? 'n/a' : sumMoney([agreedTotal || null, ...feeParts.map(neg)]);
        const qty = parseInt(meta.quantity, 10);

        const leftValues = [meta.listedPrice, meta.listedShipping, listedTotal];
        const rightValues = fees
            ? [meta.price, meta.shipping, neg(meta.refund), agreedTotal, neg(meta.transactionFee), neg(meta.adFee), neg(meta.shippingActual), earnings]
            : [meta.price, meta.shipping, showFee ? meta.buyerProtection : null, agreedTotal].filter((v) => v !== null);
        const layout = moneyLayout([...leftValues, ...rightValues]);
        const cell = (v, bold = false) => buildMoneyCell(v || 'n/a', layout, bold);

        const leftRows = [
            [L.LISTED_PRICE, cell(meta.listedPrice)],
            [L.LISTED_SHIPPING, cell(meta.listedShipping)],
            [L.LISTED_TOTAL, cell(listedTotal, true)]
        ];
        const rightRows = [
            [qty > 1 ? `${L.AGREED_PRICE} (${qty} Stück)` : L.AGREED_PRICE, cell(meta.price)],
            [L.AGREED_SHIPPING, cell(meta.shipping)],
            showFee ? [L.BUYER_PROTECTION, cell(meta.buyerProtection)] : null,
            fees ? [L.REFUND, cell(neg(meta.refund))] : null,
            [L.TOTAL_AMOUNT, cell(agreedTotal, true)],
            fees ? [L.TRANSACTION_FEE, cell(neg(meta.transactionFee))] : null,
            fees ? [L.AD_FEE, cell(neg(meta.adFee))] : null,
            fees ? [L.SHIPPING_ACTUAL, cell(neg(meta.shippingActual))] : null,
            fees ? [L.EARNINGS, cell(earnings, true)] : null
        ].filter(Boolean);

        const gap = TOKENS.table.priceBlockGapPt;
        const halfWidth = Math.floor((width - gap) / 2);
        const halfLabel = Math.round(halfWidth * 0.52);
        const left = buildMetaTable(leftRows, { startIndex: idx, width: halfWidth, labelWidth: halfLabel });
        const right = buildMetaTable(rightRows, { startIndex: idx, width: halfWidth, labelWidth: halfLabel });
        idx += Math.max(rowCountOf(left), rowCountOf(right));

        const bottomRows = [
            caps.paymentMethod ? [L.PAYMENT_METHOD, { text: meta.paymentMethod || 'n/a', bold: !isNa(meta.paymentMethod) }] : null,
            [L.TRACKING_ID, isNa(meta.trackingId) ? 'n/a' : buildLinkCell(meta.trackingId, meta.trackingUrl || '', meta.trackingCarrier || '')],
            [L.CREATED_DATE, formatDateWithRelativeAge(meta.createdAt, 'days')],
            [L.BUYER_NAME, linkOrText(meta.buyerName, meta.buyerUrl)],
            [L.SELLER_NAME, linkOrText(meta.sellerName, meta.sellerUrl)],
            [L.SELLER_TYPE, meta.sellerType || 'n/a'],
            [L.SELLER_SINCE, formatDateWithRelativeAge(meta.sellerActiveSince, 'activeSince')]
        ];
        const bottom = buildMetaTable(bottomRows, { startIndex: idx, width });

        return {
            stack: [
                top,
                { columns: [{ width: halfWidth, stack: [left] }, { width: gap, text: '' }, { width: halfWidth, stack: [right] }], columnGap: 0, margin: [0, 6, 0, 6] },
                bottom,
                buildExportedAtNode(model.exportedAt)
            ]
        };
    }

    /**
     * Anzeigen-Metadaten (eigene Seite):
     * Anzeigen-ID, Quelle, Erstellt mit, Kategorie, Anzeigentyp, Preis/Versand/Gesamtbetrag (Anzeige),
     * Ort (nicht bei eigenen Artikeln), Eingestellt am, [Angebotsdauer, Abholung, Käufername], Verkäufername, Verkäufer-Typ, Aktiv seit
     * Danach "Artikelmerkmale" (Streifen laufen weiter) und darunter der Export-Zeitstempel.
     */
    function buildAdMetaSection(model) {
        const meta = model.meta || {};
        const L = { ...META_LABELS, ...(model.labels || {}) };
        const width = TOKENS.page.contentWidthPt;
        const listedTotal = sumMoney([meta.listedPrice, meta.listedShipping]);
        const layout = moneyLayout([meta.listedPrice, meta.listedShipping, listedTotal]);
        const isOwnAd = meta.role === 'SELLER';
        const mapsUrl = !isNa(meta.location) ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(meta.location)}` : '';
        const optional = (label, value) => (isNa(value) ? null : [label, String(value)]);

        const rows = [
            [L.AD_ID, linkOrText(meta.adId, meta.adUrl)],
            [L.SOURCE, model.platformLabel || 'n/a'],
            [L.CREATED_WITH, model.scriptLabel || 'n/a'],
            [L.CATEGORY, meta.category || 'n/a'],
            [L.AD_TYPE, meta.adType || 'n/a'],
            [L.LISTED_PRICE, buildMoneyCell(meta.listedPrice || 'n/a', layout)],
            [L.LISTED_SHIPPING, buildMoneyCell(meta.listedShipping || 'n/a', layout)],
            [L.LISTED_TOTAL, buildMoneyCell(listedTotal || 'n/a', layout, true)],
            isOwnAd ? null : [L.LOCATION, linkOrText(meta.location, mapsUrl)],
            [L.CREATED_DATE, formatDateWithRelativeAge(meta.createdAt, 'days')],
            optional(L.LISTING_DURATION, meta.listingDuration),
            optional(L.PICKUP, meta.pickup),
            isOwnAd && !isNa(meta.buyerName) ? [L.BUYER_NAME, linkOrText(meta.buyerName, meta.buyerUrl)] : null,
            [L.SELLER_NAME, linkOrText(meta.sellerName, meta.sellerUrl)],
            [L.SELLER_TYPE, meta.sellerType || 'n/a'],
            [L.SELLER_SINCE, formatDateWithRelativeAge(meta.sellerActiveSince, 'activeSince')]
        ];
        const table = buildMetaTable(rows, { width });
        const stack = [table];

        const attrs = normalizeAttributes(model.attributes);
        if (attrs.length > 0) {
            const attrTable = buildMetaTable(attrs.map((a) => [a.name, a.value]), { startIndex: rowCountOf(table), width });
            stack.push(keepTogether([buildSectionHeader('Artikelmerkmale', model.platform, { margin: [0, 12, 0, 6] }), attrTable], false));
        }
        stack.push(buildExportedAtNode(model.exportedAt));
        return { stack };
    }

    function normalizeAttributes(list) {
        const seen = new Set();
        const out = [];
        for (const a of Array.isArray(list) ? list : []) {
            const name = stripTrailingColon(Array.isArray(a) ? a[0] : a && (a.name || a.label));
            const value = String((Array.isArray(a) ? a[1] : a && a.value) || '').trim();
            if (!name || !value || seen.has(name.toLowerCase())) continue;
            seen.add(name.toLowerCase());
            out.push({ name, value });
        }
        return out;
    }

    function buildDescriptionBlock(descriptionText, platform = 'auto') {
        if (!descriptionText || !String(descriptionText).trim()) return [];
        const bodyNode = buildParagraphNodeWithColorEmojis(descriptionText, {
            fontSize: TOKENS.typography.bodyFontSize,
            lineHeight: TOKENS.page.defaultLineHeight,
            color: TOKENS.colors.textDesc,
            maxWidthPt: TOKENS.page.contentWidthPt - 20,
            withLinks: true
        });
        return [
            buildSectionHeader('Beschreibung', platform, { margin: [0, 6, 0, 4] }),
            {
                table: { widths: ['*'], body: [[{ stack: Array.isArray(bodyNode.stack) ? bodyNode.stack : [bodyNode], margin: [8, 6, 8, 6] }]] },
                layout: {
                    hLineWidth: () => 0.5,
                    vLineWidth: () => 0.5,
                    hLineColor: () => TOKENS.colors.descBoxBorder,
                    vLineColor: () => TOKENS.colors.descBoxBorder,
                    fillColor: () => TOKENS.colors.descBoxBg,
                    paddingLeft: () => 0,
                    paddingRight: () => 0,
                    paddingTop: () => 0,
                    paddingBottom: () => 0
                },
                margin: [0, 0, 0, 10]
            }
        ];
    }

    /* ==========================================================================
     * ABGERUNDETE KARTEN (SVG-Kappen oben/unten + Tabellen-Mittelteil)
     * ========================================================================== */

    // pdfmake zeichnet die Seitenlinie mit ihrer Mitte eine halbe Strichbreite AUSSERHALB des Zellinhalts;
    // die SVG-Kappen sind daher um je eine Strichbreite breiter und ihr Strich liegt exakt auf dieser Linienmitte.
    const CARD_STROKE = 0.8;
    const CARD_OFF = CARD_STROKE / 2;
    const f2 = (n) => +n.toFixed(2);

    function buildRoundedTopCapSvg(widthPt, radiusPt, fillColor, strokeColor = '') {
        const w = Math.max(40, Math.round(widthPt));
        const r = Math.min(12, Math.max(4, Math.round(radiusPt)));
        const k = f2(r * 0.55228475);
        const o = strokeColor ? CARD_OFF : 0;
        const x0 = o;
        const x1 = w + 3 * o;
        const W = x1 + o;
        const h = r + o;
        const y0 = o;
        const arc = `M ${x0} ${h + 1} L ${x0} ${y0 + r} C ${x0} ${f2(y0 + r - k)}, ${f2(x0 + r - k)} ${y0}, ${x0 + r} ${y0} L ${f2(x1 - r)} ${y0} C ${f2(x1 - r + k)} ${y0}, ${x1} ${f2(y0 + r - k)}, ${x1} ${y0 + r} L ${x1} ${h + 1}`;
        const strokeTag = strokeColor ? `<path d="${arc}" fill="none" stroke="${strokeColor}" stroke-width="${CARD_STROKE}"/>` : '';
        return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}"><path d="${arc} Z" fill="${fillColor}"/>${strokeTag}</svg>`, width: W, offset: 2 * o };
    }

    function buildRoundedBottomCapSvg(widthPt, radiusPt, fillColor, roundLeft, roundRight, strokeColor = '') {
        const w = Math.max(40, Math.round(widthPt));
        const r = Math.min(12, Math.max(4, Math.round(radiusPt)));
        const k = f2(r * 0.55228475);
        const o = strokeColor ? CARD_OFF : 0;
        const x0 = o;
        const x1 = w + 3 * o;
        const W = x1 + o;
        const yb = r;
        const right = roundRight ? `L ${x1} 0 C ${x1} ${k}, ${f2(x1 - r + k)} ${yb}, ${f2(x1 - r)} ${yb}` : `L ${x1} 0 L ${x1} ${yb}`;
        const left = roundLeft ? `L ${x0 + r} ${yb} C ${f2(x0 + r - k)} ${yb}, ${x0} ${k}, ${x0} 0` : `L ${x0} ${yb} L ${x0} 0`;
        const fill = `<path d="M ${x0} -1 L ${x1} -1 ${right} ${left} Z" fill="${fillColor}"/>`;
        const strokeTag = strokeColor ? `<path d="M ${x1} -1 ${right} ${left} L ${x0} -1" fill="none" stroke="${strokeColor}" stroke-width="${CARD_STROKE}"/>` : '';
        return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${yb + o}" viewBox="0 0 ${W} ${yb + o}">${fill}${strokeTag}</svg>`, width: W, offset: 2 * o };
    }

    function buildRoundedCardPdfNode({ widthPt, radiusPt = 9, fillColor, strokeColor = '', roundBottomLeft = true, roundBottomRight = true, bodyStack, padX = 9 }) {
        const w = Math.round(widthPt);
        const hasStroke = Boolean(strokeColor);
        const fill = fillColor || '#ffffff';
        const top = buildRoundedTopCapSvg(w, radiusPt, fill, strokeColor);
        const bottom = buildRoundedBottomCapSvg(w, radiusPt, fill, roundBottomLeft, roundBottomRight, strokeColor);
        const noBorder = [false, false, false, false];
        return {
            table: {
                widths: [w],
                body: [
                    [{ svg: top.svg, width: top.width, border: noBorder, margin: [-top.offset, -top.offset, -top.offset, -0.6] }],
                    [{ stack: bodyStack, fillColor: fill, border: [hasStroke, false, hasStroke, false], margin: [padX, 0, padX, 0] }],
                    [{ svg: bottom.svg, width: bottom.width, border: noBorder, margin: [-bottom.offset, -0.6, -bottom.offset, -bottom.offset] }]
                ]
            },
            layout: {
                hLineWidth: () => 0,
                vLineWidth: () => (hasStroke ? CARD_STROKE : 0),
                vLineColor: () => strokeColor || fill,
                paddingLeft: () => 0,
                paddingRight: () => 0,
                paddingTop: () => 0,
                paddingBottom: () => 0
            }
        };
    }

    /* ==========================================================================
     * CHAT-BAUSTEINE
     * ========================================================================== */

    function buildAvatarCircleSvg(initial, bgHex, textHex) {
        const cleanChar = String(initial || '?').trim().slice(0, 1).toUpperCase().replace(/[<>&"']/g, '') || '?';
        return `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="13" fill="${bgHex}"/><text x="13" y="17.5" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="12" font-weight="bold" fill="${textHex}">${cleanChar}</text></svg>`;
    }

    function buildOfferStatusBadgeSvg(status) {
        if (status === 'accepted') {
            return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#16a34a"/><path d="M7 12.5l3.2 3.2L17.5 8.5" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        }
        if (status === 'expired') {
            return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#707070"/><path d="M12 7v5l3 2" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        }
        if (status === 'declined') {
            return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#d50b0b"/><path d="M8 8l8 8M16 8l-8 8" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round"/></svg>';
        }
        return '';
    }

    const lineHeightPt = (fontSize, lh = TOKENS.page.defaultLineHeight) => fontSize * 1.17 * lh;

    /** Bilder innerhalb einer Bubble: 1 Bild groß, mehrere als 2er-Raster. Liefert {nodes, heightPt, widthPt}. */
    function buildBubbleImages(images, innerMaxW) {
        const list = (images || []).filter((i) => i && i.dataUrl);
        if (list.length === 0) return { nodes: [], heightPt: 0, widthPt: 0 };
        const captionSize = TOKENS.typography.attachmentCaptionSize;
        const caption = (img) => (img.filename ? { text: img.filename, fontSize: captionSize, italics: true, color: TOKENS.colors.textMuted, margin: [0, 1, 0, 3], alignment: 'center' } : null);
        if (list.length === 1) {
            const fit = Math.min(TOKENS.chat.singleImageFitPt, innerMaxW);
            const img = list[0];
            const scale = Math.min(fit / (img.width || fit), fit / (img.height || fit));
            const h = Math.round((img.height || fit) * scale);
            const w = Math.round((img.width || fit) * scale);
            return { nodes: [{ image: img.dataUrl, fit: [fit, fit], margin: [0, 2, 0, 1] }, caption(img)].filter(Boolean), heightPt: h + 16, widthPt: w };
        }
        const cell = Math.min(TOKENS.chat.multiImageFitPt, Math.floor((innerMaxW - 6) / 2));
        const nodes = [];
        for (let i = 0; i < list.length; i += 2) {
            const mk = (img) => (img ? { width: cell, stack: [{ image: img.dataUrl, fit: [cell, cell], alignment: 'center' }, caption(img)].filter(Boolean) } : { width: cell, text: '' });
            nodes.push({ columns: [mk(list[i]), mk(list[i + 1])], columnGap: 6, margin: [0, 2, 0, 2] });
        }
        return { nodes, heightPt: Math.ceil(list.length / 2) * (cell + 16), widthPt: cell * 2 + 6 };
    }

    function buildLinkCardNode(card, innerW) {
        const thumb = card.imageDataUrl ? { image: card.imageDataUrl, fit: [38, 38], width: 40 } : { width: 0, text: '' };
        return {
            table: {
                widths: [innerW - 2],
                body: [[{
                    columns: [
                        thumb,
                        {
                            width: '*',
                            stack: [
                                { text: buildRichTextWithEmojis(card.title || card.url), fontSize: 8.5, bold: true, color: TOKENS.colors.textDark },
                                card.url ? { text: [linkRun(card.actionLabel || 'Artikel ansehen', card.url)], fontSize: 8, margin: [0, 2, 0, 0] } : { text: '' }
                            ]
                        }
                    ],
                    columnGap: 6,
                    margin: [5, 5, 5, 5]
                }]]
            },
            layout: {
                hLineWidth: () => 0.6, vLineWidth: () => 0.6,
                hLineColor: () => '#d1d5db', vLineColor: () => '#d1d5db',
                fillColor: () => '#ffffff',
                paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0
            },
            margin: [0, 4, 0, 2]
        };
    }

    /** Übersetzungs-Block unter dem Text: Linie + Label + übersetzter Text. */
    function buildTranslationNodes(msg, textColor, availW) {
        const tr = msg.translation;
        if (!tr || !tr.text) return { nodes: [], heightPt: 0 };
        const label = tr.label || 'Übersetzung';
        const nodes = [
            { canvas: [{ type: 'line', x1: 0, y1: 0, x2: Math.max(30, availW), y2: 0, lineWidth: 0.5, lineColor: TOKENS.colors.translationRule }], margin: [0, 4, 0, 2] },
            { text: label, fontSize: 7, italics: true, color: TOKENS.colors.textMuted, margin: [0, 0, 0, 1] },
            buildParagraphNodeWithColorEmojis(tr.text, { fontSize: 9, color: textColor, maxWidthPt: availW, italics: true })
        ];
        const lines = estimateWrappedLineCount(tr.text, availW, 9, false);
        return { nodes, heightPt: 16 + lines * lineHeightPt(9) };
    }

    /** Text-/Bild-Bubble (OUTBOUND/INBOUND) inkl. Bilder, Link-Karten und Übersetzung. */
    function buildChatBubbleNode(msg, platform = 'auto') {
        const theme = getTheme(platform);
        const b = theme.bubble;
        const isOwn = Boolean(msg.isOwn);
        const maxW = Math.round(TOKENS.page.contentWidthPt * TOKENS.chat.maxBubbleShare);
        const fillColor = isOwn ? b.outboundFill : b.inboundFill;
        const strokeColor = isOwn ? b.outboundBorder : b.inboundBorder;
        const textColor = isOwn ? b.outboundText : b.inboundText;
        const fs = TOKENS.typography.bodyFontSize;

        const textForWidth = [msg.text, msg.translation && msg.translation.text].filter(Boolean).join('\n');
        let longest = textForWidth ? measureTextWidthPt(textForWidth, fs, false) + (hasColorEmoji(textForWidth) ? 14 : 0) : 0;
        const imgs = buildBubbleImages(msg.images, maxW - b.padX * 2);
        longest = Math.max(longest, imgs.widthPt);
        if (msg.translation && msg.translation.label) longest = Math.max(longest, measureTextWidthPt(msg.translation.label, 7, false));
        if (msg.translationNote) longest = Math.max(longest, Math.min(240, measureTextWidthPt(msg.translationNote, 7, false)));
        if (Array.isArray(msg.linkCards) && msg.linkCards.length) longest = Math.max(longest, 220);

        const widthPt = Math.min(maxW, Math.max(TOKENS.chat.minBubbleWidthPt, Math.ceil(longest + b.padX * 2 + 4)));
        const innerW = Math.max(40, widthPt - b.padX * 2);
        const stack = [];
        let height = b.padY * 2;

        if (imgs.nodes.length) {
            stack.push(...imgs.nodes);
            height += imgs.heightPt;
        }
        if (msg.text) {
            stack.push(buildParagraphNodeWithColorEmojis(msg.text, { fontSize: fs, color: textColor, maxWidthPt: innerW, withLinks: true }));
            height += estimateWrappedLineCount(msg.text, innerW, fs, false) * lineHeightPt(fs);
        } else if (msg.textUnavailableNote) {
            stack.push({ text: msg.textUnavailableNote, fontSize: 8, italics: true, color: TOKENS.colors.textMuted });
            height += lineHeightPt(8);
        }
        const tr = buildTranslationNodes(msg, textColor, innerW);
        if (tr.nodes.length) {
            stack.push(...tr.nodes);
            height += tr.heightPt;
        }
        if (msg.translationNote) {
            stack.push({ text: msg.translationNote, fontSize: 7, italics: true, color: TOKENS.colors.textMuted, margin: [0, 3, 0, 0] });
            height += estimateWrappedLineCount(msg.translationNote, innerW, 7, false) * lineHeightPt(7) + 3;
        }
        for (const card of msg.linkCards || []) {
            stack.push(buildLinkCardNode(card, innerW));
            height += 52;
        }
        if (stack.length === 0) stack.push({ text: ' ' });

        const bubbleNode = buildRoundedCardPdfNode({
            widthPt,
            radiusPt: b.radiusPt,
            fillColor,
            strokeColor,
            roundBottomLeft: b.sharpCornerOnSendersSide ? isOwn : true,
            roundBottomRight: b.sharpCornerOnSendersSide ? !isOwn : true,
            padX: b.padX,
            bodyStack: [{ stack, margin: [0, Math.max(0, b.padY - b.radiusPt / 2), 0, Math.max(0, b.padY - b.radiusPt / 2)] }]
        });
        return { bubbleNode, widthPt, heightPt: Math.round(height + b.radiusPt), isOwn };
    }

    /** Preisvorschlag als umrandete Bubble (eBay-Optik): Status-Icon + Titel, darunter großer Betrag. */
    function buildOfferBubbleNode(msg, platform = 'auto') {
        const theme = getTheme(platform);
        const o = theme.offer;
        const isOwn = Boolean(msg.isOwn);
        const offer = msg.offer || {};
        const title = cleanTextPreserveEmojis(offer.title || 'Preisvorschlag');
        const amount = isNa(offer.amount) ? '' : formatMoneyText(offer.amount, moneyGroupNeedsDecimals([offer.amount]));
        const badge = buildOfferStatusBadgeSvg(offer.status);
        const titleW = measureTextWidthPt(title, o.titleSize, true) + (badge ? 20 : 0);
        const amountW = measureTextWidthPt(amount, o.amountSize, true);
        const widthPt = Math.min(Math.round(TOKENS.page.contentWidthPt * TOKENS.chat.maxBubbleShare), Math.max(150, Math.ceil(Math.max(titleW, amountW) + 28)));

        const titleNode = badge
            ? { columns: [{ svg: badge, width: 12, margin: [0, 0.5, 0, 0] }, { width: '*', text: title, bold: true, fontSize: o.titleSize, color: '#000000' }], columnGap: 5 }
            : { text: title, bold: true, fontSize: o.titleSize, color: '#000000' };
        const stack = [titleNode];
        if (amount) stack.push({ text: amount, bold: true, fontSize: o.amountSize, color: '#000000', margin: [0, 3, 0, 0] });
        if (msg.text) stack.push({ text: buildRichTextWithLinks(msg.text), fontSize: 9, color: TOKENS.colors.textDesc, margin: [0, 4, 0, 0] });

        const bubbleNode = buildRoundedCardPdfNode({
            widthPt,
            radiusPt: 12,
            fillColor: o.fill,
            strokeColor: isOwn ? o.ownBorder : o.partnerBorder,
            padX: 12,
            bodyStack: [{ stack, margin: [0, 2, 0, 2] }]
        });
        return { bubbleNode, widthPt, heightPt: 24 + lineHeightPt(o.titleSize) + (amount ? lineHeightPt(o.amountSize) : 0), isOwn };
    }

    function buildMessageSubtextNode(text, alignment = 'left', margin = [2, 2, 2, 0]) {
        return { text: buildRichTextWithEmojis(text), fontSize: TOKENS.typography.messageTimestampSize, color: TOKENS.colors.textTimestamp, alignment, margin };
    }

    /** Eine Chat-Zeile (Bubble + Avatar + Zeitstempel) – unzerbrechlich. */
    function buildChatMessageRow(msg, options = {}) {
        const platform = options.platform || 'auto';
        const theme = getTheme(platform);
        const built = msg.kind === 'offer' ? buildOfferBubbleNode(msg, platform) : buildChatBubbleNode(msg, platform);
        const { bubbleNode, widthPt, heightPt, isOwn } = built;
        const content = TOKENS.page.contentWidthPt;

        const sub = [];
        if (msg.warningText) {
            sub.push({ text: buildRichTextWithEmojis(msg.warningText), fontSize: 8, bold: true, color: TOKENS.colors.textWarning, alignment: isOwn ? 'right' : 'left', margin: [2, 2, 2, 0] });
        }
        const ts = normalizeMessageTimestamp(msg.timestamp, msg.date || options.fallbackDate || '');
        const tsLabel = [ts, msg.subtext].filter(Boolean).join(' · ');
        if (tsLabel) sub.push(buildMessageSubtextNode(tsLabel, isOwn ? 'right' : 'left'));

        if (isOwn) {
            return {
                columns: [{ width: Math.max(0, content - widthPt), text: '' }, { width: widthPt, stack: [bubbleNode, ...sub] }],
                columnGap: 0,
                unbreakable: true,
                margin: [0, 2, 0, 6]
            };
        }

        const avatar = options.avatar || {};
        const size = TOKENS.chat.avatarSizePt;
        const colW = TOKENS.chat.avatarColWidthPt;
        const top = Math.max(0, Math.round(heightPt - size));
        const avatarCol = avatar.dataUrl
            ? { width: colW, image: avatar.dataUrl, fit: [size, size], margin: [0, top, 0, 0] }
            : { width: colW, stack: [{ svg: buildAvatarCircleSvg(avatar.letter || 'U', avatar.bg || theme.avatar.bg, avatar.fg || theme.avatar.fg), width: size, margin: [0, top, 0, 0] }] };
        const rest = Math.max(0, content - colW - widthPt);
        const rowStack = [{ columns: [avatarCol, { width: widthPt, stack: [bubbleNode] }, { width: rest, text: '' }], columnGap: 0 }];
        if (sub.length) rowStack.push({ columns: [{ width: colW, text: '' }, { width: widthPt, stack: sub }, { width: rest, text: '' }], columnGap: 0 });
        return { stack: rowStack, unbreakable: true, margin: [0, 2, 0, 6] };
    }

    /**
     * Systemkarte (Kleinanzeigen "Bezahlung angefragt / Anfrage erhalten / Artikel bezahlt", eBay-Hinweise):
     * Titel, optional großer Betrag, optional Aufschlüsselung, Trennlinie, Text. Darunter "Datum · Automatische Nachricht".
     */
    function buildSystemMessageNode(msg, options = {}) {
        const theme = getTheme(options.platform);
        const c = theme.card;
        const isNotice = msg.kind === 'notice';
        const width = TOKENS.page.contentWidthPt;
        const inner = width - 24;
        const stack = [];
        const titleRow = msg.status ? buildOfferStatusBadgeSvg(msg.status) : '';
        const titleText = { text: buildRichTextWithEmojis(msg.title || (isNotice ? 'Hinweis' : 'Systemnachricht')), bold: true, fontSize: c.eyebrowSize, color: '#0c0c0b' };
        stack.push(titleRow ? { columns: [{ svg: titleRow, width: 12, margin: [0, 1, 0, 0] }, { width: '*', ...titleText }], columnGap: 5 } : titleText);
        if (!isNa(msg.amount) && msg.amount) {
            stack.push({ text: formatMoneyText(msg.amount, moneyGroupNeedsDecimals([msg.amount])), bold: true, fontSize: c.amountSize, color: '#0c0c0b', margin: [0, 4, 0, 0] });
        }
        if (Array.isArray(msg.breakdown) && msg.breakdown.length) {
            const dec = moneyGroupNeedsDecimals(msg.breakdown.map((r) => r.value));
            stack.push({
                table: { widths: ['*', 'auto'], body: msg.breakdown.map((r) => [{ text: r.label, fontSize: 9, color: '#33322e' }, { text: formatMoneyText(r.value, dec), fontSize: 9, alignment: 'right', color: '#33322e' }]) },
                layout: 'noBorders',
                margin: [0, 4, 0, 0]
            });
        }
        if (msg.text || msg.runs) {
            if (!isNotice) stack.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: inner, y2: 0, lineWidth: 0.5, lineColor: '#e0deda' }], margin: [0, 7, 0, 5] });
            stack.push(msg.runs
                ? { text: buildRunsNode(msg.runs), fontSize: 9, color: '#33322e', lineHeight: 1.25 }
                : buildParagraphNodeWithColorEmojis(msg.text, { fontSize: 9, color: '#33322e', maxWidthPt: inner, withLinks: true }));
        }
        const card = buildRoundedCardPdfNode({
            widthPt: width,
            radiusPt: c.radiusPt,
            fillColor: isNotice ? TOKENS.colors.noticeFill : c.fill,
            strokeColor: isNotice ? TOKENS.colors.noticeBorder : c.border,
            padX: 12,
            bodyStack: [{ stack, margin: [0, 2, 0, 2] }]
        });
        const ts = normalizeMessageTimestamp(msg.timestamp, msg.date || options.fallbackDate || '');
        const footer = [ts, 'Automatische Nachricht'].filter(Boolean).join(' · ');
        return { stack: [card, buildMessageSubtextNode(footer, 'right', [0, 2, 2, 0])], unbreakable: true, margin: [0, 3, 0, 8] };
    }

    /**
     * Sicherheitshinweis über dem Chat.
     * Kleinanzeigen: Logo, "Über <Partner>", "Aktiv seit …", grüne Pille mit klickbaren Links.
     * eBay: Hinweistext mit klickbaren Links.
     */
    function buildSecurityNoticeNode(notice, platform) {
        if (!notice) return null;
        const theme = getTheme(platform);
        if (notice.style === 'plain') {
            // eBay: schlichter, hellgrauer Hinweistext ohne Rahmen (wie im Original)
            return { text: buildRunsNode(notice.runs), fontSize: 8, color: TOKENS.colors.textTimestamp, lineHeight: 1.25, margin: [0, 2, 0, 10] };
        }
        const width = TOKENS.page.contentWidthPt;
        const stack = [];
        if (notice.logoDataUrl) stack.push({ image: notice.logoDataUrl, width: notice.logoWidthPt || 92, margin: [0, 0, 0, 6] });
        if (notice.title) stack.push({ text: notice.title, bold: true, fontSize: 10, color: '#0c0c0b' });
        if (notice.subtitle) stack.push({ text: notice.subtitle, fontSize: 8.5, color: TOKENS.colors.textTimestamp, margin: [0, 2, 0, 0] });
        if (notice.runs && notice.runs.length) {
            const textNode = { text: buildRunsNode(notice.runs), fontSize: 8.5, color: theme.securityPill.text, lineHeight: 1.25 };
            stack.push({
                table: { widths: ['*'], body: [[{ ...textNode, fillColor: theme.securityPill.fill, margin: [7, 5, 7, 5] }]] },
                layout: 'noBorders',
                margin: [0, stack.length ? 6 : 0, 0, 0]
            });
        }
        const card = buildRoundedCardPdfNode({ widthPt: width, radiusPt: theme.card.radiusPt, fillColor: '#ffffff', strokeColor: theme.card.border, padX: 10, bodyStack: [{ stack, margin: [0, 2, 0, 2] }] });
        return { stack: [card, buildMessageSubtextNode('Automatische Nachricht', 'right', [0, 2, 2, 0])], unbreakable: true, margin: [0, 2, 0, 10] };
    }

    function buildDateSeparatorNode(dateText) {
        return { text: buildRichTextWithEmojis(dateText), alignment: 'center', fontSize: TOKENS.typography.dateSeparatorSize, bold: true, color: TOKENS.colors.textMuted, margin: [0, 8, 0, 6] };
    }

    function buildEndOfChatNode() {
        return {
            text: buildRichTextWithEmojis('\u2E3B Ende des Nachrichtenverlaufs \u2E3B'),
            alignment: 'center',
            fontSize: TOKENS.typography.endOfChatSize,
            bold: true,
            color: TOKENS.colors.textMuted,
            margin: [0, 14, 0, 14]
        };
    }

    /** Fasst Knoten zu einem unzerbrechlichen Block zusammen (z. B. Datum + erste Nachricht, Überschrift + erste Bildzeile). */
    function keepTogether(nodes, unbreakable = true) {
        const flat = nodes.filter(Boolean);
        return unbreakable ? { stack: flat, unbreakable: true } : { stack: flat };
    }

    /**
     * Nachrichtenverlauf. Das Datum wird immer zusammen mit der ersten Nachricht des Tages gesetzt
     * (kein Seitenumbruch zwischen Datum und Bubble).
     */
    function buildChatHistoryNodes(messages, options = {}) {
        const platform = options.platform || 'auto';
        const nodes = [];
        let lastGroup = '';
        let lastDate = '';
        let pendingSeparator = null;

        for (const msg of Array.isArray(messages) ? messages : []) {
            if (msg.date && /\d/.test(msg.date)) lastDate = msg.date;
            const group = msg.dateGroupLabel || formatDateGroupLabel(msg.timestamp || msg.date, lastDate);
            if (group && group !== lastGroup) {
                lastGroup = group;
                pendingSeparator = buildDateSeparatorNode(group);
            }
            const parsed = parseAnyDateParts(msg.timestamp || msg.date, lastDate);
            if (parsed && parsed.hasDate) lastDate = parsed.numericDate;

            let node;
            if (msg.kind === 'system' || msg.kind === 'notice') {
                node = buildSystemMessageNode(msg, { platform, fallbackDate: lastDate });
            } else {
                node = buildChatMessageRow(msg, { platform, avatar: options.partnerAvatar, fallbackDate: lastDate });
            }
            if (pendingSeparator) {
                nodes.push(keepTogether([pendingSeparator, node]));
                pendingSeparator = null;
            } else {
                nodes.push(node);
            }
        }
        if (options.includeEndOfChat !== false) nodes.push(buildEndOfChatNode());
        ensurePdfMakeEmojiFontRegistered();
        return nodes;
    }

    /* ==========================================================================
     * GALERIE
     * ========================================================================== */

    /** 2-spaltige Galerie, Bildunterschrift nur "n/m" zentriert direkt unter dem Bild. Überschrift bleibt mit der ersten Bildzeile zusammen. */
    function buildTwoColumnGallery(images, platform = 'auto', sectionTitle = 'Bilder') {
        const list = (Array.isArray(images) ? images : []).map((i) => (typeof i === 'string' ? i : i && i.dataUrl)).filter(Boolean);
        if (list.length === 0) return [];
        const total = list.length;
        const header = buildSectionHeader(`${sectionTitle} (${total})`, platform, { margin: [0, 10, 0, 2] });
        delete header.headlineLevel;
        const cell = (dataUrl, n) => ({
            width: '*',
            stack: [
                { image: dataUrl, fit: [TOKENS.gallery.boxWidthPt, TOKENS.gallery.boxHeightPt], alignment: 'center' },
                { text: `${n}/${total}`, fontSize: TOKENS.typography.galleryCaptionSize, bold: true, color: TOKENS.colors.textMuted, alignment: 'center', margin: [0, 2, 0, 0] }
            ]
        });
        const rows = [];
        for (let i = 0; i < total; i += 2) {
            rows.push({
                columns: [cell(list[i], i + 1), i + 1 < total ? cell(list[i + 1], i + 2) : { width: '*', text: '' }],
                columnGap: TOKENS.gallery.columnGapPt,
                margin: [0, 4, 0, 8],
                unbreakable: true
            });
        }
        return [keepTogether([header, rows[0]]), ...rows.slice(1)];
    }

    /** Fußzeile: Seitenzahl, optional mit Erstellungshinweis (Rechnung/Bericht). */
    function buildPageFooter(note = '') {
        return (currentPage, pageCount) => ({
            columns: [
                { width: '*', text: note, fontSize: 7, color: TOKENS.colors.textMuted },
                { width: 40, text: `${currentPage}/${pageCount}`, alignment: 'right', fontSize: TOKENS.typography.footerFontSize, color: TOKENS.colors.textMuted }
            ],
            margin: [TOKENS.page.margins[0], 10, TOKENS.page.margins[2], 0]
        });
    }

    /** "Keep with next": Überschriften (headlineLevel 1) nie als letztes Element einer Seite. */
    function pageBreakBeforeKeepWithNext(currentNode, followingNodesOnPage) {
        return currentNode.headlineLevel === 1 && followingNodesOnPage.length === 0;
    }

    /* ==========================================================================
     * GESAMTDOKUMENT
     * ========================================================================== */

    function composeTitle(meta) {
        const title = meta.adTitle || 'Unbekannter Artikel';
        return meta.adStatus ? `${meta.adStatus} \u2022 ${title}` : title;
    }

    /**
     * Baut die pdfmake-docDefinition aus dem einheitlichen Datenmodell.
     * Reihenfolge: Titel -> Chat-Meta -> Sicherheitshinweis -> Chat -> Ende -> Chat-Bilder
     *              -> (neue Seite) Titel -> Anzeigen-Meta -> Artikelmerkmale -> Export-Zeitstempel -> Beschreibung -> Anzeigen-Bilder
     */
    function buildExportDocument(model) {
        const meta = model.meta || {};
        const platform = resolvePlatform(model.platform);
        const title = composeTitle(meta);
        const content = [buildTitleBar(title, platform), buildChatMetaSection(model)];

        const notice = buildSecurityNoticeNode(model.securityNotice, platform);
        if (notice) content.push(notice);
        if (Array.isArray(model.messages) && model.messages.length) {
            content.push(...buildChatHistoryNodes(model.messages, { platform, partnerAvatar: model.partnerAvatar }));
        } else {
            content.push({ text: 'Kein Nachrichtenverlauf vorhanden.', alignment: 'center', italics: true, color: TOKENS.colors.textMuted, margin: [0, 14, 0, 14] });
        }
        if (Array.isArray(model.chatImages) && model.chatImages.length) {
            content.push(...buildTwoColumnGallery(model.chatImages, platform, 'Bilder aus dem Chat'));
        }

        if (model.includeAdPage !== false) {
            content.push(buildTitleBar(title, platform, { pageBreak: 'before' }));
            content.push(buildAdMetaSection(model));
            content.push(...buildDescriptionBlock(model.description, platform));
            if (Array.isArray(model.adImages) && model.adImages.length) {
                content.push(...buildTwoColumnGallery(model.adImages, platform, 'Bilder'));
            }
        }

        ensurePdfMakeEmojiFontRegistered();
        return {
            pageSize: TOKENS.page.size,
            pageOrientation: TOKENS.page.orientation,
            pageMargins: TOKENS.page.margins,
            defaultStyle: { fontSize: TOKENS.page.defaultFontSize, lineHeight: TOKENS.page.defaultLineHeight },
            info: {
                title: `${model.platformLabel || ''} Chat - ${title}`,
                author: model.scriptLabel || '',
                subject: `Konversation ${meta.conversationId || ''} zu Anzeige ${meta.adId || ''}`
            },
            footer: buildPageFooter(),
            pageBreakBefore: pageBreakBeforeKeepWithNext,
            content
        };
    }

    /* ==========================================================================
     * RECHNUNG & STEUERBERICHT (Beträge in Cent)
     * ========================================================================== */

    const eur = (cents) => (cents === null || cents === undefined ? 'n/a' : formatEuroAmount(cents, true));
    const smallLabel = (text) => ({ text, fontSize: 8, bold: true, color: TOKENS.colors.textMuted, margin: [0, 0, 0, 2] });
    const thinTable = {
        hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0 : 0.5),
        vLineWidth: () => 0,
        hLineColor: () => TOKENS.colors.tableBorder,
        paddingLeft: () => 4,
        paddingRight: () => 4,
        paddingTop: () => 3,
        paddingBottom: () => 3
    };

    function documentShell(title, subject, author, footerNote, content, orientation = 'portrait') {
        ensurePdfMakeEmojiFontRegistered();
        return {
            pageSize: TOKENS.page.size,
            pageOrientation: orientation,
            pageMargins: TOKENS.page.margins,
            defaultStyle: { fontSize: TOKENS.page.defaultFontSize, lineHeight: TOKENS.page.defaultLineHeight },
            info: { title, author, subject },
            footer: buildPageFooter(footerNote),
            pageBreakBefore: pageBreakBeforeKeepWithNext,
            content
        };
    }

    /**
     * Rechnung je Bestellung. inv = { platform, platformLabel, scriptLabel, exportedAt, seller:{lines}, buyer:{lines},
     * order:{orderId, orderUrl, recordNumber, soldDate, paidDate, shippingService, trackingId, trackingUrl},
     * items:[{title, itemId, itemUrl, quantity, unitPrice, total}], amounts:{itemsTotal, shippingCharged, subtotal,
     * refund, shippingActual, transactionFee, adFee, total}, shippingActualLabel }
     */
    function buildInvoiceDocument(inv) {
        const platform = resolvePlatform(inv.platform);
        const o = inv.order || {};
        const a = inv.amounts || {};
        const footer = `${META_LABELS.EXPORTED_AT} ${inv.exportedAt} mit ${inv.scriptLabel}`;
        const block = (label, lines) => ({ width: '*', stack: [smallLabel(label), ...(lines || []).filter(Boolean).map((l) => ({ text: l, fontSize: 9 }))] });
        const orderLines = [
            { text: [`Bestellnummer: `, o.orderUrl ? linkRun(o.orderId, o.orderUrl) : o.orderId || 'n/a'], fontSize: 9 },
            o.recordNumber ? { text: `Verkaufsprotokollnr.: ${o.recordNumber}`, fontSize: 9 } : null,
            { text: `Verkauft am: ${o.soldDate || 'n/a'}`, fontSize: 9 },
            { text: `Bezahlt am: ${o.paidDate || 'n/a'}`, fontSize: 9 },
            { text: `Versandservice: ${o.shippingService || 'n/a'}`, fontSize: 9 },
            { text: [`Sendungsnummer: `, o.trackingUrl ? linkRun(o.trackingId, o.trackingUrl) : o.trackingId || 'n/a'], fontSize: 9 }
        ].filter(Boolean);

        const itemRows = (inv.items || []).map((it) => [
            { stack: [{ text: it.title, bold: true }, { text: ['Artikelnummer: ', it.itemUrl ? linkRun(it.itemId, it.itemUrl) : it.itemId || 'n/a'], fontSize: 8, color: TOKENS.colors.textMuted }] },
            { text: String(it.quantity || 1), alignment: 'center' },
            { text: eur(it.unitPrice), alignment: 'right' },
            { text: eur(it.total), alignment: 'right' }
        ]);
        const head = ['Artikel', 'Stückzahl', 'Artikelpreis', 'Artikelpreis gesamt'].map((t, i) => ({ text: t, bold: true, fontSize: 8.5, alignment: i === 0 ? 'left' : i === 1 ? 'center' : 'right' }));

        const neg = (c) => (c === null || c === undefined ? null : -Math.abs(c));
        const sumRows = [
            ['Artikelpreis gesamt', a.itemsTotal],
            ['Versanderlös', a.shippingCharged],
            ['Zwischensumme', a.subtotal, true],
            ['Erstattungen / Rabatt', neg(a.refund)],
            [`Versandkosten${inv.shippingActualLabel ? ` (${inv.shippingActualLabel})` : ''}`, neg(a.shippingActual)],
            ['Transaktionsgebühren', neg(a.transactionFee)],
            ['Anzeigengebühren', neg(a.adFee)],
            ['Gesamtbetrag', a.total, true]
        ].map(([label, cents, bold]) => [{ text: label, bold: Boolean(bold) }, { text: eur(cents), alignment: 'right', bold: Boolean(bold) }]);

        const content = [
            buildTitleBar(`Rechnung \u2022 Bestellung ${o.orderId || 'n/a'}`, platform),
            { columns: [block('Absender', inv.seller && inv.seller.lines), block('Lieferadresse', inv.buyer && inv.buyer.lines), { width: '*', stack: [smallLabel('Bestellung'), ...orderLines] }], columnGap: 14, margin: [0, 4, 0, 14] },
            { table: { headerRows: 1, widths: ['*', 55, 75, 95], body: [head, ...itemRows] }, layout: thinTable },
            { columns: [{ width: '*', text: '' }, { width: 300, table: { widths: ['*', 90], body: sumRows }, layout: thinTable }], margin: [0, 12, 0, 0] }
        ];
        return documentShell(`Rechnung ${o.orderId || ''}`, `${inv.platformLabel} Bestellung ${o.orderId || ''}`, inv.scriptLabel, footer, content);
    }

    /**
     * Steuerbericht. rep = { platform, platformLabel, scriptLabel, exportedAt, periodLabel,
     * totals:{gross, refunds, shippingCharged, shippingActual, transactionFees, adFees, net},
     * rows:[{date, orderId, orderUrl, items:[{title,itemId}], buyer, revenue, fees, total}] }
     */
    function buildReportDocument(rep) {
        const platform = resolvePlatform(rep.platform);
        const t = rep.totals || {};
        const footer = `${META_LABELS.EXPORTED_AT} ${rep.exportedAt} mit ${rep.scriptLabel}`;
        const overview = [
            ['Bestellungen (Gesamtbetrag)', t.gross, true],
            ['Rückerstattungen und Gutschriften', -Math.abs(t.refunds || 0)],
            ['davon Versanderlös', t.shippingCharged],
            ['Versandkosten', -Math.abs(t.shippingActual || 0)],
            ['Transaktionsgebühren', -Math.abs(t.transactionFees || 0)],
            ['Anzeigengebühren', -Math.abs(t.adFees || 0)],
            ['Ergebnis', t.net, true]
        ].map(([label, cents, bold]) => [{ text: label, bold: Boolean(bold) }, { text: eur(cents), alignment: 'right', bold: Boolean(bold) }]);

        const head = ['Datum', 'Bestellnummer', 'Artikel', 'Umsatz', 'Gebühren', 'Gesamtbetrag'].map((x, i) => ({ text: x, bold: true, fontSize: 8, alignment: i >= 3 ? 'right' : 'left' }));
        const rows = (rep.rows || []).map((r) => [
            { text: r.date, fontSize: 8 },
            { text: r.orderUrl ? [linkRun(r.orderId, r.orderUrl)] : r.orderId, fontSize: 8 },
            { stack: [...r.items.map((it) => ({ text: [{ text: it.title, bold: true }, `\nArtikelnr. ${it.itemId}`] })), { text: `Käufer: ${r.buyer || 'n/a'}`, color: TOKENS.colors.textMuted }], fontSize: 8 },
            { text: eur(r.revenue), alignment: 'right', fontSize: 8 },
            { text: eur(r.fees), alignment: 'right', fontSize: 8 },
            { text: eur(r.total), alignment: 'right', fontSize: 8, bold: true }
        ]);
        const sum = (k) => (rep.rows || []).reduce((s, r) => s + (r[k] || 0), 0);
        const totalRow = [{ text: 'Summe', bold: true, colSpan: 3, fontSize: 8 }, {}, {}, ...['revenue', 'fees', 'total'].map((k) => ({ text: eur(sum(k)), alignment: 'right', bold: true, fontSize: 8 }))];

        const content = [
            buildTitleBar(`${rep.platformLabel} Verkaufsbericht \u2022 ${rep.periodLabel}`, platform),
            buildSectionHeader('Transaktionsübersicht', platform, { margin: [0, 4, 0, 4] }),
            { columns: [{ width: 320, table: { widths: ['*', 100], body: overview }, layout: thinTable }, { width: '*', text: '' }] },
            buildSectionHeader(`Transaktionsdetails (${(rep.rows || []).length} Bestellungen)`, platform, { margin: [0, 14, 0, 4] }),
            { table: { headerRows: 1, dontBreakRows: true, widths: [48, 72, '*', 58, 58, 62], body: [head, ...rows, totalRow] }, layout: thinTable }
        ];
        return documentShell(`${rep.platformLabel} Verkaufsbericht ${rep.periodLabel}`, 'Verkaufsbericht', rep.scriptLabel, footer, content);
    }

    global.PdfSharedTheme = Object.freeze({
        VERSION: LIB_VERSION,
        isNa,
        cleanTextPreserveEmojis,
        extractTextFromNodePreserveEmojis,
        parseAnyDateParts,
        normalizeMessageTimestamp,
        formatDateWithRelativeAge,
        formatExportTimestamp,
        parseMoney,
        formatMoneyText,
        moneyGroupNeedsDecimals,
        sumMoney,
        buildExportDocument,
        buildInvoiceDocument,
        buildReportDocument
    });
})(typeof window !== 'undefined' ? window : globalThis);
