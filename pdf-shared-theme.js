/**
 * Zentrale Design-, Layout- & Komponenten-Bibliothek für eBay & Kleinanzeigen PDF-Export (pdfmake)
 * Version: 2.0.0
 *
 * Einbindung in beide Tampermonkey-Skripte via:
 * // @require https://raw.githubusercontent.com/thethinker990/tampermonkey/main/pdf-shared-theme.js
 */
(function (global) {
    'use strict';

    const EBAY_SHARED_BUBBLE_GREY = '#e5e7eb';

    const MONTH_SHORT_DE = Object.freeze([
        'Jan.', 'Feb.', 'Mär.', 'Apr.', 'Mai.', 'Jun.',
        'Jul.', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'
    ]);

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
                    outboundFill: '#b5e941',
                    outboundBorder: null,
                    outboundText: '#1d4b00',
                    inboundFill: '#f4f2ef',
                    inboundBorder: null,
                    inboundText: '#1a1a1a',
                    offerBoxOwnFill: '#a4dc34',
                    offerBoxPartnerFill: '#ffffff',
                    offerBoxBorder: '#9dc730',
                    sharpCornerOnSendersSide: false
                }
            },
            ebay: {
                headerFill: '#d4e5fe',
                headerBorder: '#0968f6',
                headerText: '#111827',
                sectionHeaderColor: '#111827',
                bubble: {
                    outboundFill: EBAY_SHARED_BUBBLE_GREY,
                    outboundBorder: null,
                    outboundText: '#111827',
                    inboundFill: '#ffffff',
                    inboundBorder: EBAY_SHARED_BUBBLE_GREY,
                    inboundText: '#111827',
                    offerBoxOwnFill: '#ffffff',
                    offerBoxPartnerFill: '#f9fafb',
                    offerBoxBorder: EBAY_SHARED_BUBBLE_GREY,
                    sharpCornerOnSendersSide: false
                }
            }
        },
        colors: {
            textPrimary: '#111111',
            textDark: '#111827',
            textDesc: '#1f2937',
            textLabel: '#222222',
            textExportedAt: '#374151',
            textMuted: '#4b5563',
            textTimestamp: '#666460',
            textWarning: '#dc2626',
            link: '#0b57d0',
            tableBorder: '#d1d5db',
            tableRowEven: '#f9fafb',
            tableRowOdd: '#ffffff',
            descBoxBg: '#f9fafb',
            descBoxBorder: '#e5e7eb',
            avatarBg: '#e6e4e0',
            avatarText: '#666460'
        },
        typography: {
            titleHeaderSize: 13,
            sectionHeaderSize: 12,
            tableFontSize: 9.5,
            bodyFontSize: 9.5,
            exportTimestampSize: 8.5,
            dateSeparatorSize: 9.5,
            messageTimestampSize: 8,
            endOfChatSize: 10,
            footerFontSize: 9,
            galleryCaptionSize: 8.5
        },
        table: {
            defaultLabelWidth: 145,
            padX: 4,
            padY: 3.5,
            borderWidth: 0.5,
            cellLineHeight: 1.15
        },
        gallery: {
            boxWidthPt: 245,
            boxHeightPt: 200,
            columnGapPt: 14,
            canvasTargetWidthPx: 980,
            canvasTargetHeightPx: 800,
            cropMode: 'contain'
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
     * DYNAMISCHE TRUETYPE-SCHRIFT (ChatEmoji) FÜR EMOJIS & THREE-EM DASH (U+2E3B)
     * ========================================================================== */

    const EMOJI_OR_SPECIAL_CP_REGEX = /[\u2E3B\u2600-\u27BF\u{1F000}-\u{1FAFF}]/u;
    const registeredCodepoints = new Set([0x2E3B]);

    function isSpecialOrEmojiCodepoint(cp) {
        if (!cp) return false;
        if (cp === 0x2E3B) return true;
        if (cp >= 0x2600 && cp <= 0x27BF) return true;
        if (cp >= 0x2300 && cp <= 0x23FF) return true;
        if (cp >= 0x2B00 && cp <= 0x2BFF) return true;
        if (cp >= 0x1F000 && cp <= 0x1FAFF) return true;
        return false;
    }

    function collectSpecialCodepointsFromText(str) {
        if (!str || typeof str !== 'string') return;
        const cleaned = str.replace(/\uFE0F/g, '');
        for (const ch of cleaned) {
            const cp = ch.codePointAt(0);
            if (isSpecialOrEmojiCodepoint(cp)) {
                registeredCodepoints.add(cp);
            }
        }
    }

    function rasterizeCharToGlyphRects(charStr, gridSize = 28) {
        if (typeof document === 'undefined') {
            return { advanceWidth: 1000, rects: [[100, 100, 900, 700]] };
        }
        const canvas = document.createElement('canvas');
        canvas.width = gridSize;
        canvas.height = gridSize;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return { advanceWidth: 1000, rects: [[100, 100, 900, 700]] };
        }

        ctx.clearRect(0, 0, gridSize, gridSize);
        ctx.fillStyle = '#000000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `${Math.round(gridSize * 0.82)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif`;
        ctx.fillText(charStr, gridSize / 2, gridSize / 2 + 1);

        const imgData = ctx.getImageData(0, 0, gridSize, gridSize).data;
        const rects = [];
        const scale = Math.round(920 / gridSize);
        const yOffset = -100;

        for (let row = 0; row < gridSize; row++) {
            let runStart = -1;
            for (let col = 0; col <= gridSize; col++) {
                let isOpaque = false;
                if (col < gridSize) {
                    const idx = (row * gridSize + col) * 4;
                    const r = imgData[idx];
                    const g = imgData[idx + 1];
                    const b = imgData[idx + 2];
                    const a = imgData[idx + 3];
                    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
                    isOpaque = a > 75 && lum < 235;
                }
                if (isOpaque && runStart === -1) {
                    runStart = col;
                } else if (!isOpaque && runStart !== -1) {
                    const x1 = 40 + runStart * scale;
                    const x2 = 40 + col * scale;
                    const yBottom = yOffset + (gridSize - 1 - row) * scale;
                    const yTop = yBottom + scale;
                    rects.push([x1, yBottom, x2, yTop]);
                    runStart = -1;
                }
            }
        }

        if (rects.length === 0) {
            rects.push([150, 80, 850, 680]);
        }
        return { advanceWidth: 1040, rects };
    }

    function buildDynamicChatEmojiTtfBase64(codepointsIterable) {
        const sortedCps = Array.from(new Set(codepointsIterable)).sort((a, b) => a - b);
        const glyphs = [
            { advanceWidth: 600, rects: [[60, 0, 540, 700]] }
        ];
        const cpToGid = new Map();

        for (const cp of sortedCps) {
            const gid = glyphs.length;
            cpToGid.set(cp, gid);
            if (cp === 0x2E3B) {
                glyphs.push({
                    advanceWidth: 2600,
                    rects: [[40, 250, 2560, 335]]
                });
            } else {
                const ch = String.fromCodePoint(cp);
                glyphs.push(rasterizeCharToGlyphRects(ch, 28));
            }
        }

        const numGlyphs = glyphs.length;
        const glyfParts = [];
        const locaOffsets = [0];
        let maxPoints = 4;
        let maxContours = 1;

        for (const g of glyphs) {
            const rects = g.rects || [];
            if (rects.length === 0) {
                locaOffsets.push(locaOffsets[locaOffsets.length - 1]);
                continue;
            }
            const numContours = rects.length;
            const numPts = numContours * 4;
            if (numContours > maxContours) maxContours = numContours;
            if (numPts > maxPoints) maxPoints = numPts;

            let xMin = 32767;
            let yMin = 32767;
            let xMax = -32768;
            let yMax = -32768;
            for (const [x1, y1, x2, y2] of rects) {
                if (x1 < xMin) xMin = x1;
                if (x2 > xMax) xMax = x2;
                if (y1 < yMin) yMin = y1;
                if (y2 > yMax) yMax = y2;
            }

            const rawLen = 10 + numContours * 2 + 2 + numPts + numPts * 2 + numPts * 2;
            const paddedLen = (rawLen + 3) & ~3;
            const buf = new ArrayBuffer(paddedLen);
            const dv = new DataView(buf);
            let pos = 0;

            dv.setInt16(pos, numContours, false); pos += 2;
            dv.setInt16(pos, xMin, false); pos += 2;
            dv.setInt16(pos, yMin, false); pos += 2;
            dv.setInt16(pos, xMax, false); pos += 2;
            dv.setInt16(pos, yMax, false); pos += 2;

            for (let i = 0; i < numContours; i++) {
                dv.setUint16(pos, i * 4 + 3, false);
                pos += 2;
            }
            dv.setUint16(pos, 0, false);
            pos += 2;

            for (let i = 0; i < numPts; i++) {
                dv.setUint8(pos, 0x01);
                pos += 1;
            }

            let prevX = 0;
            for (const [x1, y1, x2, y2] of rects) {
                const xs = [x1, x1, x2, x2];
                for (const px of xs) {
                    dv.setInt16(pos, px - prevX, false);
                    pos += 2;
                    prevX = px;
                }
            }

            let prevY = 0;
            for (const [x1, y1, x2, y2] of rects) {
                const ys = [y1, y2, y2, y1];
                for (const py of ys) {
                    dv.setInt16(pos, py - prevY, false);
                    pos += 2;
                    prevY = py;
                }
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
        maxpDv.setUint16(6, maxPoints, false);
        maxpDv.setUint16(8, maxContours, false);
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
        const nameRecs = [
            [1, famBytes],
            [2, subBytes],
            [4, famBytes],
            [6, famBytes]
        ];
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
            ['OS/2', os2Table],
            ['cmap', cmapTable],
            ['glyf', glyfTable],
            ['head', headTable],
            ['hhea', hheaTable],
            ['hmtx', hmtxTable],
            ['loca', locaTable],
            ['maxp', maxpTable],
            ['name', nameTable],
            ['post', postTable]
        ];

        const numTables = tables.length;
        const dirSize = 12 + numTables * 16;
        let totalSize = dirSize;
        for (const [, data] of tables) {
            totalSize += (data.length + 3) & ~3;
        }

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
            for (let c = 0; c < 4; c++) {
                ttf[entryBase + c] = tag.charCodeAt(c);
            }
            ttfDv.setUint32(entryBase + 4, csum, false);
            ttfDv.setUint32(entryBase + 8, dataOffset, false);
            ttfDv.setUint32(entryBase + 12, data.length, false);
            dataOffset += paddedLen;
        });

        let binary = '';
        for (let i = 0; i < ttf.length; i++) {
            binary += String.fromCharCode(ttf[i]);
        }
        return btoa(binary);
    }

    function ensurePdfMakeEmojiFontRegistered() {
        const pdfMake = global.pdfMake || (typeof window !== 'undefined' ? window.pdfMake : null);
        if (!pdfMake) return false;

        try {
            const b64 = buildDynamicChatEmojiTtfBase64(registeredCodepoints);
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
            console.warn('[PdfSharedTheme] Emoji-Font-Registrierung fehlgeschlagen:', err);
            return false;
        }
    }

    /**
     * Zerlegt einen String mit Emojis oder ⸻ (U+2E3B) in ein pdfmake-Text-Inline-Array,
     * sodass Emojis und ⸻ automatisch mit der eingebetteten Schriftart 'ChatEmoji' gerendert werden.
     */
    function buildRichTextWithEmojis(rawStr) {
        const cleaned = cleanTextPreserveEmojis(rawStr);
        if (!cleaned) return '';

        const withoutVS16 = cleaned.replace(/\uFE0F/g, '');
        if (!EMOJI_OR_SPECIAL_CP_REGEX.test(withoutVS16)) {
            return cleaned;
        }

        collectSpecialCodepointsFromText(withoutVS16);
        ensurePdfMakeEmojiFontRegistered();

        const runs = [];
        let currentText = '';
        let currentIsSpecial = false;

        for (const ch of withoutVS16) {
            const cp = ch.codePointAt(0);
            const isSpec = isSpecialOrEmojiCodepoint(cp);
            if (currentText === '') {
                currentText = ch;
                currentIsSpecial = isSpec;
            } else if (isSpec === currentIsSpecial) {
                currentText += ch;
            } else {
                runs.push(
                    currentIsSpecial
                        ? { text: currentText, font: 'ChatEmoji' }
                        : currentText
                );
                currentText = ch;
                currentIsSpecial = isSpec;
            }
        }
        if (currentText !== '') {
            runs.push(
                currentIsSpecial
                    ? { text: currentText, font: 'ChatEmoji' }
                    : currentText
            );
        }

        return runs.length === 1 ? runs[0] : runs;
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
            const namedMonthMatch = /\b(\d{1,2})\.\s*([A-Za-zÄÖÜäöü]{3,})\.?\s*(\d{4})?\b/.exec(combined);
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
            if (/\bvorgestern\b/i.test(combined)) {
                const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2);
                day = d.getDate
