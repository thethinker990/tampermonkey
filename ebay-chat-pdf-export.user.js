// ==UserScript==
// @name         eBay Chat PDF-Export
// @namespace    https://ebay.de/
// @version      3.0.0
// @description  Exportiert eBay.de-Nachrichtenverläufe inkl. Artikeldetails, Bildern (auch als PDF-Anhang), Übersetzungen und Preisvorschlägen als PDF. Nutzt die gemeinsamen Bibliotheken PdfSharedTheme + MarketplaceExportCore.
// @author       Patrick Schnitzer
// @match        https://www.ebay.de/cnt/*
// @match        https://www.ebay.de/mes/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/pdfmake.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/vfs_fonts.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js
// @require      https://raw.githubusercontent.com/thethinker990/tampermonkey/v3.0.0/pdf-shared-theme.js
// @require      https://raw.githubusercontent.com/thethinker990/tampermonkey/v3.0.0/marketplace-export-core.js
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      i.ebayimg.com
// @connect      i6.ebayimg.com
// @connect      www.ebay.de
// @connect      vi.vipr.ebaydesc.com
// @connect      itm.ebaydesc.com
// @connect      api.ebay.com
// @connect      api-free.deepl.com
// @connect      api.deepl.com
// @connect      localhost
// @connect      127.0.0.1
// @run-at       document-idle
// @sandbox      DOM
// @inject-into  content
// ==/UserScript==

