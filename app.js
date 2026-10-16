/* ==========================================================
   The Old Oak Library — app.js (vanilla JS, no libraries)
   ========================================================== */

/* ---------- 1. API helper: change BASE_URL in ONE place ---------- */
const BASE_URL = "";

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(BASE_URL + path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch (err) {
    // Network failure (server down, offline, etc.)
    throw new Error("Cannot reach the server. Please check your connection.");
  }

  let data = null;
  try { data = await response.json(); } catch (err) { /* empty or non-JSON body */ }

  if (!response.ok) {
    let message = "Something went wrong.";
    if (data && typeof data.detail === "string") {
      message = data.detail;
    } else if (data && Array.isArray(data.detail) && data.detail[0] && data.detail[0].msg) {
      message = data.detail[0].msg; // FastAPI validation errors
    }
    throw new Error(message);
  }
  return data;
}

const api = {
  getBooks:    (search = "") => request("/books?search=" + encodeURIComponent(search)),
  addBook:     (book)        => request("/books", { method: "POST", body: JSON.stringify(book) }),
  deleteBook:  (id)          => request("/books/" + id, { method: "DELETE" }),
  getMembers:  ()            => request("/members"),
  addMember:   (member)      => request("/members", { method: "POST", body: JSON.stringify(member) }),
  issueBook:   (payload)     => request("/issue", { method: "POST", body: JSON.stringify(payload) }),
  returnBook:  (issueId)     => request("/return/" + issueId, { method: "POST" }),
  getIssued:   ()            => request("/issued"),
};

/* ---------- 2. App state ---------- */
const state = {
  allBooks: [],    // every book (used by dashboard and dropdown)
  members: [],
  issued: [],
  search: "",      // current search text
};

/* ---------- 3. Small DOM helpers (never use innerHTML) ---------- */
const $ = (id) => document.getElementById(id);

/** Create an element with optional text and class. */
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

/** Remove all children of a node. */
function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** Show one message row inside a table body (loading / empty state). */
function showStateRow(tbody, colSpan, message) {
  clear(tbody);
  const tr = el("tr");
  const td = el("td", message, "state-cell");
  td.colSpan = colSpan;
  tr.appendChild(td);
  tbody.appendChild(tr);
}

/** Pinned-note toast. */
function toast(message, isError = false) {
  const note = el("div", message, "toast" + (isError ? " error" : ""));
  $("toast-area").appendChild(note);
  setTimeout(() => note.remove(), 4000);
}

/** Debounce: wait until the user stops typing. */
function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/** Run an async action while a button is disabled; show errors as toasts. */
async function withBusy(button, action) {
  if (button) button.disabled = true;
  try {
    return await action();
  } catch (err) {
    toast(err.message, true);
  } finally {
    if (button) button.disabled = false;
  }
}

/** Today as YYYY-MM-DD in local time. */
function todayString() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

/** A record is overdue if not returned and due before today. */
function isOverdue(record) {
  return !record.return_date && record.due_date && String(record.due_date).slice(0, 10) < todayString();
}

/** Show only the date part of a date string. */
function shortDate(value) {
  return value ? String(value).slice(0, 10) : "—";
}

/** Build a stamped status badge. */
function stamp(text, colorClass) {
  return el("span", text, "stamp " + colorClass);
}

/* ---------- 4. Tabs ---------- */
const tabs = Array.from(document.querySelectorAll(".tab"));

function selectTab(tab) {
  tabs.forEach((t) => {
    const active = t === tab;
    t.classList.toggle("is-active", active);
    t.setAttribute("aria-selected", String(active));
    t.tabIndex = active ? 0 : -1;
    $("panel-" + t.dataset.tab).hidden = !active;
  });
}

tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => selectTab(tab));
  // Arrow keys move between tabs (standard tab keyboard behaviour)
  tab.addEventListener("keydown", (e) => {
    let next = null;
    if (e.key === "ArrowRight") next = tabs[(index + 1) % tabs.length];
    if (e.key === "ArrowLeft") next = tabs[(index - 1 + tabs.length) % tabs.length];
    if (e.key === "Home") next = tabs[0];
    if (e.key === "End") next = tabs[tabs.length - 1];
    if (next) { e.preventDefault(); selectTab(next); next.focus(); }
  });
});

/* ---------- 5. Rendering ---------- */
function renderDashboard() {
  $("stat-total").textContent = state.allBooks.length;
  $("stat-issued").textContent = state.issued.filter((r) => !r.return_date).length;
  $("stat-members").textContent = state.members.length;
  $("stat-overdue").textContent = state.issued.filter(isOverdue).length;
}

function renderBooks(books) {
  const tbody = $("books-body");
  if (books.length === 0) {
    showStateRow(tbody, 5, state.search ? "No matching books found" : "No books on the shelf yet");
    return;
  }
  clear(tbody);
  books.forEach((book) => {
    const tr = el("tr");
    tr.appendChild(el("td", book.id));
    tr.appendChild(el("td", book.title));
    tr.appendChild(el("td", book.author));
    tr.appendChild(el("td", book.copies_available));

    const actionCell = el("td");
    const del = el("button", "Delete", "btn btn-red");
    del.type = "button";
    del.addEventListener("click", () => handleDeleteBook(book, del));
    actionCell.appendChild(del);
    tr.appendChild(actionCell);
    tbody.appendChild(tr);
  });
}

function renderMembers() {
  const tbody = $("members-body");
  if (state.members.length === 0) {
    showStateRow(tbody, 4, "No members have signed the register yet");
    return;
  }
  clear(tbody);
  state.members.forEach((m) => {
    const tr = el("tr");
    tr.appendChild(el("td", m.id));
    tr.appendChild(el("td", m.name));
    tr.appendChild(el("td", m.phone));
    tr.appendChild(el("td", shortDate(m.joined_date)));
    tbody.appendChild(tr);
  });
}

function renderDropdowns() {
  // Remember current selections so refreshes don't reset them
  const memberSel = $("issue-member");
  const bookSel = $("issue-book");
  const prevMember = memberSel.value;
  const prevBook = bookSel.value;

  clear(memberSel);
  memberSel.appendChild(new Option("Choose a member…", ""));
  state.members.forEach((m) => memberSel.appendChild(new Option(m.name + " (#" + m.id + ")", m.id)));

  clear(bookSel);
  bookSel.appendChild(new Option("Choose a book…", ""));
  state.allBooks
    .filter((b) => b.copies_available > 0)
    .forEach((b) => bookSel.appendChild(new Option(b.title + " — " + b.copies_available + " left", b.id)));

  memberSel.value = prevMember;
  bookSel.value = prevBook;
}

function renderIssued() {
  const tbody = $("issued-body");
  if (state.issued.length === 0) {
    showStateRow(tbody, 9, "No books have been lent out yet");
    return;
  }
  clear(tbody);
  state.issued.forEach((rec) => {
    const tr = el("tr");
    tr.appendChild(el("td", rec.id));
    tr.appendChild(el("td", rec.title));
    tr.appendChild(el("td", rec.member));
    tr.appendChild(el("td", shortDate(rec.issue_date)));
    tr.appendChild(el("td", shortDate(rec.due_date)));
    tr.appendChild(el("td", shortDate(rec.return_date)));
    tr.appendChild(el("td", rec.fine ? String(rec.fine) : "0"));

    const statusCell = el("td");
    if (rec.return_date) statusCell.appendChild(stamp("Returned", "stamp-green"));
    else if (isOverdue(rec)) statusCell.appendChild(stamp("Overdue", "stamp-red"));
    else statusCell.appendChild(stamp("Issued", "stamp-amber"));
    tr.appendChild(statusCell);

    const actionCell = el("td");
    if (!rec.return_date) {
      const btn = el("button", "Return", "btn btn-green");
      btn.type = "button";
      btn.addEventListener("click", () => handleReturn(rec, btn));
      actionCell.appendChild(btn);
    }
    tr.appendChild(actionCell);
    tbody.appendChild(tr);
  });
}

