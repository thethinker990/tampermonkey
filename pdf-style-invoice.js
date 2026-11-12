/**
 * PdfSharedTheme – Rechnungs-Stylesheet: Rechnung (DIN 5008 Form B, hochkant), Verkaufs- und Kaufbericht (quer).
 * Version: 4.2.0
 *
 * Geschäftsdokumente ohne Chat-Bausteine; setzt pdf-style-core.js voraus.
 *
 * Einbindung (Reihenfolge: core, article, chat, invoice; Versions-Parameter erzwingt Neuladen aus dem Tampermonkey-Cache):
 * // @require https://raw.githubusercontent.com/thethinker990/tampermonkey/main/pdf-style-invoice.js?v=4.2.0
 */
(function (global) {
    'use strict';

    const T = global.PdfSharedTheme;
    if (!T || !T._) throw new Error('pdf-style-core.js muss vor pdf-style-invoice.js per @require geladen werden');
    const {
        META_LABELS, TOKENS, ensurePdfMakeEmojiFontRegistered, resolvePlatform, formatEuroAmount, linkRun,
        buildRichTextWithEmojis, buildSectionHeader, buildPageFooter, pageBreakBeforeKeepWithNext
    } = T._;

    /* ==========================================================================
     * GRUNDLAGEN (Beträge in Cent)
     * ========================================================================== */

    const mm = (v) => (v * 72) / 25.4;
    const eur = (cents) => (cents === null || cents === undefined ? 'n/a' : formatEuroAmount(cents, true));
    const muted = TOKENS.colors.textMuted;
    const smallLabel = (text) => ({ text, fontSize: 8, bold: true, color: muted, margin: [0, 0, 0, 2] });
    const valueOrLink = (text, url) => (url && text ? [linkRun(text, url)] : text || 'n/a');

    // Plattform-Logos (Original-SVG der Website, Farben unverändert)
    const LOGOS = {
        ebay: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 122 48.592"><path fill="#F02D2D" d="M24.355 22.759c-.269-5.738-4.412-7.838-8.826-7.813-4.756.026-8.544 2.459-9.183 7.915zM6.234 26.93c.364 5.553 4.208 8.814 9.476 8.785 3.648-.021 6.885-1.524 7.952-4.763l6.306-.035c-1.187 6.568-8.151 8.834-14.145 8.866C4.911 39.844.043 33.865-.002 25.759c-.05-8.927 4.917-14.822 15.765-14.884 8.628-.048 14.978 4.433 15.033 14.291l.01 1.625z"/><path fill="#0968F6" d="M46.544 35.429c5.688-.032 9.543-4.148 9.508-10.32s-3.947-10.246-9.622-10.214-9.543 4.148-9.509 10.32 3.974 10.245 9.623 10.214zM30.652.029l6.116-.034.085 15.369c2.978-3.588 7.1-4.65 11.167-4.674 6.817-.037 14.412 4.518 14.468 14.454.045 8.29-5.941 14.407-14.422 14.454-4.463.026-8.624-1.545-11.218-4.681a33.237 33.237 0 01-.19 3.731l-5.994.034c.09-1.915.185-4.364.174-6.322z"/><path fill="#FFBD14" d="M77.282 25.724c-5.548.216-8.985 1.229-8.965 4.883.013 2.365 1.94 4.919 6.7 4.891 6.415-.035 9.826-3.556 9.794-9.289v-.637c-2.252.02-5.039.054-7.529.152zm13.683 7.506c.01 1.778.071 3.538.232 5.1l-5.688.032a33.381 33.381 0 01-.225-3.825c-3.052 3.8-6.708 4.909-11.783 4.938-7.532.042-11.585-3.915-11.611-8.518-.037-6.665 5.434-9.049 14.954-9.318 2.6-.072 5.529-.1 7.945-.116v-.637c-.026-4.463-2.9-6.285-7.854-6.257-3.68.021-6.368 1.561-6.653 4.2l-6.434.035c.645-6.566 7.53-8.269 13.595-8.3 7.263-.04 13.406 2.508 13.448 10.192z"/><path fill="#92C821" d="M91.939 19.852l-4.5-8.362 7.154-.04 10.589 20.922 10.328-21.02 6.486-.048-18.707 37.251-6.85.039 5.382-10.348-9.887-18.393"/></svg>'
    };
    const LOGO_WIDTH = 85;
    const logoNode = (platform, extra = {}) => (LOGOS[resolvePlatform(platform)] ? { svg: LOGOS[resolvePlatform(platform)], width: LOGO_WIDTH, ...extra } : null);

    const thinTable = {
        hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0 : 0.5),
        vLineWidth: () => 0,
        hLineColor: () => TOKENS.colors.tableBorder,
        paddingLeft: () => 4,
        paddingRight: () => 4,
        paddingTop: () => 3,
        paddingBottom: () => 3
    };

    const invisibleTable = {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        paddingLeft: (i) => (i === 0 ? 0 : 10),
        paddingRight: () => 0,
        paddingTop: () => 1,
        paddingBottom: () => 1
    };

    /** Beschriftung | Wert ohne sichtbaren Rahmen. rows: [[Beschriftung, Wert]] (leere Werte entfallen). */
    function labelValueTable(rows, fontSize = 9) {
        const body = rows.filter(([, v]) => v !== undefined && v !== null && v !== '').map(([l, v]) => [{ text: l, color: muted }, { text: v }]);
        return { table: { widths: ['auto', '*'], body }, layout: invisibleTable, fontSize };
    }

    function documentShell({ title, subject, author, footerNote, content, orientation = 'portrait', margins, background }) {
        ensurePdfMakeEmojiFontRegistered();
        return {
            pageSize: TOKENS.page.size,
            pageOrientation: orientation,
            pageMargins: margins,
            defaultStyle: { fontSize: 10, lineHeight: TOKENS.page.defaultLineHeight },
            info: { title, author, subject },
            footer: buildPageFooter(footerNote, [margins[0], margins[2]]),
            background,
            pageBreakBefore: pageBreakBeforeKeepWithNext,
            content
        };
    }

    /* ==========================================================================
     * RECHNUNG – DIN 5008 Form B (Maße: din-formate.info/de/din-5008)
     * ========================================================================== */

    const DIN = {
        margins: [mm(25), mm(20), mm(20), mm(22)],
        logoTop: mm(14),
        returnLineTop: mm(57),          // Rücksendeangabe: unten in der Zusatz- und Vermerkzone (45 – 62,7 mm)
        recipientTop: mm(62.7),         // Anschriftzone 27,3 mm
        addressWidth: mm(80),           // Anschriftfeld 85 mm, Text 5 mm eingerückt
        infoLeft: mm(125),
        infoTop: mm(50),
        infoWidth: mm(75),
        subjectTop: mm(98.5),           // zwei Leerzeilen unter dem Anschriftfeld (endet bei 90 mm)
        marks: [[mm(105), mm(5)], [mm(148.5), mm(7)], [mm(210), mm(5)]] // Falz-, Loch-, Falzmarke [y, Länge]
    };

    const foldMarks = (currentPage) => (currentPage !== 1 ? null : {
        canvas: DIN.marks.map(([y, len]) => ({ type: 'line', x1: mm(4), y1: y, x2: mm(4) + len, y2: y, lineWidth: 0.5, lineColor: '#9ca3af' }))
    });

    /**
     * Rechnung je Bestellung. inv = { platform, brand, scriptLabel, exportedAt, note,
     * seller:{name, lines, username}, buyer:{lines},
     * order:{orderId, orderUrl, recordNumber, soldDate, paidDate, invoiceDate, paymentMethod:{label,url},
     *        shippingService, trackingId, trackingUrl, shippedDate, deliveredDate},
     * items:[{title, itemId, itemUrl, quantity, unitPrice, total, imageDataUrl}],
     * amounts:{itemsTotal, shippingCharged, subtotal, refund, shippingActual, transactionFee, adFee, total}, shippingActualLabel }
     */
    function buildInvoiceDocument(inv) {
        const o = inv.order || {};
        const a = inv.amounts || {};
        const s = inv.seller || {};
        const pageWidth = mm(210);
        const footer = `${META_LABELS.EXPORTED_AT} ${inv.exportedAt} mit ${inv.scriptLabel}`;
        const documentLabel = inv.purchase ? 'Kaufbeleg' : 'Rechnung';
        const subject = `${inv.brand}-${documentLabel} \u2022 Bestellung ${o.orderId || 'n/a'}`;
        const logo = logoNode(inv.platform, { absolutePosition: { x: pageWidth - DIN.margins[2] - LOGO_WIDTH, y: DIN.logoTop } });

        const returnLine = [s.name, ...(s.lines || [])].filter(Boolean).join(' \u00b7 ');
        const infoBlock = {
            absolutePosition: { x: DIN.infoLeft, y: DIN.infoTop },
            width: DIN.infoWidth,
            fontSize: 9,
            stack: [
                { text: s.name || '', bold: true },
                ...(s.lines || []).map((l) => ({ text: l })),
                s.username ? { text: `${inv.brand}-Nutzername: ${s.username}`, margin: [0, 2, 0, 0] } : null,
                { ...labelValueTable([[inv.purchase ? 'Belegdatum' : 'Rechnungsdatum', o.invoiceDate]]), margin: [0, 8, 0, 0] }
            ].filter(Boolean)
        };

        const orderTable = labelValueTable([
            ['Bestellnummer', valueOrLink(o.orderId, o.orderUrl)],
            ['Verkaufsprotokollnr.', o.recordNumber],
            [inv.purchase ? 'Gekauft am' : 'Verkauft am', o.soldDate],
            ['Bezahlt am', o.paidDate],
            ['Zahlungsart', o.paymentMethod ? valueOrLink(o.paymentMethod.label, o.paymentMethod.url) : '']
        ]);
        const shippingTable = labelValueTable([
            ['Versandservice', o.shippingService || 'n/a'],
            ['Sendungsnummer', valueOrLink(o.trackingId, o.trackingUrl)],
            ['Versand am', o.shippedDate],
            ['Zugestellt am', o.deliveredDate]
        ]);

        const items = inv.items || [];
        const withImages = items.some((it) => it.imageDataUrl);
        const head = ['Artikel', 'Stückzahl', 'Artikelpreis', 'Artikelpreis gesamt'].map((t, i) => ({ text: t, bold: true, fontSize: 8.5, alignment: i === 0 ? 'left' : i === 1 ? 'center' : 'right' }));
        const itemRows = items.map((it) => [
            { stack: [{ text: it.title, bold: true }, { text: ['Artikelnummer: ', valueOrLink(it.itemId, it.itemUrl)].flat(), fontSize: 8, color: muted }] },
            { text: String(it.quantity || 1), alignment: 'center' },
            { text: eur(it.unitPrice), alignment: 'right' },
            { text: eur(it.total), alignment: 'right' }
        ]);
        if (withImages) {
            head.unshift({ text: '' });
            items.forEach((it, i) => itemRows[i].unshift(it.imageDataUrl ? { image: it.imageDataUrl, fit: [36, 36], alignment: 'center' } : { text: '' }));
        }

        const neg = (c) => (c === null || c === undefined ? null : -Math.abs(c));
        const sumRows = (inv.purchase ? [
            ['Artikelpreis gesamt', a.itemsTotal],
            ['Versand / Gebühren / Erstattungen (Differenz)', a.fees],
            ['Gesamtbetrag', a.total, true]
        ] : [
            ['Artikelpreis gesamt', a.itemsTotal],
            ['Versanderlös', a.shippingCharged],
            ['Zwischensumme', a.subtotal, true],
            ['Erstattungen / Rabatt', neg(a.refund)],
            [`Versandkosten${inv.shippingActualLabel ? ` (${inv.shippingActualLabel})` : ''}`, neg(a.shippingActual)],
            ['Transaktionsgebühren', neg(a.transactionFee)],
            ['Anzeigengebühren', neg(a.adFee)],
            ['Gesamtbetrag', a.total, true]
        ]).map(([label, cents, bold]) => [{ text: label, bold: Boolean(bold) }, { text: eur(cents), alignment: 'right', bold: Boolean(bold) }]);

        const content = [
            logo,
            { text: returnLine, fontSize: 7, color: muted, decoration: 'underline', absolutePosition: { x: DIN.margins[0], y: DIN.returnLineTop }, width: DIN.addressWidth },
            { stack: (inv.buyer && inv.buyer.lines || []).filter(Boolean).map((l) => ({ text: l })), fontSize: 10, absolutePosition: { x: DIN.margins[0], y: DIN.recipientTop }, width: DIN.addressWidth },
            infoBlock,
            { text: buildRichTextWithEmojis(subject), bold: true, fontSize: 12, margin: [0, DIN.subjectTop - DIN.margins[1], 0, 10] },
            { columns: [{ width: '*', stack: [smallLabel('Bestellung'), orderTable] }, { width: '*', stack: [smallLabel('Versand'), shippingTable] }], columnGap: 18, margin: [0, 0, 0, 12] },
            { table: { headerRows: 1, widths: [...(withImages ? [40] : []), '*', 50, 65, 80], body: [head, ...itemRows] }, layout: thinTable, fontSize: 9 },
            { columns: [{ width: '*', text: '' }, { width: 270, table: { widths: ['*', 80], body: sumRows }, layout: thinTable, fontSize: 9 }], margin: [0, 12, 0, 0] },
            inv.note ? { text: inv.note, fontSize: 8.5, color: muted, margin: [0, 16, 0, 0] } : null
        ].filter(Boolean);
        return documentShell({
            title: `${inv.brand}-${documentLabel} ${o.orderId || ''}`,
            subject,
            author: inv.scriptLabel,
            footerNote: footer,
            content,
            margins: DIN.margins,
            background: foldMarks
        });
    }

    /* ==========================================================================
     * BERICHTE (Verkauf/Kauf, quer)
     * ========================================================================== */

    /** Tabellenzelle: Zahl = Cent (rechtsbündig), Text, {text,url} = Link, {lines:[{text,url,label,bold,muted}]} = mehrzeilig. */
    function reportCell(c, col) {
        if (typeof c === 'number') return { text: eur(c), alignment: 'right', bold: Boolean(col.bold) };
        if (c === null || c === undefined) return { text: '' };
        if (typeof c === 'string') return { text: c, alignment: col.align || 'left' };
        if (c.lines) {
            return {
                stack: c.lines.filter((l) => l && l.text).map((l) => ({
                    text: [l.label || '', ...[valueOrLink(l.text, l.url)].flat()].filter(Boolean),
                    bold: Boolean(l.bold),
                    color: l.muted ? muted : undefined
                }))
            };
        }
        return { text: valueOrLink(c.text, c.url) };
    }

    /**
     * Bericht. rep = { platform, brand, scriptLabel, exportedAt, title, issuer:{name, username},
     * overview:[{label, cents, bold}], details:{ title, columns:[{label, width, align, bold}], rows:[[cell]], totals:[cell] } }
     */
    function buildReportDocument(rep) {
        const margins = [mm(18), mm(14), mm(15), mm(18)];
        const footer = `${META_LABELS.EXPORTED_AT} ${rep.exportedAt} mit ${rep.scriptLabel}`;
        const issuer = rep.issuer || {};
        const d = rep.details || { columns: [], rows: [] };
        const head = d.columns.map((c) => ({ text: c.label, bold: true, fontSize: 8, alignment: c.align || 'left' }));
        const body = d.rows.map((r) => r.map((c, i) => reportCell(c, d.columns[i])));
        if (d.totals) body.push(d.totals.map((c, i) => ({ ...reportCell(c, { ...d.columns[i], bold: true }), bold: true })));
        const overview = (rep.overview || []).map((r) => [{ text: r.label, bold: Boolean(r.bold) }, { text: eur(r.cents), alignment: 'right', bold: Boolean(r.bold) }]);

        const content = [
            {
                columns: [
                    { width: '*', stack: [{ text: issuer.name || '', bold: true, fontSize: 11 }, issuer.username ? { text: `${rep.brand}-Nutzername: ${issuer.username}`, fontSize: 9, color: muted } : null].filter(Boolean) },
                    logoNode(rep.platform) || { width: 1, text: '' }
                ],
                margin: [0, 0, 0, 12]
            },
            { text: buildRichTextWithEmojis(rep.title), bold: true, fontSize: 13, margin: [0, 0, 0, 6] },
            buildSectionHeader('Transaktionsübersicht', rep.platform, { margin: [0, 4, 0, 4] }),
            { columns: [{ width: 340, table: { widths: ['*', 100], body: overview }, layout: thinTable, fontSize: 9 }, { width: '*', text: '' }] },
            buildSectionHeader(d.title, rep.platform, { margin: [0, 14, 0, 4] }),
            { table: { headerRows: 1, dontBreakRows: true, widths: d.columns.map((c) => c.width || '*'), body: [head, ...body] }, layout: thinTable, fontSize: 8 }
        ];
        return documentShell({ title: rep.title, subject: rep.title, author: rep.scriptLabel, footerNote: footer, content, orientation: 'landscape', margins });
    }

    Object.assign(T, { buildInvoiceDocument, buildReportDocument });
})(typeof window !== 'undefined' ? window : globalThis);
