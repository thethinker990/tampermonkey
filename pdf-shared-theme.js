/**
 * Zentrale Design-, Layout- & Komponenten-Bibliothek für eBay & Kleinanzeigen PDF-Export (pdfmake)
 * Version: 2.1.0
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

    const EMOJI_OR_SPECIAL_CP_REGEX = /[\u203C\u2049\u2122\u2139\u2194-\u21AA\u2300-\u23FF\u24C2\u25AA-\u27BF\u2934-\u2935\u2B00-\u2BFF\u2E3B\u3030\u303D\u3297\u3299\u{1F000}-\u{1FAFF}]/u;
    const registeredCodepoints = new Set([0x2E3B]);

    function isSpecialOrEmojiCodepoint(cp) {
        if (!cp) return false;
        if (cp === 0x2E3B) return true;
        if (cp === 0x203C || cp === 0x2049 || cp === 0x2122 || cp === 0x2139) return true;
        if (cp >= 0x2194 && cp <= 0x21AA) return true;
        if (cp >= 0x2300 && cp <= 0x23FF) return true;
        if (cp === 0x24C2) return true;
        if (cp >= 0x25AA && cp <= 0x27BF) return true;
        if (cp >= 0x2934 && cp <= 0x2935) return true;
        if (cp >= 0x2B00 && cp <= 0x2BFF) return true;
        if (cp === 0x3030 || cp === 0x303D || cp === 0x3297 || cp === 0x3299) return true;
        if (cp >= 0x1F000 && cp <= 0x1FAFF) return true;
        return false;
    }

    function collectSpecialCodepointsFromText(str) {
        if (!str || typeof str !== 'string') return;
        const cleaned = str.replace(/[\uFE0E\uFE0F\u200D]/g, '');
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

        const withoutVS16 = cleaned.replace(/[\uFE0E\uFE0F\u200D]/g, '');
        if (!EMOJI_OR_SPECIAL_CP_REGEX.test(withoutVS16)) {
            return withoutVS16;
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
        const hh = timeMatch ? String(timeMatch[1]).padStart(2, '0') : null;
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
     * Formatiert einen Nachrichten-Zeitstempel einheitlich nach "<dd.mm.yyyy, hh:mm>" (bzw. "<dd.mm.yyyy>", falls keine Uhrzeit existiert).
     */
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

    /**
     * Erzeugt die Tagesüberschrift im Format "<dd. mmm. yyyy>" (z. B. "01. Jan. 2026").
     */
    function formatDateGroupLabel(rawDateOrTimestamp, fallbackDateStr = '') {
        const parsed = parseAnyDateParts(rawDateOrTimestamp, fallbackDateStr);
        if (parsed && parsed.hasDate) {
            return parsed.groupLabel;
        }
        return '';
    }

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

    function buildTitleBar(titleText, platform = 'auto', options = {}) {
        const theme = getTheme(platform);
        const fontSize = TOKENS.typography.titleHeaderSize;
        const lineHeight = 1.08;
        const padTop = 6;
        const padBottom = 5;

        const node = {
            table: {
                widths: ['*'],
                body: [
                    [
                        {
                            text: buildRichTextWithEmojis(titleText || 'Unbekannter Artikel'),
                            bold: true,
                            fontSize,
                            lineHeight,
                            color: theme.headerText,
                            fillColor: theme.headerFill,
                            verticalAlignment: 'middle',
                            margin: [8, padTop, 8, padBottom]
                        }
                    ]
                ]
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
            margin: options.margin || [0, 0, 0, 10]
        };

        if (options.pageBreak) {
            node.pageBreak = options.pageBreak;
        }
        return node;
    }

    function buildLinkCell(labelValue, url, carrierPrefix = '') {
        const cleanVal = cleanTextPreserveEmojis(labelValue);
        if (!cleanVal || cleanVal === 'n/a') {
            if (url) {
                return {
                    text: [
                        'n/a (',
                        { text: 'Link', link: url, color: TOKENS.colors.link, decoration: 'underline' },
                        ')'
                    ]
                };
            }
            return 'n/a';
        }
        if (!url) {
            return carrierPrefix ? `${cleanVal} (${carrierPrefix})` : cleanVal;
        }
        const prefix = carrierPrefix ? `${carrierPrefix} ` : '';
        return {
            text: [
                `${prefix}${cleanVal} (`,
                { text: 'Link', link: url, color: TOKENS.colors.link, decoration: 'underline' },
                ')'
            ]
        };
    }

    function buildTotalAmountCell(amountText) {
        return {
            text: cleanTextPreserveEmojis(amountText || 'n/a'),
            bold: true,
            fontSize: TOKENS.typography.tableFontSize,
            color: TOKENS.colors.textPrimary
        };
    }

    function buildMetaTable(rows, labelWidth = TOKENS.table.defaultLabelWidth, totalTableWidth = TOKENS.page.contentWidthPt) {
        const fontSize = TOKENS.typography.tableFontSize;
        const lineHeight = TOKENS.table.cellLineHeight;
        const padX = TOKENS.table.padX;
        const basePadY = TOKENS.table.padY;

        const trailingLineGapPt = +(fontSize * 1.17 * (lineHeight - 1)).toFixed(2);
        const singleLineHeightPt = +(fontSize * 1.17 * lineHeight).toFixed(2);

        const availLabelW = Math.max(30, labelWidth - padX * 2);
        const availValueW = Math.max(50, totalTableWidth - labelWidth - padX * 2);

        const body = rows.map(([label, val]) => {
            const labelStr = extractPlainTextFromCell(label);
            const valStr = extractPlainTextFromCell(val);
            const isValBold = Boolean(val && typeof val === 'object' && val.bold);

            const labelLines = estimateWrappedLineCount(labelStr, availLabelW, fontSize, true);
            const valLines = estimateWrappedLineCount(valStr, availValueW, fontSize, isValBold);
            const maxLines = Math.max(labelLines, valLines);

            const labelExtraHalf = +(((maxLines - labelLines) * singleLineHeightPt) / 2).toFixed(2);
            const valExtraHalf = +(((maxLines - valLines) * singleLineHeightPt) / 2).toFixed(2);

            const labelTop = +(basePadY + labelExtraHalf + trailingLineGapPt * 0.45).toFixed(2);
            const labelBottom = Math.max(1, +(basePadY + labelExtraHalf - trailingLineGapPt * 0.55).toFixed(2));

            const valTop = +(basePadY + valExtraHalf + trailingLineGapPt * 0.45).toFixed(2);
            const valBottom = Math.max(1, +(basePadY + valExtraHalf - trailingLineGapPt * 0.55).toFixed(2));

            const labelCell = {
                text: buildRichTextWithEmojis(label),
                bold: true,
                fontSize,
                lineHeight,
                color: TOKENS.colors.textLabel,
                verticalAlignment: 'middle',
                margin: [padX, labelTop, padX, labelBottom]
            };

            const valueCell =
                typeof val === 'string'
                    ? {
                          text: buildRichTextWithEmojis(val),
                          fontSize,
                          lineHeight,
                          color: TOKENS.colors.textPrimary,
                          verticalAlignment: 'middle',
                          margin: [padX, valTop, padX, valBottom]
                      }
                    : {
                          fontSize,
                          lineHeight,
                          color: TOKENS.colors.textPrimary,
                          verticalAlignment: 'middle',
                          ...val,
                          margin: [padX, valTop, padX, valBottom]
                      };

            return [labelCell, valueCell];
        });

        return {
            fontSize,
            table: {
                widths: [labelWidth, '*'],
                body
            },
            layout: {
                hLineWidth: () => TOKENS.table.borderWidth,
                vLineWidth: () => TOKENS.table.borderWidth,
                hLineColor: () => TOKENS.colors.tableBorder,
                vLineColor: () => TOKENS.colors.tableBorder,
                fillColor: (rowIndex) =>
                    rowIndex % 2 === 0 ? TOKENS.colors.tableRowEven : TOKENS.colors.tableRowOdd,
                paddingLeft: () => 0,
                paddingRight: () => 0,
                paddingTop: () => 0,
                paddingBottom: () => 0
            }
        };
    }

    function formatExportTimestamp(date = new Date()) {
        const dd = String(date.getDate()).padStart(2, '0');
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const yyyy = date.getFullYear();
        const hh = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        const sec = String(date.getSeconds()).padStart(2, '0');

        const tzIana = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin';
        const tzShort =
            new Intl.DateTimeFormat('de-DE', { timeZoneName: 'short' })
                .formatToParts(date)
                .find((part) => part.type === 'timeZoneName')?.value || 'MEZ';

        return `${dd}.${mm}.${yyyy} ${hh}:${min}:${sec} ${tzShort} (${tzIana})`.trim();
    }

    function buildExportedAtNode(exportedAtStr, label = 'Exportiert / Erstellt am:') {
        const ts = exportedAtStr || formatExportTimestamp();
        return {
            text: `${label} ${ts}`,
            alignment: 'right',
            fontSize: TOKENS.typography.exportTimestampSize,
            bold: true,
            color: TOKENS.colors.textExportedAt,
            margin: [0, 4, 0, 10]
        };
    }

    function buildSectionHeader(titleText, platform = 'auto', options = {}) {
        const theme = getTheme(platform);
        return {
            text: buildRichTextWithEmojis(titleText),
            fontSize: TOKENS.typography.sectionHeaderSize,
            bold: true,
            color: options.color || theme.sectionHeaderColor || TOKENS.colors.textDark,
            margin: options.margin || [0, 10, 0, 6],
            unbreakable: true,
            keepWithNext: true
        };
    }

    function buildDescriptionBlock(descriptionText, platform = 'auto') {
        if (!descriptionText || !String(descriptionText).trim()) return [];
        return [
            buildSectionHeader('Beschreibung', platform, { margin: [0, 6, 0, 4] }),
            {
                table: {
                    widths: ['*'],
                    body: [
                        [
                            {
                                text: buildRichTextWithEmojis(descriptionText),
                                fontSize: TOKENS.typography.bodyFontSize,
                                lineHeight: TOKENS.page.defaultLineHeight,
                                color: TOKENS.colors.textDesc,
                                margin: [8, 6, 8, 6]
                            }
                        ]
                    ]
                },
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

    function buildRoundedTopCapSvg(widthPt, radiusPt, fillColor, strokeColor = '') {
        const w = Math.max(40, Math.round(widthPt));
        const r = Math.min(12, Math.max(4, Math.round(radiusPt)));
        const k = +(r * 0.55228475).toFixed(2);
        const h = r;
        const dFill = `M 0 ${h + 1} L 0 ${r} C 0 ${+(r - k).toFixed(2)}, ${+(r - k).toFixed(2)} 0, ${r} 0 L ${w - r} 0 C ${+(w - r + k).toFixed(2)} 0, ${w} ${+(r - k).toFixed(2)}, ${w} ${r} L ${w} ${h + 1} Z`;
        const strokeTag = strokeColor
            ? `<path d="M 0 ${h} L 0 ${r} C 0 ${+(r - k).toFixed(2)}, ${+(r - k).toFixed(2)} 0.4, ${r} 0.4 L ${w - r} 0.4 C ${+(w - r + k).toFixed(2)} 0.4, ${w} ${+(r - k).toFixed(2)}, ${w} ${r} L ${w} ${h}" fill="none" stroke="${strokeColor}" stroke-width="0.8"/>`
            : '';
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path d="${dFill}" fill="${fillColor}"/>${strokeTag}</svg>`;
    }

    function buildRoundedBottomCapSvg(widthPt, radiusPt, fillColor, roundLeft, roundRight, strokeColor = '') {
        const w = Math.max(40, Math.round(widthPt));
        const r = Math.min(12, Math.max(4, Math.round(radiusPt)));
        const k = +(r * 0.55228475).toFixed(2);
        const h = r;

        const rightEdge = roundRight
            ? `L ${w} 0 C ${w} ${k}, ${+(w - r + k).toFixed(2)} ${h}, ${w - r} ${h}`
            : `L ${w} 0 L ${w} ${h}`;

        const leftEdge = roundLeft
            ? `L ${r} ${h} C ${+(r - k).toFixed(2)} ${h}, 0 ${k}, 0 0`
            : `L 0 ${h} L 0 0`;

        const dFill = `M 0 -1 L ${w} -1 ${rightEdge} ${leftEdge} Z`;

        let strokeTag = '';
        if (strokeColor) {
            const sRight = roundRight
                ? `M ${w} 0 C ${w} ${k}, ${+(w - r + k).toFixed(2)} ${h - 0.4}, ${w - r} ${h - 0.4}`
                : `M ${w} 0 L ${w} ${h - 0.4}`;
            const sLeft = roundLeft
                ? `L ${r} ${h - 0.4} C ${+(r - k).toFixed(2)} ${h - 0.4}, 0 ${k}, 0 0`
                : `L 0 ${h - 0.4} L 0 0`;
            strokeTag = `<path d="${sRight} ${sLeft}" fill="none" stroke="${strokeColor}" stroke-width="0.8"/>`;
        }

        return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path d="${dFill}" fill="${fillColor}"/>${strokeTag}</svg>`;
    }

    function buildRoundedCardPdfNode({
        widthPt,
        radiusPt = 9,
        fillColor,
        strokeColor = '',
        roundBottomLeft = true,
        roundBottomRight = true,
        bodyStack,
        padX = 9
    }) {
        const w = Math.round(widthPt);
        const hasStroke = Boolean(strokeColor);
        const topSvg = buildRoundedTopCapSvg(w, radiusPt, fillColor, strokeColor);
        const botSvg = buildRoundedBottomCapSvg(
            w,
            radiusPt,
            fillColor,
            roundBottomLeft,
            roundBottomRight,
            strokeColor
        );

        return {
            table: {
                widths: [w],
                body: [
                    [
                        {
                            svg: topSvg,
                            width: w,
                            border: [false, false, false, false],
                            margin: [0, 0, 0, -0.6]
                        }
                    ],
                    [
                        {
                            stack: bodyStack,
                            fillColor,
                            border: [hasStroke, false, hasStroke, false],
                            margin: [padX, 0, padX, 0]
                        }
                    ],
                    [
                        {
                            svg: botSvg,
                            width: w,
                            border: [false, false, false, false],
                            margin: [0, -0.6, 0, 0]
                        }
                    ]
                ]
            },
            layout: {
                hLineWidth: () => 0,
                vLineWidth: () => (hasStroke ? 0.8 : 0),
                vLineColor: () => strokeColor || fillColor,
                paddingLeft: () => 0,
                paddingRight: () => 0,
                paddingTop: () => 0,
                paddingBottom: () => 0
            }
        };
    }

    function buildAvatarCircleSvg(initial, bgHex = TOKENS.colors.avatarBg, textHex = TOKENS.colors.avatarText) {
        const cleanChar = String(initial || '?')
            .trim()
            .slice(0, 2)
            .toUpperCase()
            .replace(/[<>&"']/g, '');
        return `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26">
            <circle cx="13" cy="13" r="13" fill="${bgHex}"/>
            <text x="13" y="17" text-anchor="middle" font-family="Roboto, Arial, sans-serif" font-size="11" font-weight="bold" fill="${textHex}">${cleanChar || 'U'}</text>
        </svg>`;
    }

    function buildChatBubbleNode(msg, platform = 'auto') {
        const theme = getTheme(platform);
        const bTheme = theme.bubble;
        const isOwn = Boolean(msg.isOwn || msg.type === 'OUTBOUND');

        const MAX_BUBBLE_WIDTH_PT = Math.round(TOKENS.page.contentWidthPt * 0.62);
        const MIN_BUBBLE_WIDTH_PT = 78;
        const radiusPt = 9;
        const padX = 9;

        const fillColor = isOwn ? bTheme.outboundFill : bTheme.inboundFill;
        const strokeColor = isOwn ? bTheme.outboundBorder : bTheme.inboundBorder;
        const textColor = isOwn ? bTheme.outboundText : bTheme.inboundText;

        const roundBottomLeft = bTheme.sharpCornerOnSendersSide ? isOwn : true;
        const roundBottomRight = bTheme.sharpCornerOnSendersSide ? !isOwn : true;

        const bubbleStack = [];
        let longestContentPt = 0;
        let estimatedBodyHeightPt = 0;

        if (msg.offer) {
            const offerTitleW = measureTextWidthPt(msg.offer.title || 'Preisvorschlag', 9.5, true);
            const offerAmountW = measureTextWidthPt(msg.offer.amount || '', 11, true);
            longestContentPt = Math.max(longestContentPt, offerTitleW + 20, offerAmountW + 20);
            estimatedBodyHeightPt += 42;

            bubbleStack.push({
                table: {
                    widths: ['*'],
                    body: [
                        [
                            {
                                stack: [
                                    {
                                        text: buildRichTextWithEmojis(msg.offer.title || 'Preisvorschlag'),
                                        bold: true,
                                        fontSize: 9.5,
                                        color: '#111111'
                                    },
                                    {
                                        text: buildRichTextWithEmojis(msg.offer.amount || ''),
                                        bold: true,
                                        fontSize: 11,
                                        color: '#111111',
                                        margin: [0, 2, 0, 0]
                                    }
                                ],
                                fillColor: isOwn ? bTheme.offerBoxOwnFill : bTheme.offerBoxPartnerFill,
                                margin: [8, 5, 8, 5]
                            }
                        ]
                    ]
                },
                layout: {
                    hLineWidth: () => 0.5,
                    vLineWidth: () => 0.5,
                    hLineColor: () => bTheme.offerBoxBorder,
                    vLineColor: () => bTheme.offerBoxBorder
                },
                margin: [0, 2, 0, 4]
            });
        }

        const attachments = Array.isArray(msg.photos)
            ? msg.photos
            : Array.isArray(msg.images)
              ? msg.images
              : [];

        if (attachments.length > 0) {
            longestContentPt = Math.max(longestContentPt, 185);
            for (const item of attachments) {
                const imgDataUrl = item.dataUrl || '';
                if (!imgDataUrl) continue;
                const labelText =
                    item.filename ||
                    (item.index
                        ? `📎 Originalbild im PDF-Anhang: Chat_Foto_${String(item.index).padStart(2, '0')}.jpg`
                        : '');

                const imgW = item.width || 400;
                const imgH = item.height || 300;
                const scale = Math.min(175 / imgW, 175 / imgH);
                estimatedBodyHeightPt += Math.round(imgH * scale) + 6;

                bubbleStack.push({
                    image: imgDataUrl,
                    fit: [175, 175],
                    margin: [0, 2, 0, 4]
                });
                if (labelText) {
                    estimatedBodyHeightPt += 12;
                    bubbleStack.push({
                        text: buildRichTextWithEmojis(labelText),
                        fontSize: 7.5,
                        italics: true,
                        color: TOKENS.colors.textMuted,
                        margin: [0, 0, 0, 3]
                    });
                }
            }
        }

        if (msg.text) {
            const textW = measureTextWidthPt(msg.text, TOKENS.typography.bodyFontSize, false);
            longestContentPt = Math.max(longestContentPt, textW);
            bubbleStack.push({
                text: buildRichTextWithEmojis(msg.text),
                fontSize: TOKENS.typography.bodyFontSize,
                lineHeight: TOKENS.page.defaultLineHeight,
                color: textColor
            });
        }

        const bubbleWidthPt = Math.min(
            MAX_BUBBLE_WIDTH_PT,
            Math.max(MIN_BUBBLE_WIDTH_PT, Math.ceil(longestContentPt + padX * 2 + 6))
        );

        if (msg.text) {
            const availTextW = Math.max(40, bubbleWidthPt - padX * 2);
            const lineCount = estimateWrappedLineCount(
                msg.text,
                availTextW,
                TOKENS.typography.bodyFontSize,
                false
            );
            const singleLinePt = TOKENS.typography.bodyFontSize * 1.17 * TOKENS.page.defaultLineHeight;
            estimatedBodyHeightPt += lineCount * singleLinePt;
        }

        const bubbleHeightPt = Math.max(26, Math.round(estimatedBodyHeightPt + (radiusPt - 0.6) * 2));

        const bubbleNode = buildRoundedCardPdfNode({
            widthPt: bubbleWidthPt,
            radiusPt,
            fillColor,
            strokeColor: strokeColor || '',
            roundBottomLeft,
            roundBottomRight,
            padX,
            bodyStack: bubbleStack
        });

        return { bubbleNode, bubbleWidthPt, bubbleHeightPt, isOwn };
    }

    function buildDateSeparatorNode(dateText) {
        return {
            text: buildRichTextWithEmojis(dateText),
            alignment: 'center',
            fontSize: TOKENS.typography.dateSeparatorSize,
            bold: true,
            color: TOKENS.colors.textMuted,
            margin: [0, 10, 0, 6],
            unbreakable: true
        };
    }

    function buildMessageSubtextNode(text, isRightAligned = false, customMargin = null) {
        return {
            text: buildRichTextWithEmojis(text),
            fontSize: TOKENS.typography.messageTimestampSize,
            color: TOKENS.colors.textTimestamp,
            alignment: isRightAligned ? 'right' : 'left',
            margin: customMargin || [2, 2, 2, 0]
        };
    }

    /**
     * Erzeugt eine einzelne Chat-Nachrichtenzeile:
     * - Nutzericon sitzt links unten neben der Chat-Bubble (Unterkante Nutzericon = Unterkante Chat-Bubble).
     * - Zeitstempel (<dd.mm.yyyy, hh:mm>) sitzt unter der Chat-Bubble (links beim Sender mit Nutzericon, rechts bei eigenen Nachrichten).
     */
    function buildChatMessageRow(msg, options = {}) {
        const platform = options.platform || 'auto';
        const { bubbleNode, bubbleWidthPt, bubbleHeightPt, isOwn } = buildChatBubbleNode(msg, platform);

        const formattedTimestamp = normalizeMessageTimestamp(
            msg.timestamp,
            msg.date || options.fallbackDate || ''
        );

        const subtextStack = [];
        if (msg.warningText) {
            subtextStack.push({
                text: buildRichTextWithEmojis(`⚠️ ${msg.warningText}`),
                fontSize: 8,
                bold: true,
                color: TOKENS.colors.textWarning,
                alignment: isOwn ? 'right' : 'left',
                margin: [2, 2, 2, 0]
            });
        }
        if (formattedTimestamp) {
            subtextStack.push(buildMessageSubtextNode(formattedTimestamp, isOwn, [2, 2, 2, 0]));
        }

        if (isOwn) {
            const leftSpacer = Math.max(0, TOKENS.page.contentWidthPt - bubbleWidthPt);
            return {
                columns: [
                    { width: leftSpacer, text: '' },
                    {
                        width: bubbleWidthPt,
                        stack: [bubbleNode, ...subtextStack]
                    }
                ],
                columnGap: 0,
                unbreakable: true,
                margin: [0, 2, 0, 6]
            };
        }

        const AVATAR_SIZE_PT = 26;
        const AVATAR_COL_WIDTH_PT = 32;
        const avatarTopMarginPt = Math.max(0, Math.round(bubbleHeightPt - AVATAR_SIZE_PT));

        let avatarCol = { width: AVATAR_COL_WIDTH_PT, text: '' };
        const fallbackInitial = msg.avatarInitial || options.partnerFallbackInitial || 'U';
        const resolvedAvatarSvg =
            options.avatarSvg ||
            (!options.avatarDataUrl ? buildAvatarCircleSvg(fallbackInitial) : null);

        if (options.avatarDataUrl) {
            avatarCol = {
                width: AVATAR_COL_WIDTH_PT,
                image: options.avatarDataUrl,
                fit: [AVATAR_SIZE_PT, AVATAR_SIZE_PT],
                alignment: 'left',
                margin: [0, avatarTopMarginPt, 6, 0]
            };
        } else if (resolvedAvatarSvg) {
            avatarCol = {
                width: AVATAR_COL_WIDTH_PT,
                stack: [
                    {
                        svg: resolvedAvatarSvg,
                        width: AVATAR_SIZE_PT,
                        margin: [0, avatarTopMarginPt, 6, 0]
                    }
                ]
            };
        }

        const rightSpacer = Math.max(
            0,
            TOKENS.page.contentWidthPt - AVATAR_COL_WIDTH_PT - bubbleWidthPt
        );

        const rowStack = [
            {
                columns: [
                    avatarCol,
                    { width: bubbleWidthPt, stack: [bubbleNode] },
                    { width: rightSpacer, text: '' }
                ],
                columnGap: 0
            }
        ];

        if (subtextStack.length > 0) {
            rowStack.push({
                columns: [
                    { width: AVATAR_COL_WIDTH_PT, text: '' },
                    { width: bubbleWidthPt, stack: subtextStack },
                    { width: rightSpacer, text: '' }
                ],
                columnGap: 0
            });
        }

        return {
            stack: rowStack,
            unbreakable: true,
            margin: [0, 2, 0, 6]
        };
    }

    function buildSystemMessageNode(msg, fallbackDate = '') {
        const sysStack = [
            {
                text: buildRichTextWithEmojis(msg.title || 'Systemnachricht'),
                bold: true,
                fontSize: 10,
                color: '#111827',
                margin: [0, 0, 0, 2]
            }
        ];
        if (msg.breakdown) {
            sysStack.push({
                text: buildRichTextWithEmojis(msg.breakdown),
                fontSize: 9,
                bold: true,
                color: '#1d4b00',
                margin: [0, 0, 0, 3]
            });
        }
        if (msg.text) {
            sysStack.push({
                text: buildRichTextWithEmojis(msg.text),
                fontSize: 9,
                color: '#374151'
            });
        }

        const sysCard = buildRoundedCardPdfNode({
            widthPt: TOKENS.page.contentWidthPt,
            radiusPt: 8,
            fillColor: '#ffffff',
            strokeColor: '#d1d5db',
            roundBottomLeft: true,
            roundBottomRight: true,
            padX: 10,
            bodyStack: sysStack
        });

        const formattedTs = normalizeMessageTimestamp(msg.timestamp, msg.date || fallbackDate);
        const sysWrapperStack = [sysCard];
        if (formattedTs) {
            sysWrapperStack.push(
                buildMessageSubtextNode(`${formattedTs} · Automatische Nachricht`, true, [0, 2, 2, 0])
            );
        }

        return {
            stack: sysWrapperStack,
            unbreakable: true,
            margin: [0, 3, 0, 7]
        };
    }

    function buildEndOfChatNode(text = '\u2E3B Ende des Nachrichtenverlaufs \u2E3B') {
        const normalized = String(text || '\u2E3B Ende des Nachrichtenverlaufs \u2E3B')
            .replace(/---+/g, '\u2E3B');
        return {
            text: buildRichTextWithEmojis(normalized),
            alignment: 'center',
            fontSize: TOKENS.typography.endOfChatSize,
            bold: true,
            color: TOKENS.colors.textMuted,
            margin: [0, 14, 0, 14]
        };
    }

    /**
     * Zentrale Funktion zur Generierung des gesamten Nachrichtenverlaufs (für Kleinanzeigen & eBay):
     * - Fügt vor jedem neuen Tag automatisch die Überschrift "<dd. mmm. yyyy>" (z. B. "01. Jan. 2026") ein.
     * - Formatiert alle Zeitstempel einheitlich nach "<dd.mm.yyyy, hh:mm>".
     * - Positioniert das Nutzericon links unten an der Chat-Bubble (Unterkante = Unterkante der Bubble).
     * - Rendert Emojis sowie "⸻ Ende des Nachrichtenverlaufs ⸻" (U+2E3B).
     */
    function buildChatHistoryNodes(messages, options = {}) {
        const platform = options.platform || 'auto';
        const partnerAvatarDataUrl = options.partnerAvatarDataUrl || null;
        const partnerFallbackInitial = options.partnerFallbackInitial || 'U';
        const includeEndOfChat = options.includeEndOfChat !== false;

        const nodes = [];
        let lastDateGroupLabel = '';
        let lastKnownDateStr = '';

        if (Array.isArray(messages)) {
            for (const msg of messages) {
                if (msg.date && /\d/.test(msg.date)) {
                    lastKnownDateStr = msg.date;
                }

                const groupLabel =
                    msg.dateGroupLabel ||
                    formatDateGroupLabel(msg.timestamp || msg.date, lastKnownDateStr);

                if (groupLabel && groupLabel !== lastDateGroupLabel) {
                    lastDateGroupLabel = groupLabel;
                    nodes.push(buildDateSeparatorNode(groupLabel));
                }

                const parsedForFallback = parseAnyDateParts(msg.timestamp || msg.date, lastKnownDateStr);
                if (parsedForFallback && parsedForFallback.hasDate) {
                    lastKnownDateStr = parsedForFallback.numericDate;
                }

                if (msg.type === 'SYSTEM') {
                    nodes.push(buildSystemMessageNode(msg, lastKnownDateStr));
                    continue;
                }

                const isOwn = Boolean(msg.isOwn || msg.type === 'OUTBOUND');
                const avatarSvg =
                    !isOwn && !partnerAvatarDataUrl
                        ? options.avatarSvg ||
                          buildAvatarCircleSvg(msg.avatarInitial || partnerFallbackInitial)
                        : null;

                nodes.push(
                    buildChatMessageRow(msg, {
                        platform,
                        avatarDataUrl: !isOwn ? partnerAvatarDataUrl : null,
                        avatarSvg,
                        partnerFallbackInitial,
                        fallbackDate: lastKnownDateStr
                    })
                );
            }
        }

        if (includeEndOfChat) {
            nodes.push(buildEndOfChatNode());
        }

        ensurePdfMakeEmojiFontRegistered();
        return nodes;
    }

    function buildPageFooter() {
        return (currentPage, pageCount) => ({
            text: `${currentPage}/${pageCount}`,
            alignment: 'center',
            fontSize: TOKENS.typography.footerFontSize,
            color: TOKENS.colors.textMuted,
            margin: [0, 10, 0, 0]
        });
    }

    function normalizeGalleryImageDataUrl(sourceDataUrl, mode = TOKENS.gallery.cropMode) {
        return new Promise((resolve) => {
            if (!sourceDataUrl) {
                resolve('');
                return;
            }
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const targetW = TOKENS.gallery.canvasTargetWidthPx;
                const targetH = TOKENS.gallery.canvasTargetHeightPx;
                const srcW = img.naturalWidth || img.width || targetW;
                const srcH = img.naturalHeight || img.height || targetH;

                const canvas = document.createElement('canvas');
                canvas.width = targetW;
                canvas.height = targetH;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, targetW, targetH);

                if (mode === 'cover') {
                    const scale = Math.max(targetW / srcW, targetH / srcH);
                    const cropW = targetW / scale;
                    const cropH = targetH / scale;
                    const sx = (srcW - cropW) / 2;
                    const sy = (srcH - cropH) / 2;
                    ctx.drawImage(img, sx, sy, cropW, cropH, 0, 0, targetW, targetH);
                } else {
                    const scale = Math.min(targetW / srcW, targetH / srcH);
                    const drawW = Math.round(srcW * scale);
                    const drawH = Math.round(srcH * scale);
                    const dx = Math.round((targetW - drawW) / 2);
                    const dy = Math.round((targetH - drawH) / 2);
                    ctx.drawImage(img, 0, 0, srcW, srcH, dx, dy, drawW, drawH);
                }

                resolve(canvas.toDataURL('image/jpeg', 0.94));
            };
            img.onerror = () => resolve(sourceDataUrl);
            img.src = sourceDataUrl;
        });
    }

    function buildTwoColumnGallery(images, platform = 'auto', sectionTitlePrefix = 'Bilder') {
        if (!Array.isArray(images) || images.length === 0) return [];
        const total = images.length;
        const rows = [
            buildSectionHeader(`${sectionTitlePrefix} (${total})`, platform, {
                margin: [0, 10, 0, 6]
            })
        ];

        const getImgDataUrl = (item) => (typeof item === 'string' ? item : item?.dataUrl || '');

        for (let i = 0; i < total; i += 2) {
            const leftUrl = getImgDataUrl(images[i]);
            const rightUrl = i + 1 < total ? getImgDataUrl(images[i + 1]) : '';

            const buildCell = (dataUrl, indexOneBased) => ({
                width: '*',
                stack: [
                    {
                        image: dataUrl,
                        fit: [TOKENS.gallery.boxWidthPt, TOKENS.gallery.boxHeightPt],
                        alignment: 'center'
                    },
                    {
                        text: `${indexOneBased}/${total}`,
                        fontSize: TOKENS.typography.galleryCaptionSize,
                        bold: true,
                        color: TOKENS.colors.textMuted,
                        alignment: 'center',
                        margin: [0, 4, 0, 8]
                    }
                ]
            });

            rows.push({
                columns: [
                    buildCell(leftUrl, i + 1),
                    rightUrl ? buildCell(rightUrl, i + 2) : { width: '*', text: '' }
                ],
                columnGap: TOKENS.gallery.columnGapPt,
                margin: [0, 4, 0, 6],
                unbreakable: true
            });
        }

        return rows;
    }

    global.PdfSharedTheme = Object.freeze({
        TOKENS,
        MONTH_SHORT_DE,
        resolvePlatform,
        getTheme,
        measureTextWidthPt,
        cleanTextPreserveEmojis,
        extractTextFromNodePreserveEmojis,
        buildRichTextWithEmojis,
        ensurePdfMakeEmojiFontRegistered,
        normalizeMessageTimestamp,
        formatDateGroupLabel,
        buildTitleBar,
        buildLinkCell,
        buildTotalAmountCell,
        buildMetaTable,
        formatExportTimestamp,
        buildExportedAtNode,
        buildSectionHeader,
        buildDescriptionBlock,
        buildRoundedCardPdfNode,
        buildAvatarCircleSvg,
        buildChatBubbleNode,
        buildDateSeparatorNode,
        buildMessageSubtextNode,
        buildChatMessageRow,
        buildSystemMessageNode,
        buildEndOfChatNode,
        buildChatHistoryNodes,
        buildPageFooter,
        normalizeGalleryImageDataUrl,
        buildTwoColumnGallery
    });
})(typeof window !== 'undefined' ? window : globalThis);

window.PdfSharedTheme = PdfSharedTheme;
