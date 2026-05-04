class CheckboxTableWidget extends HTMLElement {

    constructor() {
        super();
        this._selectedIndices = new Set();
        this._data = [];
        this._columns = [];
        this._selectedDataArray = [];
        this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        this._render();
    }

    // ── Called by SAC when bound data source updates ──────────────────────────

    onResultChanged() {
        this.refreshData();
    }

    refreshData() {
        try {
            if (!this.dataBindings) {
                this._showMsg('dataBindings not available yet.');
                return;
            }
            var binding = this.dataBindings.getDataBinding('myDataSource');
            if (!binding) {
                this._showMsg('No binding named myDataSource.');
                return;
            }
            var dataSource = binding.getDataSource();
            if (!dataSource) {
                this._showMsg('No data source connected. Select a model in the Builder panel.');
                return;
            }
            var resultSet = dataSource.getResultSet();
            if (!resultSet) {
                this._showMsg('Result set is empty.');
                return;
            }

            // DEBUG: show available methods on resultSet
            var methods = [];
            for (var key in resultSet) {
                if (typeof resultSet[key] === 'function') methods.push(key);
            }
            this._showMsg('ResultSet methods: ' + methods.join(', '));
            return;
            var rows = [];
            var dimLabels = [];
            var labelsDone = false;

            for (var i = 0; i < rowCount; i++) {
                var members = resultSet.getTuple(i, 'dimensions');
                var row = {};
                if (!labelsDone) {
                    members.forEach(function(member) {
                        dimLabels.push(member.label || member.description || member.dimensionId);
                    });
                    labelsDone = true;
                }
                members.forEach(function(member) {
                    row[member.dimensionId] = member.id;
                });
                rows.push(row);
            }

            this._data    = rows;
            this._columns = dimLabels;
            this._selectedIndices.clear();
            this._selectedDataArray = [];
            this._render();

        } catch(e) {
            this._showMsg('Error: ' + e.message);
        }
    }

    // ── SAC methods ───────────────────────────────────────────────────────────

    getSelectedCount() {
        return this._selectedIndices.size;
    }

    getSelectedFieldValue(index, field) {
        if (!this._selectedDataArray || index >= this._selectedDataArray.length) return '';
        var row = this._selectedDataArray[index];
        return (row && row[field] !== undefined) ? String(row[field]) : '';
    }

    clearSelection() {
        this._selectedIndices.clear();
        this._selectedDataArray = [];
        this._render();
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    _render() {
        if (!this._data || this._data.length === 0) {
            this.shadowRoot.innerHTML = `
                <style>
                    p { font-family:'72',Arial,sans-serif; font-size:14px;
                        color:#888; padding:16px; margin:0; }
                </style>
                <p>No data. Bind a data source and add dimensions to the <strong>Dimensions</strong> feed.</p>`;
            return;
        }

        const cols = this._columns.length > 0
            ? this._columns
            : Object.keys(this._data[0]);

        const dataKeys = this._data.length > 0 ? Object.keys(this._data[0]) : cols;

        const allSelected = this._selectedIndices.size === this._data.length;

        const headerCells = cols.map(c => `<th>${this._esc(c)}</th>`).join('');

        const bodyRows = this._data.map((row, i) => {
            const checked   = this._selectedIndices.has(i) ? 'checked' : '';
            const rowClass  = this._selectedIndices.has(i) ? 'row-selected' : '';
            const dataCells = dataKeys.map(k =>
                `<td>${this._esc(row[k] !== undefined ? String(row[k]) : '')}</td>`
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
                table { width:100%; border-collapse:collapse; background:#fff; }
                thead tr { background:#0a6ed1; color:#fff; }
                th { padding:9px 12px; text-align:left; font-weight:600;
                     white-space:nowrap; border-right:1px solid rgba(255,255,255,0.2); }
                th:last-child { border-right:none; }
                td { padding:8px 12px; border-bottom:1px solid #e5e5e5; color:#333; }
                tbody tr:hover td { background:#f0f7ff; }
                tbody tr.row-selected td { background:#d1e8ff; }
                .cb-cell { width:36px; text-align:center; padding:8px 4px; }
                input[type=checkbox] { width:15px; height:15px; cursor:pointer; accent-color:#0a6ed1; }
                .badge { display:inline-block; margin:6px 0 2px 2px; padding:2px 8px;
                         background:#0a6ed1; color:#fff; border-radius:10px; font-size:11px; }
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
                this._data.forEach((_, i) => this._selectedIndices.add(i));
            } else {
                this._selectedIndices.clear();
            }
            this._render();
            this._fireEvent();
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
                this._fireEvent();
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
        if (chkAll) chkAll.checked =
            this._data.length > 0 && this._selectedIndices.size === this._data.length;
    }

    _fireEvent() {
        this._selectedDataArray = Array.from(this._selectedIndices)
            .sort(function(a, b) { return a - b; })
            .map(i => this._data[i]);
        this.dispatchEvent(new CustomEvent('onSelectionChanged', {
            detail: { selectedRows: JSON.stringify(Array.from(this._selectedIndices)) },
            bubbles: true,
            composed: true
        }));
    }

    _showMsg(msg) {
        this.shadowRoot.innerHTML = '<p style="padding:12px;font-family:Arial,sans-serif;font-size:12px;color:#555;">' + msg + '</p>';
    }

    _esc(str) {
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
}

customElements.define('custom-checkbox-table', CheckboxTableWidget);
