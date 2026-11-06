/**
 * PdfSharedTheme – Nachrichten-Stylesheet: Chat-Meta, Bubbles, Preisvorschläge, Systemnachrichten, Chat-PDF.
 * Version: 4.0.0
 *
 * buildExportDocument setzt Nachrichtenverlauf + Artikelseite zusammen; setzt pdf-style-core.js und pdf-style-article.js voraus.
 *
 * Einbindung (Reihenfolge: core, article, chat, invoice; Versions-Parameter erzwingt Neuladen aus dem Tampermonkey-Cache):
 * // @require https://raw.githubusercontent.com/thethinker990/tampermonkey/main/pdf-style-chat.js?v=4.0.0
 */
(function (global) {
    'use strict';

    const T = global.PdfSharedTheme;
    if (!T || !T._) throw new Error('pdf-style-core.js muss vor pdf-style-chat.js per @require geladen werden');
    if (!T._.buildAdMetaSection) throw new Error('pdf-style-article.js muss vor pdf-style-chat.js per @require geladen werden');
    const {
        META_LABELS, TOKENS, measureTextWidthPt, estimateWrappedLineCount, cleanTextPreserveEmojis, ensurePdfMakeEmojiFontRegistered, hasColorEmoji,
        buildRichTextWithEmojis, buildParagraphNodeWithColorEmojis, parseAnyDateParts, formatDateWithRelativeAge, normalizeMessageTimestamp, formatDateGroupLabel,
        resolvePlatform, getTheme, isNa, parseMoney, moneyGroupNeedsDecimals, formatMoneyText,
        moneyLayout, buildMoneyCell, sumMoney, linkRun, buildRichTextWithLinks, buildRunsNode,
        buildLinkCell, buildMetaTable, rowCountOf, buildTitleBar, buildExportedAtNode, linkOrText,
        formatCategory, keepTogether, buildPageFooter,         pageBreakBeforeKeepWithNext, buildAdMetaSection,
                buildDescriptionBlock, buildTwoColumnGallery
            } = T._;

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
            [L.CATEGORY, formatCategory(meta.category)],
            [L.AD_TYPE, meta.adType || 'n/a']
        ];
        const top = buildMetaTable(topRows, { startIndex: 0, width });
        let idx = rowCountOf(top);

        const fees = caps.fees && meta.role === 'SELLER' && !isNa(meta.orderId);
        const listedTotal = sumMoney([meta.listedPrice, meta.listedShipping]);
        const showFee = caps.buyerProtection && parseMoney(meta.buyerProtection).cents > 0;
        const agreedTotal = sumMoney([meta.price, meta.shipping, showFee ? meta.buyerProtection : 0]);
        // Verkäufer (eBay): Abzüge zusammengefasst; Details stehen in Rechnung und Excel
        const deductionParts = [meta.refund, meta.transactionFee, meta.adFee, meta.shippingActual];
        const deductions = !fees || deductionParts.some(isNa) ? 'n/a' : { special: '', prefix: '', cents: -deductionParts.reduce((s, v) => s + Math.abs(parseMoney(v).cents || 0), 0) };
        const earnings = !fees ? '' : deductions === 'n/a' ? 'n/a' : sumMoney([meta.price, meta.shipping, deductions]);
        const qty = parseInt(meta.quantity, 10);

        const leftValues = [meta.listedPrice, meta.listedShipping, listedTotal];
        const rightValues = fees
            ? [meta.price, meta.shipping, deductions, earnings]
            : [meta.price, meta.shipping, showFee ? meta.buyerProtection : null, agreedTotal].filter((v) => v !== null);
        const layout = moneyLayout([...leftValues, ...rightValues]);
        // Gemeinsame Spaltenbreite (Beträge/„EUR“ beider Tabellen untereinander); Sondertexte bündig mit der ersten Ziffer
        // des breitesten Betrags der EIGENEN Tabelle. Tabelle ganz ohne Beträge (z. B. Anzeige gelöscht) bleibt linksbündig.
        const layoutFor = (vals) => {
            const own = vals.filter((v) => v !== null);
            if (!own.some((v) => parseMoney(v).cents !== null)) return { ...layout, prefixW: 0, amountW: 0 };
            return { ...layout, numStart: Math.max(0, layout.amountW - moneyLayout(own).numW) };
        };
        const leftLayout = layoutFor(leftValues);
        const rightLayout = layoutFor(rightValues);

        const leftRows = [
            [L.LISTED_PRICE, buildMoneyCell(meta.listedPrice || 'n/a', leftLayout)],
            [L.LISTED_SHIPPING, buildMoneyCell(meta.listedShipping || 'n/a', leftLayout)],
            [L.LISTED_TOTAL, buildMoneyCell(listedTotal || 'n/a', leftLayout, true)]
        ];
        const cell = (v, bold = false) => buildMoneyCell(v || 'n/a', rightLayout, bold);
        const pieces = qty > 1 ? ` (${qty} Stück)` : '';
        const rightRows = fees
            ? [
                [`${L.SALE_ITEM_PRICE}${pieces}`, cell(meta.price)],
                [L.SALE_SHIPPING, cell(meta.shipping)],
                [L.SALE_DEDUCTIONS, cell(deductions)],
                [L.SALE_EARNINGS, cell(earnings, true)]
            ]
            : [
                [`${L.AGREED_PRICE}${pieces}`, cell(meta.price)],
                [L.AGREED_SHIPPING, cell(meta.shipping)],
                showFee ? [L.BUYER_PROTECTION, cell(meta.buyerProtection)] : null,
                [L.TOTAL_AMOUNT, cell(agreedTotal, true)]
            ].filter(Boolean);

        const gap = TOKENS.table.priceBlockGapPt;
        const halfWidth = Math.floor((width - gap) / 2);
        const halfLabel = Math.round(halfWidth * 0.52);
        // eBay: Anzeige- und Kaufpreis nur getrennt, wenn es einen Preisvorschlag gab; sonst ein Block
        // (mit Kaufdaten, falls vorhanden, sonst die Anzeigenpreise).
        let priceBlock;
        if (caps.priceComparisonOnlyWithOffer && !meta.hasOffer) {
            const hasDealPrice = !isNa(meta.price) || fees;
            const single = buildMetaTable(hasDealPrice ? rightRows : leftRows, { startIndex: idx, width });
            idx += rowCountOf(single);
            priceBlock = { stack: [single], margin: [0, 6, 0, 6] };
        } else {
            const left = buildMetaTable(leftRows, { startIndex: idx, width: halfWidth, labelWidth: halfLabel });
            const right = buildMetaTable(rightRows, { startIndex: idx, width: halfWidth, labelWidth: halfLabel });
            idx += Math.max(rowCountOf(left), rowCountOf(right));
            priceBlock = { columns: [{ width: halfWidth, stack: [left] }, { width: gap, text: '' }, { width: halfWidth, stack: [right] }], columnGap: 0, margin: [0, 6, 0, 6] };
        }

        const bottomRows = [
            caps.paymentMethod ? [L.PAYMENT_METHOD, { text: meta.paymentMethod || 'n/a', bold: !isNa(meta.paymentMethod) }] : null,
            [L.TRACKING_ID, isNa(meta.trackingId) ? 'n/a' : buildLinkCell(meta.trackingId, meta.trackingUrl || '', meta.trackingCarrier || '')],
            meta.returnTrackingId ? [L.RETURN_TRACKING_ID, isNa(meta.returnTrackingId) ? 'n/a' : buildLinkCell(meta.returnTrackingId, meta.returnTrackingUrl || '', meta.returnTrackingCarrier || '')] : null,
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
                priceBlock,
                bottom,
                buildExportedAtNode(model.exportedAt, model.scriptLabel)
            ]
        };
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

    // Kreis mit Ausrufezeichen (Fallback, falls die Seite kein eigenes Icon liefert)
    const WARNING_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><rect x="11" y="7" width="2" height="7" rx="1" fill="currentColor"/><circle cx="12" cy="16.5" r="1.2" fill="currentColor"/></svg>';

    /** Warnzeile unter einer Nachricht: Icon + Text + optional klickbarer Link (z. B. Kleinanzeigen "Achtung, Sicherheitsrisiko! Warum?"). */
    function buildMessageWarningNode(warning, isOwn) {
        const color = TOKENS.colors.textWarning;
        const svg = String(warning.iconSvg || WARNING_ICON_SVG).replace(/currentColor/g, color);
        const runs = [{ text: `${warning.text}${warning.linkText ? ' ' : ''}` }];
        if (warning.linkText) runs.push(warning.url ? { text: warning.linkText, link: warning.url, decoration: 'underline' } : { text: warning.linkText, decoration: 'underline' });
        const parts = [{ svg, width: 9, height: 9, margin: [0, 0.5, 0, 0] }, { width: 'auto', text: runs, fontSize: 8, bold: true, color }];
        return { columns: isOwn ? [{ width: '*', text: '' }, ...parts] : parts, columnGap: 3, margin: [2, 2, 2, 0] };
    }

    /** Eine Chat-Zeile (Bubble + Avatar + Zeitstempel) – unzerbrechlich. */
    function buildChatMessageRow(msg, options = {}) {
        const platform = options.platform || 'auto';
        const theme = getTheme(platform);
        const built = msg.kind === 'offer' ? buildOfferBubbleNode(msg, platform) : buildChatBubbleNode(msg, platform);
        const { bubbleNode, widthPt, heightPt, isOwn } = built;
        const content = TOKENS.page.contentWidthPt;

        const sub = [];
        if (msg.warning && msg.warning.text) sub.push(buildMessageWarningNode(msg.warning, isOwn));
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
            // eBay: schlichter, hellgrauer Hinweistext ohne Rahmen, zentriert (wie im Original)
            return { text: buildRunsNode(notice.runs), fontSize: 8, color: TOKENS.colors.textTimestamp, lineHeight: 1.25, alignment: 'center', margin: [0, 2, 0, 10] };
        }
        const width = TOKENS.page.contentWidthPt;
        const stack = [];
        if (notice.logoDataUrl) stack.push({ image: notice.logoDataUrl, width: notice.logoWidthPt || 92, margin: [0, 0, 0, 6] });
        if (notice.title) stack.push({ text: notice.title, bold: true, fontSize: 10, color: '#0c0c0b' });
        if (notice.subtitle) stack.push({ text: notice.subtitle, fontSize: 8.5, color: TOKENS.colors.textTimestamp, margin: [0, 2, 0, 0] });
        if (notice.runs && notice.runs.length) {
            // Grüne Box wie im Original abgerundet (Karte ohne Rahmen, innerhalb der äußeren Karte mit padX 10)
            const textNode = { text: buildRunsNode(notice.runs), fontSize: 8.5, color: theme.securityPill.text, lineHeight: 1.25 };
            stack.push({
                stack: [buildRoundedCardPdfNode({ widthPt: width - 20, radiusPt: 6, fillColor: theme.securityPill.fill, padX: 7, bodyStack: [textNode] })],
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

    Object.assign(T, { buildExportDocument });
})(typeof window !== 'undefined' ? window : globalThis);
