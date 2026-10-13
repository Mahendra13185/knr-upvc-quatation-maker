import { useEffect, useState } from "react";
import Dexie, { type Table } from "dexie";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  Plus, Trash2, Copy, FileDown, Save, Search,
  Settings, Home, FileText, Users, Calculator, RotateCcw
} from "lucide-react";

type WindowItem = {
  id: string;
  type: string;
  width: number;
  height: number;
  unit: "ft" | "mm";
  quantity: number;
  profile: string;
  profileRate: number;
  glass: string;
  glassRate: number;
  hardware: string;
  hardwareCost: number;
  labourRate: number;
  notes: string;
};

type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
};

type Quote = {
  id: string;
  number: string;
  date: string;
  customer: Customer;
  items: WindowItem[];
  discount: number;
  discountType: "amount" | "percent";
  gstRate: number;
  gstMode: "local" | "interstate" | "none";
  total: number;
  status: string;
  notes: string;
};

type Rate = { name: string; rate: number };

type SettingsData = {
  company: string;
  phone: string;
  email: string;
  address: string;
  gstin: string;
  prefix: string;
  nextNumber: number;
  defaultGst: number;
  profiles: Rate[];
  glasses: Rate[];
  hardware: Rate[];
};

class KNRDatabase extends Dexie {
  quotations!: Table<Quote, string>;
  customers!: Table<Customer, string>;

  constructor() {
    super("KNRUPVCDB");
    this.version(1).stores({
      quotations: "id, number, date, status",
      customers: "id, name, phone",
    });
  }
}

const db = new KNRDatabase();

const defaultSettings: SettingsData = {
  company: "KNR UPVC WINDOWS & DOORS",
  phone: "",
  email: "",
  address: "",
  gstin: "",
  prefix: "KNR",
  nextNumber: 1,
  defaultGst: 18,
  profiles: [
    { name: "80 Series - Heavy", rate: 350 },
    { name: "80 Series - Light", rate: 350 },
    { name: "90 Series - Heavy", rate: 550 },
    { name: "90 Series - Light", rate: 450 },
  ],
  glasses: [
    { name: "5mm Clear Glass", rate: 0 },
    { name: "6mm Toughened", rate: 0 },
  ],
  hardware: [
    { name: "Standard Hardware", rate: 0 },
    { name: "Premium Hardware", rate: 0 },
  ],
};

function createItem(settings: SettingsData): WindowItem {
  const profile = settings.profiles[0];
  const glass = settings.glasses[0];
  const hardware = settings.hardware[0];

  return {
    id: crypto.randomUUID(),
    type: "Sliding Window",
    width: 4,
    height: 5,
    unit: "ft",
    quantity: 1,
    profile: profile?.name ?? "80 Series - Heavy",
    profileRate: profile?.rate ?? 0,
    glass: glass?.name ?? "5mm Clear Glass",
    glassRate: glass?.rate ?? 0,
    hardware: hardware?.name ?? "Standard Hardware",
    hardwareCost: hardware?.rate ?? 0,
    labourRate: 0,
    notes: "",
  };
}

function createCustomer(): Customer {
  return { id: crypto.randomUUID(), name: "", phone: "", email: "", address: "" };
}

function area(item: WindowItem): number {
  const value =
    Math.max(0, item.width) *
    Math.max(0, item.height) *
    Math.max(0, item.quantity);
  return item.unit === "mm" ? value / 92903.04 : value;
}

function itemPrice(item: WindowItem): number {
  return (
    area(item) *
      (Math.max(0, item.profileRate) +
        Math.max(0, item.glassRate) +
        Math.max(0, item.labourRate)) +
    Math.max(0, item.hardwareCost) * Math.max(0, item.quantity)
  );
}

// Use ASCII "Rs." in PDF output to avoid glyph/spacing problems with the rupee symbol.
function money(value: number): string {
  return "Rs. " + Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  });
}

