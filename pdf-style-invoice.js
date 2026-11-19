/**
 * PdfSharedTheme – Rechnungs-Stylesheet: Rechnung (DIN 5008 Form B, hochkant), Verkaufs- und Kaufbericht (quer).
 * Version: 4.5.0
 *
 * Geschäftsdokumente ohne Chat-Bausteine; setzt pdf-style-core.js voraus.
 *
 * Einbindung (Reihenfolge: core, article, chat, invoice; Versions-Parameter erzwingt Neuladen aus dem Tampermonkey-Cache):
 * // @require https://raw.githubusercontent.com/thethinker990/tampermonkey/main/pdf-style-invoice.js?v=4.5.0
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
        ebay: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 122 48.592"><path fill="#F02D2D" d="M24.355 22.759c-.269-5.738-4.412-7.838-8.826-7.813-4.756.026-8.544 2.459-9.183 7.915zM6.234 26.93c.364 5.553 4.208 8.814 9.476 8.785 3.648-.021 6.885-1.524 7.952-4.763l6.306-.035c-1.187 6.568-8.151 8.834-14.145 8.866C4.911 39.844.043 33.865-.002 25.759c-.05-8.927 4.917-14.822 15.765-14.884 8.628-.048 14.978 4.433 15.033 14.291l.01 1.625z"/><path fill="#0968F6" d="M46.544 35.429c5.688-.032 9.543-4.148 9.508-10.32s-3.947-10.246-9.622-10.214-9.543 4.148-9.509 10.32 3.974 10.245 9.623 10.214zM30.652.029l6.116-.034.085 15.369c2.978-3.588 7.1-4.65 11.167-4.674 6.817-.037 14.412 4.518 14.468 14.454.045 8.29-5.941 14.407-14.422 14.454-4.463.026-8.624-1.545-11.218-4.681a33.237 33.237 0 01-.19 3.731l-5.994.034c.09-1.915.185-4.364.174-6.322z"/><path fill="#FFBD14" d="M77.282 25.724c-5.548.216-8.985 1.229-8.965 4.883.013 2.365 1.94 4.919 6.7 4.891 6.415-.035 9.826-3.556 9.794-9.289v-.637c-2.252.02-5.039.054-7.529.152zm13.683 7.506c.01 1.778.071 3.538.232 5.1l-5.688.032a33.381 33.381 0 01-.225-3.825c-3.052 3.8-6.708 4.909-11.783 4.938-7.532.042-11.585-3.915-11.611-8.518-.037-6.665 5.434-9.049 14.954-9.318 2.6-.072 5.529-.1 7.945-.116v-.637c-.026-4.463-2.9-6.285-7.854-6.257-3.68.021-6.368 1.561-6.653 4.2l-6.434.035c.645-6.566 7.53-8.269 13.595-8.3 7.263-.04 13.406 2.508 13.448 10.192z"/><path fill="#92C821" d="M91.939 19.852l-4.5-8.362 7.154-.04 10.589 20.922 10.328-21.02 6.486-.048-18.707 37.251-6.85.039 5.382-10.348-9.887-18.393"/></svg>',
        kleinanzeigen: '<svg width="139" height="36" viewBox="0 0 139 36" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21.9484 27.1475C19.2433 27.1475 17.92 25.2702 17.6513 24.8823C16.8528 25.6637 15.6475 27.1475 13.4764 27.1475C10.9693 27.1475 8.85583 25.2633 8.85583 22.2083V12.0213C8.85583 8.95939 10.9728 7.08215 13.4764 7.08215C15.9801 7.08215 18.097 9.07598 18.097 11.9748C18.5858 11.802 19.1045 11.7125 19.6377 11.7125C22.217 11.7125 24.2583 13.8152 24.2583 16.3427C24.2583 17.0513 24.1236 17.6815 23.8292 18.2852C25.465 19.0139 26.569 20.6538 26.569 22.5172C26.569 25.0704 24.4958 27.1475 21.9484 27.1475ZM18.7684 23.7629C19.4329 24.9198 20.5514 25.604 21.9484 25.604C23.6466 25.604 25.029 24.2188 25.029 22.5172C25.029 21.1708 24.1653 19.9994 22.9225 19.5871L18.7684 23.7636V23.7629ZM13.4771 8.62559C11.9441 8.62559 10.3965 9.67559 10.3965 12.0213V22.2083C10.3965 24.554 11.9434 25.604 13.4771 25.604C14.6942 25.604 15.367 24.9885 16.4522 23.901L16.9327 23.4194C16.6848 22.6789 16.5571 21.8572 16.5571 20.973V12.0206C16.5571 9.6749 15.0102 8.62489 13.4764 8.62489L13.4771 8.62559ZM18.0977 13.6681V20.9737C18.0977 21.3874 18.1324 21.7808 18.1984 22.1514L21.5463 18.7967C22.5191 17.8223 22.7183 17.111 22.7183 16.3434C22.7183 14.7035 21.4033 13.2566 19.6377 13.2566C19.0885 13.2566 18.5629 13.3982 18.0977 13.6688V13.6681ZM33.6543 11.7125H35.5908V18.4546C37.0912 17.8091 38.1243 16.68 38.786 14.9381H40.771C40.2225 16.5995 39.4476 17.8897 38.4152 18.8251L41.5618 23.003H39.2706L36.9148 19.8578C36.4954 20.0514 36.0594 20.2124 35.5915 20.3415V23.003H33.655V11.7125H33.6543ZM42.2387 20.7288V11.7125H44.0786V20.6323C44.0786 21.3901 44.2883 21.6164 44.7077 21.6164C44.95 21.6164 45.1756 21.5678 45.4659 21.4387V23.0037C45.127 23.1327 44.7396 23.2292 44.2876 23.2292C43.0448 23.2292 42.238 22.5838 42.238 20.7295L42.2387 20.7288ZM46.0873 18.9709C46.0873 16.4066 47.7008 14.7126 50.2503 14.7126C53.09 14.7126 54.5592 16.8417 53.7843 19.4872H48.0397C48.2014 20.8259 48.9436 21.6164 50.2344 21.6164C51.0897 21.6164 51.8965 21.2132 52.3485 20.6968L53.7524 21.6969C52.9456 22.5678 51.7833 23.2292 50.2024 23.2292C47.6849 23.2292 46.0873 21.5359 46.0873 18.9709ZM52.0416 18.1804C52.1548 17.0194 51.4931 16.2609 50.2184 16.2609C48.9436 16.2609 48.266 16.9382 48.0723 18.1804H52.0416ZM56.3047 11.4224C56.9663 11.4224 57.4829 11.9387 57.4829 12.6001C57.4829 13.2614 56.9663 13.7778 56.3047 13.7778C55.643 13.7778 55.1264 13.2614 55.1264 12.6001C55.1264 11.9387 55.643 11.4224 56.3047 11.4224ZM55.3687 14.9388H57.2086V23.0037H55.3687V14.9388ZM58.9944 14.9388H60.8343V16.4226C61.3668 15.358 62.3514 14.7126 63.5775 14.7126C66.1756 14.7126 66.1756 17.2769 66.1756 18.4872V23.0037H64.3357V18.5358C64.3357 17.6162 64.3357 16.3101 62.9158 16.3101C61.6897 16.3101 60.8343 17.4066 60.8343 19.0521V23.0037H58.9944V14.9388ZM75.2974 21.6164C75.4265 21.6164 75.5876 21.6004 75.7327 21.5359V23.0522C75.4425 23.1813 75.1842 23.2299 74.8614 23.2299C73.8928 23.2299 73.3443 22.4554 73.3443 21.3749V21.1167C72.8118 22.4554 71.7148 23.2299 70.2137 23.2299C68.5029 23.2299 67.4379 22.2299 67.4379 20.8266C67.4379 19.1978 68.8577 18.2137 71.1329 18.2137C71.762 18.2137 72.4077 18.2942 72.9729 18.4233C72.9729 17.2297 72.4244 16.3101 71.1975 16.3101C70.3262 16.3101 69.6805 16.7293 69.584 17.6003H67.7281C67.7926 15.8424 69.1965 14.7133 71.2295 14.7133C73.747 14.7133 74.8121 16.2456 74.8121 18.4233V21.0848C74.8121 21.472 75.0218 21.6171 75.296 21.6171L75.2974 21.6164ZM70.5851 21.7614C71.7634 21.7614 72.7312 21.0036 73.0381 19.8259C72.5056 19.6482 71.8599 19.5518 71.2794 19.5518C69.9561 19.5518 69.3104 20.0355 69.3104 20.7773C69.3104 21.4228 69.7943 21.7614 70.5851 21.7614ZM76.854 14.9388H78.6939V16.4226C79.2265 15.358 80.211 14.7126 81.4371 14.7126C84.0352 14.7126 84.0352 17.2769 84.0352 18.4872V23.0037H82.1953V18.5358C82.1953 17.6162 82.1953 16.3101 80.7755 16.3101C79.5493 16.3101 78.6939 17.4066 78.6939 19.0521V23.0037H76.854V14.9388ZM85.1982 21.5359L89.4425 16.4711H85.4891V14.9388H91.8309V16.1165L87.3123 21.5359H91.992V23.0037H85.1982V21.5359ZM92.6529 18.9716C92.6529 16.4073 94.2665 14.7133 96.816 14.7133C99.6557 14.7133 101.125 16.8424 100.35 19.4879H94.6053C94.7671 20.8266 95.5093 21.6171 96.8 21.6171C97.6554 21.6171 98.4622 21.2139 98.9142 20.6975L100.318 21.6976C99.5113 22.5685 98.349 23.2299 96.7681 23.2299C94.2505 23.2299 92.6529 21.5366 92.6529 18.9716ZM98.6073 18.1811C98.7205 17.0201 98.0588 16.2616 96.784 16.2616C95.5093 16.2616 94.8317 16.9389 94.638 18.1811H98.6073ZM102.87 11.4231C103.532 11.4231 104.049 11.9394 104.049 12.6008C104.049 13.2621 103.532 13.7785 102.87 13.7785C102.209 13.7785 101.692 13.2621 101.692 12.6008C101.692 11.9394 102.209 11.4231 102.87 11.4231ZM101.934 14.9395H103.774V23.0044H101.934V14.9395ZM104.95 23.6657H106.871C107.016 24.3431 107.742 24.8434 108.921 24.8434C110.002 24.8434 110.679 24.4076 110.679 23.7303C110.679 22.2299 106.37 23.1175 106.37 21.472C106.37 20.9238 106.854 20.6496 107.532 20.4401C105.999 20.1979 105.014 19.1819 105.014 17.7141C105.014 15.9395 106.483 14.7299 108.678 14.7299C109.807 14.7299 110.727 15.0526 111.372 15.5849C111.533 15.1331 111.485 14.4558 111.372 13.9395H112.872C113.034 14.875 112.727 15.9076 112.066 16.4718C112.243 16.8265 112.34 17.2463 112.34 17.6815C112.34 20.8592 108.403 20.4234 108.403 21.0362C108.403 21.8107 112.598 20.9876 112.598 23.7462C112.598 25.3591 111.081 26.4563 108.935 26.4563C106.627 26.4563 105.256 25.1661 104.949 23.6657H104.95ZM108.678 19.1652C109.727 19.1652 110.421 18.601 110.421 17.746C110.421 16.891 109.743 16.3268 108.678 16.3268C107.613 16.3268 106.935 16.891 106.935 17.746C106.935 18.601 107.629 19.1652 108.678 19.1652ZM113.506 18.9716C113.506 16.4073 115.12 14.7133 117.669 14.7133C120.509 14.7133 121.978 16.8424 121.203 19.4879H115.459C115.621 20.8266 116.363 21.6171 117.653 21.6171C118.509 21.6171 119.316 21.2139 119.768 20.6975L121.172 21.6976C120.365 22.5685 119.202 23.2299 117.622 23.2299C115.104 23.2299 113.506 21.5366 113.506 18.9716ZM119.461 18.1811C119.574 17.0201 118.912 16.2616 117.638 16.2616C116.363 16.2616 115.685 16.9389 115.491 18.1811H119.461ZM122.761 14.9388H124.601V16.4226C125.133 15.358 126.118 14.7126 127.344 14.7126C129.942 14.7126 129.942 17.2769 129.942 18.4872V23.0037H128.102V18.5358C128.102 17.6162 128.102 16.3101 126.682 16.3101C125.456 16.3101 124.601 17.4066 124.601 19.0521V23.0037H122.761V14.9388Z" fill="#326916"/></svg>'
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
        const idLabel = o.idLabel || 'Bestellnummer';
        const subject = `${inv.brand}-${documentLabel} \u2022 ${o.idLabel || 'Bestellung'} ${o.orderId || 'n/a'}`;
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
            [idLabel, valueOrLink(o.orderId, o.orderUrl)],
            ...(o.recordNumber ? [['Verkaufsprotokollnr.', o.recordNumber]] : []),
            [inv.purchase ? 'Gekauft am' : 'Verkauft am', o.soldDate],
            ['Bezahlt am', o.paidDate],
            ['Zahlungsart', o.paymentMethod ? valueOrLink(o.paymentMethod.label, o.paymentMethod.url) : '']
        ]);
        const shippingTable = labelValueTable([
            ['Versandservice', o.shippingService || 'n/a'],
            ['Versanddienstleister', o.shippingCarrier],
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
            ['Versand / Gebühren (Differenz)', a.fees],
            ...(a.refund ? [['Rückerstattung', neg(a.refund)]] : []),
            ['Gesamtbetrag', a.total, true]
        ] : [
            ['Artikelpreis gesamt', a.itemsTotal],
            ['Versanderlös', a.shippingCharged],
            ['Zwischensumme', a.subtotal, true],
            ['Erstattungen / Rabatt', neg(a.refund)],
            [`Versandkosten${inv.shippingActualLabel ? ` (${inv.shippingActualLabel})` : ''}`, neg(a.shippingActual)],
            [inv.transactionFeeLabel || 'Transaktionsgebühren', neg(a.transactionFee)],
            ['Anzeigengebühren', neg(a.adFee)],
            ['Gesamtbetrag', a.total, true]
        ]).map(([label, cents, bold]) => [{ text: label, bold: Boolean(bold) }, { text: eur(cents), alignment: 'right', bold: Boolean(bold) }]);

        const content = [
            logo,
            { text: returnLine, fontSize: 7, color: muted, decoration: 'underline', absolutePosition: { x: DIN.margins[0], y: DIN.returnLineTop }, width: DIN.addressWidth },
            { stack: (inv.buyer && inv.buyer.lines || []).filter(Boolean).map((l) => ({ text: l })), fontSize: 10, absolutePosition: { x: DIN.margins[0], y: DIN.recipientTop }, width: DIN.addressWidth },
            infoBlock,
            { text: buildRichTextWithEmojis(subject), bold: true, fontSize: 12, margin: [0, DIN.subjectTop - DIN.margins[1], 0, 10] },
            { columns: [{ width: '*', stack: [smallLabel(o.idLabel ? 'Anzeige' : 'Bestellung'), orderTable] }, { width: '*', stack: [smallLabel('Versand'), shippingTable] }], columnGap: 18, margin: [0, 0, 0, 12] },
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