/* ---------- 6. Loading data ---------- */

/** Fetch everything and redraw. Used at start and after every change. */
async function refreshAll() {
  try {
    const [books, members, issued] = await Promise.all([
      api.getBooks(""),
      api.getMembers(),
      api.getIssued(),
    ]);
    state.allBooks = books;
    state.members = members;
    state.issued = issued;

    // If a search is active, the table shows search results instead
    if (state.search) {
      renderBooks(await api.getBooks(state.search));
    } else {
      renderBooks(state.allBooks);
    }
    renderMembers();
    renderIssued();
    renderDropdowns();
    renderDashboard();
  } catch (err) {
    toast(err.message, true);
    showStateRow($("books-body"), 5, "Could not load books");
    showStateRow($("members-body"), 4, "Could not load members");
    showStateRow($("issued-body"), 9, "Could not load records");
  }
}

function showLoading() {
  showStateRow($("books-body"), 5, "Fetching from the shelves…");
  showStateRow($("members-body"), 4, "Opening the register…");
  showStateRow($("issued-body"), 9, "Reading the ledger…");
}

/* ---------- 7. Event handlers ---------- */
async function handleAddBook(e) {
  e.preventDefault();
  const form = e.target;
  const button = form.querySelector("button[type=submit]");
  await withBusy(button, async () => {
    const res = await api.addBook({
      title: $("book-title").value.trim(),
      author: $("book-author").value.trim(),
      copies_available: parseInt($("book-copies").value, 10),
    });
    toast(res.message || "Book added");
    form.reset();
    $("book-copies").value = 1;
    await refreshAll();
  });
}

async function handleDeleteBook(book, button) {
  if (!confirm('Remove "' + book.title + '" from the library?')) return;
  await withBusy(button, async () => {
    const res = await api.deleteBook(book.id);
    toast(res.message || "Book removed");
    await refreshAll();
  });
}

async function handleAddMember(e) {
  e.preventDefault();
  const form = e.target;
  const button = form.querySelector("button[type=submit]");
  await withBusy(button, async () => {
    const res = await api.addMember({
      name: $("member-name").value.trim(),
      phone: $("member-phone").value.trim(),
    });
    toast(res.message || "Member added");
    form.reset();
    await refreshAll();
  });
}

async function handleIssue(e) {
  e.preventDefault();
  const form = e.target;
  const button = form.querySelector("button[type=submit]");
  await withBusy(button, async () => {
    const res = await api.issueBook({
      book_id: parseInt($("issue-book").value, 10),
      member_id: parseInt($("issue-member").value, 10),
    });
    toast((res.message || "Book issued") + (res.due_date ? " Due: " + shortDate(res.due_date) : ""));
    form.reset();
    await refreshAll();
  });
}

async function handleReturn(record, button) {
  await withBusy(button, async () => {
    const res = await api.returnBook(record.id);
    const fine = res.fine ? " Fine: " + res.fine : "";
    toast((res.message || "Book returned") + fine);
    await refreshAll();
  });
}

/** Live search with debounce. */
const handleSearch = debounce(async (text) => {
  state.search = text.trim();
  showStateRow($("books-body"), 5, "Searching the catalogue…");
  try {
    renderBooks(state.search ? await api.getBooks(state.search) : state.allBooks);
  } catch (err) {
    toast(err.message, true);
    showStateRow($("books-body"), 5, "Search failed");
  }
}, 300);

/* ---------- 8. Start ---------- */
$("book-form").addEventListener("submit", handleAddBook);
$("member-form").addEventListener("submit", handleAddMember);
$("issue-form").addEventListener("submit", handleIssue);
$("book-search").addEventListener("input", (e) => handleSearch(e.target.value));

showLoading();
refreshAll();