export default function App() {
  const [page, setPage] = useState<"home" | "quotes" | "customers" | "settings">("home");
  const [items, setItems] = useState<WindowItem[]>([]);
  const [customer, setCustomer] = useState<Customer>(createCustomer());
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState<"amount" | "percent">("amount");
  const [gstRate, setGstRate] = useState(18);
  const [gstMode, setGstMode] = useState<"local" | "interstate" | "none">("local");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState("Draft");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");

  const [settings, setSettings] = useState<SettingsData>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("knr-settings") || "{}");
      return { ...defaultSettings, ...saved };
    } catch {
      return defaultSettings;
    }
  });

  useEffect(() => {
    setItems([createItem(settings)]);
    setGstRate(settings.defaultGst);
  }, []);

  useEffect(() => {
    localStorage.setItem("knr-settings", JSON.stringify(settings));
  }, [settings]);

  // Keep the active quotation in sync when a user edits prices in Settings.
  // Saved quotations retain their own rate snapshots.
  useEffect(() => {
    setItems((current) => current.map((item) => ({
      ...item,
      profileRate: settings.profiles.find((p) => p.name === item.profile)?.rate ?? item.profileRate,
      glassRate: settings.glasses.find((g) => g.name === item.glass)?.rate ?? item.glassRate,
      hardwareCost: settings.hardware.find((h) => h.name === item.hardware)?.rate ?? item.hardwareCost,
    })));
  }, [settings.profiles, settings.glasses, settings.hardware]);

  useEffect(() => {
    void refreshData();
  }, []);

  async function refreshData() {
    setQuotes((await db.quotations.toArray()).sort((a, b) => b.date.localeCompare(a.date)));
    setCustomers((await db.customers.toArray()).sort((a, b) => a.name.localeCompare(b.name)));
  }

  const subtotal = items.reduce((sum, item) => sum + itemPrice(item), 0);
  const safeDiscount = Math.max(0, discount);
  const discountAmount = Math.min(
    subtotal,
    discountType === "percent"
      ? subtotal * Math.min(100, safeDiscount) / 100
      : safeDiscount
  );
  const taxable = Math.max(0, subtotal - discountAmount);
  const safeGstRate = Math.min(100, Math.max(0, gstRate));
  const gst = gstMode === "none" ? 0 : taxable * safeGstRate / 100;
  const grandTotal = taxable + gst;

  function updateItem(id: string, field: keyof WindowItem, value: string | number) {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, [field]: value };
        if (field === "profile") updated.profileRate = settings.profiles.find((p) => p.name === value)?.rate ?? 0;
        if (field === "glass") updated.glassRate = settings.glasses.find((g) => g.name === value)?.rate ?? 0;
        if (field === "hardware") updated.hardwareCost = settings.hardware.find((h) => h.name === value)?.rate ?? 0;
        return updated;
      })
    );
  }

  function addItem(type = "Sliding Window") {
    const item = createItem(settings);
    item.type = type;
    setItems((current) => [...current, item]);
  }

  function duplicateItem(item: WindowItem) {
    setItems((current) => [...current, { ...item, id: crypto.randomUUID() }]);
  }

  function deleteItem(id: string) {
    if (items.length <= 1) {
      setNotice("Keep at least one item in the quotation.");
      return;
    }
    if (confirm("Delete this window or door?")) {
      setItems((current) => current.filter((item) => item.id !== id));
    }
  }

  function resetForm() {
    setItems([createItem(settings)]);
    setCustomer(createCustomer());
    setEditingId(null);
    setDiscount(0);
    setDiscountType("amount");
    setGstRate(settings.defaultGst);
    setGstMode("local");
    setDate(new Date().toISOString().slice(0, 10));
    setStatus("Draft");
    setNotes("");
  }

  async function saveQuote() {
    if (!customer.name.trim()) {
      setNotice("Please enter the customer name.");
      return;
    }
    if (!items.length || items.some((item) =>
      !Number.isFinite(item.width) || !Number.isFinite(item.height) ||
      item.width <= 0 || item.height <= 0 ||
      !Number.isInteger(item.quantity) || item.quantity < 1
    )) {
      setNotice("Enter valid positive measurements and whole-number quantities.");
      return;
    }

    const oldQuote = editingId ? await db.quotations.get(editingId) : undefined;
    const id = editingId ?? crypto.randomUUID();
    const number = oldQuote?.number ??
      `${settings.prefix}-${new Date().getFullYear()}-${String(settings.nextNumber).padStart(4, "0")}`;
    const savedCustomer = { ...customer, id: customer.id || crypto.randomUUID() };

    const quote: Quote = {
      id, number, date, customer: savedCustomer,
      items: items.map((item) => ({ ...item })),
      discount, discountType, gstRate: safeGstRate, gstMode,
      total: grandTotal, status, notes,
    };

    await db.quotations.put(quote);
    await db.customers.put(savedCustomer);
    if (!oldQuote) setSettings((s) => ({ ...s, nextNumber: s.nextNumber + 1 }));
    await refreshData();
    setNotice(`Saved quotation ${number}`);
    setEditingId(null);
    setPage("quotes");
  }

  function editQuote(quote: Quote) {
    setEditingId(quote.id);
    setCustomer({ ...quote.customer });
    setItems(quote.items.map((item) => ({ ...item })));
    setDiscount(quote.discount);
    setDiscountType(quote.discountType);
    setGstRate(quote.gstRate);
    setGstMode(quote.gstMode);
    setDate(quote.date);
    setStatus(quote.status);
    setNotes(quote.notes || "");
    setPage("home");
  }

  function duplicateQuote(quote: Quote) {
    setEditingId(null);
    setCustomer({ ...quote.customer, id: crypto.randomUUID() });
    setItems(quote.items.map((item) => ({ ...item, id: crypto.randomUUID() })));
    setDiscount(quote.discount);
    setDiscountType(quote.discountType);
    setGstRate(quote.gstRate);
    setGstMode(quote.gstMode);
    setDate(new Date().toISOString().slice(0, 10));
    setStatus("Draft");
    setNotes(quote.notes || "");
    setPage("home");
    setNotice("Duplicate ready. Save it to create a new quotation.");
  }

  async function removeQuote(quote: Quote) {
    if (!confirm(`Delete ${quote.number}?`)) return;
    await db.quotations.delete(quote.id);
    await refreshData();
    setNotice("Quotation deleted.");
  }

  function downloadPDF(quote: Quote) {
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 14;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(17);
    pdf.text(settings.company || "KNR UPVC WINDOWS & DOORS", margin, 18);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    if (settings.address) {
      pdf.text(pdf.splitTextToSize(settings.address, pageWidth - margin * 2), margin, 25);
    }
    pdf.text(
      `Phone: ${settings.phone || "-"}  |  Email: ${settings.email || "-"}  |  GSTIN: ${settings.gstin || "-"}`,
      margin, 34
    );

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.text("QUOTATION", margin, 45);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    pdf.text(`Quotation: ${quote.number}`, margin, 53);
    pdf.text(`Date: ${quote.date}`, pageWidth - margin, 53, { align: "right" });
    pdf.text(`Customer: ${quote.customer.name}`, margin, 61);
    pdf.text(`Mobile: ${quote.customer.phone || "-"}`, margin, 67);
    const addressLines = pdf.splitTextToSize(`Address: ${quote.customer.address || "-"}`, pageWidth - margin * 2);
    pdf.text(addressLines, margin, 73);
    const tableStart = 73 + addressLines.length * 4.5 + 3;

    autoTable(pdf, {
      startY: tableStart,
      margin: { left: margin, right: margin },
      head: [["No.", "Type", "Width", "Height", "Qty", "Area sq.ft", "Profile", "Glass", "Amount"]],
      body: quote.items.map((item, index) => [
        String(index + 1),
        item.type,
        `${item.width} ${item.unit}`,
        `${item.height} ${item.unit}`,
        String(item.quantity),
        area(item).toFixed(2),
        item.profile,
        item.glass,
        money(itemPrice(item)),
      ]),
      styles: {
        font: "helvetica",
        fontSize: 7,
        cellPadding: 2,
        overflow: "linebreak",
        fontStyle: "normal",
        textColor: [30, 40, 55],
      },
      headStyles: {
        fillColor: [23, 75, 150],
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
      columnStyles: {
        0: { cellWidth: 8, halign: "center" },
        1: { cellWidth: 25 },
        2: { cellWidth: 15 },
        3: { cellWidth: 15 },
        4: { cellWidth: 9, halign: "right" },
        5: { cellWidth: 16, halign: "right" },
        6: { cellWidth: 24 },
        7: { cellWidth: 23 },
        8: { cellWidth: "auto", halign: "right" },
      },
    });

    const tableEnd = (pdf as any).lastAutoTable?.finalY ?? tableStart + 20;
    const sub = quote.items.reduce((sum, item) => sum + itemPrice(item), 0);
    const disc = Math.min(sub, quote.discountType === "percent" ? sub * quote.discount / 100 : quote.discount);
    const taxableAmount = Math.max(0, sub - disc);
    const tax = quote.gstMode === "none" ? 0 : taxableAmount * quote.gstRate / 100;

    autoTable(pdf, {
      startY: tableEnd + 6,
      margin: { left: pageWidth - 93, right: margin },
      tableWidth: 79,
      body: [
        ["Subtotal", money(sub)],
        ["Discount", money(disc)],
        [quote.gstMode === "local" ? `CGST (${quote.gstRate / 2}%)` : quote.gstMode === "interstate" ? `IGST (${quote.gstRate}%)` : "GST", money(quote.gstMode === "local" ? tax / 2 : tax)],
        ...(quote.gstMode === "local" ? [[`SGST (${quote.gstRate / 2}%)`, money(tax / 2)]] : []),
        ["GRAND TOTAL", money(quote.total)],
      ],
      theme: "plain",
      styles: {
        font: "helvetica",
        fontSize: 9,
        cellPadding: { top: 2.5, right: 2, bottom: 2.5, left: 2 },
        fontStyle: "normal",
        overflow: "visible",
      },
      columnStyles: {
        0: { cellWidth: 39, halign: "left" },
        1: { cellWidth: 40, halign: "right" },
      },
      didParseCell(data) {
        if (data.row.index === data.table.body.length - 1) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.textColor = [23, 75, 150];
        }
      },
    });

    const totalsEnd = (pdf as any).lastAutoTable?.finalY ?? tableEnd + 35;
    let footerY = totalsEnd + 8;
    if (footerY > 245) {
      pdf.addPage();
      footerY = 20;
    }

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(`Amount in words: ${Math.round(quote.total).toLocaleString("en-IN")} rupees only`, margin, footerY);
    pdf.text("Terms: Final measurements should be verified before manufacturing.", margin, footerY + 8);
    pdf.text("Customer signature: __________________", margin, footerY + 25);
    pdf.text("For KNR UPVC: __________________", pageWidth - margin, footerY + 25, { align: "right" });

    pdf.save(`${quote.number}.pdf`);
  }

  function exportBackup() {
    const blob = new Blob(
      [JSON.stringify({ quotes, customers, settings }, null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "knr-upvc-backup.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importBackup(file?: File) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.quotes) || !Array.isArray(data.customers)) throw new Error("Invalid backup");
      if (!confirm("Import and merge this backup?")) return;
      await db.quotations.bulkPut(data.quotes);
      await db.customers.bulkPut(data.customers);
      if (data.settings) setSettings({ ...defaultSettings, ...data.settings });
      await refreshData();
      setNotice("Backup imported successfully.");
    } catch {
      setNotice("Invalid backup file.");
    }
  }

  const navigation = [
    { id: "home" as const, label: "New Quote", icon: Home },
    { id: "quotes" as const, label: "Quotations", icon: FileText },
    { id: "customers" as const, label: "Customers", icon: Users },
    { id: "settings" as const, label: "Settings", icon: Settings },
  ];

  const filteredQuotes = quotes.filter((quote) =>
    `${quote.number} ${quote.customer.name} ${quote.customer.phone}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">K</div>
          <div><b>KNR UPVC</b><small>Windows & Doors</small></div>
        </div>
        <nav>
          {navigation.map((nav) => {
            const Icon = nav.icon;
            return (
              <button key={nav.id} className={page === nav.id ? "nav active" : "nav"} onClick={() => setPage(nav.id)}>
                <Icon size={18} />{nav.label}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-foot">Quotation Maker<br/><small>Local-first workspace</small></div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div><span className="eyebrow">KNR UPVC / WORKSPACE</span><h1>{page === "home" ? editingId ? "Edit quotation" : "New quotation" : navigation.find((n) => n.id === page)?.label}</h1></div>
          <button className="button ghost" onClick={resetForm}><Plus size={16}/> New</button>
        </header>

        {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")}>×</button></div>}

        {page === "home" && (
          <div className="workspace">
            <section className="panel">
              <div className="section-title"><div><h2>Customer details</h2><p>Who is this quotation for?</p></div><Users size={20}/></div>
              {customers.length > 0 && <label>Choose existing customer
                <select value={customer.id} onChange={(e) => { const c = customers.find((x) => x.id === e.target.value); if (c) setCustomer({ ...c }); else setCustomer(createCustomer()); }}>
                  <option value="">New customer</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>)}
                </select>
              </label>}
              <div className="form-grid">
                <label>Customer name *<input value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} placeholder="Enter customer name"/></label>
                <label>Mobile number<input value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} placeholder="Mobile number"/></label>
                <label>Email<input value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} placeholder="Email address"/></label>
                <label>Quotation date<input type="date" value={date} onChange={(e) => setDate(e.target.value)}/></label>
                <label className="full">Site / billing address<textarea value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} placeholder="Customer address"/></label>
              </div>
            </section>

            <section className="panel">
              <div className="section-title"><div><h2>Windows & doors</h2><p>Add each different measurement as a separate item. Add, duplicate or delete items at any time.</p></div><Calculator size={20}/></div>
              <div className="item-stack">
                {items.map((item, index) => (
                  <article className="measure-card" key={item.id}>
                    <div className="measure-head">
                      <div><span className="number-chip">{String(index + 1).padStart(2, "0")}</span><div><h3>{item.type}</h3><small>{area(item).toFixed(2)} sq.ft total area</small></div></div>
                      <div className="icon-actions">
                        <button title="Duplicate item" className="icon-button" onClick={() => duplicateItem(item)}><Copy size={16}/></button>
                        <button title="Delete item" className="icon-button delete" onClick={() => deleteItem(item.id)}><Trash2 size={16}/></button>
                      </div>
                    </div>
                    <div className="form-grid">
                      <label className="full">Window / door type<select value={item.type} onChange={(e) => updateItem(item.id, "type", e.target.value)}>{["Sliding Window", "Fixed Window", "Casement Window", "Sliding Door", "Casement Door", "Ventilator", "Other"].map((type) => <option key={type}>{type}</option>)}</select></label>
                      <label>Width<input type="number" min="0.01" step="any" value={item.width} onChange={(e) => updateItem(item.id, "width", Number(e.target.value))}/></label>
                      <label>Height<input type="number" min="0.01" step="any" value={item.height} onChange={(e) => updateItem(item.id, "height", Number(e.target.value))}/></label>
                      <label>Unit<select value={item.unit} onChange={(e) => updateItem(item.id, "unit", e.target.value)}><option value="ft">Feet</option><option value="mm">Millimetres</option></select></label>
                      <label>Quantity<input type="number" min="1" step="1" value={item.quantity} onChange={(e) => updateItem(item.id, "quantity", Number(e.target.value))}/></label>
                      <label>UPVC profile<select value={item.profile} onChange={(e) => updateItem(item.id, "profile", e.target.value)}>{settings.profiles.map((p) => <option key={p.name} value={p.name}>{p.name} — {money(p.rate)}/sq.ft</option>)}</select></label>
                      <label>Glass<select value={item.glass} onChange={(e) => updateItem(item.id, "glass", e.target.value)}>{settings.glasses.map((g) => <option key={g.name} value={g.name}>{g.name} — {money(g.rate)}/sq.ft</option>)}</select></label>
                      <label>Hardware<select value={item.hardware} onChange={(e) => updateItem(item.id, "hardware", e.target.value)}>{settings.hardware.map((h) => <option key={h.name} value={h.name}>{h.name} — {money(h.rate)}/unit</option>)}</select></label>
                      <label>Labour (Rs./sq.ft)<input type="number" min="0" value={item.labourRate} onChange={(e) => updateItem(item.id, "labourRate", Number(e.target.value))}/></label>
                      <label className="full">Notes<input value={item.notes} onChange={(e) => updateItem(item.id, "notes", e.target.value)} placeholder="Optional item notes"/></label>
                    </div>
                    <div className="item-cost"><div><span>Rate breakdown</span><small>Profile + glass + labour + hardware</small></div><strong>{money(itemPrice(item))}</strong></div>
                  </article>
                ))}
              </div>
              <button className="button add-button" onClick={() => addItem()}><Plus size={17}/> Add another window / door</button>
            </section>

            <section className="panel">
              <div className="section-title"><div><h2>Discount & tax</h2><p>Configure this quotation's totals.</p></div><Calculator size={20}/></div>
              <div className="form-grid">
                <label>Discount type<select value={discountType} onChange={(e) => setDiscountType(e.target.value as "amount" | "percent")}><option value="amount">Fixed amount (Rs.)</option><option value="percent">Percentage (%)</option></select></label>
                <label>Discount value<input type="number" min="0" value={discount} onChange={(e) => setDiscount(Number(e.target.value))}/></label>
                <label>GST treatment<select value={gstMode} onChange={(e) => setGstMode(e.target.value as "local" | "interstate" | "none")}><option value="local">CGST + SGST</option><option value="interstate">IGST</option><option value="none">No GST</option></select></label>
                <label>GST rate (%)<input type="number" min="0" max="100" value={gstRate} onChange={(e) => setGstRate(Number(e.target.value))}/></label>
                <label>Status<select value={status} onChange={(e) => setStatus(e.target.value)}>{["Draft", "Final", "Sent", "Accepted", "Rejected"].map((s) => <option key={s}>{s}</option>)}</select></label>
                <label>Quotation notes<input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional terms or notes"/></label>
              </div>
              {(items.some((item) => item.profileRate === 0 || item.glassRate === 0 || item.hardwareCost === 0) && subtotal === 0) && (
                <div className="rate-warning" role="status">
                  <b>Prices are not set yet.</b> Open <b>Settings</b> and enter your actual profile, glass and hardware rates. Then return here; this quotation will update automatically. New installations start with rates set to Rs. 0.00 so no prices are guessed.
                  <button className="button ghost" onClick={() => setPage("settings")}>Open Settings</button>
                </div>
              )}
              <div className="totals">
                <div><span>Items</span><b>{items.length}</b></div>
                <div><span>Total area</span><b>{items.reduce((sum, item) => sum + area(item), 0).toFixed(2)} sq.ft</b></div>
                <div><span>Subtotal</span><b>{money(subtotal)}</b></div>
                <div><span>Discount</span><b>− {money(discountAmount)}</b></div>
                <div><span>Taxable amount</span><b>{money(taxable)}</b></div>
                {gstMode === "local" && <><div><span>CGST ({safeGstRate / 2}%)</span><b>{money(gst / 2)}</b></div><div><span>SGST ({safeGstRate / 2}%)</span><b>{money(gst / 2)}</b></div></>}
                {gstMode === "interstate" && <div><span>IGST ({safeGstRate}%)</span><b>{money(gst)}</b></div>}
                <div className="grand-total"><span>Grand total</span><strong>{money(grandTotal)}</strong></div>
              </div>
              <div className="action-row"><button className="button ghost" onClick={resetForm}><RotateCcw size={16}/> Clear form</button><button className="button primary" onClick={() => void saveQuote()}><Save size={16}/> Save quotation</button></div>
            </section>
          </div>
        )}

        {page === "quotes" && <section className="panel">
          <div className="section-title"><div><h2>Quotation history</h2><p>{quotes.length} saved quotations</p></div><FileText size={20}/></div>
          <div className="search-box"><Search size={17}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search quotation, customer or phone"/></div>
          {filteredQuotes.length === 0 ? <div className="empty-state">No quotations found. Create and save a quotation first.</div> : <div className="quote-list">{filteredQuotes.map((quote) => <article className="quote-row" key={quote.id}>
            <div className="quote-main"><span className="quote-no">{quote.number}</span><h3>{quote.customer.name}</h3><small>{quote.date} · {quote.items.length} items · {quote.status}</small></div>
            <div className="quote-end"><strong>{money(quote.total)}</strong><div className="icon-actions">
              <button className="icon-button" title="Download PDF" onClick={() => downloadPDF(quote)}><FileDown size={16}/></button>
              <button className="icon-button" title="Edit" onClick={() => editQuote(quote)}><FileText size={16}/></button>
              <button className="icon-button" title="Duplicate" onClick={() => duplicateQuote(quote)}><Copy size={16}/></button>
              <button className="icon-button delete" title="Delete" onClick={() => void removeQuote(quote)}><Trash2 size={16}/></button>
            </div></div>
          </article>)}</div>}
        </section>}

        {page === "customers" && <section className="panel">
          <div className="section-title"><div><h2>Customers</h2><p>Customers are saved when you save a quotation.</p></div><Users size={20}/></div>
          {customers.length ? <div className="quote-list">{customers.map((c) => <article className="quote-row" key={c.id}><div className="quote-main"><h3>{c.name}</h3><small>{c.phone || "No phone"} · {c.email || "No email"}</small><small>{c.address}</small></div><strong>{quotes.filter((q) => q.customer.id === c.id).length} quotes</strong></article>)}</div> : <div className="empty-state">No customers yet. Save a quotation to add its customer.</div>}
        </section>}

        {page === "settings" && <section className="panel">
          <div className="section-title"><div><h2>Company & pricing settings</h2><p>Enter your real company details and rates.</p></div><Settings size={20}/></div>
          <h3 className="settings-heading">Company details</h3>
          <div className="form-grid">
            <label>Company name<input value={settings.company} onChange={(e) => setSettings((s) => ({ ...s, company: e.target.value }))}/></label>
            <label>Phone<input value={settings.phone} onChange={(e) => setSettings((s) => ({ ...s, phone: e.target.value }))}/></label>
            <label>Email<input value={settings.email} onChange={(e) => setSettings((s) => ({ ...s, email: e.target.value }))}/></label>
            <label>GSTIN<input value={settings.gstin} onChange={(e) => setSettings((s) => ({ ...s, gstin: e.target.value }))}/></label>
            <label className="full">Address<textarea value={settings.address} onChange={(e) => setSettings((s) => ({ ...s, address: e.target.value }))}/></label>
            <label>Quotation prefix<input value={settings.prefix} onChange={(e) => setSettings((s) => ({ ...s, prefix: e.target.value }))}/></label>
            <label>Next quotation number<input type="number" min="1" value={settings.nextNumber} onChange={(e) => setSettings((s) => ({ ...s, nextNumber: Math.max(1, Number(e.target.value)) }))}/></label>
            <label>Default GST (%)<input type="number" min="0" max="100" value={settings.defaultGst} onChange={(e) => setSettings((s) => ({ ...s, defaultGst: Number(e.target.value) }))}/></label>
          </div>

          <h3 className="settings-heading">UPVC profiles — price per sq.ft</h3>
          {settings.profiles.map((profile, i) => <div className="rate-row" key={`${profile.name}-${i}`}>
            <input aria-label="Profile name" value={profile.name} onChange={(e) => setSettings((s) => ({ ...s, profiles: s.profiles.map((x, j) => j === i ? { ...x, name: e.target.value } : x) }))}/>
            <input aria-label="Profile rate" type="number" min="0" value={profile.rate} onChange={(e) => setSettings((s) => ({ ...s, profiles: s.profiles.map((x, j) => j === i ? { ...x, rate: Number(e.target.value) } : x) }))}/>
            <button className="icon-button delete" title="Delete profile" onClick={() => setSettings((s) => ({ ...s, profiles: s.profiles.filter((_, j) => j !== i) }))}><Trash2 size={16}/></button>
          </div>)}
          <button className="button ghost" onClick={() => setSettings((s) => ({ ...s, profiles: [...s.profiles, { name: `New Profile ${s.profiles.length + 1}`, rate: 0 }] }))}><Plus size={16}/> Add profile</button>

          <h3 className="settings-heading">Glass — price per sq.ft</h3>
          {settings.glasses.map((glass, i) => <div className="rate-row" key={`${glass.name}-${i}`}>
            <input aria-label="Glass name" value={glass.name} onChange={(e) => setSettings((s) => ({ ...s, glasses: s.glasses.map((x, j) => j === i ? { ...x, name: e.target.value } : x) }))}/>
            <input aria-label="Glass rate" type="number" min="0" value={glass.rate} onChange={(e) => setSettings((s) => ({ ...s, glasses: s.glasses.map((x, j) => j === i ? { ...x, rate: Number(e.target.value) } : x) }))}/>
            <button className="icon-button delete" title="Delete glass" onClick={() => setSettings((s) => ({ ...s, glasses: s.glasses.filter((_, j) => j !== i) }))}><Trash2 size={16}/></button>
          </div>)}
          <button className="button ghost" onClick={() => setSettings((s) => ({ ...s, glasses: [...s.glasses, { name: `New Glass ${s.glasses.length + 1}`, rate: 0 }] }))}><Plus size={16}/> Add glass</button>

          <h3 className="settings-heading">Hardware — price per unit</h3>
          {settings.hardware.map((hardware, i) => <div className="rate-row" key={`${hardware.name}-${i}`}>
            <input aria-label="Hardware name" value={hardware.name} onChange={(e) => setSettings((s) => ({ ...s, hardware: s.hardware.map((x, j) => j === i ? { ...x, name: e.target.value } : x) }))}/>
            <input aria-label="Hardware price" type="number" min="0" value={hardware.rate} onChange={(e) => setSettings((s) => ({ ...s, hardware: s.hardware.map((x, j) => j === i ? { ...x, rate: Number(e.target.value) } : x) }))}/>
            <button className="icon-button delete" title="Delete hardware" onClick={() => setSettings((s) => ({ ...s, hardware: s.hardware.filter((_, j) => j !== i) }))}><Trash2 size={16}/></button>
          </div>)}
          <button className="button ghost" onClick={() => setSettings((s) => ({ ...s, hardware: [...s.hardware, { name: `New Hardware ${s.hardware.length + 1}`, rate: 0 }] }))}><Plus size={16}/> Add hardware</button>

          <div className="backup-row"><div><h3>Backup & restore</h3><p>Export saved quotations, customers and settings.</p></div>
            <button className="button primary" onClick={exportBackup}><FileDown size={16}/> Export backup</button>
            <label className="button ghost file-button">Import backup<input type="file" accept=".json,application/json" onChange={(e) => { const file = e.target.files?.[0]; if (file) void importBackup(file); e.target.value = ""; }}/></label>
          </div>
          <p className="settings-note">Settings save automatically in this browser. Export backups regularly; data does not sync to other devices automatically.</p>
        </section>}

        <footer className="footer">KNR UPVC · Quotation Maker <span>Local-first · Data stored in this browser</span></footer>
      </main>
    </div>
  );
}