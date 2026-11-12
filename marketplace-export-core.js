/**
 * MarketplaceExportCore – gemeinsame Ablauf-Bibliothek für alle Marktplatz-PDF-Exporter.
 * Version: 4.2.0
 *
 * Verantwortung: Export-Pipeline, IndexedDB (Overrides je Konversation), Einstellungs-/Feld-Popup,
 * Toasts, HTTP/Bilder, Übersetzung (DeepL -> lokales LLM), Ollama-Client, PDF-Auslieferung.
 * Darstellung macht PdfSharedTheme (pdf-style-*.js), Seiten-Auslesen der jeweilige Adapter.
 *
 * Einbindung (Reihenfolge: pdfmake, vfs_fonts, pdf-lib, [xlsx], pdf-style-core, -article, -chat, [-invoice], Core):
 * // @require https://raw.githubusercontent.com/thethinker990/tampermonkey/main/marketplace-export-core.js?v=4.2.0
 * Benötigte Grants im Userscript: GM_xmlhttpRequest, GM_getValue, GM_setValue, GM_listValues
 */
(function (global) {
    'use strict';

    const VERSION = '4.2.0';
    const DB_NAME = 'MarketplacePdfExport';
    const DB_VERSION = 3;
    const UI_PREFIX = 'mpe';
    const Theme = global.PdfSharedTheme;
    if (!Theme || !Theme.buildExportDocument) throw new Error('pdf-style-core.js, pdf-style-article.js und pdf-style-chat.js müssen vor marketplace-export-core.js per @require geladen werden');

    function flattenValues(value, path = [], out = []) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            for (const [key, child] of Object.entries(value)) flattenValues(child, [...path, key], out);
        } else {
            out.push({ path, value });
        }
        return out;
    }

    function setPathValue(target, path, value) {
        let node = target;
        for (const key of path.slice(0, -1)) {
            if (key === '__proto__' || key === 'prototype' || key === 'constructor') throw new Error(`Unsicherer Feldpfad: ${key}`);
            if (!Object.prototype.hasOwnProperty.call(node, key) || !node[key] || typeof node[key] !== 'object' || Array.isArray(node[key])) node[key] = {};
            node = node[key];
        }
        if (path.length) {
            const key = path[path.length - 1];
            if (key === '__proto__' || key === 'prototype' || key === 'constructor') throw new Error(`Unsicherer Feldpfad: ${key}`);
            node[key] = value;
        }
    }

    function mergeArticleValues(oldData, incomingData) {
        const oldValues = flattenValues(oldData);
        const newValues = flattenValues(incomingData);
        const oldByPath = new Map(oldValues.map((x) => [JSON.stringify(x.path), x.value]));
        const conflicts = newValues.filter((x) => {
            const key = JSON.stringify(x.path);
            return oldByPath.has(key) && isKnown(oldByPath.get(key)) && isKnown(x.value) && JSON.stringify(oldByPath.get(key)) !== JSON.stringify(x.value);
        });
        const result = typeof structuredClone === 'function' ? structuredClone(incomingData) : JSON.parse(JSON.stringify(incomingData));
        const newByPath = new Map(newValues.map((x) => [JSON.stringify(x.path), x.value]));
        for (const { path, value } of oldValues) {
            if (isKnown(value) && !isKnown(newByPath.get(JSON.stringify(path)))) setPathValue(result, path, value);
        }
        return { result, conflicts, oldByPath };
    }

    function openConflictPreview(oldData, incomingData) {
        const { result, conflicts, oldByPath } = mergeArticleValues(oldData, incomingData);
        if (!conflicts.length) return Promise.resolve(result);
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = `${UI_PREFIX}-overlay`;
            const modal = document.createElement('div');
            modal.className = `${UI_PREFIX}-modal ${UI_PREFIX}-modal--wide`;
            const title = document.createElement('h3');
            title.textContent = 'Änderungen vergleichen';
            const hint = document.createElement('p');
            hint.className = `${UI_PREFIX}-hint`;
            hint.textContent = 'Wähle für jedes geänderte Feld den alten oder den eingehenden Wert. Erst „Speichern“ übernimmt die Auswahl.';
            const table = document.createElement('table');
            table.className = `${UI_PREFIX}-rates-table`;
            const header = document.createElement('tr');
            for (const text of ['Feld', 'Alt', 'Neu', 'Behalten']) {
                const th = document.createElement('th');
                th.textContent = text;
                header.appendChild(th);
            }
            table.appendChild(header);
            const choices = [];
            const display = (value) => typeof value === 'string' ? value : JSON.stringify(value);
            for (const item of conflicts) {
                const key = JSON.stringify(item.path);
                const row = document.createElement('tr');
                const name = document.createElement('td');
                name.textContent = item.path.join('.');
                const oldCell = document.createElement('td');
                oldCell.textContent = display(oldByPath.get(key));
                const newCell = document.createElement('td');
                newCell.textContent = display(item.value);
                const selectCell = document.createElement('td');
                const select = document.createElement('select');
                select.setAttribute('aria-label', `${item.path.join('.')} behalten`);
                for (const [value, text] of [['', 'Auswählen…'], ['old', 'Alt'], ['new', 'Neu']]) {
                    const option = document.createElement('option');
                    option.value = value;
                    option.textContent = text;
                    select.appendChild(option);
                }
                selectCell.appendChild(select);
                row.append(name, oldCell, newCell, selectCell);
                table.appendChild(row);
                choices.push({ item, select });
            }
            const buttons = document.createElement('div');
            buttons.className = `${UI_PREFIX}-buttons`;
            const save = document.createElement('button');
            save.type = 'button';
            save.className = `${UI_PREFIX}-btn`;
            save.textContent = 'Speichern';
            save.disabled = true;
            const cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.className = `${UI_PREFIX}-btn ${UI_PREFIX}-btn--ghost`;
            cancel.textContent = 'Abbrechen';
            const close = (value) => {
                overlay.remove();
                resolve(value);
            };
            const updateSaveState = () => { save.disabled = choices.some((x) => !x.select.value); };
            choices.forEach((x) => x.select.addEventListener('change', updateSaveState));
            save.addEventListener('click', () => {
                for (const { item, select } of choices) {
                    if (select.value === 'old') setPathValue(result, item.path, oldByPath.get(JSON.stringify(item.path)));
                }
                close(result);
            });
            cancel.addEventListener('click', () => close(null));
            buttons.append(cancel, save);
            modal.append(title, hint, table, buttons);
            overlay.appendChild(modal);
            overlay.addEventListener('click', (event) => { if (event.target === overlay) close(null); });
            document.body.appendChild(overlay);
        });
    }

    function openMediaConflict(oldMedia, newMedia) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = `${UI_PREFIX}-overlay`;
            const modal = document.createElement('div');
            modal.className = `${UI_PREFIX}-modal ${UI_PREFIX}-modal--wide`;
            const title = document.createElement('h3');
            title.textContent = 'Bilddatei vergleichen';
            const table = document.createElement('table');
            table.className = `${UI_PREFIX}-rates-table`;
            const row = document.createElement('tr');
            for (const text of ['Stand', 'Dateiname', 'Byte-Größe', 'SHA-256']) {
                const th = document.createElement('th');
                th.textContent = text;
                row.appendChild(th);
            }
            table.appendChild(row);
            for (const [label, media] of [['Alt', oldMedia], ['Neu', newMedia]]) {
                const tr = document.createElement('tr');
                for (const value of [label, media.filename, String(media.sizeBytes), media.sha256]) {
                    const td = document.createElement('td');
                    td.textContent = value;
                    tr.appendChild(td);
                }
                table.appendChild(tr);
            }
            const choiceLabel = document.createElement('label');
            choiceLabel.className = `${UI_PREFIX}-field`;
            choiceLabel.textContent = 'Zu behaltende Datei';
            const select = document.createElement('select');
            for (const [value, text] of [['', 'Auswählen…'], ['old', 'Alt'], ['new', 'Neu']]) {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = text;
                select.appendChild(option);
            }
            choiceLabel.appendChild(select);
            const buttons = document.createElement('div');
            buttons.className = `${UI_PREFIX}-buttons`;
            const cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.className = `${UI_PREFIX}-btn ${UI_PREFIX}-btn--ghost`;
            cancel.textContent = 'Abbrechen';
            const save = document.createElement('button');
            save.type = 'button';
            save.className = `${UI_PREFIX}-btn`;
            save.textContent = 'Speichern';
            save.disabled = true;
            select.addEventListener('change', () => { save.disabled = !select.value; });
            const close = (value) => { overlay.remove(); resolve(value); };
            cancel.addEventListener('click', () => close(null));
            save.addEventListener('click', () => close(select.value));
            buttons.append(cancel, save);
            modal.append(title, table, choiceLabel, buttons);
            overlay.appendChild(modal);
            overlay.addEventListener('click', (event) => { if (event.target === overlay) close(null); });
            document.body.appendChild(overlay);
        });
    }

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
            if (el.matches('script, style, svg, .clipped, .sr-only')) return;
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

    // Eine Verbindung je Seite; bei Lösch-/Upgrade-Anfrage (versionchange) freigeben, beim nächsten Zugriff neu öffnen.
    // Upgrades legen nur fehlende Bereiche an – vorhandene Daten werden nie gelöscht.
    let dbPromise = null;
    function openDb() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', { keyPath: 'key' });
                if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache', { keyPath: 'key' });
                if (!db.objectStoreNames.contains('orders')) db.createObjectStore('orders', { keyPath: 'orderId' });
                if (!db.objectStoreNames.contains('config')) db.createObjectStore('config', { keyPath: 'key' });
                if (!db.objectStoreNames.contains('articles')) db.createObjectStore('articles', { keyPath: 'articleId' });
                if (!db.objectStoreNames.contains('media')) db.createObjectStore('media', { keyPath: 'mediaId' });
                if (!db.objectStoreNames.contains('syncOutbox')) db.createObjectStore('syncOutbox', { keyPath: 'operationId' });
                if (!db.objectStoreNames.contains('unmappedFields')) db.createObjectStore('unmappedFields', { keyPath: 'id' });
            };
            req.onsuccess = () => {
                const db = req.result;
                db.onversionchange = () => {
                    db.close();
                    dbPromise = null;
                };
                resolve(db);
            };
            req.onerror = () => {
                dbPromise = null;
                reject(req.error);
            };
        });
        return dbPromise;
    }

    /*
     * Datenhaltung: IndexedDB je Website (schnell) + Spiegel im Tampermonkey-Speicher (überlebt das Löschen der
     * Website-Daten und jeden Versionswechsel). Gelesen wird zuerst IndexedDB; fehlt dort etwas, kommt es aus dem
     * Spiegel und wird zurückgeschrieben. Daten werden nie verworfen – Schema-Änderungen nur ergänzend.
     */
    const STORE_KEYS = { records: 'key', cache: 'key', orders: 'orderId', config: 'key', articles: 'articleId', media: 'mediaId', syncOutbox: 'operationId', unmappedFields: 'id' };
    const gmKey = (store, id) => `mpe:${store}:${id}`;
    const MIRROR_EXCLUDED_STORES = new Set(['media']);
    const hasGm = () => typeof GM_getValue === 'function' && typeof GM_setValue === 'function';

    function gmMirrorPut(store, value) {
        try {
            if (!MIRROR_EXCLUDED_STORES.has(store) && hasGm() && value && value[STORE_KEYS[store]] !== undefined) GM_setValue(gmKey(store, value[STORE_KEYS[store]]), value);
        } catch (err) {
            console.warn('[MPE] Sicherung im Tampermonkey-Speicher fehlgeschlagen:', err);
        }
    }

    function gmMirrorGet(store, key) {
        try {
            return hasGm() ? GM_getValue(gmKey(store, key), null) : null;
        } catch {
            return null;
        }
    }

    async function idbRequest(store, mode, fn) {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(store, mode);
            const req = fn(tx.objectStore(store));
            if (mode === 'readonly') {
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            } else {
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => reject(tx.error);
            }
        });
    }

    async function dbGet(store, key) {
        let value = null;
        try {
            value = (await idbRequest(store, 'readonly', (s) => s.get(key))) || null;
        } catch (err) {
            console.warn('[MPE] DB-Lesefehler:', err);
        }
        if (value) return value;
        const backup = gmMirrorGet(store, key);
        if (backup) await idbRequest(store, 'readwrite', (s) => s.put(backup)).catch(() => {});
        return backup || null;
    }

    async function dbPut(store, value) {
        gmMirrorPut(store, value);
        try {
            return await idbRequest(store, 'readwrite', (s) => s.put(value));
        } catch (err) {
            console.warn('[MPE] DB-Schreibfehler:', err);
            return false;
        }
    }

    async function dbGetAll(store) {
        let rows = [];
        try {
            rows = (await idbRequest(store, 'readonly', (s) => s.getAll())) || [];
        } catch (err) {
            console.warn('[MPE] DB-Lesefehler:', err);
        }
        // Einträge, die nur noch im Spiegel stehen (z. B. Website-Daten gelöscht), ergänzen
        if (hasGm() && typeof GM_listValues === 'function') {
            const prefix = `mpe:${store}:`;
            const have = new Set(rows.map((r) => String(r[STORE_KEYS[store]])));
            for (const k of GM_listValues()) {
                if (!k.startsWith(prefix) || have.has(k.slice(prefix.length))) continue;
                const v = gmMirrorGet(store, k.slice(prefix.length));
                if (v) rows.push(v);
            }
        }
        return rows;
    }

    async function dbGetStrict(store, key) {
        return (await idbRequest(store, 'readonly', (objectStore) => objectStore.get(key))) || null;
    }

    async function dbGetAllStrict(store) {
        return (await idbRequest(store, 'readonly', (objectStore) => objectStore.getAll())) || [];
    }

    async function rememberContact(platform, adId, source) {
        if (!/^\d+$/.test(adId)) throw new Error('Ungültige Anzeigen-ID');
        const key = `${platform}:contact:${adId}`;
        const existing = await dbGet('config', key);
        if (existing) return existing;
        const record = { key, platform, adId, source, contactedAt: new Date().toISOString() };
        await dbPutMany([['config', record]]);
        return record;
    }

    async function getContacts(platform) {
        const contacts = (await dbGetAll('config')).filter((row) => row.key.startsWith(`${platform}:contact:`));
        const ids = new Set(contacts.map((row) => row.adId));
        for (const record of await dbGetAll('records')) {
            const adId = String(record.extracted?.adId || '');
            if (record.platform !== platform || !/^\d+$/.test(adId) || !record.extracted?.conversationId || isNa(record.extracted.conversationId) || ids.has(adId)) continue;
            await rememberContact(platform, adId, 'saved-conversation');
            ids.add(adId);
        }
        return [...ids];
    }

    function createUuid() {
        if (global.crypto && typeof global.crypto.randomUUID === 'function') return global.crypto.randomUUID();
        if (!global.crypto || typeof global.crypto.getRandomValues !== 'function') throw new Error('Kryptografischer Zufallsgenerator nicht verfügbar');
        const bytes = new Uint8Array(16);
        global.crypto.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }

    async function sha256Hex(data) {
        if (!global.crypto || !global.crypto.subtle) throw new Error('SHA-256 ist in diesem Browser nicht verfügbar');
        const bytes = data instanceof ArrayBuffer ? data : await data.arrayBuffer();
        const digest = await global.crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    }

    async function saveArticleData({ articleId = '', ebayItemId = '', data, files = [], unmappedFields = [] }) {
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Artikeldaten sind ungültig');
        const id = articleId || createUuid();
        const current = await dbGetStrict('articles', id);
        const mergedData = current ? await openConflictPreview(current.data || {}, data) : data;
        if (!mergedData) return { cancelled: true };
        const now = new Date().toISOString();
        const localRevision = (current && current.localRevision || 0) + 1;
        const article = {
            ...(current || {}),
            articleId: id,
            data: mergedData,
            ebayItemId: ebayItemId || (current && current.ebayItemId) || null,
            mediaIds: [...new Set(current && current.mediaIds || [])],
            localRevision,
            remoteRevision: current && current.remoteRevision !== undefined ? current.remoteRevision : null,
            updatedAt: now,
            syncState: 'pending'
        };
        const entries = [['articles', article]];
        entries.push(['syncOutbox', {
            operationId: createUuid(),
            entityType: 'article',
            entityId: id,
            localRevision,
            baseRemoteRevision: article.remoteRevision,
            payload: { articleId: id, ebayItemId: article.ebayItemId, data: mergedData, mediaIds: article.mediaIds },
            state: 'pending',
            attempts: 0,
            createdAt: now
        }]);
        const savedMedia = await dbGetAllStrict('media');
        const knownMediaHashes = new Set(savedMedia.filter((media) => media.articleId === id).map((media) => media.sha256));
        let unsupportedMediaCount = 0;
        for (const file of files) {
            if (!file) continue;
            if (!/^image\//i.test(file.type || '')) {
                unsupportedMediaCount += 1;
                continue;
            }
            const sha256 = await sha256Hex(file);
            if (knownMediaHashes.has(sha256)) continue;
            knownMediaHashes.add(sha256);
            const mediaId = createUuid();
            const media = {
                mediaId,
                articleId: id,
                blob: file,
                filename: file.name || 'bild',
                mimeType: file.type || 'application/octet-stream',
                sizeBytes: file.size,
                sha256,
                provider: null,
                objectKey: null,
                syncState: 'pending'
            };
            article.mediaIds.push(mediaId);
            entries.push(['media', media]);
            entries.push(['syncOutbox', {
                operationId: createUuid(),
                entityType: 'media',
                entityId: mediaId,
                localRevision: 1,
                baseRemoteRevision: null,
                payload: { mediaId, articleId: id, filename: media.filename, mimeType: media.mimeType, sizeBytes: media.sizeBytes, sha256 },
                state: 'pending',
                attempts: 0,
                createdAt: now
            }]);
        }
        article.mediaIds = [...new Set(article.mediaIds)];
        entries[0][1] = article;
        const articleOperation = entries.find(([store, value]) => store === 'syncOutbox' && value.entityType === 'article');
        if (articleOperation) articleOperation[1].payload.mediaIds = article.mediaIds;
        const savedUnknown = await dbGetAllStrict('unmappedFields');
        for (const field of unmappedFields) {
            const label = String(field.label || '').trim();
            if (!label || savedUnknown.some((x) => x.articleId === id && x.label === label && JSON.stringify(x.value) === JSON.stringify(field.value) && x.status === 'open')) continue;
            const record = {
                id: createUuid(),
                articleId: id,
                label,
                value: field.value,
                source: String(field.source || ''),
                capturedAt: now,
                status: 'open'
            };
            entries.push(['unmappedFields', record]);
            entries.push(['syncOutbox', {
                operationId: createUuid(),
                entityType: 'unmappedField',
                entityId: record.id,
                localRevision: 1,
                baseRemoteRevision: null,
                payload: record,
                state: 'pending',
                attempts: 0,
                createdAt: now
            }]);
        }
        await dbPutMany(entries);
        return { article, mediaCount: entries.filter(([store]) => store === 'media').length, unmappedCount: entries.filter(([store]) => store === 'unmappedFields').length, unsupportedMediaCount };
    }

    async function dbPutMany(entries) {
        const stores = [...new Set(entries.map(([store]) => store))];
        const db = await openDb();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(stores, 'readwrite');
            for (const [store, value] of entries) tx.objectStore(store).put(value);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error || new Error('IndexedDB-Transaktion fehlgeschlagen'));
            tx.onabort = () => reject(tx.error || new Error('IndexedDB-Transaktion abgebrochen'));
        });
        for (const [store, value] of entries) gmMirrorPut(store, value);
        return true;
    }

    /** Ein Wert gilt als bekannt, wenn er nicht leer und nicht „n/a“ ist (Listen: nicht leer). */
    const isKnown = (v) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== '' && !isNa(v));

    /** Neue Daten über alte legen – ein unbekannter neuer Wert überschreibt nie einen bekannten alten. */
    function mergeKnown(old, fresh) {
        const out = { ...(old || {}) };
        for (const [k, v] of Object.entries(fresh || {})) if (isKnown(v) || !(k in out)) out[k] = v;
        return out;
    }

    /** Schnelle Prüfsumme (FNV-1a 32 Bit + Länge) als Schlüssel für Zwischenspeicher (Texterkennung, Übersetzung). */
    function hashText(str) {
        const s = String(str || '');
        let h = 0x811c9dc5;
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 0x01000193) >>> 0;
        }
        return `${s.length.toString(36)}-${h.toString(36)}`;
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

    /**
     * Dienstleister NUR aus eindeutigen Sendungsnummer-Formaten ('' = nicht eindeutig).
     * Deutsche Post Brief (Internetmarke/Matrixcode, z. B. A001346C4C0000002CEF) und Priobrief laut
     * https://www.paketda.de/paketverfolgung.php?carrier=deutschepost (04.11.2026).
     */
    function carrierFromTrackingId(trackingId) {
        const id = String(trackingId || '').replace(/\s+/g, '');
        if (/^A0[0-9A-F]{18}$/i.test(id) || /^F[0-9A-F]{19}$/i.test(id)) return 'Deutsche Post';
        if (/^1Z[A-Z0-9]{16}$/i.test(id)) return 'UPS';
        return '';
    }

    function detectCarrier(trackingId, contextText = '') {
        const exact = carrierFromTrackingId(trackingId);
        if (exact) return exact;
        const ctx = String(contextText || '');
        if (/hermes/i.test(ctx)) return 'Hermes';
        if (/\bdhl\b/i.test(ctx)) return 'DHL';
        if (/\bdpd\b/i.test(ctx)) return 'DPD';
        if (/\bgls\b/i.test(ctx)) return 'GLS';
        if (/\bups\b/i.test(ctx)) return 'UPS';
        if (/deutsche\s*post|brief/i.test(ctx)) return 'Deutsche Post';
        const id = String(trackingId || '');
        if (/^\d{14}$/.test(id)) return 'Hermes';
        return id ? 'DHL' : '';
    }

    function normalizeCarrier(raw) {
        const s = cleanText(raw).replace(/\s*(paket|päckchen|parcel|express|warenpost)\b.*/i, '').trim();
        return CARRIERS.find((c) => c && c.toLowerCase() === s.toLowerCase()) || (s ? detectCarrier('', s) : '');
    }

    // Nummer muss mindestens eine Ziffer enthalten (sonst wurde z. B. „unmittelbar“ nach „Sendungsnummer“ erkannt)
    const TRACKING_RE = /(?:Sendungsnummer|Sendungnummer|Sendungsnr\.?|Tracking(?:-?nummer|-?id)?|Paketnummer|Sendungsverfolgung)[^A-Z0-9\n]{0,25}((?=[A-Z]*\d)[A-Z0-9]{10,22})\b/gi;
    // Sendungsnummern ohne Stichwort (z. B. aus einem Beleg-Foto): nur eindeutige Formate
    const BARE_TRACKING_RE = /\b(00\d{18}|\d{20}|\d{14}|\d{12}|A0[0-9A-F]{18}|1Z[A-Z0-9]{16}|[A-Z]{2}\d{9}DE)\b/gi;

    /** Alle Sendungsnummern in Reihenfolge (ohne Dubletten, IBANs ausgeschlossen); bare = auch ohne Stichwort. */
    function findTrackingNumbers(texts, { bare = false } = {}) {
        const out = [];
        for (const text of texts) {
            const t = String(text || '');
            const flat = bare ? t.replace(/(\d)[ \t]+(?=\d)/g, '$1') : t;
            for (const re of bare ? [TRACKING_RE, BARE_TRACKING_RE] : [TRACKING_RE]) {
                re.lastIndex = 0;
                for (const m of flat.matchAll(re)) {
                    const id = m[1].toUpperCase();
                    if (/^DE\d{18,20}$/.test(id) || out.some((o) => o.id === id)) continue;
                    out.push({ id, carrier: detectCarrier(id, t) });
                }
            }
        }
        return out;
    }

    /** Erste im Chat genannte Sendungsnummer (= Versand an den Käufer) inkl. Versanddienstleister, sonst null. */
    function findTrackingNumber(texts) {
        return findTrackingNumbers(texts)[0] || null;
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
        { key: 'returnTrackingId', label: 'Rücksende-Sendungsnummer (leer = keine Rücksendung, „n/a“ = Rücksendung ohne Nummer)' },
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
    const moneyFieldValue = (value) => String(value ?? '').replace(/\s*(?:EUR|€)\s*/gi, ' ').trim();
    const MONEY_FIELDS = new Set(['listedPrice', 'listedShipping', 'price', 'shipping', 'buyerProtection']);
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
            .${UI_PREFIX}-btn--attention{background:#f97316;border-color:#ea580c;color:#ffffff}
            .${UI_PREFIX}-bar{display:flex;flex-wrap:wrap;align-items:center;gap:6px;max-width:100%;min-width:0;margin-left:auto;margin-right:8px}
            .${UI_PREFIX}-bar .${UI_PREFIX}-btn,.${UI_PREFIX}-bar .${UI_PREFIX}-badge{flex-shrink:0}
            .${UI_PREFIX}-badge{font:600 11px system-ui,sans-serif;padding:3px 8px;border-radius:10px;background:#e5e7eb;color:#374151;border:1px solid #d1d5db;white-space:nowrap}
            .${UI_PREFIX}-badge--saved{background:#dcfce7;color:#166534;border-color:#86efac}
            .${UI_PREFIX}-toasts{position:fixed;right:20px;bottom:20px;z-index:2147483645;display:flex;flex-direction:column;gap:8px;max-width:520px}
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
            .${UI_PREFIX}-modal select{appearance:auto!important;background-image:none!important;background-repeat:no-repeat!important;padding-right:24px}
            .${UI_PREFIX}-field--missing input{border-color:#ef4444}
            .${UI_PREFIX}-check{display:flex;align-items:center;gap:6px;font-size:12.5px;grid-column:1/-1}
            .${UI_PREFIX}-buttons{display:flex;justify-content:flex-end;gap:8px;margin-top:12px;flex-wrap:wrap;align-items:center}
            .${UI_PREFIX}-modal--wide{width:920px}
            .${UI_PREFIX}-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
            .${UI_PREFIX}-rates-table{border-collapse:collapse;width:100%;font:12px system-ui,sans-serif}
            .${UI_PREFIX}-rates-table th,.${UI_PREFIX}-rates-table td{border-bottom:1px solid #e5e7eb;padding:3px 4px;text-align:left}
            .${UI_PREFIX}-rates-table input{width:100%;box-sizing:border-box;font:12px system-ui,sans-serif;padding:3px 5px;border:1px solid #d1d5db;border-radius:4px}
            .${UI_PREFIX}-rates-table input.${UI_PREFIX}-num{width:80px;text-align:right}
            .${UI_PREFIX}-modal--xwide{width:1400px}
            .${UI_PREFIX}-rates-table select{font:12px system-ui,sans-serif;padding:2px 3px;border:1px solid #d1d5db;border-radius:4px}
            .${UI_PREFIX}-rates-table .${UI_PREFIX}-changed{border-color:#f59e0b;background:#fffbeb}
            .${UI_PREFIX}-rates-table td.${UI_PREFIX}-info{font-size:11.5px;min-width:220px;max-width:320px}
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

    async function ollamaGenerate(settings, prompt, { json = false, timeoutMs = 45000, images = null, model = '' } = {}) {
        try {
            const res = await gmRequest({
                method: 'POST',
                url: settings.ollamaUrl,
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify({ model: model || settings.ollamaModel, prompt, stream: false, ...(images ? { images } : {}), ...(json ? { format: 'json' } : {}), options: { temperature: 0 } }),
                timeout: timeoutMs
            });
            if (res.status !== 200) return { ok: false, error: `Ollama HTTP ${res.status}${model ? ` (Modell ${model} installiert?)` : ''}` };
            const outer = JSON.parse(res.text);
            const text = String(outer.response || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
            if (!json) return { ok: true, text };
            return { ok: true, data: JSON.parse(text || '{}') };
        } catch (err) {
            return { ok: false, error: `Ollama nicht erreichbar (${settings.ollamaUrl}): ${err.message || err}` };
        }
    }

    const TRACKING_HINT_RE = /Sendungsn|Sendungsverfolgung|Tracking|Paketnummer|Einlieferung|Beleg|Quittung|Paketschein|Etikett|Label|verschickt|abgegeben|zur Post/i;

    /**
     * Sendungsnummern aus Chat-Bildern: nur Bilder in Nachrichten, die selbst oder deren direkte Nachbarn auf einen
     * Versand hinweisen (spart Zeit). Reihenfolge = Chatreihenfolge. Ollama-Vision, Fallback Tesseract.js (falls geladen).
     * Rückgabe { found: [{id, carrier, source}], warnings: [] }.
     */
    async function findTrackingInImages(messages, settings) {
        const warnings = [];
        const found = [];
        const msgs = messages.filter((m) => m.kind === 'text');
        const targets = [];
        msgs.forEach((m, i) => {
            if (!m.images || !m.images.length) return;
            const near = [msgs[i - 1], m, msgs[i + 1]].some((x) => x && TRACKING_HINT_RE.test(x.text || ''));
            if (near) targets.push(...m.images.filter((img) => img.dataUrl).map((img) => ({ img, msg: m })));
        });
        if (!targets.length) return { found, warnings };
        let visionOk = Boolean(settings.useLlm && settings.ollamaVisionModel);
        let tesseract = null;
        const prompt = 'Lies alle Sendungsnummern/Tracking-Nummern (Paketnummern von DHL, Deutsche Post, Hermes, DPD, GLS, UPS) auf diesem Bild ab. ' +
            'Antworte NUR als JSON {"trackingIds": ["..."], "carrier": "DHL|Deutsche Post|Hermes|DPD|GLS|UPS|"}. Keine Nummer erkennbar: {"trackingIds": []}. Nichts erfinden.';
        let cachedAll = true;
        for (const { img, msg } of targets.slice(0, 12)) {
            // Erkannte Nummern je Bild bleiben gespeichert (Bild ändert sich nie) – keine erneute Erkennung
            const cacheKey = `ocr:${hashText(img.dataUrl)}`;
            const cached = await dbGet('cache', cacheKey);
            let ids = cached && cached.data ? cached.data.ids : null;
            if (!ids) {
                cachedAll = false;
                let engine = '';
                if (visionOk) {
                    const r = await ollamaGenerate(settings, prompt, { json: true, timeoutMs: 120000, images: [img.dataUrl.replace(/^data:[^,]+,/, '')], model: settings.ollamaVisionModel });
                    if (r.ok) {
                        ids = (r.data.trackingIds || []).map((s) => String(s).replace(/\s+/g, '').toUpperCase()).filter((s) => /\d/.test(s) && s.length >= 10 && s.length <= 22);
                        engine = `Ollama ${settings.ollamaVisionModel}`;
                    } else {
                        visionOk = false;
                        warnings.push(`Bild-Erkennung per Ollama-Vision nicht möglich (${r.error}) – Fallback Texterkennung`);
                    }
                }
                if (!visionOk && global.Tesseract) {
                    try {
                        tesseract = tesseract || (await global.Tesseract.createWorker('deu+eng'));
                        const { data } = await tesseract.recognize(img.dataUrl);
                        ids = findTrackingNumbers([data.text], { bare: true }).map((t) => t.id);
                        engine = 'Tesseract.js';
                    } catch (err) {
                        warnings.push(`Texterkennung (Tesseract.js) fehlgeschlagen: ${err.message || err}`);
                        break;
                    }
                }
                if (engine) await dbPut('cache', { key: cacheKey, data: { ids, engine }, updatedAt: new Date().toISOString() });
            }
            for (const id of ids || []) if (!found.some((f) => f.id === id)) found.push({ id, carrier: detectCarrier(id), source: img.filename, message: msg });
        }
        if (tesseract) await tesseract.terminate().catch(() => {});
        if (!cachedAll && !visionOk && !global.Tesseract) warnings.push('Sendungsnummern in Bildern nicht geprüft (weder Ollama-Vision noch Tesseract.js verfügbar)');
        return { found, warnings };
    }

    /**
     * Alle Sendungsnummern in Chatreihenfolge: Systemnachricht (z. B. Versandetikett der Plattform), Text, Bild.
     * Die erste ist der Versand an den Käufer; spätere sind Kandidaten für eine Rücksendung.
     */
    function orderTrackingCandidates(messages, imageHits = []) {
        const out = [];
        const add = (id, carrier, source) => {
            if (id && !isNa(id) && !out.some((o) => o.id === id)) out.push({ id, carrier: carrier || detectCarrier(id), source });
        };
        for (const m of messages) {
            if (m.trackingId) add(m.trackingId, m.trackingCarrier, 'Systemnachricht');
            if (m.kind === 'text') for (const t of findTrackingNumbers([m.text])) add(t.id, t.carrier, 'Chat');
            for (const h of imageHits.filter((x) => x.message === m)) add(h.id, h.carrier, `Bild ${h.source}`);
        }
        return out;
    }

    /**
     * Rücksendung erkennen (lokales LLM). candidates = Sendungsnummern in Chatreihenfolge (erste = Versand an den Käufer).
     * Rückgabe '' (keine Rücksendung), Sendungsnummer oder 'n/a' (Rücksendung ohne Nummer); null = nicht prüfbar.
     */
    async function detectReturn(settings, messages, candidates) {
        if (!settings.useLlm) return { value: null };
        const lines = messages.filter((m) => m.text).map((m) => `[${m.timestamp || m.date || ''}] ${m.isOwn ? 'Ich' : 'Partner'}: ${m.text}`);
        // Ohne jedes Rücksende-Stichwort kein LLM-Aufruf (spart Zeit bei normalen Chats)
        if (!lines.length || !/zurück(?:send|schick|geschick|gesandt|gesendet)|rücksend|retoure|rückgabe|return/i.test(lines.join('\n'))) return { value: '' };
        const prompt = [
            'Wurde in diesem Marktplatz-Chat der gekaufte Artikel (oder ein Teil davon) an den Verkäufer ZURÜCKGESCHICKT bzw. eine Rücksendung tatsächlich durchgeführt?',
            'Nur Ankündigungen/Angebote ohne Durchführung zählen nicht. Erfinde nichts.',
            `Bekannte Sendungsnummern in Chatreihenfolge: ${candidates.length ? candidates.join(', ') : 'keine'}. Die erste ist normalerweise der Versand an den Käufer.`,
            'Antworte NUR als JSON {"returned": true|false, "returnTrackingId": "<Nummer aus der Liste oder aus dem Chat>" | "n/a"}.',
            '',
            ...lines
        ].join('\n');
        const r = await ollamaGenerate(settings, prompt, { json: true, timeoutMs: 90000 });
        if (!r.ok) return { value: null, error: r.error };
        if (!r.data.returned) return { value: '' };
        const id = String(r.data.returnTrackingId || '').replace(/\s+/g, '').toUpperCase();
        const known = candidates.includes(id) || lines.some((l) => l.replace(/\s+/g, '').toUpperCase().includes(id));
        if (id && /\d/.test(id) && known && id !== candidates[0]) return { value: id };
        return { value: candidates[1] || 'n/a' };
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
    /** Übersetzung mit Zwischenspeicher je Text (spart DeepL-Kontingent; gleiche Nachricht = gleiche Übersetzung). */
    async function translateTexts(texts, opts) {
        const target = opts.targetLang || 'DE';
        const keys = texts.map((t) => `tr:${target}:${hashText(t)}`);
        const results = await Promise.all(keys.map(async (k) => ((await dbGet('cache', k)) || {}).data || null));
        const missing = texts.map((t, i) => (results[i] ? null : i)).filter((i) => i !== null);
        if (!missing.length) return { results, warnings: [] };
        const fresh = await translateUncached(missing.map((i) => texts[i]), opts);
        for (const [n, i] of missing.entries()) {
            results[i] = fresh.results[n];
            if (results[i] && results[i].text) await dbPut('cache', { key: keys[i], data: results[i], updatedAt: new Date().toISOString() });
        }
        return { results, warnings: fresh.warnings };
    }

    async function translateUncached(texts, { settings, saveSettings, targetLang = 'DE' }) {
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
     * BESTELLUNGEN, VERSANDKOSTEN, RECHNUNG, BERICHT (Beträge intern in Cent)
     * ========================================================================== */

    /** "6,39 €" / "-0,54 €" / 639 -> Cent (Betrag ohne Vorzeichen bei abs=true), sonst null */
    function toCents(v, abs = false) {
        if (v === null || v === undefined || v === '') return null;
        const c = typeof v === 'number' ? Math.round(v) : Theme.parseMoney(v).cents;
        return c === null ? null : abs ? Math.abs(c) : c;
    }

    const eur = (c) => Theme.formatMoneyText(c === null || c === undefined ? 'n/a' : c, true);
    const eurInput = (c) => (c === null || c === undefined ? '' : (c / 100).toFixed(2).replace('.', ','));

    /** Einzige Stelle, an der Bestellbeträge berechnet werden (Rechnung, Bericht, Excel, Chat-Export). */
    function computeOrderAmounts(order) {
        const ov = order.overrides || {};
        const pick = (k, base) => (ov[k] !== undefined && ov[k] !== null ? ov[k] : base);
        const paid = order.paid || {};
        const fees = order.fees || {};
        const itemsTotal = pick('itemsTotal', (order.items || []).reduce((s, i) => s + (i.total || 0), 0) || paid.subtotal || 0);
        const shippingCharged = pick('shippingCharged', paid.shipping || 0);
        const refund = pick('refund', paid.refund || 0);
        const shippingActual = pick('shippingActual', order.shippingActual ? order.shippingActual.cents : null);
        const transactionFee = pick('transactionFee', fees.transactionFee || 0);
        const adFee = pick('adFee', (fees.adFee || 0) + (fees.other || []).reduce((s, f) => s + f.cents, 0));
        const subtotal = itemsTotal + shippingCharged;
        return { itemsTotal, shippingCharged, subtotal, refund, shippingActual, transactionFee, adFee, total: subtotal - refund - (shippingActual || 0) - transactionFee - adFee };
    }

    /** Käufe (Rolle Käufer): Gebühren = Gesamtbetrag − Artikelpreis (Versand, Rückerstattungen …). */
    function computePurchaseAmounts(order) {
        const ov = order.overrides || {};
        const itemsTotal = ov.itemsTotal ?? (order.items || []).reduce((s, i) => s + (i.total || 0), 0);
        const total = ov.total ?? ((order.paid && order.paid.total) || itemsTotal);
        return { itemsTotal, total, fees: total - itemsTotal };
    }

    const dateDe = (iso) => (iso ? iso.split('-').reverse().join('.') : '');

    /** Haltedauer Erwerb -> Verkauf: „>1 Jahr“ (steuerlich relevant) oder „N Tage“; leer, wenn ein Datum fehlt. */
    function holdingPeriod(acquiredIso, soldIso) {
        if (!acquiredIso || !soldIso) return '';
        const oneYearLater = `${Number(acquiredIso.slice(0, 4)) + 1}${acquiredIso.slice(4)}`;
        if (soldIso > oneYearLater) return '>1 Jahr';
        return `${Math.round((Date.parse(soldIso) - Date.parse(acquiredIso)) / 86400000)} Tage`;
    }

    const AMOUNT_FIELDS = [
        ['itemsTotal', 'Artikelpreis gesamt'],
        ['shippingCharged', 'Versanderlös'],
        ['refund', 'Erstattungen / Rabatt'],
        ['shippingActual', 'Versandkosten'],
        ['transactionFee', 'Transaktionsgebühren'],
        ['adFee', 'Anzeigengebühren']
    ];
    const PURCHASE_FIELDS = [['itemsTotal', 'Artikelpreis'], ['total', 'Gesamtbetrag']];
    const ACQUISITION_FIELDS = [
        { key: 'acquiredAt', label: 'Erworben am (TT.MM.JJJJ)' },
        { key: 'acquiredFrom', label: 'Erworben von', type: 'select', options: [['', '–'], ['Privatkauf', 'Privatkauf'], ['Gewerblicher Kauf', 'Gewerblicher Kauf']] },
        { key: 'acquisitionPrice', label: 'Anschaffungspreis (EUR)' },
        { key: 'originalInvoiceNumber', label: 'Originale Rechnungsnummer (Erwerb)' },
        { key: 'saleReason', label: 'Verkaufsgrund', wide: true }
    ];

    /** Aktuelle Werte einer Bestellung als Formularwerte (EUR-Text, TT.MM.JJJJ); Käufe nur Artikelpreis/Gesamtbetrag. */
    function orderEditValues(order) {
        if (order.role === 'BUYER') {
            const p = computePurchaseAmounts(order);
            return Object.fromEntries(PURCHASE_FIELDS.map(([k]) => [k, eurInput(p[k])]));
        }
        const cur = computeOrderAmounts(order);
        const acq = order.acquisition || {};
        return {
            ...Object.fromEntries(AMOUNT_FIELDS.map(([k]) => [k, eurInput(cur[k])])),
            acquiredAt: dateDe(acq.date),
            acquiredFrom: acq.from || '',
            acquisitionPrice: eurInput(acq.priceCents),
            originalInvoiceNumber: acq.originalInvoiceNumber || '',
            saleReason: acq.reason || ''
        };
    }

    /** Formularwerte zurückschreiben: abweichende Beträge als manuelle Werte (Versandkosten als manueller Tarif), Erwerbsangaben. */
    function applyOrderEdits(order, values) {
        const buyer = order.role === 'BUYER';
        const auto = buyer ? computePurchaseAmounts({ ...order, overrides: {} }) : computeOrderAmounts({ ...order, overrides: {} });
        const next = { ...order, overrides: {} };
        for (const [k] of buyer ? PURCHASE_FIELDS : AMOUNT_FIELDS) {
            const v = toCents(values[k], true);
            if (v !== null && v !== auto[k]) next.overrides[k] = v;
        }
        if (next.overrides.shippingActual !== undefined) {
            next.shippingActual = { cents: next.overrides.shippingActual, carrier: '', product: 'manuell', source: 'manual' };
            delete next.overrides.shippingActual;
        }
        if (!buyer) {
            next.acquisition = {
                date: toIsoDate(values.acquiredAt) || '',
                from: values.acquiredFrom || '',
                priceCents: toCents(values.acquisitionPrice, true),
                originalInvoiceNumber: values.originalInvoiceNumber ?? order.acquisition?.originalInvoiceNumber ?? '',
                reason: values.saleReason || ''
            };
        }
        return next;
    }

    /** Neue Seitendaten speichern; bekannte Werte, manuelle Werte (overrides, manuell gewählte Versandkosten) und Erwerbsangaben bleiben erhalten. */
    async function saveOrder(fresh) {
        const old = await dbGet('orders', fresh.orderId);
        const keepManualShipping = old && old.shippingActual && old.shippingActual.source === 'manual';
        const order = {
            ...mergeKnown(old, fresh),
            overrides: (old && old.overrides) || {},
            shippingActual: keepManualShipping ? old.shippingActual : fresh.shippingActual || (old && old.shippingActual) || null,
            updatedAt: new Date().toISOString()
        };
        await dbPut('orders', order);
        const changed = Boolean(old && JSON.stringify(computeOrderAmounts(old)) !== JSON.stringify(computeOrderAmounts(order)));
        return { order, changed, isNew: !old };
    }

    const RATE_CARRIERS = ['Deutsche Post', 'DHL', 'Hermes', 'DPD', 'GLS', 'UPS'];

    // Startwerte der Versandkosten-Tabelle (Privatkunden, Online-Frankierung); Quellen siehe plan.md "Versandkosten".
    // Kompakt: [Tarif, [gültig ab, Cent], …] – nur echte Preisänderungen.
    const RATE_SEED = {
        'Deutsche Post': [
            ['Kompaktbrief (50 g)', ['2024-01-01', 100], ['2025-01-01', 110]],
            ['Großbrief (500 g)', ['2024-01-01', 160], ['2025-01-01', 180]],
            ['Maxibrief (1 kg)', ['2024-01-01', 275], ['2025-01-01', 290]],
            ['Maxibrief bis 2 kg', ['2024-01-01', 495], ['2025-01-01', 510]],
            ['Warensendung (1 kg)', ['2024-01-01', 255], ['2025-07-01', 270]],
            ['Warensendung bis 2 kg', ['2024-07-01', 340], ['2025-07-01', 355]]
        ],
        DHL: [
            ['Päckchen S (2 kg)', ['2024-01-01', 399], ['2025-01-01', 419]],
            ['Päckchen M (2 kg)', ['2024-01-01', 479], ['2025-01-01', 519]],
            ['Paket 2 kg (online)', ['2024-01-01', 549], ['2025-01-01', 619]],
            ['Paket 5 kg', ['2024-01-01', 699], ['2025-01-01', 769]],
            ['Paket 10 kg', ['2024-01-01', 1049]],
            ['Paket 20 kg', ['2024-07-12', 1899]],
            ['Paket 31,5 kg', ['2024-01-01', 1999], ['2024-07-12', 2399]]
        ],
        Hermes: [
            ['Päckchen (Shop→Shop)', ['2024-01-01', 370]],
            ['S-Paket (Shop→Shop)', ['2024-01-01', 440], ['2025-04-01', 450]],
            ['M-Paket (Shop→Shop)', ['2024-01-01', 540], ['2025-04-01', 590]],
            ['L-Paket (Shop→Shop)', ['2024-01-01', 1040], ['2025-04-01', 990]],
            ['XL-Paket (Abholung)', ['2024-01-01', 2895], ['2026-01-01', 2899]]
        ],
        DPD: [
            ['Paket XS (Shop)', ['2024-01-01', 439], ['2025-05-01', 459]],
            ['Paket S (Shop)', ['2024-01-01', 499], ['2025-05-01', 519]],
            ['Paket M (Shop)', ['2024-01-01', 640], ['2025-05-01', 690]],
            ['Paket L (Shop)', ['2024-01-01', 990], ['2025-05-01', 1090]],
            ['Paket XL (Shop)', ['2024-01-01', 1690], ['2025-05-01', 1840]]
        ],
        GLS: [
            ['Paket XS (ParcelShop)', ['2024-01-01', 329]],
            ['Paket S (ParcelShop)', ['2024-01-01', 379], ['2025-09-01', 389]],
            ['Paket M (ParcelShop)', ['2024-01-01', 519], ['2025-09-01', 559]],
            ['Paket L (ParcelShop)', ['2024-01-01', 1000]],
            ['Paket XL (ParcelShop)', ['2024-01-01', 2000], ['2025-09-01', 2200]]
        ],
        UPS: [
            ['Standard 2 kg', ['2024-01-01', 540], ['2025-01-01', 599], ['2026-01-01', 674]],
            ['Standard 5 kg', ['2024-01-01', 690], ['2025-01-01', 749], ['2026-01-01', 828]],
            ['Standard 10 kg', ['2024-01-01', 1040], ['2025-01-01', 1100], ['2026-01-01', 1187]],
            ['Standard 15 kg', ['2024-01-01', 1690], ['2025-01-01', 1899], ['2026-01-01', 2007]],
            ['Standard 25 kg', ['2024-01-01', 1960], ['2026-01-01', 2109]],
            ['Standard 32 kg', ['2024-01-01', 5108]]
        ]
    };
    const DEFAULT_SHIPPING_RATES = Object.fromEntries(Object.entries(RATE_SEED).map(([carrier, rows]) =>
        [carrier, rows.map(([product, ...prices]) => ({ product, prices: prices.map(([validFrom, cents]) => ({ validFrom, cents })) }))]));

    async function getShippingRates() {
        const rec = await dbGet('config', 'shippingRates');
        const carriers = rec ? rec.carriers : JSON.parse(JSON.stringify(DEFAULT_SHIPPING_RATES));
        for (const c of RATE_CARRIERS) if (!carriers[c]) carriers[c] = [];
        return carriers;
    }

    const saveShippingRates = (carriers) => dbPut('config', { key: 'shippingRates', carriers, updatedAt: new Date().toISOString() });

    /** Preis eines Tarifs, der am Datum gilt (letzte Preisänderung <= Datum). */
    function priceAt(product, dateIso) {
        const valid = (product.prices || []).filter((p) => p.validFrom <= dateIso && p.cents !== null && p.cents !== undefined);
        valid.sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1));
        return valid.length ? { cents: valid[0].cents, validFrom: valid[0].validFrom } : null;
    }

    function carrierFromService(service) {
        const s = String(service || '').toLowerCase();
        if (/hermes/.test(s)) return 'Hermes';
        if (/\bdpd\b/.test(s)) return 'DPD';
        if (/\bgls\b/.test(s)) return 'GLS';
        if (/\bups\b/.test(s)) return 'UPS';
        if (/deutsche post|warensendung|b(ü|ue)chersendung|brief/.test(s)) return 'Deutsche Post';
        if (/dhl|p(ä|ae)ckchen|paket/.test(s)) return 'DHL';
        return '';
    }

    /**
     * Tatsächliche Versandkosten vorschlagen: Tarif des Dienstleisters zum Verkaufsdatum, der nicht teurer als der
     * berechnete Versand ist und am dichtesten darunter liegt. Zweifel (kein Tarif, Abstand > 1 EUR) -> {ok:false}.
     */
    function suggestShippingActual(order, carriers) {
        const charged = computeOrderAmounts({ ...order, overrides: {} }).shippingCharged;
        const carrier = carrierFromService(order.shippingService);
        const date = order.soldDate || formatDateIso();
        if (!carrier) return { ok: false, reason: `Versanddienst „${order.shippingService || 'unbekannt'}“ keinem Dienstleister zuordenbar` };
        if (!charged) return { ok: false, reason: 'Kein Versanderlös – tatsächliche Versandkosten bitte selbst eintragen' };
        // Der vom Käufer gewählte Versandservice ist nicht zwingend die tatsächliche Versandart -> nie still raten
        const tracked = carrierFromTrackingId(order.trackingId);
        if (tracked && tracked !== carrier) return { ok: false, reason: `Sendungsnummer ${order.trackingId} gehört zu ${tracked}, gewählt war „${order.shippingService}“ – bitte tatsächlichen Tarif wählen` };
        const refund = computeOrderAmounts({ ...order, overrides: {} }).refund;
        if (refund) return { ok: false, reason: `Erstattung von ${eur(refund)} – evtl. Versand günstiger als berechnet, bitte tatsächlichen Tarif wählen` };
        const cands = (carriers[carrier] || [])
            .map((p) => ({ carrier, product: p.product, ...(priceAt(p, date) || {}) }))
            .filter((c) => c.cents !== undefined && c.cents <= charged)
            .sort((a, b) => b.cents - a.cents);
        if (!cands.length) return { ok: false, reason: `Kein ${carrier}-Tarif ≤ ${eur(charged)} zum ${date} in der Versandkosten-Tabelle` };
        if (charged - cands[0].cents > 100) return { ok: false, reason: `Nächster ${carrier}-Tarif (${cands[0].product}, ${eur(cands[0].cents)}) liegt über 1 EUR unter dem Versanderlös`, candidate: cands[0] };
        return { ok: true, value: { ...cands[0], source: 'auto' } };
    }

    /** Popup: Versandkosten-Tabelle, ein Reiter je Dienstleister, Zeilen = Tarife, Spalten = "gültig ab". */
    async function openShippingRatesEditor() {
        injectStyles();
        const carriers = await getShippingRates();
        let active = RATE_CARRIERS[0];
        return new Promise((resolve) => {
            document.getElementById(`${UI_PREFIX}-rates`)?.remove();
            const overlay = document.createElement('div');
            overlay.id = `${UI_PREFIX}-rates`;
            overlay.className = `${UI_PREFIX}-overlay`;
            const modal = document.createElement('div');
            modal.className = `${UI_PREFIX}-modal ${UI_PREFIX}-modal--wide`;
            overlay.appendChild(modal);
            const close = (saved) => {
                overlay.remove();
                resolve(saved);
            };
            const dates = () => Array.from(new Set(carriers[active].flatMap((p) => p.prices.map((x) => x.validFrom)))).sort();
            const render = () => {
                const ds = dates();
                modal.innerHTML = `<h3>🚚 Versandkosten (tatsächlich bezahlt)</h3><p class="${UI_PREFIX}-hint">Preis gilt ab dem Spaltendatum bis zur nächsten Preisänderung. Leeres Feld = unverändert gegenüber der vorherigen Spalte. Beträge in EUR (z. B. 6,19).</p>`;
                const tabs = document.createElement('div');
                tabs.className = `${UI_PREFIX}-tabs`;
                for (const c of RATE_CARRIERS) {
                    const b = document.createElement('button');
                    b.type = 'button';
                    b.textContent = `${c} (${carriers[c].length})`;
                    b.className = `${UI_PREFIX}-btn ${c === active ? '' : `${UI_PREFIX}-btn--ghost`}`;
                    b.onclick = () => { active = c; render(); };
                    tabs.appendChild(b);
                }
                modal.appendChild(tabs);
                const table = document.createElement('table');
                table.className = `${UI_PREFIX}-rates-table`;
                table.innerHTML = `<thead><tr><th>Tarif / Paketgröße</th>${ds.map((d) => `<th>ab ${escapeHtml(d.split('-').reverse().join('.'))}</th>`).join('')}<th></th></tr></thead>`;
                const tbody = document.createElement('tbody');
                carriers[active].forEach((p, row) => {
                    const tr = document.createElement('tr');
                    const name = document.createElement('input');
                    name.value = p.product;
                    name.oninput = () => { p.product = name.value; };
                    const tdName = document.createElement('td');
                    tdName.appendChild(name);
                    tr.appendChild(tdName);
                    for (const d of ds) {
                        const td = document.createElement('td');
                        const inp = document.createElement('input');
                        const own = p.prices.find((x) => x.validFrom === d);
                        const inherited = priceAt(p, d);
                        inp.value = own ? eurInput(own.cents) : '';
                        inp.placeholder = inherited ? eurInput(inherited.cents) : '–';
                        inp.className = `${UI_PREFIX}-num`;
                        inp.oninput = () => {
                            p.prices = p.prices.filter((x) => x.validFrom !== d);
                            const c = toCents(inp.value);
                            if (c !== null) p.prices.push({ validFrom: d, cents: c });
                        };
                        td.appendChild(inp);
                        tr.appendChild(td);
                    }
                    const del = document.createElement('button');
                    del.type = 'button';
                    del.textContent = '✕';
                    del.title = 'Tarif löschen';
                    del.className = `${UI_PREFIX}-btn ${UI_PREFIX}-btn--ghost ${UI_PREFIX}-btn--icon`;
                    del.onclick = () => { carriers[active].splice(row, 1); render(); };
                    const tdDel = document.createElement('td');
                    tdDel.appendChild(del);
                    tr.appendChild(tdDel);
                    tbody.appendChild(tr);
                });
                table.appendChild(tbody);
                modal.appendChild(table);

                const bar = document.createElement('div');
                bar.className = `${UI_PREFIX}-buttons`;
                const dateInput = document.createElement('input');
                dateInput.type = 'date';
                dateInput.title = 'Datum der Preisänderung';
                const mk = (label, primary, fn) => {
                    const b = document.createElement('button');
                    b.type = 'button';
                    b.textContent = label;
                    b.className = `${UI_PREFIX}-btn${primary ? '' : ` ${UI_PREFIX}-btn--ghost`}`;
                    b.onclick = fn;
                    return b;
                };
                bar.append(
                    mk('+ Tarif', false, () => { carriers[active].push({ product: 'Neuer Tarif', prices: [{ validFrom: ds[ds.length - 1] || formatDateIso(), cents: null }] }); render(); }),
                    dateInput,
                    mk('+ Preisänderung gültig ab', false, () => {
                        if (!dateInput.value) { dateInput.focus(); return; }
                        for (const p of carriers[active]) {
                            const cur = priceAt(p, dateInput.value);
                            if (!p.prices.some((x) => x.validFrom === dateInput.value)) p.prices.push({ validFrom: dateInput.value, cents: cur ? cur.cents : null });
                        }
                        render();
                    }),
                    mk('Abbrechen', false, () => close(false)),
                    mk('Speichern', true, async () => {
                        for (const c of RATE_CARRIERS) carriers[c] = carriers[c].filter((p) => p.product.trim()).map((p) => ({ ...p, prices: p.prices.filter((x) => x.cents !== null) }));
                        await saveShippingRates(carriers);
                        toast('🚚 Versandkosten gespeichert.', { type: 'success', timeoutMs: 3000 });
                        close(true);
                    })
                );
                modal.appendChild(bar);
            };
            render();
            document.body.appendChild(overlay);
        });
    }

    /**
     * Tabellen-Popup für viele Datensätze (z. B. Bericht vor dem Erstellen).
     * columns: [{key, label, type?:'select', options?, num?}], rows: [{id, info:[Zeilen], values, originals?}]
     * -> Promise<Map(id -> values)> bzw. null bei Abbruch. Orange = weicht vom Seitenwert (originals) ab.
     */
    function openTableEditor({ title, hint, columns, rows, confirmLabel }) {
        injectStyles();
        return new Promise((resolve) => {
            document.getElementById(`${UI_PREFIX}-table`)?.remove();
            const overlay = document.createElement('div');
            overlay.id = `${UI_PREFIX}-table`;
            overlay.className = `${UI_PREFIX}-overlay`;
            const modal = document.createElement('div');
            modal.className = `${UI_PREFIX}-modal ${UI_PREFIX}-modal--wide ${UI_PREFIX}-modal--xwide`;
            modal.innerHTML = `<h3>${escapeHtml(title)}</h3><p class="${UI_PREFIX}-hint">${escapeHtml(hint)}</p>`;
            const table = document.createElement('table');
            table.className = `${UI_PREFIX}-rates-table`;
            table.innerHTML = `<thead><tr><th>Bestellung</th>${columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('')}</tr></thead>`;
            const tbody = document.createElement('tbody');
            const getters = new Map();
            for (const r of rows) {
                const tr = document.createElement('tr');
                const info = document.createElement('td');
                info.className = `${UI_PREFIX}-info`;
                info.innerHTML = r.info.map((l, i) => (i === 0 ? `<b>${escapeHtml(l)}</b>` : escapeHtml(l))).join('<br>');
                tr.appendChild(info);
                const vals = {};
                for (const c of columns) {
                    const input = document.createElement(c.type === 'select' ? 'select' : 'input');
                    for (const [v, l] of c.options || []) input.add(new Option(l, v));
                    input.value = r.values[c.key] ?? '';
                    if (c.num) input.className = `${UI_PREFIX}-num`;
                    const mark = () => input.classList.toggle(`${UI_PREFIX}-changed`, Boolean(r.originals) && c.key in r.originals && String(r.originals[c.key]) !== input.value.trim());
                    input.addEventListener('input', mark);
                    input.addEventListener('change', mark);
                    mark();
                    vals[c.key] = () => input.value.trim();
                    const td = document.createElement('td');
                    td.appendChild(input);
                    tr.appendChild(td);
                }
                getters.set(r.id, vals);
                tbody.appendChild(tr);
            }
            table.appendChild(tbody);
            modal.appendChild(table);
            const close = (result) => {
                overlay.remove();
                resolve(result);
            };
            const bar = document.createElement('div');
            bar.className = `${UI_PREFIX}-buttons`;
            for (const [label, primary, fn] of [
                ['Abbrechen', false, () => close(null)],
                [confirmLabel, true, () => close(new Map(Array.from(getters, ([id, g]) => [id, Object.fromEntries(Object.entries(g).map(([k, get]) => [k, get()]))])))]
            ]) {
                const b = document.createElement('button');
                b.type = 'button';
                b.textContent = label;
                b.className = `${UI_PREFIX}-btn${primary ? '' : ` ${UI_PREFIX}-btn--ghost`}`;
                b.onclick = fn;
                bar.appendChild(b);
            }
            modal.appendChild(bar);
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
        });
    }

    /** Popup: Beträge und Erwerbsangaben einer Bestellung korrigieren (Overrides) inkl. Auswahl des Versandtarifs. */
    async function openOrderEditor(order, reason = '') {
        const purchase = order.role === 'BUYER';
        const carriers = await getShippingRates();
        const auto = orderEditValues({ ...order, overrides: {} });
        const cur = orderEditValues(order);
        const date = order.soldDate || formatDateIso();
        const options = [['', '– Tarif wählen –']];
        for (const c of RATE_CARRIERS) {
            for (const p of carriers[c]) {
                const pa = priceAt(p, date);
                if (pa) options.push([JSON.stringify({ carrier: c, product: p.product, cents: pa.cents, validFrom: pa.validFrom }), `${c} – ${p.product} – ${eur(pa.cents)}`]);
            }
        }
        const fields = (purchase ? PURCHASE_FIELDS : AMOUNT_FIELDS).map(([key, label]) => ({ key, label, value: cur[key], original: auto[key] }));
        if (!purchase) fields.push({ key: 'shippingProduct', label: `Versandtarif zum ${dateDe(date)} (setzt „Versandkosten“)`, type: 'select', options, value: '', wide: true });
        const answer = await openForm({
            title: `✏️ Bestellung ${order.orderId} – Beträge & Erwerb`,
            hint: [reason, `Versandservice laut Bestellung: ${order.shippingService || 'n/a'}. Beträge in EUR, orange = manuell geändert.`].filter(Boolean).join(' · '),
            sections: [
                { title: 'Beträge (werden in der Datenbank gespeichert)', fields },
                ...(!purchase ? [{ title: 'Erwerb (Verkaufsbericht: Haltedauer, Anschaffungspreis, Ertrag)', fields: ACQUISITION_FIELDS.map((f) => ({ ...f, value: cur[f.key] })) }] : [])
            ],
            buttons: [{ label: 'Abbrechen', value: null }, { label: 'Manuelle Beträge löschen', value: 'reset' }, { label: 'Speichern', value: 'save', primary: true }]
        });
        if (!answer) return null;
        let next;
        if (answer.button === 'save') {
            next = applyOrderEdits(order, answer.values);
            if (answer.values.shippingProduct) next.shippingActual = { ...JSON.parse(answer.values.shippingProduct), source: 'manual' };
        } else {
            next = { ...order, overrides: {} };
            if (order.shippingActual && order.shippingActual.source === 'manual') next.shippingActual = null;
        }
        await dbPut('orders', next);
        return next;
    }

    /** Fehlende tatsächliche Versandkosten automatisch ermitteln, im Zweifel Popup. Liefert die (ggf. aktualisierte) Bestellung oder null bei Abbruch. */
    async function ensureShippingActual(order) {
        if (order.shippingActual || (order.overrides && order.overrides.shippingActual !== undefined)) return order;
        const s = suggestShippingActual(order, await getShippingRates());
        if (s.ok) {
            const next = { ...order, shippingActual: s.value };
            await dbPut('orders', next);
            return next;
        }
        return openOrderEditor(order, `⚠️ ${s.reason}.`);
    }

    function buildOrderDocumentModel(order, ctx) {
        const purchase = order.role === 'BUYER';
        const a = purchase ? computePurchaseAmounts(order) : computeOrderAmounts(order);
        const sa = order.shippingActual;
        const s = ctx.settings;
        const carrier = detectCarrier(order.trackingId, order.shippingService);
        return {
            platform: ctx.platform,
            brand: ctx.brand,
            scriptLabel: ctx.scriptLabel,
            exportedAt: Theme.formatExportTimestamp(new Date()),
            purchase,
            note: purchase ? 'Selbst erstellter Kaufbeleg für die eigenen Unterlagen. Ersetzt keine Originalrechnung des Verkäufers.' : s.privateSaleNote || '',
            seller: purchase
                ? { name: order.seller?.name || 'n/a', lines: order.seller?.address || [], username: order.seller?.username || '' }
                : { name: s.ownFullName, lines: String(s.ownAddress || '').split(/\r?\n/).filter(Boolean), username: s.ownUsername || '' },
            buyer: purchase
                ? { lines: [s.ownFullName || 'n/a', ...String(s.ownAddress || '').split(/\r?\n/).filter(Boolean)] }
                : { lines: order.address && order.address.length ? order.address : [order.buyer && order.buyer.name, order.buyer && order.buyer.username ? `(${order.buyer.username})` : ''] },
            order: {
                orderId: order.orderId,
                orderUrl: order.orderUrl,
                recordNumber: order.recordNumber,
                soldDate: dateDe(order.soldDate) || 'n/a',
                paidDate: dateDe(order.paidDate) || 'n/a',
                invoiceDate: dateDe(order.paidDate || order.soldDate),
                paymentMethod: ctx.paymentMethod,
                shippingService: order.shippingService,
                trackingId: order.trackingId,
                trackingUrl: order.trackingId && CARRIER_TRACKING_URLS[carrier] ? CARRIER_TRACKING_URLS[carrier](order.trackingId) : '',
                shippedDate: dateDe(order.shippedDate),
                deliveredDate: dateDe(order.deliveredDate)
            },
            items: (order.items || []).map((i) => ({ ...i, itemUrl: ctx.itemUrl ? ctx.itemUrl(i.itemId) : '' })),
            amounts: a,
            shippingActualLabel: sa && sa.product ? [sa.carrier, sa.product].filter(Boolean).join(' ') : ''
        };
    }

    /** Excel-Datei (SheetJS) aus Zeilen; Summenzeile per Formel. */
    function buildXlsxBytes(header, rows, sumColumns, sheetName) {
        const XLSX = global.XLSX;
        if (!XLSX) throw new Error('SheetJS (XLSX) nicht geladen – @require im Userscript prüfen');
        const aoa = [header, ...rows];
        const last = rows.length + 1;
        const sumRow = header.map((_, i) => (i === 0 ? 'Summe' : ''));
        const ws = XLSX.utils.aoa_to_sheet([...aoa, sumRow]);
        for (const col of sumColumns) {
            const letter = XLSX.utils.encode_col(col);
            ws[`${letter}${last + 1}`] = { t: 'n', f: `SUM(${letter}2:${letter}${last})` };
        }
        // Datumsformat erst nachträglich setzen: dateNF-Option von aoa_to_sheet scheitert in SheetJS 0.18 an 'dd.mm.yyyy'
        rows.forEach((row, r) => row.forEach((v, col) => {
            if (v instanceof Date) ws[XLSX.utils.encode_cell({ r: r + 1, c: col })].z = 'dd.mm.yyyy';
        }));
        for (let r = 1; r <= last; r++) {
            for (const col of sumColumns) {
                const cell = ws[XLSX.utils.encode_cell({ r, c: col })];
                if (cell) cell.z = '#,##0.00 "€"';
            }
        }
        ws['!cols'] = header.map((h) => ({ wch: Math.max(10, String(h).length + 2) }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
    }

    function deliverFile(bytes, filename, mime) {
        const url = URL.createObjectURL(new File([bytes], filename, { type: mime }));
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
    }

    async function blobToBase64(blob) {
        return (await blobToDataUrl(blob)).split(',')[1] || '';
    }

    function base64ToBlob(base64, mimeType) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new Blob([bytes], { type: mimeType || 'application/octet-stream' });
    }

    function isSecretKey(key) {
        const normalized = String(key).replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().replace(/[^a-z0-9]+/g, '_');
        return /(?:^|_)(?:token|password|secret|credential|private_key|access_key|api_key|auth_key|authorization|deepl_key|deep_lkey|deepl_auth_key)$/.test(normalized);
    }

    function stripSecrets(value) {
        if (Array.isArray(value)) return value.map(stripSecrets);
        if (!value || typeof value !== 'object') return value;
        return Object.fromEntries(Object.entries(value).filter(([key]) => !isSecretKey(key)).map(([key, child]) => [key, stripSecrets(child)]));
    }

    function containsSecretKey(value) {
        if (Array.isArray(value)) return value.some(containsSecretKey);
        if (!value || typeof value !== 'object') return false;
        return Object.entries(value).some(([key, child]) => isSecretKey(key) || containsSecretKey(child));
    }

    const BACKUP_STORES = ['records', 'orders', 'config', 'articles', 'media', 'syncOutbox', 'unmappedFields'];
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    async function validateBackup(backup) {
        if (!backup || backup.format !== 'marketplace-pdf-export-backup' || backup.version !== 1 || !backup.stores || typeof backup.stores !== 'object') {
            throw new Error('Sicherungsformat oder Version wird nicht unterstützt');
        }
        const assertSafeKeys = (value) => {
            if (Array.isArray(value)) {
                value.forEach(assertSafeKeys);
            } else if (value && typeof value === 'object') {
                for (const [key, child] of Object.entries(value)) {
                    if (key === '__proto__' || key === 'prototype' || key === 'constructor') throw new Error(`Sicherungsdatei enthält einen unsicheren Feldnamen: ${key}`);
                    assertSafeKeys(child);
                }
            }
        };
        assertSafeKeys(backup);
        if (containsSecretKey(backup)) throw new Error('Sicherung enthält ein verbotenes Geheimnisfeld; es wurden keine Daten geändert');
        if (backup.settings !== undefined && (!backup.settings || typeof backup.settings !== 'object' || Array.isArray(backup.settings))) {
            throw new Error('Sicherung enthält ungültige Einstellungen');
        }
        for (const name of BACKUP_STORES) {
            if (!Array.isArray(backup.stores[name])) throw new Error(`Sicherung enthält keine gültige Liste für ${name}`);
        }
        const stores = { ...backup.stores };
        const articleIds = new Set();
        for (const article of stores.articles) {
            if (!article || !UUID_RE.test(article.articleId || '') || !article.data || typeof article.data !== 'object' || Array.isArray(article.data)
                || !Number.isInteger(article.localRevision) || article.localRevision < 1 || !Array.isArray(article.mediaIds)) {
                throw new Error('Sicherung enthält einen ungültigen Artikel');
            }
            articleIds.add(article.articleId);
        }
        const restoredMedia = [];
        for (const media of stores.media) {
            if (!media || typeof media.blobBase64 !== 'string' || !UUID_RE.test(media.mediaId || '') || !UUID_RE.test(media.articleId || '')
                || !articleIds.has(media.articleId) || !Number.isInteger(media.sizeBytes) || media.sizeBytes < 0
                || typeof media.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(media.sha256)
                || typeof media.filename !== 'string' || typeof media.mimeType !== 'string') {
                throw new Error('Sicherung enthält einen ungültigen Medieneintrag');
            }
            if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(media.blobBase64)) throw new Error(`Base64-Daten von ${media.filename} sind ungültig`);
            const blob = base64ToBlob(media.blobBase64, media.mimeType);
            if (blob.size !== media.sizeBytes || await sha256Hex(blob) !== media.sha256) throw new Error(`Prüfsumme oder Byte-Größe von ${media.filename} stimmt nicht`);
            const metadata = { ...media };
            delete metadata.blobBase64;
            restoredMedia.push({ ...metadata, blob });
        }
        stores.media = restoredMedia;
        const keyFields = { records: 'key', orders: 'orderId', config: 'key', articles: 'articleId', media: 'mediaId', syncOutbox: 'operationId', unmappedFields: 'id' };
        for (const name of BACKUP_STORES) {
            const seen = new Set();
            for (const row of stores[name]) {
                const key = row && row[keyFields[name]];
                if (key === undefined || key === null || key === '' || seen.has(String(key))) throw new Error(`Sicherung enthält einen fehlenden oder doppelten Schlüssel in ${name}`);
                seen.add(String(key));
                if (['articles', 'media', 'syncOutbox', 'unmappedFields'].includes(name) && !UUID_RE.test(key)) throw new Error(`Sicherung enthält eine ungültige UUID in ${name}`);
            }
        }
        const mediaIds = new Set(stores.media.map((media) => media.mediaId));
        for (const article of stores.articles) {
            if (article.mediaIds.some((id) => !UUID_RE.test(id) || !mediaIds.has(id))) throw new Error(`Sicherung enthält eine ungültige Medienzuordnung für Artikel ${article.articleId}`);
        }
        for (const field of stores.unmappedFields) {
            if (!field || typeof field.label !== 'string' || (field.articleId !== null && field.articleId !== undefined && !articleIds.has(field.articleId))) {
                throw new Error('Sicherung enthält ein ungültiges nicht zugeordnetes Feld');
            }
        }
        return stores;
    }

    /* ==========================================================================
     * EXPORTER (Ablauf-Steuerung)
     * ========================================================================== */

    const COMMON_GLOBAL_FIELDS = [
        { key: 'ownFullName', label: 'Eigener Klarname' },
        { key: 'deeplKey', label: 'DeepL-API-Key', type: 'password' },
        { key: 'ollamaUrl', label: 'Ollama-Endpunkt' },
        { key: 'ollamaModel', label: 'Ollama-Modell' },
        { key: 'ollamaVisionModel', label: 'Ollama-Vision-Modell für Sendungsnummern in Bildern (leer = nur Tesseract.js)' },
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
        ollamaVisionModel: 'qwen3-vl:8b',
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
        // Angaben, deren Fehlen gemeldet wird (Warnung nach dem Export, oranger ⚙️-Knopf)
        const missingFieldLabels = (meta) => localFieldDefs.filter((f) => ['adType', 'category', 'createdAt', 'sellerType', 'sellerActiveSince', 'listedPrice'].includes(f.key) && isNa(meta[f.key])).map((f) => f.label);
        const globalFieldDefs = [...(config.globalFields || []), ...COMMON_GLOBAL_FIELDS];
        let busy = false;

        injectStyles(config.colors);
        void Theme.prepareFonts(); // PDF-Schrift früh zum Messen laden (Rechnung/Bericht nutzen sie dann ebenfalls)

        function finalizeMeta(meta) {
            const m = { ...meta };
            m.trackingCarrier = normalizeCarrier(m.trackingCarrier) || (isNa(m.trackingId) ? '' : detectCarrier(m.trackingId));
            if (!isNa(m.trackingId) && CARRIER_TRACKING_URLS[m.trackingCarrier]) m.trackingUrl = CARRIER_TRACKING_URLS[m.trackingCarrier](m.trackingId);
            else m.trackingUrl = '';
            m.returnTrackingId = String(m.returnTrackingId || '').trim();
            m.returnTrackingCarrier = m.returnTrackingId && !isNa(m.returnTrackingId) ? detectCarrier(m.returnTrackingId) : '';
            m.returnTrackingUrl = CARRIER_TRACKING_URLS[m.returnTrackingCarrier] ? CARRIER_TRACKING_URLS[m.returnTrackingCarrier](m.returnTrackingId) : '';
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
                    fields: localFieldDefs.map((f) => {
                        const display = (value) => config.platform === 'kleinanzeigen' && MONEY_FIELDS.has(f.key) ? moneyFieldValue(value) : value ?? '';
                        return { ...f, value: display(current[f.key]), original: display(extractedVals[f.key]), missing: isNa(current[f.key]) };
                    })
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
                    const orig = config.platform === 'kleinanzeigen' && MONEY_FIELDS.has(f.key)
                        ? moneyFieldValue(extractedVals[f.key]) : String(extractedVals[f.key] ?? '');
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

        async function run({ review = false, articleOnly = false } = {}) {
            if (busy) return;
            busy = true;
            const progress = toast(`⏳ ${config.platformLabel}: lese Nachrichtenverlauf, Anzeige & Bilder …`, { sticky: true, id: `${UI_PREFIX}-progress` });
            try {
                const settings = store.get();
                const collect = articleOnly ? config.adapter.collectArticle : config.adapter.collect;
                if (typeof collect !== 'function') throw new Error('Artikeldetails-Export ist auf dieser Seite nicht verfügbar');
                const extraction = await collect({ settings, core: api, toast });
                const warnings = [...(extraction.warnings || [])];
                let record = await dbGet('records', extraction.key);

                // Früher erkannte Werte bleiben: „n/a“/leer dieses Laufs überschreibt keinen bekannten Wert des letzten Exports
                if (record && record.extracted) {
                    const kept = Object.keys(record.extracted).filter((k) => isKnown(record.extracted[k]) && !isKnown(extraction.meta[k]));
                    extraction.meta = mergeKnown(record.extracted, extraction.meta);
                    if (!isKnown(extraction.attributes) && isKnown(record.extractedAttributes)) extraction.attributes = record.extractedAttributes;
                    if (!isKnown(extraction.description) && isKnown(record.extractedDescription)) extraction.description = record.extractedDescription;
                    const labels = localFieldDefs.filter((f) => kept.includes(f.key)).map((f) => f.label);
                    if (labels.length) warnings.push(`Aus früherem Export übernommen (diesmal nicht ermittelbar): ${labels.join(', ')}`);
                }

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
                    includeAdPage: extraction.includeAdPage !== false,
                    labels: config.labels
                };
                model.articleOnly = articleOnly;

                await Theme.prepareFonts();
                let bytes = await renderPdfBytes(Theme.buildExportDocument(model));
                if (settings.attachOriginals) {
                    const attachments = [
                        ...model.chatImages.map((i) => ({ bytes: i.bytes, filename: i.filename, description: 'Originalbild aus dem Chat' })),
                        ...model.adImages.map((i) => ({ bytes: i.bytes, filename: i.filename, description: 'Originalbild der Anzeige' }))
                    ].filter((a) => a.bytes);
                    bytes = await attachFiles(bytes, attachments);
                }

                const txIso = toIsoDate(merged.meta.transactionDate);
                const datePart = articleOnly ? formatDateIso() : txIso || formatDateIso();
                const titlePart = sanitizeFilename(merged.meta.adTitle || 'Unbekannt', 90);
                const idPart = isNa(merged.meta.adId) ? '' : ` ${sanitizeFilename(merged.meta.adId, 24)}`;
                const filename = `${datePart} ${sanitizeFilename(config.platformLabel.replace(/\.de$/i, ''))} ${articleOnly ? 'Artikeldetails' : 'Chat'} ${titlePart}${idPart}.pdf`;
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
                if (!txIso && !articleOnly) warnings.push('Transaktionsdatum unbekannt – Dateiname nutzt das heutige Datum');
                const missing = missingFieldLabels(merged.meta);
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
                    const hintActions = (extraction.hints || []).map((h) => (h.settings ? { label: h.label, onClick: () => openSettings() } : { label: h.label, href: h.href }));
                    toast('⚠️ Hinweise zum Export (Werte im ⚙️-Popup korrigierbar):', {
                        type: 'warn',
                        sticky: true,
                        list: warnings,
                        actions: [...hintActions, { label: '✏️ Felder bearbeiten', onClick: () => openEditor({ extraction, record: { ...(record || {}), overrides: merged.overrides }, mode: 'save' }) }]
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

        async function saveCurrentArticle() {
            if (typeof config.adapter.captureArticle !== 'function') throw new Error('Artikelerfassung ist für diese Seite nicht verfügbar');
            const captured = await config.adapter.captureArticle();
            if (!captured) throw new Error('Kein Angebotsformular gefunden');
            const draftKey = `mpe:article-draft:${hashText(`${location.pathname}${location.search}`)}`;
            let articleId = captured.articleId || (document.documentElement.dataset.mpeArticleId || '');
            if (!articleId && typeof GM_getValue === 'function') articleId = GM_getValue(draftKey, '');
            if (!articleId && captured.ebayItemId) {
                const match = (await dbGetAllStrict('articles')).filter((item) => item.ebayItemId === captured.ebayItemId);
                if (match.length > 1) throw new Error(`Mehrere gespeicherte Artikel passen zur eBay-Artikelnummer ${captured.ebayItemId}; es wurde nichts verändert`);
                if (match.length === 1) articleId = match[0].articleId;
            }
            const result = await saveArticleData({ ...captured, articleId });
            if (result.cancelled) return result;
            document.documentElement.dataset.mpeArticleId = result.article.articleId;
            if (typeof GM_setValue === 'function') GM_setValue(draftKey, result.article.articleId);
            const message = `Artikel lokal gespeichert (${result.mediaCount} neue Bilddatei(en)); Synchronisierung ausstehend.`;
            toast(result.unsupportedMediaCount
                ? `${message} ${result.unsupportedMediaCount} nicht unterstützte Datei(en) wurden nicht übernommen.`
                : message, { type: result.unsupportedMediaCount ? 'warn' : 'success', timeoutMs: 6000 });
            return result;
        }

        async function openUnmappedFields() {
            const rows = (await dbGetAllStrict('unmappedFields')).filter((x) => x.status === 'open');
            const overlay = document.createElement('div');
            overlay.className = `${UI_PREFIX}-overlay`;
            const modal = document.createElement('div');
            modal.className = `${UI_PREFIX}-modal ${UI_PREFIX}-modal--wide`;
            const title = document.createElement('h3');
            title.textContent = 'Diese Daten konnten nicht zugeordnet werden';
            const hint = document.createElement('p');
            hint.className = `${UI_PREFIX}-hint`;
            hint.textContent = rows.length ? 'Kopiere benötigte Werte oder markiere einzelne Einträge als erledigt.' : 'Keine offenen Felder.';
            const table = document.createElement('table');
            table.className = `${UI_PREFIX}-rates-table`;
            const head = document.createElement('tr');
            for (const text of ['Feld', 'Wert', 'Quelle', 'Aktion']) {
                const th = document.createElement('th');
                th.textContent = text;
                head.appendChild(th);
            }
            table.appendChild(head);
            for (const rowData of rows) {
                const tr = document.createElement('tr');
                for (const value of [rowData.label, typeof rowData.value === 'string' ? rowData.value : JSON.stringify(rowData.value), rowData.source]) {
                    const td = document.createElement('td');
                    td.textContent = value || '';
                    tr.appendChild(td);
                }
                const actions = document.createElement('td');
                const copy = document.createElement('button');
                copy.type = 'button';
                copy.className = `${UI_PREFIX}-btn ${UI_PREFIX}-btn--ghost`;
                copy.textContent = 'Kopieren';
                copy.addEventListener('click', async () => {
                    try {
                        await navigator.clipboard.writeText(String(rowData.value));
                        toast('Wert in die Zwischenablage kopiert.', { type: 'success', timeoutMs: 2500 });
                    } catch (err) {
                        toast(`Kopieren fehlgeschlagen: ${err.message || err}`, { type: 'error', sticky: true });
                    }
                });
                const done = document.createElement('button');
                done.type = 'button';
                done.className = `${UI_PREFIX}-btn ${UI_PREFIX}-btn--ghost`;
                done.textContent = 'Erledigt';
                done.addEventListener('click', async () => {
                    try {
                        await dbPutMany([['unmappedFields', { ...rowData, status: 'resolved' }]]);
                        tr.remove();
                        toast('Eintrag als erledigt markiert.', { type: 'success', timeoutMs: 2500 });
                    } catch (err) {
                        toast(`Eintrag konnte nicht gespeichert werden: ${err.message || err}`, { type: 'error', sticky: true });
                    }
                });
                actions.append(copy, done);
                tr.appendChild(actions);
                table.appendChild(tr);
            }
            const closeButton = document.createElement('button');
            closeButton.type = 'button';
            closeButton.className = `${UI_PREFIX}-btn`;
            closeButton.textContent = 'Schließen';
            const close = () => overlay.remove();
            closeButton.addEventListener('click', close);
            const buttons = document.createElement('div');
            buttons.className = `${UI_PREFIX}-buttons`;
            buttons.appendChild(closeButton);
            modal.append(title, hint, table, buttons);
            overlay.appendChild(modal);
            overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
            document.body.appendChild(overlay);
        }

        async function exportBackup() {
            const storeNames = ['records', 'orders', 'config', 'articles', 'media', 'syncOutbox', 'unmappedFields'];
            const stores = {};
            for (const name of storeNames) {
                stores[name] = await dbGetAllStrict(name);
                if (name !== 'media' && hasGm() && typeof GM_listValues === 'function') {
                    const prefix = `mpe:${name}:`;
                    const known = new Set(stores[name].map((row) => String(row[STORE_KEYS[name]])));
                    for (const key of GM_listValues()) {
                        if (!key.startsWith(prefix) || known.has(key.slice(prefix.length))) continue;
                        const mirrored = gmMirrorGet(name, key.slice(prefix.length));
                        if (mirrored) stores[name].push(mirrored);
                    }
                }
            }
            const exportedMedia = [];
            for (const media of stores.media) {
                const { blob, ...metadata } = media;
                if (!blob || typeof blob.size !== 'number' || typeof blob.arrayBuffer !== 'function') throw new Error(`Originaldatei ${media.filename} fehlt oder ist ungültig`);
                exportedMedia.push({ ...metadata, blobBase64: await blobToBase64(blob) });
            }
            stores.media = exportedMedia;
            const backup = {
                format: 'marketplace-pdf-export-backup',
                version: 1,
                exportedAt: new Date().toISOString(),
                settings: stripSecrets(store.get()),
                stores: stripSecrets(stores)
            };
            const filename = `marketplace-export-backup-${new Date().toISOString().slice(0, 10)}.json`;
            deliverFile(new Blob([JSON.stringify(backup)], { type: 'application/json' }), filename, 'application/json');
            toast('Sicherung erstellt; Zugangsdaten und API-Token wurden ausgelassen.', { type: 'success', timeoutMs: 5000 });
        }

        async function importBackup(file) {
            let backup;
            try {
                backup = JSON.parse(await file.text());
            } catch (err) {
                throw new Error(`Sicherungsdatei ist kein gültiges JSON: ${err.message || err}`);
            }
            const storeNames = BACKUP_STORES;
            const incomingStores = await validateBackup(backup);
            const keyFields = { records: 'key', orders: 'orderId', config: 'key', articles: 'articleId', media: 'mediaId', syncOutbox: 'operationId', unmappedFields: 'id' };
            const staged = [];
            const supersededSyncEntities = new Set();
            const existingOutbox = await dbGetAllStrict('syncOutbox');
            for (const name of storeNames) {
                for (const incoming of incomingStores[name]) {
                    const key = incoming[keyFields[name]];
                    if (name === 'syncOutbox' && supersededSyncEntities.has(`${incoming.entityType}:${incoming.entityId}`)) continue;
                    const existing = await dbGetStrict(name, key);
                    if (!existing) {
                        staged.push([name, incoming]);
                        continue;
                    }
                    if (name === 'syncOutbox') {
                        if (JSON.stringify(existing) !== JSON.stringify(incoming)) throw new Error(`Operationskennung ${key} ist mit unterschiedlichen Daten vorhanden`);
                        continue;
                    }
                    if (name === 'media') {
                        if (existing.articleId !== incoming.articleId) throw new Error(`Medienkennung ${key} ist bereits einem anderen Artikel zugeordnet`);
                        if (existing.sha256 === incoming.sha256 && existing.filename === incoming.filename && existing.mimeType === incoming.mimeType && existing.sizeBytes === incoming.sizeBytes) continue;
                        const choice = await openMediaConflict(existing, incoming);
                        if (!choice) return false;
                        if (choice === 'new') {
                            const media = { ...incoming, syncState: 'pending' };
                            supersededSyncEntities.add(`media:${media.mediaId}`);
                            staged.push([name, media]);
                            staged.push(['syncOutbox', {
                                operationId: createUuid(),
                                entityType: 'media',
                                entityId: media.mediaId,
                                localRevision: 1,
                                baseRemoteRevision: null,
                                payload: { mediaId: media.mediaId, articleId: media.articleId, filename: media.filename, mimeType: media.mimeType, sizeBytes: media.sizeBytes, sha256: media.sha256 },
                                state: 'pending',
                                attempts: 0,
                                createdAt: new Date().toISOString()
                            }]);
                        }
                        continue;
                    }
                    if (JSON.stringify(existing) === JSON.stringify(incoming)) continue;
                    let merged;
                    if (name === 'articles') {
                        const data = await openConflictPreview(existing.data || {}, incoming.data || {});
                        if (!data) return false;
                        supersededSyncEntities.add(`article:${existing.articleId}`);
                        merged = {
                            ...existing,
                            ...incoming,
                            data,
                            mediaIds: [...new Set([...(existing.mediaIds || []), ...(incoming.mediaIds || [])])],
                            localRevision: Math.max(existing.localRevision || 0, incoming.localRevision || 0) + 1,
                            remoteRevision: existing.remoteRevision === undefined ? null : existing.remoteRevision,
                            syncState: 'pending'
                        };
                        staged.push(['syncOutbox', {
                            operationId: createUuid(),
                            entityType: 'article',
                            entityId: merged.articleId,
                            localRevision: merged.localRevision,
                            baseRemoteRevision: merged.remoteRevision,
                            payload: { articleId: merged.articleId, ebayItemId: merged.ebayItemId, data: merged.data, mediaIds: merged.mediaIds },
                            state: 'pending',
                            attempts: 0,
                            createdAt: new Date().toISOString()
                        }]);
                    } else {
                        merged = await openConflictPreview(existing, incoming);
                        if (!merged) return false;
                    }
                    staged.push([name, merged]);
                }
            }
            for (const operation of existingOutbox) {
                if (['pending', 'error'].includes(operation.state) && supersededSyncEntities.has(`${operation.entityType}:${operation.entityId}`)) {
                    staged.push(['syncOutbox', { ...operation, state: 'superseded' }]);
                }
            }
            const oldSettings = store.get();
            const importedSettings = stripSecrets(backup.settings || {});
            const nextSettings = { ...oldSettings, ...importedSettings };
            if (!await confirmBackupImport(staged.length)) return false;
            store.set(nextSettings);
            try {
                if (staged.length) await dbPutMany(staged);
            } catch (err) {
                try {
                    store.set(oldSettings);
                } catch (rollbackError) {
                    throw new Error(`Import fehlgeschlagen und Einstellungen konnten nicht zurückgesetzt werden: ${rollbackError.message || rollbackError}`);
                }
                throw err;
            }
            toast(`Sicherung importiert (${staged.length} Datensätze); Zugangsdaten und API-Token blieben lokal.`, { type: 'success', sticky: true });
            return true;
        }

        function confirmBackupImport(recordCount) {
            return new Promise((resolve) => {
                const overlay = document.createElement('div');
                overlay.className = `${UI_PREFIX}-overlay`;
                const modal = document.createElement('div');
                modal.className = `${UI_PREFIX}-modal`;
                const title = document.createElement('h3');
                title.textContent = 'Sicherung übernehmen?';
                const hint = document.createElement('p');
                hint.className = `${UI_PREFIX}-hint`;
                hint.textContent = `${recordCount} neue oder geänderte Datensätze und die nicht geheimen Einstellungen werden lokal gespeichert. Zugangsdaten und API-Token bleiben unverändert.`;
                const buttons = document.createElement('div');
                buttons.className = `${UI_PREFIX}-buttons`;
                const close = (value) => { overlay.remove(); resolve(value); };
                const cancel = document.createElement('button');
                cancel.type = 'button';
                cancel.className = `${UI_PREFIX}-btn ${UI_PREFIX}-btn--ghost`;
                cancel.textContent = 'Abbrechen';
                cancel.addEventListener('click', () => close(false));
                const apply = document.createElement('button');
                apply.type = 'button';
                apply.className = `${UI_PREFIX}-btn`;
                apply.textContent = 'Übernehmen';
                apply.addEventListener('click', () => close(true));
                buttons.append(cancel, apply);
                modal.append(title, hint, buttons);
                overlay.appendChild(modal);
                overlay.addEventListener('click', (event) => { if (event.target === overlay) close(false); });
                document.body.appendChild(overlay);
            });
        }

        function openBackupDialog() {
            const overlay = document.createElement('div');
            overlay.className = `${UI_PREFIX}-overlay`;
            const modal = document.createElement('div');
            modal.className = `${UI_PREFIX}-modal`;
            const title = document.createElement('h3');
            title.textContent = 'Sicherung';
            const hint = document.createElement('p');
            hint.className = `${UI_PREFIX}-hint`;
            hint.textContent = 'Export enthält Artikeldaten, Originalbilder, Bestellungen und Einstellungen. Zugangsdaten und API-Token werden ausgelassen.';
            const buttons = document.createElement('div');
            buttons.className = `${UI_PREFIX}-buttons`;
            const close = () => overlay.remove();
            const exportButton = document.createElement('button');
            exportButton.type = 'button';
            exportButton.className = `${UI_PREFIX}-btn`;
            exportButton.textContent = 'Sicherung exportieren';
            exportButton.addEventListener('click', async () => {
                exportButton.disabled = true;
                try {
                    await exportBackup();
                    close();
                } catch (err) {
                    toast(`Sicherung fehlgeschlagen: ${err.message || err}`, { type: 'error', sticky: true });
                } finally {
                    exportButton.disabled = false;
                }
            });
            const importButton = document.createElement('button');
            importButton.type = 'button';
            importButton.className = `${UI_PREFIX}-btn ${UI_PREFIX}-btn--ghost`;
            importButton.textContent = 'Sicherung importieren';
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'application/json,.json';
            fileInput.hidden = true;
            importButton.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', async () => {
                const file = fileInput.files && fileInput.files[0];
                if (!file) return;
                importButton.disabled = true;
                try {
                    if (await importBackup(file)) close();
                } catch (err) {
                    toast(`Sicherung konnte nicht importiert werden: ${err.message || err}`, { type: 'error', sticky: true });
                } finally {
                    importButton.disabled = false;
                    fileInput.value = '';
                }
            });
            const cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.className = `${UI_PREFIX}-btn ${UI_PREFIX}-btn--ghost`;
            cancel.textContent = 'Schließen';
            cancel.addEventListener('click', close);
            buttons.append(exportButton, importButton, cancel);
            modal.append(title, hint, fileInput, buttons);
            overlay.appendChild(modal);
            overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
            document.body.appendChild(overlay);
        }

        const brand = config.brand || config.platformLabel.replace(/\.de$/i, '');
        const docCtx = () => ({ platform: config.platform, brand, scriptLabel, settings: store.get(), itemUrl: config.itemUrl, paymentMethod: config.paymentMethod });

        async function loadOrder(orderId) {
            let order = orderId ? await dbGet('orders', orderId) : null;
            if (!order && config.adapter.fetchOrder) {
                order = await config.adapter.fetchOrder(orderId);
                if (order) order = (await saveOrder(order)).order;
            }
            if (!order) {
                toast(`Bestellung ${orderId || ''} ist noch nicht gespeichert. Bitte die Bestellseite öffnen – sie wird dann automatisch ausgelesen.`, {
                    type: 'warn',
                    sticky: true,
                    actions: orderId && config.orderUrl ? [{ label: '🔗 Bestellung öffnen', href: config.orderUrl(orderId) }] : []
                });
            }
            return order;
        }

        /** Rechnung mit einem Klick: Bestellung laden, Versandkosten sicherstellen, PDF ausliefern, Stand speichern. */
        async function createInvoice(orderId) {
            try {
                let order = await loadOrder(orderId);
                if (!order) return;
                if (order.role !== 'BUYER') order = await ensureShippingActual(order);
                if (!order) return;
                const model = buildOrderDocumentModel(order, docCtx());
                const images = await Promise.all(model.items.map((i) => (i.imageUrl ? fetchImage(i.imageUrl, 'artikel.jpg') : null)));
                model.items.forEach((it, n) => { it.imageDataUrl = images[n] ? images[n].dataUrl : ''; });
                const bytes = await renderPdfBytes(Theme.buildInvoiceDocument(model));
                const title = sanitizeFilename((order.items && order.items[0] && order.items[0].title) || '', 70);
                // Rechnungsdatum = Zahldatum (wie im Dokument)
                const documentLabel = model.purchase ? 'Kaufbeleg' : 'Rechnung';
                const filename = `${order.paidDate || order.soldDate || formatDateIso()} ${sanitizeFilename(brand)} ${documentLabel} ${order.orderId} ${title}.pdf`;
                const url = deliverPdf(bytes, filename, store.get().deliveryMode);
                await dbPut('orders', { ...order, invoiceCreatedAt: new Date().toISOString(), invoiceAmounts: model.amounts });
                toast(`🧾 ${documentLabel} erstellt: ${filename}`, {
                    type: 'success',
                    sticky: true,
                    list: model.purchase ? [`Gesamtbetrag: ${eur(model.amounts.total)}`] : [`Gesamtbetrag (Erlös): ${eur(model.amounts.total)}`, `Versandkosten: ${eur(model.amounts.shippingActual)}${model.shippingActualLabel ? ` (${model.shippingActualLabel})` : ''}`],
                    actions: [
                        { label: '📂 Im Tab öffnen', href: url },
                        { label: '✏️ Werte ändern & neu erstellen', onClick: async () => { if (await openOrderEditor(order)) await createInvoice(order.orderId); } }
                    ]
                });
            } catch (err) {
                console.error(`[${config.scriptName}]`, err);
                toast(`❌ Rechnung fehlgeschlagen: ${err.message || err}`, { type: 'error', sticky: true });
            }
        }

        async function editOrder(orderId) {
            const order = await loadOrder(orderId);
            if (order && (await openOrderEditor(order))) toast('💾 Beträge gespeichert. Rechnung bei Bedarf neu erstellen.', { type: 'success', timeoutMs: 4000 });
        }

        const itemLines = (o) => (o.items || []).flatMap((i) => [
            { text: i.title || 'n/a', bold: true },
            { label: 'Artikelnummer: ', text: i.itemId, url: config.itemUrl ? config.itemUrl(i.itemId) : '' }
        ]);
        const neg = (c) => (c ? -c : 0);
        const euro = (v) => (v === null || v === undefined ? null : v / 100);
        const xlsxDate = (iso) => (iso ? new Date(`${iso}T12:00:00`) : null);

        /** Excel: je Artikel eine Zeile; Bestellbeträge in der ersten Artikelzeile, Zeilen-Gesamtbeträge ergeben genau den Bestell-Gesamtbetrag. */
        function xlsxItemLines(o, orderTotal) {
            const lines = o.items && o.items.length ? o.items : [{}];
            const otherItems = lines.slice(1).reduce((s, i) => s + (i.total || 0), 0);
            return lines.map((i, n) => ({ i, first: n === 0, lineTotal: n === 0 ? orderTotal - otherItems : i.total || 0 }));
        }

        function salesReport(orders, withAcquisition) {
            const t = { gross: 0, refunds: 0, shippingCharged: 0, shippingActual: 0, transactionFees: 0, adFees: 0, net: 0, acquisition: 0, profit: 0, known: 0, fees: 0 };
            const rows = [];
            const xlsx = [];
            for (const o of orders) {
                const a = computeOrderAmounts(o);
                const acq = o.acquisition || {};
                const price = acq.priceCents ?? null;
                const profit = price === null ? null : a.total - price;
                const fees = -(a.refund + (a.shippingActual || 0) + a.transactionFee + a.adFee);
                t.gross += a.subtotal;
                t.refunds += a.refund;
                t.shippingCharged += a.shippingCharged;
                t.shippingActual += a.shippingActual || 0;
                t.transactionFees += a.transactionFee;
                t.adFees += a.adFee;
                t.fees += fees;
                t.net += a.total;
                if (price !== null) {
                    t.acquisition += price;
                    t.profit += profit;
                    t.known += 1;
                }
                const buyer = [o.buyer && o.buyer.name, o.buyer && o.buyer.username ? `(${o.buyer.username})` : ''].filter(Boolean).join(' ');
                const hold = holdingPeriod(acq.date, o.soldDate);
                rows.push([dateDe(o.soldDate), { text: o.orderId, url: o.orderUrl }, { lines: [...itemLines(o), { label: 'Käufer: ', text: buyer || 'n/a', muted: true }] },
                    a.subtotal, fees, a.total, hold, acq.reason || '', ...(withAcquisition ? [price ?? 'n/a', profit ?? 'n/a'] : [])]);
                const c = (v) => (v || 0) / 100;
                for (const { i, first, lineTotal } of xlsxItemLines(o, a.total)) {
                    xlsx.push([xlsxDate(o.soldDate), o.orderId, i.itemId || '', i.title || '', buyer, i.quantity || 1, c(i.unitPrice), c(i.total),
                        first ? c(a.shippingCharged) : 0, first ? -c(a.refund) : 0, first ? -c(a.shippingActual) : 0, first ? -c(a.transactionFee) : 0, first ? -c(a.adFee) : 0,
                        c(lineTotal), o.shippingService || '', o.trackingId || '',
                        first ? xlsxDate(acq.date) : null, first ? acq.from || '' : '', first ? euro(price) : null, first ? hold : '', first ? acq.reason || '' : '', first ? euro(profit) : null]);
                }
            }
            const partial = t.known < orders.length ? ` (${t.known} von ${orders.length} mit Anschaffungspreis)` : '';
            return {
                sheet: 'Verkäufe',
                summary: `Verkaufserlös ${eur(t.net)}`,
                overview: [
                    { label: 'Bestellungen (Gesamtbetrag)', cents: t.gross, bold: true },
                    { label: 'Rückerstattungen und Gutschriften', cents: neg(t.refunds) },
                    { label: 'davon Versanderlös', cents: t.shippingCharged },
                    { label: 'Versandkosten', cents: neg(t.shippingActual) },
                    { label: 'Transaktionsgebühren', cents: neg(t.transactionFees) },
                    { label: 'Anzeigengebühren', cents: neg(t.adFees) },
                    { label: 'Verkaufserlös', cents: t.net, bold: true },
                    ...(withAcquisition ? [{ label: `Anschaffungspreise${partial}`, cents: neg(t.acquisition) }, { label: `Ertrag${partial}`, cents: t.profit, bold: true }] : [])
                ],
                details: {
                    title: `Transaktionsdetails (${orders.length} Bestellungen)`,
                    columns: [
                        { label: 'Datum', width: 48 }, { label: 'Bestellnummer', width: 70 }, { label: 'Artikel', width: '*' },
                        { label: 'Umsatz', width: 54, align: 'right' }, { label: 'Gebühren', width: 54, align: 'right' }, { label: 'Gesamtbetrag', width: 60, align: 'right' },
                        { label: 'Haltedauer', width: 46 }, { label: 'Verkaufsgrund', width: 74 },
                        ...(withAcquisition ? [{ label: 'Anschaffungspreis', width: 74, align: 'right' }, { label: 'Ertrag', width: 50, align: 'right' }] : [])
                    ],
                    rows,
                    totals: ['Summe', '', '', t.gross, t.fees, t.net, '', '', ...(withAcquisition ? [t.acquisition, t.profit] : [])]
                },
                xlsx: {
                    header: ['Datum', 'Bestellnummer', 'Artikelnummer', 'Artikel', 'Käufer', 'Stückzahl', 'Artikelpreis', 'Artikelpreis gesamt', 'Versanderlös', 'Erstattung/Rabatt', 'Versandkosten', 'Transaktionsgebühren', 'Anzeigengebühren', 'Gesamtbetrag', 'Versandservice', 'Sendungsnummer', 'Erworben am', 'Erworben von', 'Anschaffungspreis', 'Haltedauer', 'Verkaufsgrund', 'Ertrag'],
                    rows: xlsx,
                    sum: [6, 7, 8, 9, 10, 11, 12, 13, 18, 21]
                }
            };
        }

        function purchaseReport(orders) {
            const t = { items: 0, fees: 0, total: 0 };
            const rows = [];
            const xlsx = [];
            for (const o of orders) {
                const p = computePurchaseAmounts(o);
                t.items += p.itemsTotal;
                t.fees += p.fees;
                t.total += p.total;
                const seller = (o.seller && o.seller.username) || 'n/a';
                rows.push([dateDe(o.soldDate), { text: o.orderId, url: o.orderUrl }, { lines: [...itemLines(o), { label: 'Verkäufer: ', text: seller, muted: true }] }, p.itemsTotal, p.fees, p.total]);
                for (const { i, first, lineTotal } of xlsxItemLines(o, p.total)) xlsx.push([xlsxDate(o.soldDate), o.orderId, i.itemId || '', i.title || '', seller, euro(i.total || 0), first ? euro(p.fees) : 0, euro(lineTotal)]);
            }
            return {
                sheet: 'Käufe',
                summary: `Gesamtbetrag ${eur(t.total)}`,
                overview: [
                    { label: 'Artikelpreise', cents: t.items },
                    { label: 'Gebühren (Versand, Rückerstattungen)', cents: t.fees },
                    { label: 'Gesamtbetrag', cents: t.total, bold: true }
                ],
                details: {
                    title: `Transaktionsdetails (${orders.length} Bestellungen)`,
                    columns: [
                        { label: 'Datum', width: 50 }, { label: 'Bestellnummer', width: 72 }, { label: 'Artikel', width: '*' },
                        { label: 'Artikelpreis', width: 70, align: 'right' }, { label: 'Gebühren', width: 70, align: 'right' }, { label: 'Gesamtbetrag', width: 74, align: 'right' }
                    ],
                    rows,
                    totals: ['Summe', '', '', t.items, t.fees, t.total]
                },
                xlsx: { header: ['Datum', 'Bestellnummer', 'Artikelnummer', 'Artikel', 'Verkäufer', 'Artikelpreis', 'Gebühren', 'Gesamtbetrag'], rows: xlsx, sum: [5, 6, 7] }
            };
        }

        /** Bericht vor dem Erstellen als Tabelle prüfen/ändern; Änderungen landen in der Datenbank (gelten auch für Rechnungen). */
        async function editReportRows(orders, sales, name) {
            const columns = sales
                ? [...AMOUNT_FIELDS.map(([key, label]) => ({ key, label, num: true })), ...ACQUISITION_FIELDS.map((f) => ({ ...f, label: f.label.replace(/ \(.*\)$/, ''), num: f.key === 'acquisitionPrice' }))]
                : PURCHASE_FIELDS.map(([key, label]) => ({ key, label, num: true }));
            const edited = await openTableEditor({
                title: `✏️ ${name} – Tabelle prüfen`,
                hint: 'Beträge in EUR, Datum TT.MM.JJJJ. Orange = weicht vom Wert der eBay-Seite ab. Änderungen werden gespeichert und gelten auch für Rechnungen.',
                columns,
                rows: orders.map((o) => ({
                    id: o.orderId,
                    info: [(o.items || []).map((i) => i.title).join(', ') || 'n/a', `${dateDe(o.soldDate)} · ${o.orderId}`],
                    values: orderEditValues(o),
                    originals: orderEditValues({ ...o, overrides: {} })
                })),
                confirmLabel: 'PDF + Excel erstellen'
            });
            if (!edited) return null;
            const out = [];
            for (const o of orders) {
                const next = applyOrderEdits(o, edited.get(o.orderId));
                if (JSON.stringify(next) !== JSON.stringify(o)) await dbPut('orders', next);
                out.push(next);
            }
            return out;
        }

        /** Verkaufs- bzw. Kaufbericht (PDF + Excel) über alle gespeicherten Bestellungen eines Zeitraums. */
        async function openReport(kind = 'sales') {
            const sales = kind === 'sales';
            const name = sales ? 'Verkaufsbericht' : 'Kaufbericht';
            try {
                const all = (await dbGetAll('orders')).filter((o) => o.platform === config.platform && (o.role === 'BUYER') !== sales);
                const years = Array.from(new Set(all.map((o) => (o.soldDate || '').slice(0, 4)).filter(Boolean))).sort().reverse();
                const thisYear = String(new Date().getFullYear());
                const answer = await openForm({
                    title: `📊 ${name} (Finanzamt)`,
                    hint: sales
                        ? `${all.length} Verkäufe gespeichert. Es zählen Bestellungen, deren Bestellseite geöffnet oder für die eine Rechnung erstellt wurde.`
                        : `${all.length} Käufe gespeichert (aus der Käufe-Übersicht – für ältere Käufe dort weiterblättern).`,
                    sections: [{ title: 'Zeitraum', fields: [
                        { key: 'year', label: 'Jahr', type: 'select', options: [['', '– alle –'], ...(years.length ? years : [thisYear]).map((y) => [y, y])], value: years[0] || thisYear },
                        { key: 'from', label: 'oder von (TT.MM.JJJJ)' },
                        { key: 'to', label: 'bis (TT.MM.JJJJ)' },
                        ...(sales ? [{ key: 'acquisition', label: 'Erwerbsangaben drucken (Anschaffungspreis, Ertrag)', type: 'checkbox', value: false }] : [])
                    ] }],
                    buttons: [{ label: 'Abbrechen', value: null }, { label: 'Weiter: Tabelle prüfen', value: 'go', primary: true }]
                });
                if (!answer) return;
                const v = answer.values;
                const today = formatDateIso();
                const from = toIsoDate(v.from) || (v.year ? `${v.year}-01-01` : all.map((o) => o.soldDate).filter(Boolean).sort()[0] || today);
                const to = toIsoDate(v.to) || (v.year ? `${v.year}-12-31` : today);
                let orders = all.filter((o) => o.soldDate && o.soldDate >= from && o.soldDate <= to).sort((a, b) => (a.soldDate < b.soldDate ? -1 : 1));
                if (!orders.length) {
                    toast(`Keine gespeicherten ${sales ? 'Verkäufe' : 'Käufe'} im Zeitraum.`, { type: 'warn', timeoutMs: 5000 });
                    return;
                }
                if (sales) {
                    const ready = [];
                    for (const o of orders) ready.push((await ensureShippingActual(o)) || o);
                    orders = ready;
                }
                orders = await editReportRows(orders, sales, name);
                if (!orders) return;
                const periodLabel = v.year && !v.from && !v.to ? v.year : `${dateDe(from)} – ${dateDe(to)}`;
                const rep = sales ? salesReport(orders, Boolean(v.acquisition)) : purchaseReport(orders);
                const s = store.get();
                const pdf = await renderPdfBytes(Theme.buildReportDocument({
                    platform: config.platform, brand, scriptLabel, exportedAt: Theme.formatExportTimestamp(new Date()),
                    title: `${brand}-${name} \u2022 ${periodLabel}`, issuer: { name: s.ownFullName, username: s.ownUsername },
                    overview: rep.overview, details: rep.details
                }));
                const base = `${formatDateIso()} ${sanitizeFilename(brand)} ${name} ${sanitizeFilename(periodLabel.replace(/[–]/g, '-'))}`;
                deliverPdf(pdf, `${base}.pdf`, 'download');
                deliverFile(buildXlsxBytes(rep.xlsx.header, rep.xlsx.rows, rep.xlsx.sum, rep.sheet), `${base}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                toast(`📊 ${name} ${periodLabel}: ${orders.length} Bestellungen, ${rep.summary}`, { type: 'success', sticky: true });
            } catch (err) {
                console.error(`[${config.scriptName}]`, err);
                toast(`❌ ${name} fehlgeschlagen: ${err.message || err}`, { type: 'error', sticky: true });
            }
        }

        /** Button-Leiste. mode 'chat': 📄 PDF-Export, 📝 Prüfen, [🧾 Rechnung], ⚙️ · 'order': 🧾 Rechnung, ✏️ Beträge, 🚚, 📊, ⚙️ · 'sales'/'purchases' (Übersichten): 📊 Bericht, [🚚], ⚙️ */
        function createToolbar({ mode = 'chat', getOrderId } = {}) {
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
                    } catch (err) {
                        console.error(`[${config.scriptName}]`, err);
                        toast(`Aktion fehlgeschlagen: ${err.message || err}`, { type: 'error', sticky: true });
                    } finally {
                        b.disabled = false;
                    }
                });
                return b;
            };
            const orderId = () => (getOrderId ? getOrderId() : config.adapter.getOrderId ? config.adapter.getOrderId() : '');
            const ghost = `${UI_PREFIX}-btn--ghost`;
            const icon = `${ghost} ${UI_PREFIX}-btn--icon`;
            const backupButton = () => mk('🗄️', 'Sicherung exportieren oder importieren', icon, () => openBackupDialog());
            if (mode === 'details') {
                bar.append(
                    mk('📄 Artikeldetails', 'Artikeldaten ohne Nachrichtenverlauf als PDF exportieren', '', () => run({ articleOnly: true })),
                    mk('📝 Prüfen', 'Artikeldaten vor dem PDF-Export bearbeiten', ghost, () => run({ articleOnly: true, review: true })),
                    backupButton(),
                    mk('⚙️', 'Einstellungen & gespeicherte Felder', icon, () => openSettings())
                );
                return bar;
            }
            if (mode === 'article') {
                bar.append(
                    mk('💾 Artikel speichern', 'Angebotsdaten und ausgewählte Originalbilder lokal sichern', '', () => saveCurrentArticle()),
                    mk('🧩', 'Nicht zugeordnete Felder anzeigen', icon, () => openUnmappedFields()),
                    backupButton(),
                    mk('⚙️', 'Einstellungen', icon, () => openSettings())
                );
                return bar;
            }
            if (mode === 'order' || mode === 'purchase-order') {
                const purchase = mode === 'purchase-order';
                const invoiceButton = mk(purchase ? '🧾 Kaufbeleg' : '🧾 Rechnung', 'Beleg dieser Bestellung erstellen', '', () => createInvoice(orderId()));
                bar.append(
                    invoiceButton,
                    mk('✏️ Beträge', 'Preis, Versand, Erstattung, Gebühren und Erwerbsangaben dieser Bestellung korrigieren', ghost, () => editOrder(orderId())),
                    ...(!purchase ? [
                        mk('🚚', 'Versandkosten-Tabelle (gültig ab …)', icon, () => openShippingRatesEditor()),
                        mk('📊', 'Verkaufsbericht (PDF + Excel)', icon, () => openReport('sales'))
                    ] : []),
                    mk('🧩', 'Nicht zugeordnete Felder anzeigen', icon, () => openUnmappedFields()),
                    backupButton(),
                    mk('⚙️', 'Einstellungen', icon, () => openSettings())
                );
                const refreshInvoice = async () => {
                    try {
                        const order = await dbGet('orders', orderId());
                        if (!order) return;
                        const changed = Object.keys(order.overrides || {}).length > 0 || order.shippingActual?.source === 'manual';
                        invoiceButton.classList.toggle(`${UI_PREFIX}-btn--attention`, changed);
                        invoiceButton.style.backgroundColor = changed ? '' : order.invoiceCreatedAt ? '#b5e941' : '';
                        invoiceButton.style.color = !changed && order.invoiceCreatedAt ? '#1d4b00' : '';
                        const text = order.invoiceCreatedAt
                            ? `${purchase ? 'Kaufbeleg' : 'Rechnung'} erstellt am ${new Date(order.invoiceCreatedAt).toLocaleDateString('de-DE')}`
                            : purchase ? '🧾 Kaufbeleg' : '🧾 Rechnung';
                        if (invoiceButton.textContent !== text) invoiceButton.textContent = text;
                    } catch (err) {
                        console.error('[MPE] Belegstatus konnte nicht geladen werden:', err);
                    }
                };
                void refreshInvoice();
                const invoiceTimer = setInterval(() => {
                    if (!bar.isConnected) clearInterval(invoiceTimer);
                    else void refreshInvoice();
                }, 1000);
                return bar;
            }
            if (mode === 'sales' || mode === 'purchases') {
                bar.append(
                    mode === 'sales'
                        ? mk('📊 Verkaufsbericht', 'Verkaufsbericht (PDF + Excel), Tabelle vorher bearbeitbar', '', () => openReport('sales'))
                        : mk('📊 Kaufbericht', 'Kaufbericht (PDF + Excel), Tabelle vorher bearbeitbar', '', () => openReport('purchases')),
                    ...(mode === 'sales' ? [mk('🚚', 'Versandkosten-Tabelle (gültig ab …)', icon, () => openShippingRatesEditor())] : []),
                    mk('🧩', 'Nicht zugeordnete Felder anzeigen', icon, () => openUnmappedFields()),
                    backupButton(),
                    mk('⚙️', 'Einstellungen', icon, () => openSettings())
                );
                return bar;
            }
            bar.append(
                mk('📄 PDF-Export', 'PDF mit Nachrichtenverlauf, Anzeige & Bildern erstellen', '', () => run()),
                mk('📝 Prüfen', 'Felder vor dem Export prüfen/ändern', ghost, () => run({ review: true }))
            );
            if (caps.invoice) {
                bar.append(
                    mk('🧾', 'Rechnung zur Bestellung dieser Konversation', icon, () => (orderId() ? createInvoice(orderId()) : toast('Zu dieser Konversation gibt es keine Bestellnummer.', { type: 'warn', timeoutMs: 4000 }))),
                    mk('🚚', 'Versandkosten-Tabelle (gültig ab …)', icon, () => openShippingRatesEditor()),
                    mk('📊', 'Verkaufsbericht (PDF + Excel)', icon, () => openReport('sales'))
                );
            }
            const settingsBtn = mk('⚙️', 'Einstellungen & gespeicherte Felder', icon, () => openSettings());
            bar.append(mk('🧩', 'Nicht zugeordnete Felder anzeigen', icon, () => openUnmappedFields()), backupButton(), settingsBtn);
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
                // Fehlende Angaben (letzter Export + manuelle Werte) -> ⚙️ orange
                const missing = rec && rec.extracted ? missingFieldLabels({ ...rec.extracted, ...(rec.overrides || {}) }) : [];
                settingsBtn.classList.toggle(`${UI_PREFIX}-btn--attention`, missing.length > 0);
                settingsBtn.title = missing.length ? `Es fehlen Angaben: ${missing.join(', ')} – hier ergänzen` : 'Einstellungen & gespeicherte Felder';
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
            saveArticle: saveCurrentArticle,
            openUnmappedFields,
            openBackupDialog,
            exportBackup,
            importBackup,
            createToolbar,
            createInvoice,
            ollamaGenerate: (prompt, opts) => ollamaGenerate(store.get(), prompt, opts),
            findTrackingInImages: (messages) => findTrackingInImages(messages, store.get()),
            detectReturn: (messages, candidates) => detectReturn(store.get(), messages, candidates)
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
        rememberContact,
        getContacts,
        moneyFieldValue,
        mergeKnown,
        mergeArticleValues,
        stripSecrets,
        containsSecretKey,
        validateBackup,
        toast,
        detectCarrier,
        findTrackingNumber,
        findTrackingNumbers,
        orderTrackingCandidates,
        PAYMENT_METHODS,
        toCents,
        computeOrderAmounts,
        computePurchaseAmounts,
        buildOrderDocumentModel,
        holdingPeriod,
        saveOrder,
        priceAt,
        carrierFromService,
        suggestShippingActual,
        ensureShippingActual,
        createExporter
    });
})(typeof window !== 'undefined' ? window : globalThis);
