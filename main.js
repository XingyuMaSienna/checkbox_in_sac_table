(function () {
    class CheckboxTableWidget extends HTMLElement {

        constructor() {
            super();
            this._selectedIndices = new Set();
            this._rows = [];           // array of plain objects keyed by dimension id
            this._columns = [];        // [{ id, label }]
            this._selectedDataArray = [];
            this._message = 'No data. Bind a data source and add dimensions to the Dimensions feed.';
            this.attachShadow({ mode: 'open' });
        }

        connectedCallback() {
            this._render();
        }

        // ── SAC custom-widget lifecycle ───────────────────────────────────────

        // Called by SAC after each property/binding update.
        // changedProperties.myDataSource is the binding object.
        onCustomWidgetAfterUpdate(changedProperties) {
            if ('myDataSource' in changedProperties) {
                this._processBinding(changedProperties.myDataSource);
            }
        }

        onCustomWidgetResize() { /* no-op */ }
        onCustomWidgetDestroy() { /* no-op */ }

        // Property setter form (SAC also pushes the binding through this).
        set myDataSource(binding) {
            this._processBinding(binding);
        }

        // ── Public methods exposed to story scripting ────────────────────────

        refreshData() {
            this._render();
        }

        getSelectedCount() {
            return this._selectedIndices.size;
        }

        getSelectedFieldValue(index, field) {
            if (!this._selectedDataArray ||
                index < 0 || index >= this._selectedDataArray.length) {
                return '';
            }
            const row = this._selectedDataArray[index];
            return (row && row[field] !== undefined && row[field] !== null)
                ? String(row[field]) : '';
        }

        clearSelection() {
            this._selectedIndices.clear();
            this._selectedDataArray = [];
            this._render();
        }

        // ── Binding processing ────────────────────────────────────────────────

        _processBinding(binding) {
            try {
                if (!binding) {
                    this._rows = [];
                    this._columns = [];
                    this._message = 'No data binding.';
                    this._render();
                    return;
                }

                // Binding state may be "Success"/"NoData"/"Error"/"Loading"
                // (case can vary). We only block rendering when there is
                // genuinely no data to show.
                const state = (binding.state || '').toString();
                const stateLc = state.toLowerCase();

                const metadata = binding.metadata || {};
                const data = Array.isArray(binding.data) ? binding.data : [];

                if (data.length === 0) {
                    this._rows = [];
                    this._columns = [];
                    if (stateLc === 'loading' || stateLc === 'pending') {
                        this._message = 'Loading data…';
                    } else if (stateLc === 'error') {
                        var detail = '';
                        try {
                            var keys = Object.keys(binding || {}).join(', ');
                            detail = ' [binding keys: ' + keys + ']';
                            if (binding.errorMessage) detail += ' msg: ' + binding.errorMessage;
                            if (binding.error)        detail += ' err: ' + JSON.stringify(binding.error);
                        } catch (ignore) { /* noop */ }
                        try { console.warn('CheckboxTable binding error', binding); } catch(e){}
                        this._message = 'Data source returned an error. ' +
                            'Check the model binding, dimensions and filters.' + detail;
                    } else {
                        this._message = 'No data. Bind a data source and add ' +
                            'dimensions to the Dimensions feed.';
                    }
                    this._render();
                    return;
                }

                // Determine which dimensions are in the "dimensions" feed
                let dimIds = [];
                if (metadata.feeds && metadata.feeds.dimensions &&
                    Array.isArray(metadata.feeds.dimensions.values)) {
                    dimIds = metadata.feeds.dimensions.values.slice();
                }

                // Fallback: derive from first data row keys
                if (dimIds.length === 0 && data.length > 0) {
                    dimIds = Object.keys(data[0]);
                }

                // Build column descriptors with friendly labels
                const dimMeta = metadata.dimensions || {};
                this._columns = dimIds.map(id => ({
                    id: id,
                    label: (dimMeta[id] && (dimMeta[id].description || dimMeta[id].name)) || id
                }));

                // Build flat row objects: { <dimId>: <member.label or id>, ... }
                this._rows = data.map(rec => {
                    const row = {};
                    dimIds.forEach(id => {
                        const cell = rec[id];
                        if (cell == null) {
                            row[id] = '';
                        } else if (typeof cell === 'object') {
                            // Member object: { id, label, description, parentId, ... }
                            row[id] = (cell.label !== undefined && cell.label !== null && cell.label !== '')
                                ? cell.label
                                : (cell.id !== undefined ? cell.id : '');
                        } else {
                            row[id] = cell;
                        }
                    });
                    return row;
                });

                // Reset selection when data changes
                this._selectedIndices.clear();
                this._selectedDataArray = [];

                if (this._rows.length === 0) {
                    this._message = 'Result is empty. Add at least one dimension to the Dimensions feed.';
                }

                this._render();

                this.dispatchEvent(new CustomEvent('onResultChanged', {
                    bubbles: true, composed: true
                }));

            } catch (e) {
                this._rows = [];
                this._columns = [];
                this._message = 'Error processing binding: ' +
                    (e && e.message ? e.message : e);
                this._render();
            }
        }

        // ── Rendering ─────────────────────────────────────────────────────────

        _render() {
            if (!this._rows || this._rows.length === 0) {
                this.shadowRoot.innerHTML = `
                    <style>
                        p { font-family:'72',Arial,sans-serif; font-size:13px;
                            color:#666; padding:16px; margin:0; }
                    </style>
                    <p>${this._esc(this._message)}</p>`;
                return;
            }

            const cols = this._columns;
            const allSelected = this._selectedIndices.size === this._rows.length;

            const headerCells = cols.map(c =>
                `<th>${this._esc(c.label)}</th>`
            ).join('');

            const bodyRows = this._rows.map((row, i) => {
                const checked  = this._selectedIndices.has(i) ? 'checked' : '';
                const rowClass = this._selectedIndices.has(i) ? 'row-selected' : '';
                const dataCells = cols.map(c =>
                    `<td>${this._esc(row[c.id] !== undefined ? String(row[c.id]) : '')}</td>`
                ).join('');
                return `<tr class="${rowClass}" data-index="${i}">
                            <td class="cb-cell"><input type="checkbox" data-index="${i}" ${checked}/></td>
                            ${dataCells}
                        </tr>`;
            }).join('');

            this.shadowRoot.innerHTML = `
                <style>
                    *, *::before, *::after { box-sizing: border-box; }
                    :host { display:block; width:100%; height:100%; overflow:auto;
                            font-family:'72',Arial,sans-serif; font-size:13px; }
                    .badge { display:inline-block; margin:6px 0 4px 2px; padding:2px 8px;
                             background:#0a6ed1; color:#fff; border-radius:10px; font-size:11px; }
                    table { width:100%; border-collapse:collapse; background:#fff; }
                    thead tr { background:#0a6ed1; color:#fff; position:sticky; top:0; z-index:1; }
                    th { padding:9px 12px; text-align:left; font-weight:600;
                         white-space:nowrap; border-right:1px solid rgba(255,255,255,0.2); }
                    th:last-child { border-right:none; }
                    td { padding:8px 12px; border-bottom:1px solid #e5e5e5; color:#333; }
                    tbody tr:hover td { background:#f0f7ff; }
                    tbody tr.row-selected td { background:#d1e8ff; }
                    .cb-cell { width:36px; text-align:center; padding:8px 4px; }
                    input[type=checkbox] { width:15px; height:15px; cursor:pointer; accent-color:#0a6ed1; }
                </style>
                <span class="badge">${this._selectedIndices.size} selected</span>
                <table>
                    <thead>
                        <tr>
                            <th class="cb-cell"><input type="checkbox" id="chk-all" ${allSelected ? 'checked' : ''}/></th>
                            ${headerCells}
                        </tr>
                    </thead>
                    <tbody>${bodyRows}</tbody>
                </table>`;

            this.shadowRoot.querySelector('#chk-all').addEventListener('change', (e) => {
                if (e.target.checked) {
                    this._rows.forEach((_, i) => this._selectedIndices.add(i));
                } else {
                    this._selectedIndices.clear();
                }
                this._render();
                this._fireSelectionEvent();
            });

            this.shadowRoot.querySelectorAll('input[data-index]').forEach(cb => {
                cb.addEventListener('change', (e) => {
                    const idx = parseInt(e.target.dataset.index, 10);
                    if (e.target.checked) {
                        this._selectedIndices.add(idx);
                    } else {
                        this._selectedIndices.delete(idx);
                    }
                    this._updateHighlights();
                    this._fireSelectionEvent();
                });
            });
        }

        _updateHighlights() {
            this.shadowRoot.querySelectorAll('tbody tr').forEach(tr => {
                const idx = parseInt(tr.dataset.index, 10);
                tr.classList.toggle('row-selected', this._selectedIndices.has(idx));
            });
            const badge = this.shadowRoot.querySelector('.badge');
            if (badge) badge.textContent = `${this._selectedIndices.size} selected`;
            const chkAll = this.shadowRoot.querySelector('#chk-all');
            if (chkAll) {
                chkAll.checked = this._rows.length > 0 &&
                    this._selectedIndices.size === this._rows.length;
            }
        }

        _fireSelectionEvent() {
            this._selectedDataArray = Array.from(this._selectedIndices)
                .sort((a, b) => a - b)
                .map(i => this._rows[i]);

            this.dispatchEvent(new CustomEvent('onSelectionChanged', {
                detail: { selectedRows: JSON.stringify(Array.from(this._selectedIndices)) },
                bubbles: true,
                composed: true
            }));
        }

        _esc(str) {
            return String(str)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;')
                .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }
    }

    if (!customElements.get('custom-checkbox-table')) {
        customElements.define('custom-checkbox-table', CheckboxTableWidget);
    }
})();
