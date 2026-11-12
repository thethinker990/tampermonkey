/**
 * PdfSharedTheme – Artikel-Stylesheet: Anzeigen-Meta, Artikelmerkmale, Beschreibung.
 * Version: 4.2.0
 *
 * Baut die Artikel-/Anzeigenseite des Chat-PDFs; setzt pdf-style-core.js voraus.
 *
 * Einbindung (Reihenfolge: core, article, chat, invoice; Versions-Parameter erzwingt Neuladen aus dem Tampermonkey-Cache):
 * // @require https://raw.githubusercontent.com/thethinker990/tampermonkey/main/pdf-style-article.js?v=4.2.0
 */
(function (global) {
    'use strict';

    const T = global.PdfSharedTheme;
    if (!T || !T._) throw new Error('pdf-style-core.js muss vor pdf-style-article.js per @require geladen werden');
    const {
        META_LABELS, TOKENS, stripTrailingColon, buildParagraphNodeWithColorEmojis, formatDateWithRelativeAge, isNa, moneyLayout,
        buildMoneyCell, sumMoney, buildMetaTable, rowCountOf, buildSectionHeader, buildExportedAtNode,
        linkOrText, formatCategory, keepTogether
    } = T._;

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
            [L.CATEGORY, formatCategory(meta.category)],
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
        stack.push(buildExportedAtNode(model.exportedAt, model.scriptLabel));
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

    Object.assign(T._, { buildAdMetaSection, normalizeAttributes, buildDescriptionBlock });
})(typeof window !== 'undefined' ? window : globalThis);
