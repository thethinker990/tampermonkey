/**
 * MarketplaceExportCore – gemeinsame Ablauf-Bibliothek für alle Marktplatz-PDF-Exporter.
 * Version: 3.0.0
 *
 * Verantwortung: Export-Pipeline, IndexedDB (Overrides je Konversation), Einstellungs-/Feld-Popup,
 * Toasts, HTTP/Bilder, Übersetzung (DeepL -> lokales LLM), Ollama-Client, PDF-Auslieferung.
 * Darstellung macht PdfSharedTheme (pdf-shared-theme.js), Seiten-Auslesen der jeweilige Adapter.
 *
 * Einbindung (Reihenfolge: pdfmake, vfs_fonts, pdf-lib, Theme, Core):
 * // @require https://raw.githubusercontent.com/thethinker990/tampermonkey/v3.0.0/marketplace-export-core.js
 * Benötigte Grants im Userscript: GM_xmlhttpRequest, GM_getValue, GM_setValue
 */
(function (global) {
    'use strict';

    const VERSION = '3.0.0';
    const DB_NAME = 'MarketplacePdfExport';
    const DB_VERSION = 1;
    const UI_PREFIX = 'mpe';
    const Theme = global.PdfSharedTheme;
    if (!Theme) throw new Error('pdf-shared-theme.js muss vor marketplace-export-core.js per @require geladen werden');

    /* ==========================================================================
     * HILFSFUNKTIONEN
     * ========================================================================== */

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const { isNa } = Theme;
    const cleanText = Theme.cleanTextPreserveEmojis;

    function escapeHtml(str) {
        return String(str === null || str === undefined ? '' : str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    const UMLAUTS = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss' };

    function sanitizeFilename(raw, maxLen = 110) {
        return String(raw || 'Unbekannt')
            .replace(/[äöüÄÖÜß]/g, (c) => UMLAUTS[c])
            .replace(/[\u2013\u2014]/g, '-')
            .replace(/["\u201C\u201D\u201E]/g, '')
            .replace(/[<>:/\\|?*]/g, '_')
            .replace(/[^\x20-\x7E]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, maxLen)
            .trim();
    }

    function formatDateIso(date = new Date()) {
        const p = (n) => String(n).padStart(2, '0');
        return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
    }

    /** "18.10.2026" / "2026-10-18" / "18. Okt 2026" -> "2026-10-18" (oder null) */
    function toIsoDate(raw) {
        if (isNa(raw)) return null;
        const parsed = Theme.parseAnyDateParts(String(raw));
        if (parsed && parsed.hasDate) return `${parsed.year}-${parsed.mm}-${parsed.dd}`;
        return null;
    }

    /** Liefert Text + Links eines DOM-Knotens als Runs [{text, link?}] (für klickbare Links im PDF). */
    function extractRuns(node) {
        const runs = [];
        if (!node) return runs;
        const walk = (n) => {
            if (n.nodeType === 3) {
                const t = n.textContent.replace(/\s+/g, ' ');
                if (t) runs.push({ text: t });
                return;
            }
            if (n.nodeType !== 1) return;
            const el = n;
            if (el.matches('script, style, svg, .clipped, .sr-only, button')) return;
            if (el.tagName === 'A') {
                const href = el.getAttribute('href') || '';
                const clone = el.cloneNode(true);
                clone.querySelectorAll('.sr-only, .clipped, svg').forEach((x) => x.remove());
                const text = clone.textContent.replace(/\s+/g, ' ').trim();
                if (text) runs.push(/^https?:/i.test(href) ? { text, link: href } : { text });
                return;
            }
            if (el.tagName === 'BR') {
                runs.push({ text: '\n' });
                return;
            }
            el.childNodes.forEach(walk);
            if (/^(P|DIV|LI)$/.test(el.tagName) && runs.length && !/\n$/.test(runs[runs.length - 1].text)) runs.push({ text: '\n' });
        };
        walk(node);
        while (runs.length && !runs[runs.length - 1].text.trim()) runs.pop();
        if (runs.length) runs[0].text = runs[0].text.replace(/^\s+/, '');
        return runs;
    }

    const looksGermanWords = /\b(und|ich|nicht|der|die|das|ist|sie|wir|hallo|danke|mit|für|auf|noch|gerne|bitte|viele|grüße|gruß|lg|vg|habe|ein|eine|kann|wäre|würde|schon|aber|auch|oder|wenn|dann|ja|nein|hi)\b/gi;
    const looksForeignWords = /\b(the|and|you|is|are|have|thanks|thank|please|would|could|can|with|for|this|that|hello|hej|igen|tack|och|jag|det|bonjour|merci|oui|grazie|ciao|hola|gracias|dziękuję|bardzo|dobrý|děkuji)\b/gi;

    /** Grobe Vorprüfung, ob ein Text deutsch ist (spart DeepL-Kontingent). */
    function looksGerman(text) {
        const s = String(text || '');
        const words = s.match(/[A-Za-zÄÖÜäöüß]{2,}/g) || [];
        if (words.length === 0) return true;
        const de = (s.match(looksGermanWords) || []).length + (/[äöüß]/i.test(s) ? 2 : 0);
        const fo = (s.match(looksForeignWords) || []).length;
        if (fo > de) return false;
        if (de === 0 && words.length >= 2) return false;
        return true;
    }

    /* ==========================================================================
     * HTTP (GM_xmlhttpRequest) & BILDER
     * ========================================================================== */

    function gmRequest({ method = 'GET', url, headers = {}, data, responseType, timeout = 30000, anonymous = false }) {
        return new Promise((resolve, reject) => {
            if (typeof GM_xmlhttpRequest !== 'function') {
                reject(new Error('GM_xmlhttpRequest nicht verfügbar (@grant fehlt)'));
                return;
            }
            GM_xmlhttpRequest({
                method, url, headers, data, responseType, timeout, anonymous,
                onload: (res) => resolve({ status: res.status, text: res.responseText, response: res.response, headers: res.responseHeaders || '' }),
                onerror: () => reject(new Error(`Netzwerkfehler bei ${new URL(url).host}`)),
                ontimeout: () => reject(new Error(`Zeitüberschreitung bei ${new URL(url).host} (${Math.round(timeout / 1000)} s)`))
            });
        });
    }

    async function gmFetchText(url, options = {}) {
        const res = await gmRequest({ url, ...options });
        if (res.status >= 200 && res.status < 400) return res.text;
        throw new Error(`HTTP ${res.status} für ${url}`);
    }

    function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(String(reader.result || ''));
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    function dataUrlToBytes(dataUrl) {
        const binary = atob(String(dataUrl).split(',')[1] || '');
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Bild nicht dekodierbar'));
            img.src = src;
        });
    }

    /** Beliebiges Bild -> echtes JPEG (pdfmake/pdf-lib-sicher) inkl. Bytes für den PDF-Anhang. */
    async function toJpeg(dataUrl, quality = 0.92) {
        const img = await loadImage(dataUrl);
        const width = img.naturalWidth || img.width || 800;
        const height = img.naturalHeight || img.height || 600;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const jpeg = canvas.toDataURL('image/jpeg', quality);
        return { dataUrl: jpeg, bytes: dataUrlToBytes(jpeg), width, height };
    }

    /** Lädt ein Bild (data:, same-origin oder per GM) und liefert {url, filename, dataUrl, bytes, width, height} oder null. */
    async function fetchImage(url, filename) {
        if (!url) return null;
        try {
            let dataUrl;
            if (/^data:/i.test(url)) {
                dataUrl = url;
            } else {
                const res = await gmRequest({ url, responseType: 'blob', headers: { Accept: 'image/avif,image/webp,image/jpeg,image/png,image/*;q=0.8' } });
                if (!(res.status >= 200 && res.status < 400) || !res.response) throw new Error(`HTTP ${res.status}`);
                dataUrl = await blobToDataUrl(res.response);
            }
            const jpeg = await toJpeg(dataUrl);
            return { url, filename: filename || 'bild.jpg', ...jpeg };
        } catch (err) {
            console.warn('[MPE] Bild konnte nicht geladen werden:', url, err);
            return null;
        }
    }

    /** Lädt mehrere Bilder parallel; Dateiname "<prefix>NN.jpg" nach Position, fehlgeschlagene fallen weg. */
    async function fetchImages(urls, prefix) {
        const list = await Promise.all(urls.map((u, i) => fetchImage(u, `${prefix}${String(i + 1).padStart(2, '0')}.jpg`)));
        return list.filter(Boolean);
    }

    /** SVG (URL) verlustfrei als PNG rastern (Seitenverhältnis bleibt, kein Beschnitt). */
    async function rasterizeSvgUrl(url, targetWidthPx = 600) {
        try {
            const svgText = await gmFetchText(url);
            const blobUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
            const img = await loadImage(blobUrl);
            const ratio = (img.naturalHeight || img.height || 1) / (img.naturalWidth || img.width || 1);
            const canvas = document.createElement('canvas');
            canvas.width = targetWidthPx;
            canvas.height = Math.max(1, Math.round(targetWidthPx * ratio));
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            return { dataUrl: canvas.toDataURL('image/png'), ratio };
        } catch (err) {
            console.warn('[MPE] SVG konnte nicht gerastert werden:', url, err);
            return null;
        }
    }

    /* ==========================================================================
     * EINSTELLUNGEN (GM-Storage, je Userscript) & INDEXEDDB (je Website)
     * ========================================================================== */

    function createSettingsStore(key, defaults) {
        return {
            get() {
                let raw = null;
                try {
                    raw = typeof GM_getValue === 'function' ? GM_getValue(key, null) : localStorage.getItem(key);
                } catch { /* Storage gesperrt */ }
                if (!raw) return { ...defaults };
                try {
                    return { ...defaults, ...(typeof raw === 'string' ? JSON.parse(raw) : raw) };
                } catch {
                    return { ...defaults };
                }
            },
            set(next) {
                const json = JSON.stringify(next);
                if (typeof GM_setValue === 'function') GM_setValue(key, json);
                else localStorage.setItem(key, json);
            }
        };
    }

    function openDb() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', { keyPath: 'key' });
                if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache', { keyPath: 'key' });
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function dbGet(store, key) {
        try {
            const db = await openDb();
            return await new Promise((resolve, reject) => {
                const req = db.transaction(store, 'readonly').objectStore(store).get(key);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => reject(req.error);
            });
        } catch (err) {
            console.warn('[MPE] DB-Lesefehler:', err);
            return null;
        }
    }

    async function dbPut(store, value) {
        try {
            const db = await openDb();
            return await new Promise((resolve, reject) => {
                const tx = db.transaction(store, 'readwrite');
                tx.objectStore(store).put(value);
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => reject(tx.error);
            });
        } catch (err) {
            console.warn('[MPE] DB-Schreibfehler:', err);
            return false;
        }
    }

    /* ==========================================================================
     * FELD-SCHEMA (alles Abgerufene ist im Popup editierbar)
     * ========================================================================== */

    const PAYMENT_METHODS = ['n/a', 'Direktzahlung', 'Überweisung', 'PayPal', 'PayPal Family&Friends', 'Bar bei Abholung'];
    const CARRIERS = ['', 'DHL', 'Hermes', 'DPD', 'GLS', 'UPS', 'Deutsche Post'];

    const CARRIER_TRACKING_URLS = Object.freeze({
        DHL: (id) => `https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=${encodeURIComponent(id)}`,
        Hermes: (id) => `https://www.myhermes.de/empfangen/sendungsverfolgung/sendungsinformation#${encodeURIComponent(id)}`,
        DPD: (id) => `https://tracking.dpd.de/status/de_DE/parcel/${encodeURIComponent(id)}`,
        GLS: (id) => `https://www.gls-pakete.de/reach-sendungsverfolgung?match=${encodeURIComponent(id)}`,
        UPS: (id) => `https://www.ups.com/track?loc=de_DE&tracknum=${encodeURIComponent(id)}`,
        'Deutsche Post': (id) => `https://www.deutschepost.de/de/s/sendungsverfolgung.html?piececode=${encodeURIComponent(id)}`
    });

    function detectCarrier(trackingId, contextText = '') {
        const ctx = String(contextText || '');
        if (/hermes/i.test(ctx)) return 'Hermes';
        if (/\bdhl\b/i.test(ctx)) return 'DHL';
        if (/\bdpd\b/i.test(ctx)) return 'DPD';
        if (/\bgls\b/i.test(ctx)) return 'GLS';
        if (/\bups\b/i.test(ctx)) return 'UPS';
        if (/deutsche\s*post|brief/i.test(ctx)) return 'Deutsche Post';
        const id = String(trackingId || '');
        if (/^1Z[A-Z0-9]{16}$/i.test(id)) return 'UPS';
        if (/^\d{14}$/.test(id)) return 'Hermes';
        return id ? 'DHL' : '';
    }

    function normalizeCarrier(raw) {
        const s = cleanText(raw).replace(/\s*(paket|päckchen|parcel|express|warenpost)\b.*/i, '').trim();
        return CARRIERS.find((c) => c && c.toLowerCase() === s.toLowerCase()) || (s ? detectCarrier('', s) : '');
    }

    const TRACKING_RE = /(?:Sendungsnummer|Sendungnummer|Tracking(?:-?nummer|-?id)?|Paketnummer|Sendungsverfolgung)[^A-Z0-9\n]{0,25}([A-Z0-9]{10,22})\b/i;

    /** Letzte im Chat genannte Sendungsnummer (IBANs ausgeschlossen) inkl. erkanntem Versanddienstleister, sonst null. */
    function findTrackingNumber(texts) {
        let found = null;
        for (const text of texts) {
            const m = TRACKING_RE.exec(text || '');
            if (m && !/^DE\d{18,20}$/i.test(m[1])) found = { id: m[1], carrier: detectCarrier(m[1], text) };
        }
        return found;
    }

    const LOCAL_FIELDS = [
        { key: 'role', label: 'Eigene Rolle', type: 'select', options: [['BUYER', 'Käufer'], ['SELLER', 'Verkäufer']] },
        { key: 'adStatus', label: 'Status-Zusatz im Titel (z. B. Gekauft, Gelöscht)' },
        { key: 'adTitle', label: 'Anzeigentitel' },
        { key: 'adId', label: 'Anzeigen-ID' },
        { key: 'adUrl', label: 'Anzeigen-Link' },
        { key: 'conversationId', label: 'Nachrichten-ID' },
        { key: 'conversationUrl', label: 'Nachrichten-Link' },
        { key: 'orderId', label: 'Bestellnummer', cap: 'orderId' },
        { key: 'orderUrl', label: 'Bestellungs-Link', cap: 'orderId' },
        { key: 'category', label: 'Kategorie' },
        { key: 'adType', label: 'Anzeigentyp' },
        { key: 'location', label: 'Ort' },
        { key: 'createdAt', label: 'Eingestellt am (TT.MM.JJJJ)' },
        { key: 'listedPrice', label: 'Preis (Anzeige)' },
        { key: 'listedShipping', label: 'Versand (Anzeige)' },
        { key: 'price', label: 'Preis (vereinbart)' },
        { key: 'shipping', label: 'Versand (vereinbart)' },
        { key: 'buyerProtection', label: 'Käuferschutz', cap: 'buyerProtection' },
        { key: 'paymentMethod', label: 'Zahlungsart', type: 'select', options: PAYMENT_METHODS.map((p) => [p, p]), cap: 'paymentMethod' },
        { key: 'trackingId', label: 'Sendungsverfolgungsnummer' },
        { key: 'trackingCarrier', label: 'Versanddienstleister', type: 'select', options: CARRIERS.map((c) => [c, c || '–']) },
        { key: 'buyerName', label: 'Käufername' },
        { key: 'buyerUrl', label: 'Käufer-Link' },
        { key: 'sellerName', label: 'Verkäufername' },
        { key: 'sellerUrl', label: 'Verkäufer-Link' },
        { key: 'sellerType', label: 'Verkäufer-Typ' },
        { key: 'sellerActiveSince', label: 'Verkäufer aktiv seit (TT.MM.JJJJ)' },
        { key: 'transactionDate', label: 'Transaktionsdatum für Dateiname (TT.MM.JJJJ)' },
        { key: 'attributesText', label: 'Artikelmerkmale (eine Zeile je „Name: Wert“)', type: 'textarea', rows: 6 },
        { key: 'description', label: 'Beschreibung', type: 'textarea', rows: 6 }
    ];

    const attributesToText = (attrs) => (Array.isArray(attrs) ? attrs.map((a) => `${a.name}: ${a.value}`).join('\n') : '');
    const textToAttributes = (txt) => String(txt || '').split(/\r?\n/).map((l) => {
        const i = l.indexOf(':');
        return i > 0 ? { name: l.slice(0, i).trim(), value: l.slice(i + 1).trim() } : null;
    }).filter((a) => a && a.name && a.value);

    /* ==========================================================================
     * UI: STYLES, TOASTS, FORMULAR-POPUP
     * ========================================================================== */

    function injectStyles(colors) {
        if (document.getElementById(`${UI_PREFIX}-style`)) return;
        const c = { primary: '#0064d2', primaryText: '#ffffff', ...colors };
        const css = `
            .${UI_PREFIX}-btn{display:inline-flex;align-items:center;gap:4px;border-radius:16px;padding:6px 12px;font:600 12.5px/1.2 system-ui,-apple-system,Segoe UI,sans-serif;cursor:pointer;white-space:nowrap;border:1px solid ${c.primaryBorder || c.primary};background:${c.primary};color:${c.primaryText}}
            .${UI_PREFIX}-btn[disabled]{opacity:.6;cursor:progress}
            .${UI_PREFIX}-btn--ghost{background:#f3f4f6;color:#111827;border-color:#d1d5db}
            .${UI_PREFIX}-btn--icon{width:30px;height:30px;padding:0;justify-content:center;border-radius:50%}
            .${UI_PREFIX}-bar{display:inline-flex;align-items:center;gap:6px;margin-left:auto;margin-right:8px}
            .${UI_PREFIX}-badge{font:600 11px system-ui,sans-serif;padding:3px 8px;border-radius:10px;background:#e5e7eb;color:#374151;border:1px solid #d1d5db;white-space:nowrap}
            .${UI_PREFIX}-badge--saved{background:#dcfce7;color:#166534;border-color:#86efac}
            .${UI_PREFIX}-toasts{position:fixed;right:20px;bottom:20px;z-index:2147483647;display:flex;flex-direction:column;gap:8px;max-width:520px}
            .${UI_PREFIX}-toast{background:#1e293b;color:#fff;padding:12px 14px;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.3);font:13px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;cursor:pointer;border-left:5px solid #38bdf8}
            .${UI_PREFIX}-toast--success{border-left-color:#22c55e}.${UI_PREFIX}-toast--warn{border-left-color:#f59e0b}.${UI_PREFIX}-toast--error{border-left-color:#ef4444}
            .${UI_PREFIX}-toast ul{margin:6px 0 0 18px;padding:0}.${UI_PREFIX}-toast small{display:block;margin-top:6px;color:#94a3b8}
            .${UI_PREFIX}-toast__actions{display:flex;gap:10px;margin-top:8px;flex-wrap:wrap}
            .${UI_PREFIX}-toast__actions a,.${UI_PREFIX}-toast__actions button{color:#38bdf8;background:none;border:0;padding:0;font:600 12.5px system-ui,sans-serif;text-decoration:underline;cursor:pointer}
            .${UI_PREFIX}-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2147483646;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,Segoe UI,sans-serif}
            .${UI_PREFIX}-modal{background:#fff;color:#111827;width:640px;max-width:94vw;max-height:90vh;overflow:auto;border-radius:10px;padding:18px 20px;box-shadow:0 12px 32px rgba(0,0,0,.3)}
            .${UI_PREFIX}-modal h3{margin:0 0 4px;font-size:16px}.${UI_PREFIX}-modal p.${UI_PREFIX}-hint{margin:0 0 10px;font-size:12px;color:#4b5563}
            .${UI_PREFIX}-section{border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;margin:10px 0;background:#f9fafb}
            .${UI_PREFIX}-section h4{margin:0 0 8px;font-size:13px}
            .${UI_PREFIX}-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px}
            .${UI_PREFIX}-field{display:flex;flex-direction:column;gap:2px;font-size:11.5px;color:#374151}
            .${UI_PREFIX}-field--wide{grid-column:1/-1}
            .${UI_PREFIX}-field input,.${UI_PREFIX}-field select,.${UI_PREFIX}-field textarea{font:12.5px system-ui,sans-serif;padding:5px 6px;border:1px solid #d1d5db;border-radius:5px;background:#fff;color:#111827}
            .${UI_PREFIX}-field--changed input,.${UI_PREFIX}-field--changed select,.${UI_PREFIX}-field--changed textarea{border-color:#f59e0b;background:#fffbeb}
            .${UI_PREFIX}-field--missing input{border-color:#ef4444}
            .${UI_PREFIX}-check{display:flex;align-items:center;gap:6px;font-size:12.5px;grid-column:1/-1}
            .${UI_PREFIX}-buttons{display:flex;justify-content:flex-end;gap:8px;margin-top:12px;flex-wrap:wrap}
        `;
        const style = document.createElement('style');
        style.id = `${UI_PREFIX}-style`;
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
    }

    function toast(message, options = {}) {
        const type = options.type || 'info';
        let host = document.getElementById(`${UI_PREFIX}-toasts`);
        if (!host) {
            host = document.createElement('div');
            host.id = `${UI_PREFIX}-toasts`;
            host.className = `${UI_PREFIX}-toasts`;
            document.body.appendChild(host);
        }
        if (options.id) document.getElementById(options.id)?.remove();
        const el = document.createElement('div');
        if (options.id) el.id = options.id;
        el.className = `${UI_PREFIX}-toast ${UI_PREFIX}-toast--${type}`;
        el.title = 'Klicken zum Schließen';
        const body = document.createElement('div');
        body.textContent = message;
        el.appendChild(body);
        if (Array.isArray(options.list) && options.list.length) {
            const ul = document.createElement('ul');
            options.list.forEach((item) => {
                const li = document.createElement('li');
                li.textContent = item;
                ul.appendChild(li);
            });
            el.appendChild(ul);
        }
        if (Array.isArray(options.actions) && options.actions.length) {
            const bar = document.createElement('div');
            bar.className = `${UI_PREFIX}-toast__actions`;
            for (const a of options.actions) {
                const btn = document.createElement(a.href ? 'a' : 'button');
                btn.textContent = a.label;
                if (a.href) {
                    btn.href = a.href;
                    btn.target = '_blank';
                    btn.rel = 'noopener noreferrer';
                    if (a.download) btn.download = a.download;
                }
                btn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    if (a.onClick) a.onClick(ev);
                    if (a.closeOnClick !== false) el.remove();
                });
                bar.appendChild(btn);
            }
            el.appendChild(bar);
        }
        const hint = document.createElement('small');
        hint.textContent = 'Klicken zum Schließen';
        el.appendChild(hint);
        el.addEventListener('click', () => el.remove());
        host.appendChild(el);
        const timeout = options.sticky ? 0 : options.timeoutMs || (type === 'info' ? 6000 : 0);
        if (timeout) setTimeout(() => el.remove(), timeout);
        return { close: () => el.remove(), element: el };
    }

    /**
     * Generisches Formular-Popup.
     * sections: [{ title, hint, fields: [{ key, label, type, options, value, original, wide, hint, missing }] }]
     * buttons:  [{ label, value, primary }]  -> Promise<{ button, values }> bzw. null bei Abbruch
     */
    function openForm({ title, hint, sections, buttons }) {
        return new Promise((resolve) => {
            document.getElementById(`${UI_PREFIX}-modal`)?.remove();
            const overlay = document.createElement('div');
            overlay.id = `${UI_PREFIX}-modal`;
            overlay.className = `${UI_PREFIX}-overlay`;
            const modal = document.createElement('div');
            modal.className = `${UI_PREFIX}-modal`;
            modal.innerHTML = `<h3>${escapeHtml(title)}</h3>${hint ? `<p class="${UI_PREFIX}-hint">${escapeHtml(hint)}</p>` : ''}`;
            const inputs = new Map();

            for (const sec of sections) {
                const box = document.createElement('div');
                box.className = `${UI_PREFIX}-section`;
                box.innerHTML = `<h4>${escapeHtml(sec.title)}</h4>${sec.hint ? `<p class="${UI_PREFIX}-hint">${escapeHtml(sec.hint)}</p>` : ''}`;
                const grid = document.createElement('div');
                grid.className = `${UI_PREFIX}-grid`;
                for (const f of sec.fields) {
                    const value = f.value === undefined || f.value === null ? '' : f.value;
                    if (f.type === 'checkbox') {
                        const lab = document.createElement('label');
                        lab.className = `${UI_PREFIX}-check`;
                        const cb = document.createElement('input');
                        cb.type = 'checkbox';
                        cb.checked = Boolean(value);
                        lab.append(cb, document.createTextNode(f.label));
                        grid.appendChild(lab);
                        inputs.set(f.key, () => cb.checked);
                        continue;
                    }
                    const wrap = document.createElement('label');
                    wrap.className = `${UI_PREFIX}-field${f.wide || f.type === 'textarea' ? ` ${UI_PREFIX}-field--wide` : ''}${f.missing ? ` ${UI_PREFIX}-field--missing` : ''}`;
                    wrap.appendChild(document.createTextNode(f.label));
                    let input;
                    if (f.type === 'select') {
                        input = document.createElement('select');
                        const opts = [...(f.options || [])];
                        if (value && !opts.some((o) => o[0] === value)) opts.unshift([value, value]);
                        for (const [v, l] of opts) {
                            const o = document.createElement('option');
                            o.value = v;
                            o.textContent = l;
                            input.appendChild(o);
                        }
                        input.value = value;
                    } else if (f.type === 'textarea') {
                        input = document.createElement('textarea');
                        input.rows = f.rows || 4;
                        input.value = value;
                    } else {
                        input = document.createElement('input');
                        input.type = f.type === 'password' ? 'password' : 'text';
                        input.value = value;
                        input.autocomplete = 'off';
                    }
                    if (f.original !== undefined && String(f.original) !== String(value)) wrap.classList.add(`${UI_PREFIX}-field--changed`);
                    if (f.hint) input.title = f.hint;
                    wrap.appendChild(input);
                    grid.appendChild(wrap);
                    inputs.set(f.key, () => input.value.trim());
                }
                box.appendChild(grid);
                modal.appendChild(box);
            }

            const bar = document.createElement('div');
            bar.className = `${UI_PREFIX}-buttons`;
            const close = (result) => {
                overlay.remove();
                resolve(result);
            };
            for (const b of buttons) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = `${UI_PREFIX}-btn${b.primary ? '' : ` ${UI_PREFIX}-btn--ghost`}`;
                btn.textContent = b.label;
                btn.addEventListener('click', () => {
                    if (b.value === null) {
                        close(null);
                        return;
                    }
                    const values = {};
                    inputs.forEach((getter, key) => { values[key] = getter(); });
                    close({ button: b.value, values });
                });
                bar.appendChild(btn);
            }
            modal.appendChild(bar);
            overlay.appendChild(modal);
            overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(null); });
            document.body.appendChild(overlay);
        });
    }

    /* ==========================================================================
     * LOKALES LLM (OLLAMA)
     * ========================================================================== */

    async function ollamaGenerate(settings, prompt, { json = false, timeoutMs = 45000 } = {}) {
        try {
            const res = await gmRequest({
                method: 'POST',
                url: settings.ollamaUrl,
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify({ model: settings.ollamaModel, prompt, stream: false, ...(json ? { format: 'json' } : {}), options: { temperature: 0 } }),
                timeout: timeoutMs
            });
            if (res.status !== 200) return { ok: false, error: `Ollama HTTP ${res.status}` };
            const outer = JSON.parse(res.text);
            const text = String(outer.response || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
            if (!json) return { ok: true, text };
            return { ok: true, data: JSON.parse(text || '{}') };
        } catch (err) {
            return { ok: false, error: `Ollama nicht erreichbar (${settings.ollamaUrl}): ${err.message || err}` };
        }
    }

    /* ==========================================================================
     * ÜBERSETZUNG: DeepL Free -> lokales LLM
     * ========================================================================== */

    async function deeplTranslate(key, texts, targetLang) {
        const host = /:fx$/.test(key) ? 'api-free.deepl.com' : 'api.deepl.com';
        const res = await gmRequest({
            method: 'POST',
            url: `https://${host}/v2/translate`,
            headers: { Authorization: `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/json' },
            data: JSON.stringify({ text: texts, target_lang: targetLang }),
            timeout: 30000
        });
        if (res.status === 403) throw new Error('DeepL: API-Key ungültig (HTTP 403)');
        if (res.status === 456) throw new Error('DeepL: Monatskontingent aufgebraucht (HTTP 456)');
        if (res.status !== 200) throw new Error(`DeepL: HTTP ${res.status}`);
        const data = JSON.parse(res.text);
        return data.translations.map((t) => ({ text: t.text, detected: String(t.detected_source_language || '').toUpperCase(), provider: 'DeepL' }));
    }

    async function llmTranslate(settings, texts) {
        const out = [];
        for (const t of texts) {
            const r = await ollamaGenerate(settings, `Übersetze den folgenden Chat-Text ins Deutsche. Gib NUR die Übersetzung aus, ohne Erklärung. Ist der Text bereits deutsch, gib ihn unverändert aus.\n\nText:\n${t}`, { timeoutMs: 60000 });
            if (!r.ok) throw new Error(r.error);
            out.push({ text: r.text, detected: '', provider: 'lokales LLM' });
        }
        return out;
    }

    /**
     * Übersetzt Texte ins Deutsche. Reihenfolge: DeepL (Key fehlt -> Popup) -> lokales LLM.
     * Rückgabe: Array gleicher Länge ({text, detected, provider} oder null) + warnings.
     */
    async function translateTexts(texts, { settings, saveSettings, targetLang = 'DE' }) {
        const warnings = [];
        if (!texts.length) return { results: [], warnings };
        let key = settings.deeplKey;
        if (!key) {
            const answer = await openForm({
                title: 'DeepL-API-Key fehlt',
                hint: `${texts.length} Nachricht(en) sind nicht deutsch. Für die Übersetzung wird dein DeepL-Free-Key benötigt (wird nur lokal in Tampermonkey gespeichert).`,
                sections: [{ title: 'DeepL', fields: [{ key: 'deeplKey', label: 'DeepL-API-Key (endet bei Free auf „:fx“)', type: 'password', wide: true }] }],
                buttons: [
                    { label: 'Nicht übersetzen', value: 'none' },
                    { label: 'Ohne DeepL (lokales LLM)', value: 'llm' },
                    { label: 'Speichern & übersetzen', value: 'save', primary: true }
                ]
            });
            if (!answer || answer.button === 'none') return { results: texts.map(() => null), warnings: ['Übersetzung übersprungen'] };
            if (answer.button === 'save' && answer.values.deeplKey) {
                key = answer.values.deeplKey;
                saveSettings({ ...settings, deeplKey: key });
            }
        }
        if (key) {
            try {
                return { results: await deeplTranslate(key, texts, targetLang), warnings };
            } catch (err) {
                warnings.push(`${err.message} – Fallback auf lokales LLM`);
            }
        }
        if (settings.useLlm !== false) {
            try {
                return { results: await llmTranslate(settings, texts), warnings };
            } catch (err) {
                warnings.push(`Übersetzung fehlgeschlagen: ${err.message}`);
            }
        }
        return { results: texts.map(() => null), warnings };
    }

    /* ==========================================================================
     * PDF ERZEUGEN & AUSLIEFERN
     * ========================================================================== */

    function renderPdfBytes(docDefinition) {
        return new Promise((resolve, reject) => {
            try {
                global.pdfMake.createPdf(docDefinition).getBuffer((buffer) => resolve(buffer));
            } catch (err) {
                reject(err);
            }
        });
    }

    async function attachFiles(pdfBytes, attachments) {
        if (!global.PDFLib || !attachments.length) return pdfBytes;
        const doc = await global.PDFLib.PDFDocument.load(pdfBytes);
        for (const a of attachments) {
            await doc.attach(a.bytes, a.filename, { mimeType: a.mimeType || 'image/jpeg', description: a.description || 'Originalbild' });
        }
        return doc.save();
    }

    /** Genau EINE Auslieferung: Download (Standard), Tab oder beides. */
    function deliverPdf(bytes, filename, mode = 'download') {
        const file = new File([bytes], filename, { type: 'application/pdf' });
        const url = URL.createObjectURL(file);
        if (mode === 'download' || mode === 'both') {
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
        }
        if (mode === 'open' || mode === 'both') window.open(url, '_blank');
        // shortcut: Blob-URL lebt 10 min (Links im Toast danach tot), bei Bedarf Bytes im Toast halten
        setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
        return url;
    }

    /* ==========================================================================
     * EXPORTER (Ablauf-Steuerung)
     * ========================================================================== */

    const COMMON_GLOBAL_FIELDS = [
        { key: 'ownFullName', label: 'Eigener Klarname' },
        { key: 'deeplKey', label: 'DeepL-API-Key', type: 'password' },
        { key: 'ollamaUrl', label: 'Ollama-Endpunkt' },
        { key: 'ollamaModel', label: 'Ollama-Modell' },
        { key: 'deliveryMode', label: 'Nach dem Erstellen', type: 'select', options: [['download', 'Nur herunterladen'], ['open', 'Nur im Tab öffnen'], ['both', 'Herunterladen und öffnen']] },
        { key: 'useLlm', label: 'Lokales LLM (Ollama) als Fallback/Analyse nutzen', type: 'checkbox' },
        { key: 'attachOriginals', label: 'Originalbilder als PDF-Anhang einbetten', type: 'checkbox' },
        { key: 'reviewBeforeExport', label: 'Vor jedem Export das Feld-Popup zeigen', type: 'checkbox' }
    ];

    const COMMON_DEFAULTS = {
        ownFullName: '',
        deeplKey: '',
        ollamaUrl: 'http://127.0.0.1:11434/api/generate',
        ollamaModel: 'qwen2.5:7b',
        deliveryMode: 'download',
        useLlm: true,
        attachOriginals: true,
        reviewBeforeExport: false
    };

    /**
     * config: {
     *   platform, platformLabel, scriptName, scriptVersion, settingsKey, defaults, globalFields,
     *   capabilities: { orderId, paymentMethod, buyerProtection, translation },
     *   colors: { primary, primaryText, primaryBorder },
     *   adapter: { getRecordKey(), collect(ctx) -> Promise<extraction>, finalizeMeta?(meta, settings) }
     * }
     * extraction = { key, meta, messages, chatImages, adImages, attributes, description, securityNotice, partnerAvatar, warnings[] }
     */
    function createExporter(config) {
        const store = createSettingsStore(config.settingsKey, { ...COMMON_DEFAULTS, ...(config.defaults || {}) });
        const caps = config.capabilities || {};
        const scriptLabel = `${config.scriptName} v${config.scriptVersion} (Tampermonkey, Bibliotheken v${VERSION})`;
        const localFieldDefs = LOCAL_FIELDS.filter((f) => !f.cap || caps[f.cap]);
        const globalFieldDefs = [...(config.globalFields || []), ...COMMON_GLOBAL_FIELDS];
        let busy = false;

        injectStyles(config.colors);

        function finalizeMeta(meta) {
            const m = { ...meta };
            m.trackingCarrier = normalizeCarrier(m.trackingCarrier) || (isNa(m.trackingId) ? '' : detectCarrier(m.trackingId));
            if (!isNa(m.trackingId) && CARRIER_TRACKING_URLS[m.trackingCarrier]) m.trackingUrl = CARRIER_TRACKING_URLS[m.trackingCarrier](m.trackingId);
            else m.trackingUrl = '';
            return config.adapter.finalizeMeta ? config.adapter.finalizeMeta(m, store.get()) : m;
        }

        function mergeRecord(extraction, record) {
            const overrides = (record && record.overrides) || {};
            const meta = { ...extraction.meta };
            for (const [k, v] of Object.entries(overrides)) {
                if (k !== 'attributesText' && k !== 'description') meta[k] = v;
            }
            const attributes = overrides.attributesText !== undefined ? textToAttributes(overrides.attributesText) : extraction.attributes || [];
            const description = overrides.description !== undefined ? overrides.description : extraction.description || '';
            return { meta: finalizeMeta(meta), attributes, description, overrides };
        }

        async function openEditor({ extraction, record, mode }) {
            const settings = store.get();
            const merged = extraction ? mergeRecord(extraction, record) : null;
            const sections = [{
                title: '🌐 Global (für alle Konversationen dieses Skripts)',
                fields: globalFieldDefs.map((f) => ({ ...f, value: settings[f.key] }))
            }];
            if (merged) {
                const extractedVals = { ...extraction.meta, attributesText: attributesToText(extraction.attributes), description: extraction.description || '' };
                const current = { ...merged.meta, attributesText: attributesToText(merged.attributes), description: merged.description };
                sections.push({
                    title: '📄 Diese Konversation / Anzeige (wird in der lokalen Datenbank gespeichert)',
                    hint: 'Orange = manuell geändert (gilt auch für künftige Exporte). Rot = fehlt (n/a).',
                    fields: localFieldDefs.map((f) => ({ ...f, value: current[f.key] === undefined ? '' : current[f.key], original: extractedVals[f.key] === undefined ? '' : extractedVals[f.key], missing: /^n\/?a$/i.test(String(current[f.key] === undefined || current[f.key] === null ? '' : current[f.key]).trim()) }))
                });
            } else {
                sections.push({ title: '📄 Diese Konversation', hint: 'Noch keine Daten für diese Konversation. Nutze „📝 Prüfen“, um die Felder vor dem Export zu sehen und zu ändern.', fields: [] });
            }
            const buttons = [{ label: 'Abbrechen', value: null }];
            if (merged) buttons.push({ label: 'Konversation zurücksetzen', value: 'reset' });
            buttons.push({ label: 'Speichern', value: 'save', primary: mode !== 'export' });
            if (mode === 'export') buttons.push({ label: 'Speichern & PDF erstellen', value: 'export', primary: true });

            const answer = await openForm({ title: `⚙️ ${config.scriptName} – Einstellungen & Felder (v${config.scriptVersion})`, sections, buttons });
            if (!answer) return null;
            const nextSettings = { ...settings };
            for (const f of globalFieldDefs) if (answer.values[f.key] !== undefined) nextSettings[f.key] = answer.values[f.key];
            store.set(nextSettings);

            if (!merged) return { action: answer.button };
            const overrides = {};
            if (answer.button !== 'reset') {
                const extractedVals = { ...extraction.meta, attributesText: attributesToText(extraction.attributes), description: extraction.description || '' };
                for (const f of localFieldDefs) {
                    const v = answer.values[f.key];
                    const orig = extractedVals[f.key] === undefined || extractedVals[f.key] === null ? '' : String(extractedVals[f.key]);
                    if (v !== undefined && v !== orig) overrides[f.key] = v;
                }
            }
            const nextRecord = { ...(record || {}), key: extraction.key, platform: config.platform, overrides, updatedAt: new Date().toISOString() };
            await dbPut('records', nextRecord);
            toast(answer.button === 'reset' ? '↩️ Manuelle Änderungen dieser Konversation verworfen.' : '💾 Einstellungen & Felder gespeichert.', { type: 'success', timeoutMs: 4000 });
            return { action: answer.button, record: nextRecord };
        }

        async function translateMessages(messages, settings, warnings) {
            if (!caps.translation) return;
            const candidates = messages.filter((m) => (m.kind === 'text' || !m.kind) && m.text && !m.translation && (m.forceTranslation || !looksGerman(m.text)));
            if (!candidates.length) return;
            const { results, warnings: tw } = await translateTexts(candidates.map((m) => m.text), { settings, saveSettings: (s) => store.set({ ...store.get(), ...s }) });
            warnings.push(...tw);
            candidates.forEach((m, i) => {
                const r = results[i];
                if (r && r.text && r.detected !== 'DE' && r.text.trim() !== m.text.trim()) {
                    m.translation = { text: r.text, label: `Übersetzung (${r.provider}${r.detected ? `, aus ${r.detected}` : ''})` };
                }
            });
        }

        async function run({ review = false } = {}) {
            if (busy) return;
            busy = true;
            const progress = toast(`⏳ ${config.platformLabel}: lese Nachrichtenverlauf, Anzeige & Bilder …`, { sticky: true, id: `${UI_PREFIX}-progress` });
            try {
                const settings = store.get();
                const extraction = await config.adapter.collect({ settings, core: api, toast });
                const warnings = [...(extraction.warnings || [])];
                let record = await dbGet('records', extraction.key);

                if (review || settings.reviewBeforeExport) {
                    progress.close();
                    const edited = await openEditor({ extraction, record, mode: 'export' });
                    if (!edited || edited.action !== 'export') return;
                    record = edited.record;
                }

                const merged = mergeRecord(extraction, record);
                await translateMessages(extraction.messages, store.get(), warnings);

                toast('📄 Erzeuge PDF …', { sticky: true, id: `${UI_PREFIX}-progress` });
                const model = {
                    platform: config.platform,
                    platformLabel: config.platformLabel,
                    scriptLabel,
                    capabilities: caps,
                    meta: merged.meta,
                    attributes: merged.attributes,
                    description: merged.description,
                    messages: extraction.messages,
                    chatImages: extraction.chatImages || [],
                    adImages: extraction.adImages || [],
                    securityNotice: extraction.securityNotice,
                    partnerAvatar: extraction.partnerAvatar,
                    exportedAt: Theme.formatExportTimestamp(new Date()),
                    includeAdPage: extraction.includeAdPage !== false
                };
                for (const img of [...model.adImages, ...model.chatImages]) img.galleryDataUrl = await Theme.normalizeGalleryImageDataUrl(img.dataUrl);

                let bytes = await renderPdfBytes(Theme.buildExportDocument(model));
                if (settings.attachOriginals) {
                    const attachments = [
                        ...model.chatImages.map((i) => ({ bytes: i.bytes, filename: i.filename, description: 'Originalbild aus dem Chat' })),
                        ...model.adImages.map((i) => ({ bytes: i.bytes, filename: i.filename, description: 'Originalbild der Anzeige' }))
                    ].filter((a) => a.bytes);
                    bytes = await attachFiles(bytes, attachments);
                }

                const txIso = toIsoDate(merged.meta.transactionDate);
                const datePart = txIso || formatDateIso();
                const titlePart = sanitizeFilename(merged.meta.adTitle || 'Unbekannt', 90);
                const idPart = isNa(merged.meta.adId) ? '' : ` ${sanitizeFilename(merged.meta.adId, 24)}`;
                const filename = `${datePart} ${sanitizeFilename(config.platformLabel.replace(/\.de$/i, ''))} Chat ${titlePart}${idPart}.pdf`;
                const url = deliverPdf(bytes, filename, settings.deliveryMode);

                await dbPut('records', {
                    ...(record || {}),
                    key: extraction.key,
                    platform: config.platform,
                    overrides: merged.overrides,
                    extracted: extraction.meta,
                    extractedAttributes: extraction.attributes || [],
                    extractedDescription: extraction.description || '',
                    lastFilename: filename,
                    lastExportAt: new Date().toISOString(),
                    messageCount: extraction.messages.length
                });

                progress.close();
                document.getElementById(`${UI_PREFIX}-progress`)?.remove();
                if (!txIso) warnings.push('Transaktionsdatum unbekannt – Dateiname nutzt das heutige Datum');
                const missing = localFieldDefs.filter((f) => ['adType', 'category', 'createdAt', 'sellerActiveSince', 'listedPrice'].includes(f.key) && isNa(merged.meta[f.key])).map((f) => f.label);
                if (missing.length) warnings.push(`Fehlende Felder (n/a): ${missing.join(', ')}`);
                toast(`✅ PDF erstellt: ${filename}`, {
                    type: 'success',
                    sticky: true,
                    actions: [
                        { label: '📂 Im Tab öffnen', href: url },
                        { label: '💾 Erneut herunterladen', href: url, download: filename },
                        { label: '✏️ Felder bearbeiten', onClick: () => openEditor({ extraction, record: { ...(record || {}), overrides: merged.overrides }, mode: 'save' }) }
                    ]
                });
                if (warnings.length) {
                    toast('⚠️ Hinweise zum Export (Werte im ⚙️-Popup korrigierbar):', {
                        type: 'warn',
                        sticky: true,
                        list: warnings,
                        actions: [{ label: '✏️ Felder bearbeiten', onClick: () => openEditor({ extraction, record: { ...(record || {}), overrides: merged.overrides }, mode: 'save' }) }]
                    });
                }
            } catch (err) {
                console.error(`[${config.scriptName}]`, err);
                document.getElementById(`${UI_PREFIX}-progress`)?.remove();
                toast(`❌ Export fehlgeschlagen: ${err.message || err}`, { type: 'error', sticky: true });
            } finally {
                busy = false;
            }
        }

        async function openSettings() {
            const key = config.adapter.getRecordKey ? config.adapter.getRecordKey() : null;
            const record = key ? await dbGet('records', key) : null;
            const extraction = record && record.extracted
                ? { key, meta: record.extracted, attributes: record.extractedAttributes || [], description: record.extractedDescription || '' }
                : null;
            await openEditor({ extraction, record, mode: 'save' });
        }

        /** Button-Leiste (📄 PDF-Export, 📝 Prüfen, ⚙️). */
        function createToolbar() {
            const bar = document.createElement('div');
            bar.className = `${UI_PREFIX}-bar`;
            bar.dataset.mpe = config.platform;
            const mk = (label, title, cls, onClick) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = `${UI_PREFIX}-btn ${cls}`;
                b.textContent = label;
                b.title = title;
                b.addEventListener('click', async (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    b.disabled = true;
                    try {
                        await onClick();
                    } finally {
                        b.disabled = false;
                    }
                });
                return b;
            };
            bar.append(
                mk('📄 PDF-Export', 'PDF mit Nachrichtenverlauf, Anzeige & Bildern erstellen', '', () => run()),
                mk('📝 Prüfen', 'Felder vor dem Export prüfen/ändern', `${UI_PREFIX}-btn--ghost`, () => run({ review: true })),
                mk('⚙️', 'Einstellungen & gespeicherte Felder', `${UI_PREFIX}-btn--ghost ${UI_PREFIX}-btn--icon`, () => openSettings())
            );
            const badge = document.createElement('span');
            badge.className = `${UI_PREFIX}-badge`;
            bar.append(badge);
            const refreshBadge = async () => {
                const key = config.adapter.getRecordKey ? config.adapter.getRecordKey() : null;
                const rec = key ? await dbGet('records', key) : null;
                const saved = Boolean(rec && (rec.lastExportAt || (rec.overrides && Object.keys(rec.overrides).length)));
                badge.textContent = saved ? '💾 In DB' : '💾 Neu';
                badge.classList.toggle(`${UI_PREFIX}-badge--saved`, saved);
                badge.title = saved
                    ? `Lokal gespeichert${rec.lastExportAt ? `, zuletzt exportiert ${new Date(rec.lastExportAt).toLocaleString('de-DE')}` : ''}${rec.overrides && Object.keys(rec.overrides).length ? `, ${Object.keys(rec.overrides).length} manuelle Änderung(en)` : ''}`
                    : 'Für diese Konversation noch nichts in der lokalen Datenbank';
            };
            void refreshBadge();
            const timer = setInterval(() => {
                if (!bar.isConnected) clearInterval(timer);
                else void refreshBadge();
            }, 2500);
            return bar;
        }

        const api = {
            settings: store,
            run,
            openSettings,
            createToolbar,
            ollamaGenerate: (prompt, opts) => ollamaGenerate(store.get(), prompt, opts)
        };
        return api;
    }

    global.MarketplaceExportCore = Object.freeze({
        VERSION,
        sleep,
        isNa,
        cleanText,
        sanitizeFilename,
        toIsoDate,
        extractRuns,
        looksGerman,
        gmRequest,
        gmFetchText,
        fetchImage,
        fetchImages,
        rasterizeSvgUrl,
        dbGet,
        dbPut,
        detectCarrier,
        findTrackingNumber,
        PAYMENT_METHODS,
        createExporter
    });
})(typeof window !== 'undefined' ? window : globalThis);
