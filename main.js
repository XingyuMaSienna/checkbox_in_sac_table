(function () {
    class CheckboxTableWidget extends HTMLElement {

        constructor() {
            super();
            this._selectedIndices = new Set();
            this._rows = [];           // array of plain objects keyed by dimension id
            this._columns = [];        // [{ id, label }]
            this._selectedDataArray = [];
            this._hiddenColumns = new Set([
                'DATA_PRODUCT_DOMAIN',
                'IS_BDD_EQ_BDT', 'IS_BDD_EQ_BDM', 'IS_BDD_EQ_BDP',
                'IS_BDT_EQ_BDM', 'IS_BDT_EQ_BDP', 'IS_BDM_EQ_BDP'
            ]);
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
                console.warn('CheckboxTable.getSelectedFieldValue: no row at index', index,
                    'selectedDataArray length:', this._selectedDataArray ? this._selectedDataArray.length : 0);
                return '';
            }
            const row = this._selectedDataArray[index];
            console.log('CheckboxTable.getSelectedFieldValue: index=', index,
                'field=', field, 'row keys=', row ? Object.keys(row) : 'null',
                'value=', row ? row[field] : 'undefined');
            return (row && row[field] !== undefined && row[field] !== null)
                ? String(row[field]) : '';
        }

        getSelectedKeys() {
            // Returns JSON string of field names available in selected rows (for debugging).
            if (this._selectedDataArray && this._selectedDataArray.length > 0) {
                return JSON.stringify(Object.keys(this._selectedDataArray[0]));
            }
            return '[]';
        }

        clearSelection() {
            this._selectedIndices.clear();
            this._selectedDataArray = [];
            this._render();
        }

        showColumn(field) {
            this._hiddenColumns.delete(field);
            this._render();
        }

        hideColumn(field) {
            this._hiddenColumns.add(field);
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
                            var msgs = [];
                            if (Array.isArray(binding.messages)) {
                                binding.messages.forEach(function (m) {
                                    if (!m) return;
                                    if (typeof m === 'string') { msgs.push(m); return; }
                                    var s = m.text || m.message || m.shortText || m.description || '';
                                    if (m.type) s = '[' + m.type + '] ' + s;
                                    if (m.code) s = s + ' (code: ' + m.code + ')';
                                    if (!s) { try { s = JSON.stringify(m); } catch (e) { s = '[unprintable]'; } }
                                    msgs.push(s);
                                });
                            }
                            if (msgs.length) detail = ' — ' + msgs.join(' | ');
                            if (binding.errorMessage) detail += ' msg: ' + binding.errorMessage;
                        } catch (ignore) { /* noop */ }
                        try { console.warn('CheckboxTable binding error', binding); } catch (e) { /* noop */ }
                        this._message = 'Data source returned an error.' + detail;
                    } else {
                        this._message = 'No data. Bind a data source and add ' +
                            'dimensions to the Dimensions feed.';
                    }
                    this._render();
                    return;
                }

                // SAC binding uses generic keys (dimensions_0, measures_0, etc.)
                // Real IDs are in metadata.dimensions[genericKey].id and
                // metadata.mainStructureMembers[genericKey].id
                const dataKeys = data.length > 0 ? Object.keys(data[0]) : [];
                const genericDimKeys = dataKeys.filter(k => k.startsWith('dimensions_'))
                    .sort((a, b) => parseInt(a.split('_')[1]) - parseInt(b.split('_')[1]));
                const genericMsrKeys = dataKeys.filter(k => k.startsWith('measures_'))
                    .sort((a, b) => parseInt(a.split('_')[1]) - parseInt(b.split('_')[1]));

                const dimMeta = metadata.dimensions || {};
                const msrMeta = metadata.mainStructureMembers || {};

                // Build mapping: real dimension ID <-> generic key
                this._fieldMap = {};        // realId -> genericKey
                this._fieldMapReverse = {}; // genericKey -> realId
                genericDimKeys.forEach(gk => {
                    const realId = (dimMeta[gk] && dimMeta[gk].id) ? dimMeta[gk].id : gk;
                    this._fieldMap[realId] = gk;
                    this._fieldMapReverse[gk] = realId;
                });
                genericMsrKeys.forEach(gk => {
                    const realId = (msrMeta[gk] && msrMeta[gk].id) ? msrMeta[gk].id : gk;
                    this._fieldMap[realId] = gk;
                    this._fieldMapReverse[gk] = realId;
                });

                console.log('CheckboxTable field mapping:', this._fieldMap);

                // Build column descriptors with friendly labels
                const dimColumns = genericDimKeys.map(gk => {
                    const meta = dimMeta[gk] || {};
                    const realId = meta.id || gk;
                    return {
                        id: gk,
                        realId: realId,
                        isMeasure: false,
                        label: meta.description || meta.name || realId
                    };
                });
                const measureColumns = genericMsrKeys.map(gk => {
                    const meta = msrMeta[gk] || {};
                    const realId = meta.id || gk;
                    return {
                        id: gk,
                        realId: realId,
                        isMeasure: true,
                        label: meta.label || meta.description || meta.name || realId
                    };
                });
                this._columns = dimColumns.concat(measureColumns);

                // Build flat row objects keyed by REAL dimension/measure IDs
                // so that getSelectedFieldValue("SPACE_ID") works.
                this._rows = data.map(rec => {
                    const row = {};
                    genericDimKeys.forEach(gk => {
                        const realId = (dimMeta[gk] && dimMeta[gk].id) ? dimMeta[gk].id : gk;
                        const cell = rec[gk];
                        if (cell == null) {
                            row[realId] = '';
                        } else if (typeof cell === 'object') {
                            row[realId] = (cell.label !== undefined && cell.label !== null && cell.label !== '')
                                ? cell.label
                                : (cell.id !== undefined ? cell.id : '');
                        } else {
                            row[realId] = cell;
                        }
                    });
                    genericMsrKeys.forEach(gk => {
                        const realId = (msrMeta[gk] && msrMeta[gk].id) ? msrMeta[gk].id : gk;
                        const cell = rec[gk];
                        if (cell == null) {
                            row[realId] = '';
                        } else if (typeof cell === 'object') {
                            if (cell.formatted !== undefined && cell.formatted !== null && cell.formatted !== '') {
                                row[realId] = cell.formatted;
                            } else if (cell.raw !== undefined && cell.raw !== null) {
                                row[realId] = cell.raw;
                            } else {
                                row[realId] = '';
                            }
                        } else {
                            row[realId] = cell;
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

            const cols = this._columns.filter(c => !this._hiddenColumns.has(c.realId));
            const allSelected = this._selectedIndices.size === this._rows.length;

            const headerCells = cols.map(c =>
                `<th class="${c.isMeasure ? 'm-cell' : ''}">${this._esc(c.label)}</th>`
            ).join('');

            const bodyRows = this._rows.map((row, i) => {
                const checked  = this._selectedIndices.has(i) ? 'checked' : '';
                const rowClass = this._selectedIndices.has(i) ? 'row-selected' : '';
                const dataCells = cols.map(c => {
                    const key = c.realId || c.id;
                    return `<td class="${c.isMeasure ? 'm-cell' : ''}">${this._esc(row[key] !== undefined ? String(row[key]) : '')}</td>`;
                }).join('');
                return `<tr class="${rowClass}" data-index="${i}">
                            <td class="cb-cell"><input type="checkbox" data-index="${i}" ${checked}/></td>
                            ${dataCells}
                        </tr>`;
            }).join('');

            this.shadowRoot.innerHTML = `
                <style>
                    *, *::before, *::after { box-sizing: border-box; }
                    :host { display:block; width:100%; height:100%;
                            font-family:'72',Arial,sans-serif; font-size:13px;
                            overflow:hidden; }
                    .scroll-wrap { width:100%; height:100%; overflow:auto; }
                    table { width:100%; border-spacing:0; border-collapse:separate; }
                    thead th { background:#fff; color:#333;
                               position:sticky; top:0; z-index:2;
                               padding:10px 14px; text-align:left; font-weight:700;
                               white-space:nowrap; border-bottom:1px solid #000000;
                               border-right:1px solid #e5e5e5; font-size:12px;
                               text-transform:uppercase; letter-spacing:0.3px; }
                    thead th:last-child { border-right:none; }
                    thead th.cb-cell { border-right:1px solid #e5e5e5; }
                    td { padding:9px 14px; border-bottom:1px solid #eaeaea; color:#333;
                         background:#fff; border-right:1px solid #f0f0f0; font-size:13px; }
                    td:last-child { border-right:none; }
                    tbody tr:hover td { background:#e8f4ff; }
                    tbody tr.row-selected td { background:#d1e8ff; }
                    .cb-cell { width:36px; text-align:center; padding:8px 4px; }
                    .m-cell  { text-align:right; font-variant-numeric:tabular-nums; }
                    input[type=checkbox] { width:15px; height:15px; cursor:pointer; accent-color:#0070F2; }
                    .status-bar { position:sticky; bottom:0; z-index:2; background:#f5f5f5;
                                  border-top:1px solid #d9d9d9; padding:5px 12px;
                                  font-size:12px; color:#333; }
                    .status-count { font-weight:600; color:#0070F2; }
                </style>
                <div class="scroll-wrap">
                <table>
                    <thead>
                        <tr>
                            <th class="cb-cell"><input type="checkbox" id="chk-all" ${allSelected ? 'checked' : ''}/></th>
                            ${headerCells}
                        </tr>
                    </thead>
                    <tbody>${bodyRows}</tbody>
                </table>
                <div class="status-bar"><span class="status-count">${this._selectedIndices.size}</span> of ${this._rows.length} selected</div>
                </div>`;

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
            const chkAll = this.shadowRoot.querySelector('#chk-all');
            if (chkAll) {
                chkAll.checked = this._rows.length > 0 &&
                    this._selectedIndices.size === this._rows.length;
            }
            const count = this.shadowRoot.querySelector('.status-count');
            if (count) count.textContent = this._selectedIndices.size;
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
