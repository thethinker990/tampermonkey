/**
 * Zentrale Design-, Layout- & Komponenten-Bibliothek für eBay & Kleinanzeigen PDF-Export (pdfmake)
 *
 * Einbindung in beide Tampermonkey-Skripte via:
 * // @require https://raw.githubusercontent.com/thethinker990/tampermonkey/main/pdf-shared-theme.js
 */
(function (global) {
    'use strict';

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
                    inboundBorder: '#d5d7da',
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
                    outboundFill: '#f3f4f6',
                    outboundBorder: null,
                    outboundText: '#111827',
                    inboundFill: '#ffffff',
                    inboundBorder: '#d5d7da',
                    inboundText: '#111827',
                    offerBoxOwnFill: '#ffffff',
                    offerBoxPartnerFill: '#f9fafb',
                    offerBoxBorder: '#d5d7da',
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
        ctx.font = `${isBold ? 'bold ' : ''}${fontSizePt}px Roboto, Arial, sans-serif`;
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
        if (!str) return '';
        return String(str)
            .replace(/\u00a0/g, ' ')
            .replace(/[ \t]+/g, ' ')
            .trim();
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
                            text: cleanTextPreserveEmojis(titleText || 'Unbekannter Artikel'),
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
                text: cleanTextPreserveEmojis(label),
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
                          text: cleanTextPreserveEmojis(val),
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
            text: cleanTextPreserveEmojis(titleText),
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
                                text: cleanTextPreserveEmojis(descriptionText),
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

    function buildChatBubbleNode(msg, platform = 'auto') {
        const theme = getTheme(platform);
        const bTheme = theme.bubble;
        const isOwn = Boolean(msg.isOwn || msg.type === 'OUTBOUND');

        const MAX_BUBBLE_WIDTH_PT = Math.round(TOKENS.page.contentWidthPt * 0.62);
        const MIN_BUBBLE_WIDTH_PT = 78;
        const padX = 9;

        const fillColor = isOwn ? bTheme.outboundFill : bTheme.inboundFill;
        const strokeColor = isOwn ? bTheme.outboundBorder : bTheme.inboundBorder;
        const textColor = isOwn ? bTheme.outboundText : bTheme.inboundText;

        const roundBottomLeft = bTheme.sharpCornerOnSendersSide ? isOwn : true;
        const roundBottomRight = bTheme.sharpCornerOnSendersSide ? !isOwn : true;

        const bubbleStack = [];
        let longestContentPt = 0;

        if (msg.offer) {
            const offerTitleW = measureTextWidthPt(msg.offer.title || 'Preisvorschlag', 9.5, true);
            const offerAmountW = measureTextWidthPt(msg.offer.amount || '', 11, true);
            longestContentPt = Math.max(longestContentPt, offerTitleW + 20, offerAmountW + 20);

            bubbleStack.push({
                table: {
                    widths: ['*'],
                    body: [
                        [
                            {
                                stack: [
                                    {
                                        text: cleanTextPreserveEmojis(msg.offer.title || 'Preisvorschlag'),
                                        bold: true,
                                        fontSize: 9.5,
                                        color: '#111111'
                                    },
                                    {
                                        text: cleanTextPreserveEmojis(msg.offer.amount || ''),
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

                bubbleStack.push({
                    image: imgDataUrl,
                    fit: [175, 175],
                    margin: [0, 2, 0, 4]
                });
                if (labelText) {
                    bubbleStack.push({
                        text: cleanTextPreserveEmojis(labelText),
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
                text: cleanTextPreserveEmojis(msg.text),
                fontSize: TOKENS.typography.bodyFontSize,
                lineHeight: TOKENS.page.defaultLineHeight,
                color: textColor
            });
        }

        if (msg.warningText) {
            const warnW = measureTextWidthPt(`⚠️ ${msg.warningText}`, 8, true);
            longestContentPt = Math.max(longestContentPt, warnW);
        }

        const bubbleWidthPt = Math.min(
            MAX_BUBBLE_WIDTH_PT,
            Math.max(MIN_BUBBLE_WIDTH_PT, Math.ceil(longestContentPt + padX * 2 + 6))
        );

        const bubbleNode = buildRoundedCardPdfNode({
            widthPt: bubbleWidthPt,
            radiusPt: 9,
            fillColor,
            strokeColor: strokeColor || '',
            roundBottomLeft,
            roundBottomRight,
            padX,
            bodyStack: bubbleStack
        });

        return { bubbleNode, bubbleWidthPt, isOwn };
    }

    function buildDateSeparatorNode(dateText) {
        return {
            text: cleanTextPreserveEmojis(dateText),
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
            text: cleanTextPreserveEmojis(text),
            fontSize: TOKENS.typography.messageTimestampSize,
            color: TOKENS.colors.textTimestamp,
            alignment: isRightAligned ? 'right' : 'left',
            margin: customMargin || [2, 2, 2, 0]
        };
    }

    function buildChatMessageRow(msg, options = {}) {
        const platform = options.platform || 'auto';
        const { bubbleNode, bubbleWidthPt, isOwn } = buildChatBubbleNode(msg, platform);
        const stack = [bubbleNode];

        if (msg.warningText) {
            stack.push({
                text: cleanTextPreserveEmojis(`⚠️ ${msg.warningText}`),
                fontSize: 8,
                bold: true,
                color: TOKENS.colors.textWarning,
                alignment: isOwn ? 'right' : 'left',
                margin: [2, 2, 2, 0]
            });
        }

        if (msg.timestamp) {
            stack.push(buildMessageSubtextNode(msg.timestamp, isOwn, [2, 2, 2, 0]));
        }

        if (isOwn) {
            const leftSpacer = Math.max(0, TOKENS.page.contentWidthPt - bubbleWidthPt);
            return {
                columns: [
                    { width: leftSpacer, text: '' },
                    { width: bubbleWidthPt, stack }
                ],
                columnGap: 0,
                unbreakable: true,
                margin: [0, 2, 0, 6]
            };
        }

        const AVATAR_COL_WIDTH_PT = 32;
        let avatarCol = { width: AVATAR_COL_WIDTH_PT, text: '' };

        if (options.avatarSvg) {
            avatarCol = {
                width: AVATAR_COL_WIDTH_PT,
                stack: [{ svg: options.avatarSvg, width: 26, margin: [0, 0, 6, 0] }]
            };
        } else if (options.avatarDataUrl) {
            avatarCol = {
                width: AVATAR_COL_WIDTH_PT,
                image: options.avatarDataUrl,
                fit: [26, 26],
                alignment: 'left',
                margin: [0, 0, 6, 0]
            };
        }

        const rightSpacer = Math.max(
            0,
            TOKENS.page.contentWidthPt - AVATAR_COL_WIDTH_PT - bubbleWidthPt
        );

        return {
            columns: [
                avatarCol,
                { width: bubbleWidthPt, stack },
                { width: rightSpacer, text: '' }
            ],
            columnGap: 0,
            unbreakable: true,
            margin: [0, 2, 0, 6]
        };
    }

    function buildEndOfChatNode(text = '⸻ Ende des Nachrichtenverlaufs ⸻') {
        return {
            text: cleanTextPreserveEmojis(text),
            alignment: 'center',
            fontSize: TOKENS.typography.endOfChatSize,
            bold: true,
            color: TOKENS.colors.textMuted,
            margin: [0, 14, 0, 14]
        };
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
        resolvePlatform,
        getTheme,
        measureTextWidthPt,
        cleanTextPreserveEmojis,
        buildTitleBar,
        buildLinkCell,
        buildTotalAmountCell,
        buildMetaTable,
        formatExportTimestamp,
        buildExportedAtNode,
        buildSectionHeader,
        buildDescriptionBlock,
        buildRoundedCardPdfNode,
        buildChatBubbleNode,
        buildDateSeparatorNode,
        buildMessageSubtextNode,
        buildChatMessageRow,
        buildEndOfChatNode,
        buildPageFooter,
        normalizeGalleryImageDataUrl,
        buildTwoColumnGallery
    });
})(typeof window !== 'undefined' ? window : globalThis);

window.PdfSharedTheme = PdfSharedTheme;
