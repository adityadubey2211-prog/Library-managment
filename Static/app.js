/* ==========================================================
   The Old Oak Library — app.js (vanilla JS, no libraries)
   ========================================================== */

/* ---------- 1. API helper: change BASE_URL in ONE place ---------- */
const BASE_URL = "";

/* Read the token saved at login */
function getToken() {
  try {
    const saved = JSON.parse(localStorage.getItem("member"));
    return saved ? saved.token : null;
  } catch (err) {
    return null;
  }
}

/* True only if the logged-in user is an admin */
function isAdmin() {
  try {
    const saved = JSON.parse(localStorage.getItem("member"));
    return saved !== null && saved.role === "admin";
  } catch (err) {
    return false;
  }
}

/* The saved login info ({id, name, role, token}) or null */
function getMember() {
  try {
    return JSON.parse(localStorage.getItem("member"));
  } catch (err) {
    return null;
  }
}

/* Forget the login and go back to the login page */
function logout() {
  try {
    localStorage.removeItem("member");
  } catch (err) { /* storage blocked: nothing to remove */ }
  window.location.replace("/login");
}

/* Login guard: nobody logged in means go to the login page */
if (getMember() === null) {
  window.location.replace("/login");
}

async function request(path, options = {}) {
  let response;
  try {
    // Send the login token with every request
    const headers = { "Content-Type": "application/json" };
    const token = getToken();
    if (token) {
      headers["Authorization"] = "Bearer " + token;
    }
    response = await fetch(BASE_URL + path, { ...options, headers });
  } catch (err) {
    // Network failure (server down, offline, etc.)
    throw new Error("Cannot reach the server. Please check your connection.");
  }

  let data = null;
  try { data = await response.json(); } catch (err) { /* empty or non-JSON body */ }

  if (!response.ok) {
    // 401 = not logged in or session expired (e.g. server restarted)
    if (response.status === 401) {
      logout();
    }
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

/** Books table has 5 columns for admin, 4 for everyone else. */
function bookCols() {
  return isAdmin() ? 5 : 4;
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
    showStateRow(tbody, bookCols(), state.search ? "No matching books found" : "No books on the shelf yet");
    return;
  }
  clear(tbody);
  books.forEach((book) => {
    const tr = el("tr");
    tr.appendChild(el("td", book.id));
    tr.appendChild(el("td", book.title));
    tr.appendChild(el("td", book.author));
    tr.appendChild(el("td", book.copies_available));

    // The Action cell (Delete button) exists only for admins
    if (isAdmin()) {
      const actionCell = el("td");
      const del = el("button", "Delete", "btn btn-red");
      del.type = "button";
      del.addEventListener("click", () => handleDeleteBook(book, del));
      actionCell.appendChild(del);
      tr.appendChild(actionCell);
    }
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

/** Fill the member-name suggestions (native datalist). */
function renderMemberNames() {
  const list = $("member-names");
  clear(list);
  state.members.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m.name;
    list.appendChild(opt);
  });
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
    renderMemberNames();
    renderDashboard();
  } catch (err) {
    toast(err.message, true);
    showStateRow($("books-body"), bookCols(), "Could not load books");
    showStateRow($("members-body"), 4, "Could not load members");
    showStateRow($("issued-body"), 9, "Could not load records");
  }
}

function showLoading() {
  showStateRow($("books-body"), bookCols(), "Fetching from the shelves…");
  showStateRow($("members-body"), 4, "Opening the register…");
  showStateRow($("issued-body"), 9, "Reading the ledger…");
}

/* ---------- Issue form helpers ---------- */
let selectedBook = null;   // {id, title} chosen from the suggestions
let suggestionItems = [];  // books currently listed
let activeIndex = -1;      // highlighted suggestion (keyboard)

/** Find the member whose name matches what was typed. */
function findMemberByName(text) {
  const name = text.trim().toLowerCase();
  if (!name) throw new Error("Enter the member's user name.");
  const matches = state.members.filter((m) => m.name.toLowerCase() === name);
  if (matches.length === 0) throw new Error('No member named "' + text.trim() + '".');
  if (matches.length > 1) throw new Error("More than one member has that name. Ask the librarian.");
  return matches[0];
}

/** The book chosen from suggestions (or typed exactly). */
function pickedBook() {
  if (selectedBook) return selectedBook;
  const typed = $("issue-book-search").value.trim().toLowerCase();
  const exact = suggestionItems.filter((b) => b.title.toLowerCase() === typed);
  if (exact.length === 1) return exact[0];
  throw new Error("Please pick a book from the suggestions.");
}

/** Normal users get their own name filled in. */
function prefillMemberName() {
  const who = getMember();
  if (!isAdmin() && who) $("issue-member").value = who.name;
}

function closeSuggestions() {
  const box = $("book-suggestions");
  box.hidden = true;
  clear(box);
  activeIndex = -1;
  $("issue-book-search").setAttribute("aria-expanded", "false");
}

function chooseBook(book) {
  selectedBook = { id: book.id, title: book.title };
  $("issue-book-search").value = book.title;
  closeSuggestions();
}

/** Move the highlight up or down. */
function setActive(index) {
  const items = $("book-suggestions").querySelectorAll(".suggestion");
  if (items.length === 0) return;
  activeIndex = (index + items.length) % items.length;
  items.forEach((item, i) => {
    item.classList.toggle("is-active", i === activeIndex);
    item.setAttribute("aria-selected", String(i === activeIndex));
  });
}

function renderSuggestions(books) {
  const box = $("book-suggestions");
  clear(box);
  suggestionItems = books;
  activeIndex = -1;

  if (books.length === 0) {
    box.appendChild(el("li", "No available book matches", "suggestion-empty"));
  } else {
    books.forEach((book) => {
      const li = el("li", null, "suggestion");
      li.setAttribute("role", "option");
      li.appendChild(el("span", book.title, "suggestion-title"));
      li.appendChild(el("span", book.author + " · " + book.copies_available + " left", "suggestion-meta"));
      // mousedown fires before the input loses focus, so the click is not lost
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        chooseBook(book);
      });
      box.appendChild(li);
    });
  }
  box.hidden = false;
  $("issue-book-search").setAttribute("aria-expanded", "true");
}