(function () {
    'use strict';

    const SCRIPT_VERSION = '3.0.0';
    const Core = window.MarketplaceExportCore;
    const Theme = window.PdfSharedTheme;
    const { cleanText } = Core;

    const SEL = Object.freeze({
        header: '.msg-conversation-head',
        headerPartnerLink: '.msg-conversation-head__section a.ux-action',
        dropdown: '.msg-conversation-head__dropdown',
        thread: '[data-testid="messages-thread"]',
        threadItems: '.app-conversations__subcontainer > *',
        cardTitleLink: '.app-base-item-card-v2__item-title a',
        cardPrice: '.app-base-item-card-v2 .ux-section .ux-textspans--BOLD',
        cardImage: '.app-base-item-card-v2__image img',
        orderLink: '.order-id a',
        legal: '.app-conversations__legal__info'
    });

    /* ------------------------------------------------------------------ Hilfen */

    function textOfDisplaySpans(root) {
        if (!root) return '';
        const spans = Array.from(root.querySelectorAll('[data-testid="ux-textual-display"]'));
        if (spans.length === 0) return Theme.extractTextFromNodePreserveEmojis(root, ['.clipped']);
        return spans.map((s) => Theme.extractTextFromNodePreserveEmojis(s)).filter(Boolean).join('\n');
    }

    function hiRes(url) {
        return String(url || '').replace(/\/s-l\d+(\.\w+)/i, '/s-l1600$1').replace(/\$_\d+\.(JPG|PNG|WEBP)/i, '$_57.$1');
    }

    function parseEbayDay(raw) {
        const s = cleanText(raw);
        const parsed = Theme.parseAnyDateParts(s);
        return parsed && parsed.hasDate ? parsed.numericDate : '';
    }

    /** Parameter der Aktion "Hilfe & Melden" (enthält userType, conversation_id, Namen, IDs). */
    function readActionParams(doc = document) {
        const nodes = Array.from(doc.querySelectorAll('[data-action]'));
        let fallback = null;
        for (const n of nodes) {
            try {
                const parsed = JSON.parse(n.getAttribute('data-action'));
                const p = parsed && parsed.params;
                if (!p) continue;
                if (p.userType) return p;
                if (p.conversation_id && !fallback) fallback = p;
            } catch { /* kein JSON */ }
        }
        return fallback || {};
    }

    function getQuestionIdFromUrl() {
        const u = new URL(window.location.href);
        return u.searchParams.get('question_id') || u.searchParams.get('conversation_id') || '';
    }

    /* ------------------------------------------------------------- Nachrichten */

    const convTextOf = (conv) => textOfDisplaySpans(conv.querySelector('[data-testid="message-bubble_content"]'));

    /**
     * eBay zeigt bei automatischer Übersetzung nur EINE Fassung. Über den Button "Originalnachrichten anzeigen"
     * (data-testid="translation-cta") wird umgeschaltet: Zustand lesen, umschalten, lesen, zurückschalten.
     * Ergebnis: Map(DOM-Index der Konversation -> {original, translation}).
     */
    async function readEbayTranslationPairs(thread) {
        const pairs = new Map();
        const btn = document.querySelector('button[data-testid="translation-cta"]');
        if (!btn) return pairs;
        const showsTranslations = /Original/i.test(btn.textContent || '');
        const snapshot = () => Array.from(thread.querySelectorAll('[data-testid="app-conversation"]')).map(convTextOf);
        const before = snapshot();
        const labelBefore = cleanText(btn.textContent);
        btn.click();
        let after = before;
        for (let i = 0; i < 40; i++) {
            await Core.sleep(150);
            const now = document.querySelector('button[data-testid="translation-cta"]');
            after = snapshot();
            if ((now && cleanText(now.textContent) !== labelBefore) || after.some((t, k) => t !== before[k])) break;
        }
        await Core.sleep(300);
        after = snapshot();
        const back = document.querySelector('button[data-testid="translation-cta"]');
        if (back && cleanText(back.textContent) !== labelBefore) {
            back.click();
            await Core.sleep(400);
        }
        if (after.length !== before.length) return pairs;
        before.forEach((text, i) => {
            const other = after[i];
            if (!text || !other || text === other) return;
            pairs.set(i, showsTranslations ? { original: other, translation: text } : { original: text, translation: other });
        });
        return pairs;
    }

    async function extractMessages(params) {
        const thread = document.querySelector(SEL.thread);
        if (!thread) throw new Error('Kein Nachrichtenverlauf gefunden – bitte zuerst eine Konversation öffnen.');
        const translationPairs = await readEbayTranslationPairs(thread);
        const convOrder = Array.from(thread.querySelectorAll('[data-testid="app-conversation"]'));
        const items = Array.from(thread.querySelectorAll(SEL.threadItems)).reverse();
        const messages = [];
        const chatImages = [];
        let currentDate = parseEbayDay('Heute');
        let imgCounter = 0;
        let acceptedOffer = null;

        for (const el of items) {
            if (el.classList.contains('app-system-notice-wrapper') || el.querySelector('.app-system-notice')) {
                const text = textOfDisplaySpans(el.querySelector('.app-system-notice__main') || el);
                if (text) messages.push({ kind: 'notice', title: 'Hinweis von eBay', text, date: currentDate, timestamp: currentDate });
                continue;
            }
            const conv = el.matches('[data-testid="app-conversation"]') ? el : el.querySelector('[data-testid="app-conversation"]');
            if (!conv) continue;

            const sep = conv.querySelector('.app-conversation__message-separator');
            if (sep) currentDate = parseEbayDay(sep.textContent) || currentDate;

            const wrapper = conv.querySelector('[data-testid="message-bubble__wrapper"]');
            const offerEl = conv.querySelector('.message-content-offer');
            const isPartner = Boolean(
                (wrapper && wrapper.classList.contains('app-conversation__message-bubble__grey')) ||
                conv.querySelector('[data-testid="message-bubble__avatar"]') ||
                (offerEl && offerEl.classList.contains('message-content-offer--left'))
            );
            const timeEl = conv.querySelector('[data-testid="message-bubble_posted-time"] > .ux-textspans');
            const time = timeEl ? cleanText(timeEl.textContent) : '';
            const timestamp = time ? `${currentDate}, ${time}` : currentDate;
            const translatedByEbay = Boolean(conv.querySelector('.app-conversation__message-bubble__translation-label'));

            const msg = { kind: 'text', isOwn: !isPartner, date: currentDate, timestamp, text: '', images: [], linkCards: [] };

            if (offerEl) {
                const title = cleanText((offerEl.querySelector('.message-content-offer__title [data-testid="ux-textual-display"]') || offerEl.querySelector('.message-content-offer__title') || {}).textContent) || 'Preisvorschlag';
                const amount = cleanText((offerEl.querySelector('.message-content-offer__amount') || {}).textContent);
                let status = 'pending';
                if (offerEl.classList.contains('message-content-offer--status-accepted') || /akzeptiert|angenommen/i.test(title)) status = 'accepted';
                else if (offerEl.classList.contains('message-content-offer--status-expired') || /abgelaufen/i.test(title)) status = 'expired';
                else if (offerEl.classList.contains('message-content-offer--status-declined') || /abgelehnt/i.test(title)) status = 'declined';
                msg.kind = 'offer';
                msg.offer = { title, amount, status };
                if (status === 'accepted') acceptedOffer = { amount, date: currentDate };
            }

            const content = conv.querySelector('[data-testid="message-bubble_content"]');
            if (content) msg.text = textOfDisplaySpans(content);

            const attach = conv.querySelector('[data-testid="message-bubble_attachments"]');
            if (attach) {
                const links = Array.from(attach.querySelectorAll('a[href], img'));
                const urls = [];
                for (const node of links) {
                    const url = node.tagName === 'A' ? node.getAttribute('href') : node.closest('a') ? null : node.getAttribute('src');
                    if (url && /ebayimg|^data:/i.test(url) && !urls.includes(url)) urls.push(url);
                }
                for (const url of urls) {
                    imgCounter += 1;
                    const img = await Core.fetchImage(hiRes(url), `Chat_Bild_${String(imgCounter).padStart(2, '0')}.jpg`);
                    if (img) {
                        msg.images.push(img);
                        chatImages.push(img);
                    }
                }
            }

            for (const card of conv.querySelectorAll('.link-card')) {
                const title = cleanText((card.querySelector('.link-card__description') || {}).textContent);
                const url = (msg.text.match(/https?:\/\/[^\s]*ebay\.[a-z.]+\/itm\/\d+[^\s]*/i) || [])[0] || '';
                const imgEl = card.querySelector('img');
                const thumb = imgEl ? await Core.fetchImage(imgEl.getAttribute('src'), 'link.jpg') : null;
                msg.linkCards.push({ title, url, imageDataUrl: thumb ? thumb.dataUrl : '', actionLabel: 'Artikel ansehen' });
            }

            if (translatedByEbay && msg.text) {
                msg.ebayTranslated = true;
            }
            const pair = translationPairs.get(convOrder.indexOf(conv));
            if (pair) {
                msg.text = pair.original;
                msg.translation = { text: pair.translation, label: 'Übersetzung (eBay)' };
                msg.ebayTranslated = false;
            }
            if (msg.kind === 'offer' || msg.text || msg.images.length || msg.linkCards.length) messages.push(msg);
        }

        // eBay liefert bei übersetzten Nachrichten nur die Übersetzung. Das Original der LETZTEN Nachricht steht in der Konversationsliste.
        const latestOriginal = cleanText((document.querySelector(`[data-conversation-id="${params.conversation_id}"] .card__latest-message`) || {}).textContent);
        const lastText = [...messages].reverse().find((m) => m.kind === 'text' && m.text);
        for (const m of messages) {
            if (!m.ebayTranslated) continue;
            if (m === lastText && latestOriginal && cleanText(m.text).replace(/\s+/g, ' ') !== latestOriginal.replace(/\s+/g, ' ')) {
                m.translation = { text: m.text, label: 'Übersetzung (eBay)' };
                m.text = latestOriginal;
            } else if (Core.looksGerman(m.text)) {
                m.translationNote = 'Von eBay automatisch übersetzt – Original wird von eBay nicht bereitgestellt';
            } else {
                m.forceTranslation = true;
            }
        }
        return { messages, chatImages, acceptedOffer };
    }

    /* ---------------------------------------------------------- eBay Browse-API */

    async function getApiToken(settings, exporter) {
        const cached = settings.ebayToken;
        if (cached && cached.value && cached.expiresAt > Date.now() + 60000) return cached.value;
        const res = await Core.gmRequest({
            method: 'POST',
            url: 'https://api.ebay.com/identity/v1/oauth2/token',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: `Basic ${btoa(`${settings.ebayClientId}:${settings.ebayClientSecret}`)}`
            },
            data: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope',
            anonymous: true
        });
        if (res.status !== 200) throw new Error(`Token-Abruf HTTP ${res.status} (Client-ID/Secret prüfen)`);
        const data = JSON.parse(res.text);
        exporter.settings.set({ ...exporter.settings.get(), ebayToken: { value: data.access_token, expiresAt: Date.now() + (data.expires_in || 7200) * 1000 } });
        return data.access_token;
    }

    /** Schritt 1: Browse-API. Liefert {ok, data} oder {ok:false, reason}. Hinweis: nur aktive Angebote. */
    async function fetchFromApi(itemId, settings, exporter) {
        if (!settings.ebayClientId || !settings.ebayClientSecret) {
            return { ok: false, reason: 'eBay-API: keine Client-ID/Secret hinterlegt (⚙️ → Global)' };
        }
        try {
            const token = await getApiToken(settings, exporter);
            const res = await Core.gmRequest({
                url: `https://api.ebay.com/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=${encodeURIComponent(itemId)}`,
                headers: { Authorization: `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_DE', 'Accept-Language': 'de-DE' },
                anonymous: true
            });
            if (res.status === 404) return { ok: false, reason: 'eBay-API: Artikel nicht gefunden – die Browse-API liefert nur aktive Angebote (beendet/verkauft)' };
            if (res.status !== 200) return { ok: false, reason: `eBay-API: HTTP ${res.status}` };
            return { ok: true, data: JSON.parse(res.text) };
        } catch (err) {
            return { ok: false, reason: `eBay-API nicht erreichbar: ${err.message || err}` };
        }
    }

    function mapApiItem(it) {
        const opts = Array.isArray(it.buyingOptions) ? it.buyingOptions : [];
        let adType = '';
        if (opts.includes('AUCTION')) adType = opts.includes('FIXED_PRICE') ? 'Auktion mit Sofort-Kaufen' : 'Auktion';
        else if (opts.includes('FIXED_PRICE')) adType = 'Sofort-Kaufen';
        if (adType && opts.includes('BEST_OFFER')) adType += ' (Preisvorschlag möglich)';
        const ship = Array.isArray(it.shippingOptions) && it.shippingOptions[0];
        const shipCost = ship && ship.shippingCost ? ship.shippingCost.value : '';
        const loc = it.itemLocation || {};
        const created = it.itemCreationDate ? new Date(it.itemCreationDate) : null;
        const p2 = (n) => String(n).padStart(2, '0');
        const attributes = [];
        if (it.condition) attributes.push({ name: 'Artikelzustand', value: it.condition });
        for (const a of it.localizedAspects || []) attributes.push({ name: a.name, value: a.value });
        const images = [it.image && it.image.imageUrl, ...(it.additionalImages || []).map((i) => i.imageUrl)].filter(Boolean);
        let description = '';
        if (it.description) {
            const doc = new DOMParser().parseFromString(it.description, 'text/html');
            description = Theme.extractTextFromNodePreserveEmojis(doc.body);
        }
        return {
            title: it.title || '',
            adType,
            listedPrice: it.price ? it.price.value : '',
            listedShipping: shipCost === '0.00' ? 'Kostenlos' : shipCost,
            category: it.categoryPath ? it.categoryPath.split('|').join(' > ') : '',
            location: [loc.postalCode, loc.city].filter(Boolean).join(' ') || '',
            createdAt: created && !Number.isNaN(created.getTime()) ? `${p2(created.getDate())}.${p2(created.getMonth() + 1)}.${created.getFullYear()}` : '',
            sellerUsername: it.seller ? it.seller.username : '',
            sellerType: it.seller && it.seller.sellerAccountType ? (it.seller.sellerAccountType === 'BUSINESS' ? 'Gewerblicher Verkäufer' : 'Privater Verkäufer') : '',
            attributes,
            description,
            imageUrls: images
        };
    }

    /* ----------------------------------------------------- Fallback: Artikelseite */

    function readItemSpecifics(doc) {
        const out = [];
        for (const lbl of doc.querySelectorAll('.ux-labels-values__labels')) {
            const valEl = lbl.tagName === 'DT' ? lbl.nextElementSibling : lbl.parentElement && lbl.parentElement.querySelector('.ux-labels-values__values');
            if (!valEl || lbl.closest('.ux-labels-values--shipping, .ux-labels-values--returns, .ux-labels-values--payments, .ux-labels-values--itemLocation, .ux-labels-values--deliverto')) continue;
            const name = cleanText(lbl.textContent).replace(/:$/, '');
            const clone = valEl.cloneNode(true);
            clone.querySelectorAll('.infotip, .ux-bubble-help, button, .clipped, [data-testid="viewMore"], [data-testid="viewLess"]').forEach((n) => n.remove());
            const variants = Array.from(clone.querySelectorAll('[data-testid="text"]')).map((n) => cleanText(n.textContent));
            const value = variants.length ? variants.sort((a, b) => b.length - a.length)[0] : cleanText(clone.textContent);
            if (name && value) out.push({ name, value: value.replace(/\s*\.\.\.\s*$/, '') });
        }
        return out;
    }

    function detectAdTypeFromPage(doc, html) {
        const bid = doc.querySelector('[data-testid="x-bid-action"], .x-bid-action, #bidBtn_btn');
        const bin = doc.querySelector('[data-testid="x-bin-action"], .x-bin-action, #binBtn_btn');
        const offer = doc.querySelector('[data-testid="x-offer-action"], .x-offer-action, #boBtn_btn');
        if (bid && bin) return 'Auktion mit Sofort-Kaufen';
        if (bid) return 'Auktion';
        if (bin) return offer ? 'Sofort-Kaufen (Preisvorschlag möglich)' : 'Sofort-Kaufen';
        if (/"listingType"\s*:\s*"(?:Chinese|Auction)"|"isAuction"\s*:\s*true|\b\d+\s+Gebote?\b|Erfolgreiches\s+Gebot/i.test(html)) return 'Auktion';
        if (/"listingType"\s*:\s*"(?:FixedPriceItem|StoreInventory)"|Sofort-Kaufen/i.test(html)) return /Preisvorschlag/i.test(html) ? 'Sofort-Kaufen (Preisvorschlag möglich)' : 'Sofort-Kaufen';
        return '';
    }

    function extractCreatedAtFromPage(html) {
        const m = /"(?:startTime|listingStartDate|itemStartDate|itemCreationDate)"\s*:\s*"(\d{4}-\d{2}-\d{2})/i.exec(html);
        if (m) {
            const [y, mo, d] = m[1].split('-');
            return `${d}.${mo}.${y}`;
        }
        return '';
    }

    async function fetchFromItemPage(itemId) {
        const html = await Core.gmFetchText(`https://www.ebay.de/itm/${itemId}`);
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const txt = (sel) => cleanText((doc.querySelector(sel) || {}).textContent);

        let shipping = '';
        let location = '';
        const shipEl = doc.querySelector('.ux-labels-values--shipping .ux-labels-values__values-content');
        if (shipEl) {
            const clone = shipEl.cloneNode(true);
            clone.querySelectorAll('.clipped, script, style, button, a').forEach((n) => n.remove());
            const raw = cleanText(clone.textContent);
            const locMatch = /Standort\s*:\s*(.+)$/i.exec(raw);
            if (locMatch) location = cleanText(locMatch[1]);
            if (/kostenlos/i.test(raw)) shipping = 'Kostenlos';
            else {
                const pm = /(?:EUR|€)\s*\d[\d.,]*|\d[\d.,]*\s*(?:EUR|€)/i.exec(raw);
                shipping = pm ? pm[0] : '';
            }
        }
        const locEl = txt('.ux-labels-values--itemLocation .ux-labels-values__values-content').replace(/^Standort\s*:\s*/i, '');
        if (locEl) location = locEl;

        const sellerLink = doc.querySelector('.x-sellercard-atf__info__about-seller a[href*="/usr/"], [data-testid="x-sellercard-atf"] a[href*="/usr/"], a[href*="/str/"]');
        let sellerType = '';
        if (doc.querySelector('[data-testid="x-business-seller-information"], .x-business-seller-information') || /Gewerblicher\s+Verkäufer|Rechtliche\s+Informationen\s+des\s+Verkäufers/i.test(html)) sellerType = 'Gewerblicher Verkäufer';
        else if (/Privater\s+Verkäufer|Privatverkäufer/i.test(html)) sellerType = 'Privater Verkäufer';

        const crumbs = Array.from(doc.querySelectorAll('nav.breadcrumbs a, .seo-breadcrumbs-container a, [data-testid="x-breadcrumb"] a'))
            .map((a) => cleanText(a.textContent)).filter((t) => t && !/^eBay$/i.test(t) && !/^Zurück/i.test(t));
        let category = Array.from(new Set(crumbs)).join(' > ');
        if (!category) {
            const ld = /"@type"\s*:\s*"BreadcrumbList"[\s\S]*?"itemListElement"\s*:\s*(\[[\s\S]*?\])\s*\}/.exec(html);
            if (ld) {
                try {
                    category = JSON.parse(ld[1]).map((e) => e.name).filter((n) => n && !/^eBay$/i.test(n)).join(' > ');
                } catch { /* ungültiges JSON-LD */ }
            }
        }

        let description = '';
        const iframe = doc.querySelector('iframe#desc_ifr, iframe[src*="ebaydesc.com"]');
        if (iframe && iframe.getAttribute('src')) {
            try {
                const dHtml = await Core.gmFetchText(iframe.getAttribute('src'));
                description = Theme.extractTextFromNodePreserveEmojis(new DOMParser().parseFromString(dHtml, 'text/html').body);
            } catch { /* Beschreibung optional */ }
        }

        const imageUrls = [];
        doc.querySelectorAll('.ux-image-carousel-item img, .ux-image-filmstrip-carousel-item img').forEach((img) => {
            const src = img.getAttribute('data-zoom-src') || img.getAttribute('data-src') || img.getAttribute('src');
            if (src && /ebayimg\.com/.test(src)) {
                const u = hiRes(src);
                if (!imageUrls.includes(u)) imageUrls.push(u);
            }
        });

        return {
            title: txt('.x-item-title__mainTitle'),
            adType: detectAdTypeFromPage(doc, html),
            listedPrice: txt('.x-price-primary') || txt('[data-testid="x-price-primary"]'),
            listedShipping: shipping,
            category,
            location,
            createdAt: extractCreatedAtFromPage(html),
            sellerUsername: sellerLink ? cleanText(sellerLink.textContent) : '',
            sellerType,
            attributes: readItemSpecifics(doc),
            description,
            imageUrls
        };
    }

    async function fetchActiveSince(username) {
        if (!username) return '';
        try {
            const html = await Core.gmFetchText(`https://www.ebay.de/usr/${encodeURIComponent(username)}?_tab=about`);
            const doc = new DOMParser().parseFromString(html, 'text/html');
            for (const sp of doc.querySelectorAll('.str-about-description__seller-info span.SECONDARY, span.str-text-span.SECONDARY')) {
                if (/Angemeldet\s+seit|Mitglied\s+seit/i.test(sp.textContent || '')) {
                    const val = cleanText((sp.nextElementSibling || {}).textContent);
                    const parsed = Theme.parseAnyDateParts(val);
                    if (parsed && parsed.hasDate) return parsed.numericDate;
                }
            }
            const m = /(?:Angemeldet|Mitglied)\s+seit:?(?:&nbsp;|\s|<[^>]+>)*(\d{1,2}\.?\s*[A-Za-zÄÖÜäöü]+\.?\s*\d{4})/i.exec(html);
            const parsed = m ? Theme.parseAnyDateParts(m[1]) : null;
            return parsed && parsed.hasDate ? parsed.numericDate : '';
        } catch {
            return '';
        }
    }

    /** Anzeige: API zuerst, dann Artikelseite, dann DB-Cache. Fehlende Werte bleiben n/a (Warnung). */
    async function collectItem(itemId, settings, exporter, warnings) {
        const merged = {};
        const sources = [];
        const api = await fetchFromApi(itemId, settings, exporter);
        if (api.ok) {
            Object.assign(merged, mapApiItem(api.data));
            sources.push('eBay-API');
        } else {
            warnings.push(api.reason);
        }
        try {
            const page = await fetchFromItemPage(itemId);
            for (const [k, v] of Object.entries(page)) {
                if (Array.isArray(v) ? v.length && !(merged[k] || []).length : v && !merged[k]) merged[k] = v;
            }
            sources.push('Artikelseite');
        } catch (err) {
            warnings.push(`Artikelseite nicht abrufbar: ${err.message || err}`);
        }
        const cacheKey = `ebay:item:${itemId}`;
        const cached = await Core.dbGet('cache', cacheKey);
        if (cached && cached.data) {
            for (const [k, v] of Object.entries(cached.data)) {
                if (Array.isArray(v) ? v.length && !(merged[k] || []).length : v && !merged[k]) merged[k] = v;
            }
        }
        if (sources.length) await Core.dbPut('cache', { key: cacheKey, data: merged, updatedAt: new Date().toISOString() });
        return merged;
    }

    /* ---------------------------------------------------------------- Sammeln */

    async function collect({ settings, core }) {
        const warnings = [];
        const params = readActionParams();
        const titleLink = document.querySelector(SEL.cardTitleLink);
        const rawCardTitle = titleLink ? cleanText(titleLink.textContent) : '';
        const statusMatch = /^(Gekauft|Verkauft|Beendet|Abgelaufen|Storniert)\s*[-–•]\s*/i.exec(rawCardTitle);
        const adStatus = statusMatch ? statusMatch[1] : '';
        const itemId = params.reference_id || ((titleLink && titleLink.getAttribute('href')) || '').replace(/^.*\/itm\/(\d+).*$/, '$1');
        const adTitle = params.item_title || rawCardTitle.replace(statusMatch ? statusMatch[0] : '', '');

        let role = String(params.userType || '').toUpperCase();
        if (role !== 'BUYER' && role !== 'SELLER') {
            role = /verkauft/i.test(adStatus) ? 'SELLER' : 'BUYER';
            warnings.push('Rolle (Käufer/Verkäufer) nicht eindeutig erkannt – bitte prüfen');
        }

        const headerLink = document.querySelector(SEL.headerPartnerLink);
        const partnerName = params.receivingMemberName || (headerLink ? cleanText(headerLink.textContent) : '') || 'n/a';
        const partnerUrl = headerLink ? headerLink.getAttribute('href').split('?')[0] : `https://www.ebay.de/usr/${encodeURIComponent(partnerName)}`;
        const ownUser = settings.ownUsername || params.reporterMemberName || '';
        const ownLabel = settings.ownFullName && ownUser ? `${settings.ownFullName} (${ownUser})` : settings.ownFullName || ownUser || 'n/a';
        const ownUrl = ownUser ? `https://www.ebay.de/usr/${encodeURIComponent(ownUser)}` : '';

        const questionId = getQuestionIdFromUrl();
        const conversationId = questionId || params.conversation_id || 'n/a';
        const conversationUrl = questionId ? `https://www.ebay.de/cnt/viewMessage?group_type=CORE&question_id=${questionId}` : window.location.href;

        const orderLink = document.querySelector(SEL.orderLink);
        const cardPrice = cleanText((document.querySelector(SEL.cardPrice) || {}).textContent);

        const { messages, chatImages, acceptedOffer } = await extractMessages(params);

        const item = itemId ? await collectItem(itemId, settings, core, warnings) : {};
        const sellerUsername = role === 'SELLER' ? ownUser : partnerName;
        const sellerActiveSince = await fetchActiveSince(sellerUsername);

        const prefix = `Anzeige_${itemId}_Bild_`;
        let adImages = await Core.fetchImages((item.imageUrls || []).slice(0, 24), prefix);
        const cardImg = document.querySelector(SEL.cardImage);
        if (!adImages.length && cardImg) adImages = await Core.fetchImages([hiRes(cardImg.getAttribute('src'))], prefix);

        const hasDeal = Boolean(orderLink || acceptedOffer || /gekauft|verkauft/i.test(adStatus));
        const listedPrice = item.listedPrice || cardPrice || 'n/a';
        const price = acceptedOffer ? acceptedOffer.amount : hasDeal ? cardPrice || listedPrice : 'n/a';
        const shipping = hasDeal ? item.listedShipping || 'n/a' : 'n/a';
        const tracking = Core.findTrackingNumber(messages.map((m) => m.text));

        const firstDate = messages.length ? messages[0].date : '';
        const transactionDate = acceptedOffer ? acceptedOffer.date : orderLink ? firstDate : '';

        const avatarEl = document.querySelector('[data-testid="message-bubble__avatar"] .avatar, .msg-conversation-head__avatar .avatar');
        let partnerAvatar = { letter: (partnerName || 'U').charAt(0) };
        if (avatarEl) {
            const cs = getComputedStyle(avatarEl);
            partnerAvatar = { letter: cleanText(avatarEl.textContent).charAt(0) || partnerAvatar.letter, bg: cs.backgroundColor, fg: cs.color };
        }

        const legal = document.querySelector(SEL.legal);
        const securityNotice = legal ? { runs: Core.extractRuns(legal) } : null;

        const meta = {
            role,
            adStatus,
            adTitle: adTitle || item.title || 'eBay-Artikel',
            adId: itemId || 'n/a',
            adUrl: itemId ? `https://www.ebay.de/itm/${itemId}` : '',
            conversationId,
            conversationUrl,
            orderId: orderLink ? cleanText(orderLink.textContent) : 'n/a',
            orderUrl: orderLink ? orderLink.getAttribute('href') : '',
            category: item.category || 'n/a',
            adType: item.adType || (acceptedOffer ? 'Sofort-Kaufen (Preisvorschlag angenommen)' : 'n/a'),
            location: item.location || 'n/a',
            createdAt: item.createdAt || 'n/a',
            listedPrice,
            listedShipping: item.listedShipping || 'n/a',
            price,
            shipping,
            trackingId: tracking ? tracking.id : 'n/a',
            trackingCarrier: tracking ? tracking.carrier : '',
            buyerName: role === 'BUYER' ? ownLabel : partnerName,
            buyerUrl: role === 'BUYER' ? ownUrl : partnerUrl,
            sellerName: role === 'SELLER' ? ownLabel : partnerName,
            sellerUrl: role === 'SELLER' ? ownUrl : partnerUrl,
            sellerType: role === 'SELLER' ? settings.ownSellerType || item.sellerType || 'n/a' : item.sellerType || 'n/a',
            sellerActiveSince: sellerActiveSince || 'n/a',
            transactionDate: transactionDate || ''
        };

        return {
            key: `ebay:${params.conversation_id || conversationId || itemId}`,
            meta,
            messages,
            chatImages,
            adImages,
            attributes: item.attributes || [],
            description: item.description || '',
            securityNotice,
            partnerAvatar,
            warnings
        };
    }

    /* ------------------------------------------------------------------ Start */

    const exporter = Core.createExporter({
        platform: 'ebay',
        platformLabel: 'eBay.de',
        scriptName: 'eBay Chat PDF-Export',
        scriptVersion: SCRIPT_VERSION,
        settingsKey: 'ebay_pdf_export_settings_v3',
        capabilities: { orderId: true, paymentMethod: false, buyerProtection: false, translation: true },
        colors: { primary: '#0064d2', primaryText: '#ffffff' },
        defaults: {
            ownFullName: 'Patrick Schnitzer',
            ownUsername: 'rackandlayer',
            ownSellerType: 'Privater Verkäufer',
            ebayClientId: '',
            ebayClientSecret: ''
        },
        globalFields: [
            { key: 'ownUsername', label: 'Eigener eBay-Nutzername' },
            { key: 'ownSellerType', label: 'Eigener Verkäufer-Typ' },
            { key: 'ebayClientId', label: 'eBay-API Client-ID (App-ID)' },
            { key: 'ebayClientSecret', label: 'eBay-API Client-Secret (Cert-ID)', type: 'password' }
        ],
        adapter: {
            getRecordKey: () => {
                const p = readActionParams();
                return p.conversation_id ? `ebay:${p.conversation_id}` : null;
            },
            collect
        }
    });

    function ensureToolbar() {
        const head = document.querySelector(SEL.header);
        if (!head || head.querySelector('[data-mpe="ebay"]')) return;
        const bar = exporter.createToolbar();
        const dropdown = head.querySelector(SEL.dropdown);
        if (dropdown && dropdown.parentNode === head) head.insertBefore(bar, dropdown);
        else head.appendChild(bar);
    }

    ensureToolbar();
    new MutationObserver(ensureToolbar).observe(document.body, { childList: true, subtree: true });
})();
