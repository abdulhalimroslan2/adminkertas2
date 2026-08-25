/**
 * Dedicated Admin Portal - Sistem Pemantauan & Kawalan Kod Lesen E-Book Shopee
 * Bersepadu dengan Supabase Cloud PostgreSQL Database
 */

class AdminPortalApp {
  constructor() {
    this.supabase = null;
    this.allKeys = [];
    this.filteredKeys = [];
    this.currentPage = 1;
    this.pageSize = 25;
    this.isAuthenticated = true; // Auto-active via PIN or preloaded
    this.init();
  }

  async init() {
    this.initSupabase();
    this.bindEvents();
    await this.fetchKeysFromCloud();
  }

  initSupabase() {
    if (window.supabase && ADMIN_CONFIG.supabase) {
      try {
        this.supabase = window.supabase.createClient(
          ADMIN_CONFIG.supabase.url,
          ADMIN_CONFIG.supabase.anonKey
        );
        console.log("Supabase Admin Client sedia.");
      } catch (e) {
        console.error("Ralat inisialisasi Supabase:", e);
      }
    }
  }

  bindEvents() {
    // Carian & Penapis
    const searchInput = document.getElementById("searchInput");
    const statusFilter = document.getElementById("statusFilter");
    const pageSizeSelect = document.getElementById("pageSizeSelect");

    if (searchInput) searchInput.addEventListener("input", () => this.handleFilter());
    if (statusFilter) statusFilter.addEventListener("change", () => this.handleFilter());
    if (pageSizeSelect) pageSizeSelect.addEventListener("change", (e) => {
      this.pageSize = parseInt(e.target.value) || 25;
      this.currentPage = 1;
      this.renderTable();
    });

    // Refresh Data
    const refreshBtn = document.getElementById("refreshBtn");
    if (refreshBtn) refreshBtn.addEventListener("click", () => this.fetchKeysFromCloud(true));

    // Modal Close
    document.querySelectorAll("[data-close-modal]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const modal = e.target.closest(".modal-backdrop");
        if (modal) modal.classList.remove("active");
      });
    });

    // Quick Assign Button
    const quickAssignBtn = document.getElementById("quickAssignBtn");
    if (quickAssignBtn) quickAssignBtn.addEventListener("click", () => this.openQuickAssignModal());

    // Bulk Generate Modal Open
    const openBulkModalBtn = document.getElementById("openBulkModalBtn");
    if (openBulkModalBtn) openBulkModalBtn.addEventListener("click", () => {
      const modal = document.getElementById("bulkModal");
      if (modal) modal.classList.add("active");
    });

    // Submit Bulk Generate
    const submitBulkBtn = document.getElementById("submitBulkBtn");
    if (submitBulkBtn) submitBulkBtn.addEventListener("click", () => this.handleBulkGenerate());

    // Form Quick Assign
    const quickAssignForm = document.getElementById("quickAssignForm");
    if (quickAssignForm) {
      quickAssignForm.addEventListener("submit", (e) => {
        e.preventDefault();
        this.submitQuickAssign();
      });
    }

    // Export CSV
    const exportCsvBtn = document.getElementById("exportCsvBtn");
    if (exportCsvBtn) exportCsvBtn.addEventListener("click", () => this.exportCsv());
  }

  // Tarik Data Terkini dari Supabase Cloud
  async fetchKeysFromCloud(showToast = false) {
    if (!this.supabase) return;

    try {
      const refreshBtn = document.getElementById("refreshBtn");
      if (refreshBtn) refreshBtn.classList.add("loading");

      const { data, error } = await this.supabase
        .from("license_keys")
        .select("*")
        .order("created_at", { ascending: true });

      if (error) throw error;

      this.allKeys = data || [];
      this.calculateStats();
      this.handleFilter();

      if (showToast) {
        this.showToast(`Data berjaya dikemaskini (${this.allKeys.length} kod lesen dimuatkan)`, "success");
      }
    } catch (err) {
      console.error("Ralat menarik data:", err);
      this.showToast("Gagal menyambung ke Supabase Cloud.", "error");
    } finally {
      const refreshBtn = document.getElementById("refreshBtn");
      if (refreshBtn) refreshBtn.classList.remove("loading");
    }
  }

  // Kira KPI Statistik
  calculateStats() {
    const total = this.allKeys.length;
    const available = this.allKeys.filter(k => k.downloads_left === 4 && k.status === 'active').length;
    const inUse = this.allKeys.filter(k => k.downloads_left >= 1 && k.downloads_left <= 3 && k.status === 'active').length;
    const exhausted = this.allKeys.filter(k => k.downloads_left <= 0 || k.status === 'exhausted').length;
    const disabled = this.allKeys.filter(k => k.status === 'disabled').length;
    const totalDownloads = this.allKeys.reduce((acc, k) => acc + (k.download_count || 0), 0);

    this.setText("statTotal", total);
    this.setText("statAvailable", available);
    this.setText("statInUse", inUse);
    this.setText("statExhausted", exhausted);
    this.setText("statTotalDownloads", totalDownloads);
  }

  setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
  }

  // Tapis & Carian
  handleFilter() {
    const searchVal = (document.getElementById("searchInput")?.value || "").trim().toUpperCase();
    const filterVal = document.getElementById("statusFilter")?.value || "all";

    let result = [...this.allKeys];

    // Status Filter
    if (filterVal === "available") {
      result = result.filter(k => k.downloads_left === 4 && k.status === 'active');
    } else if (filterVal === "in_use") {
      result = result.filter(k => k.downloads_left >= 1 && k.downloads_left <= 3 && k.status === 'active');
    } else if (filterVal === "exhausted") {
      result = result.filter(k => k.downloads_left <= 0 || k.status === 'exhausted');
    } else if (filterVal === "disabled") {
      result = result.filter(k => k.status === 'disabled');
    }

    // Search Query
    if (searchVal) {
      result = result.filter(k => 
        k.key.toUpperCase().includes(searchVal) ||
        (k.order_id && k.order_id.toUpperCase().includes(searchVal)) ||
        (k.customer_name && k.customer_name.toUpperCase().includes(searchVal))
      );
    }

    this.filteredKeys = result;
    this.currentPage = 1;
    this.renderTable();
  }

  // Render Data Table dengan Pagination
  renderTable() {
    const tbody = document.getElementById("keysTableBody");
    const countInfo = document.getElementById("tableCountInfo");
    const paginationEl = document.getElementById("paginationControls");

    if (!tbody) return;

    const totalFiltered = this.filteredKeys.length;
    const totalPages = Math.ceil(totalFiltered / this.pageSize) || 1;
    this.currentPage = Math.max(1, Math.min(this.currentPage, totalPages));

    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = Math.min(startIndex + this.pageSize, totalFiltered);
    const pagedData = this.filteredKeys.slice(startIndex, endIndex);

    if (countInfo) {
      countInfo.innerText = `Menunjukkan ${totalFiltered === 0 ? 0 : startIndex + 1} - ${endIndex} daripada ${totalFiltered} rekod`;
    }

    if (pagedData.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center; padding: 32px; color: var(--text-dim);">
            Tiada kod lesen ditemui bagi tapisan ini.
          </td>
        </tr>
      `;
      if (paginationEl) paginationEl.innerHTML = "";
      return;
    }

    tbody.innerHTML = pagedData.map((k, idx) => {
      const rowNum = startIndex + idx + 1;
      let badgeClass = "badge-green";
      let statusLabel = `Baki ${k.downloads_left}/${k.max_downloads || 2}`;

      if (k.status === 'disabled') {
        badgeClass = "badge-gray";
        statusLabel = "🚫 Dinyahaktif";
      } else if (k.downloads_left === 1) {
        badgeClass = "badge-amber";
        statusLabel = "⚡ Baki 1/2";
      } else if (k.downloads_left <= 0) {
        badgeClass = "badge-red";
        statusLabel = "❌ Habis (0/2)";
      }

      const dateStr = k.created_at ? new Date(k.created_at).toLocaleDateString("ms-MY", { day: "2-digit", month: "short", year: "numeric" }) : "-";

      return `
        <tr>
          <td style="color:var(--text-dim); font-size:0.75rem;">${rowNum}</td>
          <td>
            <div class="table-key-code">${k.key}</div>
            <div style="font-size:0.72rem; color:var(--text-dim); margin-top:2px;">
              ${k.last_download_at ? 'Muat turun akhir: ' + new Date(k.last_download_at).toLocaleString("ms-MY", { dateStyle: "short", timeStyle: "short" }) : 'Belum dimuat turun'}
            </div>
          </td>
          <td>
            <div style="font-weight:600; color:#fff;">${k.order_id || 'Stok Shopee'}</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">${k.customer_name || 'Pelanggan Shopee'}</div>
          </td>
          <td>
            <span class="badge ${badgeClass}">${statusLabel}</span>
          </td>
          <td style="font-size:0.75rem; color:var(--text-muted);">${dateStr}</td>
          <td>
            <div class="action-btn-group">
              <button class="btn btn-primary btn-sm" onclick="window.adminApp.copyShopeeMessageForKey('${k.key}', '${k.order_id || ''}', '${k.customer_name || ''}')" title="Salin Mesej Shopee Chat">
                💬 Shopee
              </button>
              <button class="btn btn-secondary btn-sm" onclick="window.adminApp.copyDirectLink('${k.key}')" title="Salin Link Direct Penebusan">
                🔗 Link
              </button>
              <button class="btn btn-secondary btn-sm" onclick="window.adminApp.topUpKey('${k.key}')" title="Tambah +1 Had Download">
                ➕ +1
              </button>
              <button class="btn btn-secondary btn-sm" onclick="window.adminApp.resetKey('${k.key}')" title="Reset Penuh ke 2 Kuota">
                🔄 Reset
              </button>
              <button class="btn btn-secondary btn-sm" onclick="window.adminApp.toggleDisableKey('${k.key}', '${k.status}')" title="Nyahaktifkan / Aktifkan">
                ${k.status === 'disabled' ? '✅ Aktif' : '🚫 Sekat'}
              </button>
              <button class="btn btn-danger btn-sm" onclick="window.adminApp.deleteKey('${k.key}')" title="Padam Rekod">
                🗑️
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    this.renderPagination(totalPages);
  }

  renderPagination(totalPages) {
    const el = document.getElementById("paginationControls");
    if (!el) return;

    if (totalPages <= 1) {
      el.innerHTML = "";
      return;
    }

    let html = `
      <button class="btn btn-secondary btn-sm" ${this.currentPage === 1 ? 'disabled' : ''} onclick="window.adminApp.goToPage(${this.currentPage - 1})">◀ Sebelumnya</button>
      <span style="font-size:0.8rem; align-self:center; color:var(--text-muted);">Muka ${this.currentPage} / ${totalPages}</span>
      <button class="btn btn-secondary btn-sm" ${this.currentPage === totalPages ? 'disabled' : ''} onclick="window.adminApp.goToPage(${this.currentPage + 1})">Seterusnya ▶</button>
    `;
    el.innerHTML = html;
  }

  goToPage(page) {
    this.currentPage = page;
    this.renderTable();
  }

  // ==========================================================
  // OPERASI KAWALAN & AKSI
  // ==========================================================

  // 1. Salin Pautan Direct
  copyDirectLink(key) {
    const link = `${ADMIN_CONFIG.portalUrl}?key=${key}`;
    navigator.clipboard.writeText(link).then(() => {
      this.showToast(`Pautan ${key} telah disalin ke clipboard!`, "success");
    });
  }

  // 2. Salin Mesej Shopee Lengkap
  copyShopeeMessageForKey(key, orderId = "", customerName = "") {
    const link = `${ADMIN_CONFIG.portalUrl}?key=${key}`;
    const nameStr = customerName && customerName !== 'Pelanggan Shopee' && customerName !== 'Stok Shopee' ? `kepada ${customerName} ` : '';

    const message = 
`Salam sejahtera ${nameStr}& Terima kasih atas pembelian di Shopee kami! ⭐⭐⭐⭐⭐

Berikut adalah pautan & Kod Lesen untuk memuat turun E-Book Fizik Percubaan SPM 2026 anda:

🔗 Pautan Muat Turun: ${link}
🔑 Kod Lesen Anda: ${key}
📦 Kandungan E-Book:
1. E-Book Soalan Kertas 2 Topikal Percubaan 2026 (PDF HD)
2. Skema & Panduan Jawapan Lengkap + Tip Skor A+ (PDF HD)

⚠️ PENTING:
- Kod lesen ini diberikan 4 KALI MUAT TURUN (cth: 2x Versi Soalan + 2x Versi Skema) bagi kemudahan anda.
- Sila terus simpan fail PDF ke peranti anda (Google Drive / Files / Storan Peranti) setelah selesai muat turun.

Selamat mengulang kaji dan semoga beroleh keputusan A+ Cemerlang dalam SPM Fizik 2026! 🎯`;

    navigator.clipboard.writeText(message).then(() => {
      this.showToast(`Mesej Shopee untuk ${key} telah disalin! Sedia untuk paste di Shopee Chat.`, "success");
    });
  }

  // 3. Tambah +1 Kuota
  async topUpKey(key) {
    if (!this.supabase) return;
    try {
      const record = this.allKeys.find(k => k.key === key);
      const newLeft = (record ? record.downloads_left : 1) + 1;

      const { error } = await this.supabase
        .from("license_keys")
        .update({ downloads_left: newLeft, status: "active" })
        .eq("key", key);

      if (error) throw error;

      this.showToast(`Kuota ${key} berjaya ditambah (+1). Baki kini: ${newLeft}`, "success");
      await this.fetchKeysFromCloud();
    } catch (e) {
      this.showToast(`Ralat menambah kuota: ${e.message}`, "error");
    }
  }

  // 4. Reset Penuh ke 4 Kuota
  async resetKey(key) {
    if (!confirm(`Reset kuota kod ${key} kembali kepada 4 kali muat turun?`)) return;
    if (!this.supabase) return;

    try {
      const { error } = await this.supabase
        .from("license_keys")
        .update({ downloads_left: 4, download_count: 0, status: "active" })
        .eq("key", key);

      if (error) throw error;

      this.showToast(`Kod ${key} berjaya di-reset penuh (4/4)!`, "success");
      await this.fetchKeysFromCloud();
    } catch (e) {
      this.showToast(`Ralat reset: ${e.message}`, "error");
    }
  }

  // 5. Toggle Disable / Aktif
  async toggleDisableKey(key, currentStatus) {
    if (!this.supabase) return;
    const newStatus = currentStatus === 'disabled' ? 'active' : 'disabled';
    const actionName = newStatus === 'disabled' ? 'disekat' : 'diaktifkan';

    try {
      const { error } = await this.supabase
        .from("license_keys")
        .update({ status: newStatus })
        .eq("key", key);

      if (error) throw error;

      this.showToast(`Kod ${key} telah ${actionName}!`, "success");
      await this.fetchKeysFromCloud();
    } catch (e) {
      this.showToast(`Ralat kemaskini status: ${e.message}`, "error");
    }
  }

  // 6. Padam Rekod Kunci
  async deleteKey(key) {
    if (!confirm(`AMARAN:\nAdakah anda pasti ingin memadamkan Kod Lesen ${key} daripada pangkalan data?`)) return;
    if (!this.supabase) return;

    try {
      const { error } = await this.supabase
        .from("license_keys")
        .delete()
        .eq("key", key);

      if (error) throw error;

      this.showToast(`Kod ${key} telah dipadamkan.`, "warning");
      await this.fetchKeysFromCloud();
    } catch (e) {
      this.showToast(`Ralat memadam kod: ${e.message}`, "error");
    }
  }

  // ==========================================================
  // QUICK SHOPEE ASSIGN ASSISTANT (Ambil 1 Kod Baru)
  // ==========================================================
  openQuickAssignModal() {
    const availableKey = this.allKeys.find(k => k.downloads_left === 4 && k.status === 'active') || this.allKeys.find(k => k.downloads_left > 0 && k.status === 'active');
    if (!availableKey) {
      this.showToast("Tiada stok kod belum guna. Sila jana kod tambahan.", "error");
      return;
    }

    const modal = document.getElementById("quickAssignModal");
    const keyInput = document.getElementById("qaKeyCode");
    const orderInput = document.getElementById("qaOrderId");
    const buyerInput = document.getElementById("qaBuyerName");

    if (keyInput) keyInput.value = availableKey.key;
    if (orderInput) orderInput.value = "";
    if (buyerInput) buyerInput.value = "";

    if (modal) modal.classList.add("active");
  }

  async submitQuickAssign() {
    const key = document.getElementById("qaKeyCode")?.value;
    const orderId = document.getElementById("qaOrderId")?.value.trim() || "Shopee Order";
    const buyerName = document.getElementById("qaBuyerName")?.value.trim() || "Pelanggan Shopee";

    if (!key) return;

    try {
      const { error } = await this.supabase
        .from("license_keys")
        .update({
          order_id: orderId,
          customer_name: buyerName
        })
        .eq("key", key);

      if (error) throw error;

      // Salin Mesej Terus
      this.copyShopeeMessageForKey(key, orderId, buyerName);

      const modal = document.getElementById("quickAssignModal");
      if (modal) modal.classList.remove("active");

      await this.fetchKeysFromCloud();
    } catch (e) {
      this.showToast(`Ralat menetapkan pesanan: ${e.message}`, "error");
    }
  }

  // ==========================================================
  // BULK GENERATOR (Jana Kunci Tambahan)
  // ==========================================================
  async handleBulkGenerate() {
    const countInput = document.getElementById("bulkCount");
    const prefixInput = document.getElementById("bulkPrefix");

    const count = Math.min(Math.max(parseInt(countInput?.value || 10) || 10, 1), 100);
    const prefix = (prefixInput?.value || "FZ26").trim().toUpperCase();

    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const newRecords = [];

    for (let i = 0; i < count; i++) {
      const p1 = Array.from({ length: 4 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join("");
      const p2 = Array.from({ length: 4 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join("");
      const generatedKey = `${prefix}-${p1}-${p2}`;

      newRecords.push({
        key: generatedKey,
        order_id: `Stok Tambahan`,
        customer_name: `Stok Shopee`,
        downloads_left: 4,
        max_downloads: 4,
        download_count: 0,
        status: 'active'
      });
    }

    try {
      const { error } = await this.supabase.from("license_keys").insert(newRecords);
      if (error) throw error;

      this.showToast(`Berjaya menambah ${count} kod lesen baharu ke Cloud!`, "success");
      const modal = document.getElementById("bulkModal");
      if (modal) modal.classList.remove("active");

      await this.fetchKeysFromCloud();
    } catch (e) {
      this.showToast(`Ralat jana pukal: ${e.message}`, "error");
    }
  }

  // ==========================================================
  // EXPORT CSV
  // ==========================================================
  exportCsv() {
    if (this.allKeys.length === 0) {
      this.showToast("Tiada data untuk dieksport.", "error");
      return;
    }

    let csv = "No,Kod_Lesen,Order_ID,Nama_Pembeli,Baki_Download,Jumlah_Download,Status,Tarikh_Cipta,Tarikh_Download_Akhir\n";
    this.allKeys.forEach((k, i) => {
      csv += `${i + 1},"${k.key}","${k.order_id || ''}","${k.customer_name || ''}",${k.downloads_left},${k.download_count || 0},"${k.status}","${k.created_at || ''}","${k.last_download_at || ''}"\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `laporan-lesen-shopee-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast("Laporan CSV berjaya dimuat turun.", "success");
  }

  // Toast System
  showToast(message, type = "success") {
    const container = document.getElementById("toastContainer") || this.createToastContainer();
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    
    let icon = "✅";
    if (type === "error") icon = "❌";
    if (type === "warning") icon = "⚠️";

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(40px)";
      toast.style.transition = "all 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  createToastContainer() {
    const container = document.createElement("div");
    container.id = "toastContainer";
    container.className = "toast-container";
    document.body.appendChild(container);
    return container;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.adminApp = new AdminPortalApp();
});