/** Ask the server for books matching the text (only books with copies left). */
const searchBookSuggestions = debounce(async (text) => {
  try {
    const books = await api.getBooks(text.trim());
    renderSuggestions(books.filter((b) => b.copies_available > 0).slice(0, 8));
  } catch (err) {
    toast(err.message, true);
    closeSuggestions();
  }
}, 250);

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
    const member = findMemberByName($("issue-member").value);
    const book = pickedBook();
    const res = await api.issueBook({ book_id: book.id, member_id: member.id });
    toast((res.message || "Book issued") + (res.due_date ? " Due: " + shortDate(res.due_date) : ""));
    form.reset();
    selectedBook = null;
    closeSuggestions();
    prefillMemberName();
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
  showStateRow($("books-body"), bookCols(), "Searching the catalogue…");
  try {
    renderBooks(state.search ? await api.getBooks(state.search) : state.allBooks);
  } catch (err) {
    toast(err.message, true);
    showStateRow($("books-body"), bookCols(), "Search failed");
  }
}, 300);

/* ---------- 8. Start ---------- */

/* Welcome text and logout button */
const me = getMember();
if (me) {
  $("welcome-text").textContent = "Welcome, " + me.name + (isAdmin() ? " (admin)" : "");
}
$("logout-btn").addEventListener("click", logout);

/* Normal users cannot add books or members: hide those forms */
if (!isAdmin()) {
  $("book-form").hidden = true;
  $("member-form").hidden = true;
  $("books-action-th").hidden = true;
}

$("book-form").addEventListener("submit", handleAddBook);
$("member-form").addEventListener("submit", handleAddMember);
$("issue-form").addEventListener("submit", handleIssue);

/* Book search box with suggestions */
const bookInput = $("issue-book-search");
bookInput.addEventListener("input", () => {
  selectedBook = null; // typing again means the old choice no longer applies
  searchBookSuggestions(bookInput.value);
});
bookInput.addEventListener("focus", () => searchBookSuggestions(bookInput.value));
bookInput.addEventListener("blur", closeSuggestions);
bookInput.addEventListener("keydown", (e) => {
  const open = !$("book-suggestions").hidden;
  if (e.key === "ArrowDown" && open) { e.preventDefault(); setActive(activeIndex + 1); }
  if (e.key === "ArrowUp" && open) { e.preventDefault(); setActive(activeIndex - 1); }
  if (e.key === "Enter" && open && activeIndex >= 0) {
    e.preventDefault();
    chooseBook(suggestionItems[activeIndex]);
  }
  if (e.key === "Escape") closeSuggestions();
});

prefillMemberName();
$("book-search").addEventListener("input", (e) => handleSearch(e.target.value));

showLoading();
refreshAll();