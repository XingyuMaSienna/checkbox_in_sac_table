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

    // ── SAC property setters ──────────────────────────────────────────────────

    set tableData(value) {
        try {
            this._data = typeof value === 'string' ? JSON.parse(value) : (value || []);
        } catch (e) {
            this._data = [];
        }
        this._selectedIndices.clear();
        this._render();
    }

    set columns(value) {
        if (typeof value === 'string' && value.trim() !== '') {
            this._columns = value.split(',').map(c => c.trim());
        } else if (Array.isArray(value)) {
            this._columns = value;
        } else {
            this._columns = [];
        }
        this._render();
    }

    // ── SAC methods ───────────────────────────────────────────────────────────

    getSelectedRows() {
        return JSON.stringify(Array.from(this._selectedIndices));
    }

    getSelectedData() {
        const rows = Array.from(this._selectedIndices).map(i => this._data[i]);
        return JSON.stringify(rows);
    }

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

    _cols() {
        return this._columns.length > 0
            ? this._columns
            : (this._data.length > 0 ? Object.keys(this._data[0]) : []);
    }

    _render() {
        if (!this._data || this._data.length === 0) {
            this.shadowRoot.innerHTML = `
                <style>
                    p { font-family: '72', Arial, sans-serif; font-size: 14px;
                        color: #888; padding: 16px; margin: 0; }
                </style>
                <p>No data. Set the <strong>tableData</strong> property.</p>`;
            return;
        }

        const cols = this._cols();
        const allSelected = this._data.length > 0 &&
            this._selectedIndices.size === this._data.length;

        const headerCells = cols.map(c =>
            `<th>${this._esc(c)}</th>`
        ).join('');

        const bodyRows = this._data.map((row, i) => {
            const checked    = this._selectedIndices.has(i) ? 'checked' : '';
            const rowClass   = this._selectedIndices.has(i) ? 'row-selected' : '';
            const dataCells  = cols.map(c =>
                `<td>${this._esc(row[c] !== undefined ? String(row[c]) : '')}</td>`
            ).join('');
            return `<tr class="${rowClass}" data-index="${i}">
                        <td class="cb-cell">
                            <input type="checkbox" data-index="${i}" ${checked}/>
                        </td>
                        ${dataCells}
                    </tr>`;
        }).join('');

        this.shadowRoot.innerHTML = `
            <style>
                *, *::before, *::after { box-sizing: border-box; }
                :host {
                    display: block;
                    width: 100%;
                    height: 100%;
                    overflow: auto;
                    font-family: '72', Arial, sans-serif;
                    font-size: 13px;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    background: #fff;
                }
                thead tr {
                    background: #0a6ed1;
                    color: #fff;
                }
                th {
                    padding: 9px 12px;
                    text-align: left;
                    font-weight: 600;
                    white-space: nowrap;
                    border-right: 1px solid rgba(255,255,255,0.2);
                }
                th:last-child { border-right: none; }
                td {
                    padding: 8px 12px;
                    border-bottom: 1px solid #e5e5e5;
                    color: #333;
                }
                tbody tr:hover td  { background: #f0f7ff; }
                tbody tr.row-selected td { background: #d1e8ff; }
                .cb-cell {
                    width: 36px;
                    text-align: center;
                    padding: 8px 4px;
                }
                input[type=checkbox] {
                    width: 15px;
                    height: 15px;
                    cursor: pointer;
                    accent-color: #0a6ed1;
                }
                .badge {
                    display: inline-block;
                    margin: 6px 0 2px 2px;
                    padding: 2px 8px;
                    background: #0a6ed1;
                    color: #fff;
                    border-radius: 10px;
                    font-size: 11px;
                }
            </style>

            <span class="badge">${this._selectedIndices.size} selected</span>

            <table>
                <thead>
                    <tr>
                        <th class="cb-cell">
                            <input type="checkbox" id="chk-all"
                                   ${allSelected ? 'checked' : ''}/>
                        </th>
                        ${headerCells}
                    </tr>
                </thead>
                <tbody>
                    ${bodyRows}
                </tbody>
            </table>`;

        // Select-all handler
        const chkAll = this.shadowRoot.querySelector('#chk-all');
        chkAll.addEventListener('change', (e) => {
            if (e.target.checked) {
                this._data.forEach((_, i) => this._selectedIndices.add(i));
            } else {
                this._selectedIndices.clear();
            }
            this._render();
            this._fireEvent();
        });

        // Per-row checkbox handlers
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
        // Update row highlight classes without full re-render
        this.shadowRoot.querySelectorAll('tbody tr').forEach(tr => {
            const idx = parseInt(tr.dataset.index, 10);
            tr.classList.toggle('row-selected', this._selectedIndices.has(idx));
        });
        const badge = this.shadowRoot.querySelector('.badge');
        if (badge) badge.textContent = `${this._selectedIndices.size} selected`;

        const chkAll = this.shadowRoot.querySelector('#chk-all');
        if (chkAll) {
            chkAll.checked =
                this._data.length > 0 &&
                this._selectedIndices.size === this._data.length;
        }
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

    _esc(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}

customElements.define('custom-checkbox-table', CheckboxTableWidget);
