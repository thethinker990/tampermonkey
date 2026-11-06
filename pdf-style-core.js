/**
 * PdfSharedTheme – Core-Stylesheet (pdfmake) für alle Marktplatz-PDFs: Tokens, Schriften, Emojis, Datum, Geld, Links, Tabellen, Galerie, Fußzeile.
 * Version: 4.0.0
 *
 * Wird von pdf-style-article.js (Artikel), pdf-style-chat.js (Nachrichten) und pdf-style-invoice.js (Rechnung, Berichte) genutzt.
 * Öffentliche Funktionen hängen an window.PdfSharedTheme, gemeinsame Bausteine für die anderen Stylesheets an window.PdfSharedTheme._ .
 * Ablauf/DB/Settings/Toast liegen in marketplace-export-core.js; Datenmodell siehe specs/001-marketplace-pdf-export/plan.md.
 *
 * Einbindung (Reihenfolge: core, article, chat, invoice; Versions-Parameter erzwingt Neuladen aus dem Tampermonkey-Cache):
 * // @require https://raw.githubusercontent.com/thethinker990/tampermonkey/main/pdf-style-core.js?v=4.0.0
 */
(function (global) {
    'use strict';

    const LIB_VERSION = '4.0.0';

    const MONTH_SHORT_DE = Object.freeze([
        'Jan.', 'Feb.', 'Mär.', 'Apr.', 'Mai', 'Jun.',
        'Jul.', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'
    ]);

    /** Einheitliche Feldbezeichnungen (ohne Doppelpunkt) für alle Plattformen. */
    const META_LABELS = Object.freeze({
        SOURCE: 'Quelle',
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
        RETURN_TRACKING_ID: 'Rücksende-Sendungsnummer',
        // eBay-Verkäufer-Tabelle (Details in Rechnung/Excel)
        SALE_ITEM_PRICE: 'Artikelpreis',
        SALE_SHIPPING: 'Versanderlös',
        SALE_DEDUCTIONS: 'Gebühren, Rabatte, Versandkosten',
        SALE_EARNINGS: 'Verkaufserlös',
        LISTING_DURATION: 'Angebotsdauer',
        PICKUP: 'Abholung',
        EXPORTED_AT: 'Erstellt am'
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

    let measureFamily = 'Roboto, Arial';

    function getMeasureContext() {
        if (!measureCtx && typeof document !== 'undefined') {
            const canvas = document.createElement('canvas');
            measureCtx = canvas.getContext('2d');
        }
        return measureCtx;
    }

    /**
     * Lädt die PDF-Schrift (Roboto aus pdfmake: Regular = normal, Medium = fett) zum Messen in den Browser, damit
     * Ausrichtungen (z. B. „n/a“ bündig mit der ersten Ziffer) exakt stimmen. Einmalig; bei Fehler bleibt Arial.
     */
    let fontsReady = null;

    function prepareFonts() {
        if (fontsReady) return fontsReady;
        fontsReady = (async () => {
            const vfs = global.pdfMake && global.pdfMake.vfs;
            if (!vfs || typeof FontFace === 'undefined' || !document.fonts) return;
            const toBytes = (b64) => {
                const bin = atob(b64);
                const out = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
                return out.buffer;
            };
            try {
                for (const [file, weight] of [['Roboto-Regular.ttf', '400'], ['Roboto-Medium.ttf', '700']]) {
                    const face = new FontFace('MpePdfRoboto', toBytes(vfs[file]), { weight });
                    document.fonts.add(await face.load());
                }
                measureFamily = 'MpePdfRoboto';
            } catch (err) {
                console.warn('[PdfSharedTheme] PDF-Schrift zum Messen nicht ladbar – Arial-Näherung:', err);
            }
        })();
        return fontsReady;
    }

    function measureTextWidthPt(text, fontSizePt = 9.5, isBold = false) {
        const ctx = getMeasureContext();
        if (!ctx) return String(text || '').length * (fontSizePt * 0.52);
        ctx.font = `${isBold ? 'bold ' : ''}${fontSizePt}px ${measureFamily}, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
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

    // Mini-Schrift fuer Zeichen, die Roboto (pdfmake) nicht hat oder falsch setzt: ⸻ (Ende-Markierung), → (Kategorie-Pfad), • (mittig statt tief).
    // Glyphen sind Polygone (Einheiten 1000/em, im Uhrzeigersinn).
    function buildSymbolFontBase64() {
        const rect = (x1, y1, x2, y2) => [[x1, y1], [x1, y2], [x2, y2], [x2, y1]];
        const glyphs = [
            { advanceWidth: 600, polys: [rect(60, 0, 540, 700)] },
            { advanceWidth: 900, polys: [[[80, 245], [80, 335], [540, 335], [540, 470], [820, 290], [540, 110], [540, 245]]] },
            { advanceWidth: 2600, polys: [rect(40, 250, 2560, 335)] },
            // Aufzählungspunkt auf halber Versalhöhe (Roboto: 711/1000), damit er mittig zur Schrift steht
            { advanceWidth: 500, polys: [Array.from({ length: 16 }, (_, i) => [Math.round(250 + 105 * Math.cos(Math.PI / 2 - (i * Math.PI) / 8)), Math.round(355 + 105 * Math.sin(Math.PI / 2 - (i * Math.PI) / 8))])] }
        ];
        const sortedCps = [0x2022, 0x2192, 0x2E3B];
        const cpToGid = new Map([[0x2022, 3], [0x2192, 1], [0x2E3B, 2]]);
        const numGlyphs = glyphs.length;
        const glyfParts = [];
        const locaOffsets = [0];

        for (const g of glyphs) {
            const pts = g.polys.flat();
            const numContours = g.polys.length;
            const numPts = pts.length;
            const xs = pts.map((p) => p[0]);
            const ys = pts.map((p) => p[1]);
            const rawLen = 10 + numContours * 2 + 2 + numPts + numPts * 2 + numPts * 2;
            const paddedLen = (rawLen + 3) & ~3;
            const buf = new ArrayBuffer(paddedLen);
            const dv = new DataView(buf);
            let pos = 0;

            dv.setInt16(pos, numContours, false); pos += 2;
            dv.setInt16(pos, Math.min(...xs), false); pos += 2;
            dv.setInt16(pos, Math.min(...ys), false); pos += 2;
            dv.setInt16(pos, Math.max(...xs), false); pos += 2;
            dv.setInt16(pos, Math.max(...ys), false); pos += 2;
            let end = -1;
            for (const poly of g.polys) {
                end += poly.length;
                dv.setUint16(pos, end, false); pos += 2;
            }
            dv.setUint16(pos, 0, false); pos += 2;
            for (let i = 0; i < numPts; i++) {
                dv.setUint8(pos, 0x01); pos += 1;
            }
            let prevX = 0;
            for (const px of xs) {
                dv.setInt16(pos, px - prevX, false); pos += 2; prevX = px;
            }
            let prevY = 0;
            for (const py of ys) {
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
        maxpDv.setUint16(6, Math.max(...glyphs.map((g) => g.polys.flat().length)), false);
        maxpDv.setUint16(8, Math.max(...glyphs.map((g) => g.polys.length)), false);
        maxpDv.setUint16(14, 2, false);

        const hmtxTable = new Uint8Array(numGlyphs * 4);
        const hmtxDv = new DataView(hmtxTable.buffer);
        glyphs.forEach((g, idx) => {
            hmtxDv.setUint16(idx * 4, g.advanceWidth, false);
            // linker Rand = xMin der Glyphe, sonst verschieben Renderer die Glyphe nach links
            hmtxDv.setInt16(idx * 4 + 2, Math.min(...g.polys.flat().map((p) => p[0])), false);
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
            const b64 = buildSymbolFontBase64();
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

        if (!/[\u2E3B\u2192\u2022]/.test(cleaned)) {
            return cleaned;
        }

        ensurePdfMakeEmojiFontRegistered();

        const parts = cleaned.split(/([\u2E3B\u2192\u2022]+)/);
        const runs = [];
        for (const p of parts) {
            if (!p) continue;
            if (/^[\u2E3B\u2192\u2022]+$/.test(p)) {
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
        let numW = 0;
        for (const m of values.map(parseMoney)) {
            if (m.special) continue;
            if (m.prefix) prefixW = Math.max(prefixW, Math.ceil(measureTextWidthPt(`${m.prefix}  `, fs, true) * 1.1));
            amountW = Math.max(amountW, Math.ceil(measureTextWidthPt(formatEuroNumber(m.cents, decimals), fs, true) * 1.1) + 1);
            numW = Math.max(numW, measureTextWidthPt(formatEuroNumber(m.cents, decimals), fs, false));
        }
        // numStart: Abstand von der Spaltenkante bis zur ersten Ziffer des breitesten (normal gesetzten) Betrags
        return { decimals, prefixW, amountW, numW, numStart: Math.max(0, amountW - numW) };
    }

    /**
     * Tabellenzelle "VB | 10,00 | EUR" – als Block linksbündig, freier Platz bleibt rechts.
     * Sondertexte ("n/a", "Kostenlos", "inkl. Versand", "Abholung") beginnen bündig mit der ersten Ziffer des breitesten
     * Betrags der Gruppe (Messung mit der PDF-Schrift, siehe prepareFonts).
     */
    function buildMoneyCell(raw, layout, bold = false) {
        const m = parseMoney(raw);
        if (m.special && !layout.amountW) return { text: m.special, bold };
        const columns = [];
        if (layout.prefixW) columns.push({ width: layout.prefixW, text: m.special ? '' : m.prefix || '', bold });
        if (m.special) {
            columns.push({ width: '*', text: m.special, bold, margin: [layout.numStart || 0, 0, 0, 0] });
            return { columns, columnGap: 0, __plain: m.special };
        }
        const num = formatEuroNumber(m.cents, layout.decimals);
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

    function buildExportedAtNode(exportedAtStr, scriptLabel = '') {
        return {
            text: `${META_LABELS.EXPORTED_AT} ${exportedAtStr || formatExportTimestamp()}${scriptLabel ? ` mit ${scriptLabel}` : ''}`,
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

    // Kategorie-Pfad: Daten mit " > ", Anzeige mit Pfeil
    const formatCategory = (cat) => (isNa(cat) || !cat ? 'n/a' : { text: buildRichTextWithEmojis(String(cat).split(/\s*>\s*/).join(' \u2192 ')) });

    /** Fasst Knoten zu einem unzerbrechlichen Block zusammen (z. B. Datum + erste Nachricht, Überschrift + erste Bildzeile). */
    function keepTogether(nodes, unbreakable = true) {
        const flat = nodes.filter(Boolean);
        return unbreakable ? { stack: flat, unbreakable: true } : { stack: flat };
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

    /** Fußzeile: Seitenzahl, optional mit Erstellungshinweis (Rechnung/Bericht). side = [links, rechts] in pt. */
    function buildPageFooter(note = '', side = [TOKENS.page.margins[0], TOKENS.page.margins[2]]) {
        return (currentPage, pageCount) => ({
            stack: [
                note ? { text: note, fontSize: 7, color: TOKENS.colors.textMuted, margin: [0, 0, 0, 2] } : null,
                { text: `${currentPage}/${pageCount}`, alignment: 'center', fontSize: TOKENS.typography.footerFontSize, color: TOKENS.colors.textMuted }
            ].filter(Boolean),
            margin: [side[0], note ? 6 : 10, side[1], 0]
        });
    }

    /** "Keep with next": Überschriften (headlineLevel 1) nie als letztes Element einer Seite. */
    function pageBreakBeforeKeepWithNext(currentNode, followingNodesOnPage) {
        return currentNode.headlineLevel === 1 && followingNodesOnPage.length === 0;
    }

    global.PdfSharedTheme = {
        VERSION: LIB_VERSION,
        isNa, cleanTextPreserveEmojis, extractTextFromNodePreserveEmojis, parseAnyDateParts, normalizeMessageTimestamp, formatDateWithRelativeAge,
        formatExportTimestamp, parseMoney, formatMoneyText, moneyGroupNeedsDecimals, sumMoney, prepareFonts,
        // Gemeinsame Bausteine für die übrigen Stylesheets (kein öffentliches API)
        _: {
            LIB_VERSION, MONTH_SHORT_DE, META_LABELS, TOKENS, getMeasureContext, prepareFonts,
            measureTextWidthPt, extractPlainTextFromCell, estimateWrappedLineCount, stripTrailingColon, cleanTextPreserveEmojis, extractTextFromNodePreserveEmojis,
            EMOJI_TOKEN_REGEX, buildSymbolFontBase64, ensurePdfMakeEmojiFontRegistered, emojiPngCache, renderEmojiPng, hasColorEmoji,
            buildRichTextWithEmojis, splitEmojiTokens, buildParagraphNodeWithColorEmojis, parseAnyDateParts, formatDateWithRelativeAge, normalizeMessageTimestamp,
            formatDateGroupLabel, resolvePlatform, getTheme, isNa, parseMoney, formatEuroNumber,
            formatEuroAmount, moneyGroupNeedsDecimals, formatMoneyText, moneyLayout, buildMoneyCell, sumMoney,
            URL_REGEX, linkRun, buildRichTextWithLinks, buildRunsNode, buildLinkCell, plainOf,
            buildMetaTable, rowCountOf, buildTitleBar, buildSectionHeader, formatExportTimestamp, buildExportedAtNode,
            linkOrText, formatCategory, keepTogether, buildTwoColumnGallery, buildPageFooter, pageBreakBeforeKeepWithNext
        }
    };
})(typeof window !== 'undefined' ? window : globalThis);
