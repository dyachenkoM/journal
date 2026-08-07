"use strict";

const app = document.getElementById("app");

// Текущий пользователь ({id, username, is_admin}) или null до входа
let currentUser = null;

const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const SHIFT_NAMES = { day: "Дневная смена", night: "Ночная смена" };
const SHIFT_TIMES = { day: ["08:30", "20:30"], night: ["20:30", "08:30"] };
const DESIGNATIONS = ["Ivory", "Red", "Orange", "Cherry"];
// Опорная дата графика: 13.07.2026 в день — Red, в ночь — Ivory.
// Цикл 4 дня; дневная смена даты N выходит в ночь на дату N+1.
const ROTATION_EPOCH = Date.UTC(2026, 6, 13);

function designationFor(iso, shiftType) {
    const [y, m, d] = iso.split("-").map(Number);
    const days = Math.round((Date.UTC(y, m - 1, d) - ROTATION_EPOCH) / 86400000);
    const offset = shiftType === "day" ? 1 : 0;
    return DESIGNATIONS[((days + offset) % 4 + 4) % 4];
}

// Группа обхода (1–8) для смены. Цикл 8 дней; смена обходит одну группу за
// пару «день даты N + ночь даты N+1», поэтому ночное смещение на 1 меньше
// дневного. Опорная дата 13.07.2026: в день — группа 6, в ночь — 5.
function roundGroupFor(iso, shiftType) {
    const [y, m, d] = iso.split("-").map(Number);
    const days = Math.round((Date.UTC(y, m - 1, d) - ROTATION_EPOCH) / 86400000);
    const offset = shiftType === "day" ? 5 : 4;
    return ((days + offset) % 8 + 8) % 8 + 1;
}

// ---------- Утилиты ----------

function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === "class") node.className = v;
        else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
        else if (v !== null && v !== undefined) node.setAttribute(k, v);
    }
    for (const child of children.flat()) {
        if (child === null || child === undefined) continue;
        node.append(child.nodeType ? child : document.createTextNode(child));
    }
    return node;
}

function fmtDate(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return `${d} ${MONTHS[m - 1].toLowerCase().replace(/[ьй]$/, "я").replace(/т$/, "та")} ${y} г.`;
}

let toastTimer = null;
function toast(msg, isError = false) {
    let node = document.querySelector(".toast");
    if (!node) {
        node = el("div", { class: "toast" });
        document.body.append(node);
    }
    node.textContent = msg;
    node.classList.toggle("error", isError);
    node.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove("show"), 2500);
}

// Иконка «?» с всплывающей подсказкой (наведение или клик — для сенсорных экранов)
function hintIcon(text) {
    const icon = el("span", { class: "hint-icon" }, "?",
        el("span", { class: "hint-tip" }, text));
    icon.addEventListener("click", (e) => {
        e.stopPropagation();
        icon.classList.toggle("open");
    });
    return icon;
}
document.addEventListener("click", (e) => {
    for (const open of document.querySelectorAll(".hint-icon.open")) {
        if (!open.contains(e.target)) open.classList.remove("open");
    }
});

async function api(url, options = {}) {
    const resp = await fetch(url, {
        headers: { "Content-Type": "application/json" },
        ...options,
    });
    if (resp.status === 401) {
        currentUser = null;
        renderLogin();
        throw new Error("Требуется вход");
    }
    if (resp.status === 404) return null;
    if (!resp.ok) throw new Error(`Ошибка сервера: ${resp.status}`);
    return resp.json();
}

// ---------- Вход ----------

function renderLogin() {
    const loginInput = el("input", { type: "text", placeholder: "Имя пользователя",
        autocomplete: "username" });
    const passInput = el("input", { type: "password", placeholder: "Пароль",
        autocomplete: "current-password" });

    async function submit() {
        if (!loginInput.value.trim() || !passInput.value) return;
        try {
            const resp = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: loginInput.value, password: passInput.value }),
            });
            if (!resp.ok) throw new Error((await resp.json()).detail || "Ошибка входа");
            currentUser = await resp.json();
            route();
        } catch (e) {
            toast(e.message, true);
        }
    }
    for (const input of [loginInput, passInput]) {
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
    }

    app.classList.remove("wide");
    app.replaceChildren(
        el("div", { class: "login-box" },
            el("div", { class: "card" },
                el("h2", {}, "Сменный журнал — вход"),
                el("div", { class: "login-fields" },
                    loginInput,
                    passInput,
                    el("button", { class: "btn primary", onclick: submit }, "Войти"),
                ),
                el("p", { class: "empty-hint" },
                    "Нет учётной записи? Обратитесь к администратору."),
            ),
        ),
    );
    loginInput.focus();
}

async function logout() {
    try {
        await fetch("/api/auth/logout", { method: "POST" });
    } finally {
        currentUser = null;
        renderLogin();
    }
}

// ---------- Маршрутизация ----------

function route() {
    if (!currentUser) {
        renderLogin();
        return;
    }
    let hash = location.hash || "#/";
    // Страницы настройки справочников доступны только администраторам
    const adminOnly = ["#/controls", "#/areas", "#/round-groups", "#/print-layout", "#/users"];
    if (adminOnly.includes(hash) && !currentUser.is_admin) {
        hash = "#/";
        location.hash = "";
    }
    // Страница отчёта растягивается на широкие (16:9) экраны
    app.classList.toggle("wide", /^#\/shift\//.test(hash));
    let m;
    if ((m = hash.match(/^#\/shift\/(\d{4}-\d{2}-\d{2})\/(day|night)$/))) {
        renderReport(m[1], m[2]);
    } else if ((m = hash.match(/^#\/calendar\/(\d{4})$/))) {
        renderCalendar(Number(m[1]));
    } else if (hash === "#/controls") {
        renderControls();
    } else if (hash === "#/malfunctions") {
        renderMalfunctions();
    } else if (hash === "#/areas") {
        renderAreas();
    } else if (hash === "#/round-groups") {
        renderRoundGroups();
    } else if (hash === "#/print-layout") {
        renderPrintLayout();
    } else if (hash === "#/users") {
        renderUsers();
    } else if (hash === "#/search") {
        renderSearch();
    } else {
        renderCalendar(new Date().getFullYear());
    }
}
window.addEventListener("hashchange", route);

// ---------- Календарь ----------

async function renderCalendar(year) {
    app.replaceChildren(el("p", { class: "empty-hint" }, "Загрузка…"));
    let marks = {};
    try {
        marks = await api(`/api/calendar/${year}`) || {};
    } catch (e) {
        toast(e.message, true);
    }

    const today = new Date();
    const todayIso = isoDate(today.getFullYear(), today.getMonth(), today.getDate());

    const grid = el("div", { class: "calendar-grid" });
    for (let month = 0; month < 12; month++) {
        grid.append(renderMonth(year, month, marks, todayIso));
    }

    app.replaceChildren(
        el("div", { class: "report-header" },
            el("h1", {}, "Сменный журнал"),
            el("div", { class: "field-row" },
                el("button", { class: "btn", onclick: () => location.hash = "#/search" }, "Поиск"),
                el("button", { class: "btn", onclick: () => location.hash = "#/malfunctions" }, "Неисправности"),
                ...(currentUser?.is_admin ? [
                    el("button", { class: "btn", onclick: () => location.hash = "#/controls" }, "Дежурные"),
                    el("button", { class: "btn", onclick: () => location.hash = "#/areas" }, "Участки"),
                    el("button", { class: "btn", onclick: () => location.hash = "#/round-groups" }, "Группы обхода"),
                    el("button", { class: "btn", onclick: () => location.hash = "#/print-layout" }, "Макет печати"),
                    el("button", { class: "btn", onclick: () => location.hash = "#/users" }, "Пользователи"),
                ] : []),
                el("span", { class: "user-badge" }, currentUser?.username || ""),
                el("button", { class: "btn", onclick: logout, title: "Выйти из учётной записи" }, "Выйти"),
            ),
        ),
        el("div", { class: "year-header" },
            el("button", { onclick: () => location.hash = `#/calendar/${year - 1}`, title: "Предыдущий год" }, "‹"),
            el("div", { class: "year-title" }, String(year)),
            el("button", { onclick: () => location.hash = `#/calendar/${year + 1}`, title: "Следующий год" }, "›"),
        ),
        el("div", { class: "legend" },
            el("span", {}, el("span", { class: "dot day" }), "дневная смена"),
            el("span", {}, el("span", { class: "dot night" }), "ночная смена"),
        ),
        grid,
    );
}

function isoDate(year, month, day) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function renderMonth(year, month, marks, todayIso) {
    const thead = el("tr", {}, WEEKDAYS.map((wd, i) =>
        el("th", { class: i >= 5 ? "weekend" : "" }, wd)));

    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let weekday = (first.getDay() + 6) % 7; // Пн = 0

    const rows = [];
    let cells = [];
    for (let i = 0; i < weekday; i++) cells.push(el("td"));
    for (let day = 1; day <= daysInMonth; day++) {
        const iso = isoDate(year, month, day);
        const shifts = marks[iso] || [];
        const btn = el("button", {
            class: "day-cell" + (iso === todayIso ? " today" : ""),
            onclick: () => openShiftModal(iso, shifts),
        },
            el("span", { class: "day-num" }, String(day)),
            el("span", { class: "dots" }, shifts.map(s => el("span", { class: `dot ${s}` }))),
        );
        cells.push(el("td", { class: weekday >= 5 ? "weekend" : "" }, btn));
        weekday = (weekday + 1) % 7;
        if (weekday === 0 || day === daysInMonth) {
            rows.push(el("tr", {}, cells));
            cells = [];
        }
    }

    return el("div", { class: "month" },
        el("h3", {}, MONTHS[month]),
        el("table", {}, el("thead", {}, thead), el("tbody", {}, rows)),
    );
}

// ---------- Модальное окно выбора смены ----------

function openShiftModal(iso, existing) {
    const overlay = el("div", { class: "modal-overlay", onclick: (e) => {
        if (e.target === overlay) overlay.remove();
    }});
    const shiftButton = (type) => {
        const exists = existing.includes(type);
        return el("button", {
            class: "shift-btn",
            onclick: () => { overlay.remove(); location.hash = `#/shift/${iso}/${type}`; },
        },
            SHIFT_NAMES[type],
            el("span", { class: "tag " + (exists ? `exists-${type}` : "empty") },
                exists ? "заполнена" : "нет отчёта"),
        );
    };
    overlay.append(el("div", { class: "modal" },
        el("h2", {}, fmtDate(iso)),
        el("div", { class: "shift-buttons" }, shiftButton("day"), shiftButton("night")),
        el("button", { class: "close-btn", onclick: () => overlay.remove() }, "Отмена"),
    ));
    document.body.append(overlay);
}

// ---------- Дежурные ----------

async function renderControls() {
    app.replaceChildren(el("p", { class: "empty-hint" }, "Загрузка…"));
    let controls = [];
    try {
        controls = await api("/api/controls") || [];
    } catch (e) {
        toast(e.message, true);
    }

    const nameInput = el("input", { type: "text", placeholder: "Фамилия И.О., например: Иванов И.И." });

    async function add() {
        const name = nameInput.value.trim();
        if (!name) return;
        try {
            const resp = await fetch("/api/controls", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            });
            if (!resp.ok) throw new Error((await resp.json()).detail || "Ошибка");
            toast("Дежурный добавлен");
            renderControls();
        } catch (e) {
            toast(e.message, true);
        }
    }
    nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") add(); });

    async function remove(control) {
        if (!confirm(`Удалить дежурного «${control.name}» из списка?`)) return;
        try {
            await api(`/api/controls/${control.id}`, { method: "DELETE" });
            renderControls();
        } catch (e) {
            toast(e.message, true);
        }
    }

    app.replaceChildren(
        el("div", { class: "report-header" },
            el("h1", {}, "Дежурные"),
            el("button", { class: "btn", onclick: () => history.length > 1 ? history.back() : location.hash = "#/" },
                "← Назад"),
        ),
        el("div", { class: "card" },
            el("h2", {}, "Список дежурных"),
            controls.length
                ? el("table", { class: "data" }, el("tbody", {},
                    ...controls.map(o => el("tr", {},
                        el("td", {}, o.name),
                        el("td", { class: "row-del" },
                            el("button", { class: "del-row", title: "Удалить",
                                onclick: () => remove(o) }, "✕")),
                    ))))
                : el("p", { class: "empty-hint" }, "Список пуст. Добавьте первого дежурного."),
            el("div", { class: "field-row add-control" },
                nameInput,
                el("button", { class: "btn primary", onclick: add }, "Добавить"),
            ),
        ),
        el("p", { class: "empty-hint" },
            "Удаление из списка не меняет уже сохранённые отчёты — фамилия в них остаётся."),
    );
}

// ---------- Пользователи ----------

async function renderUsers() {
    app.replaceChildren(el("p", { class: "empty-hint" }, "Загрузка…"));
    let users = [];
    try {
        users = await api("/api/users") || [];
    } catch (e) {
        toast(e.message, true);
    }

    const nameInput = el("input", { type: "text", placeholder: "Имя пользователя" });
    const passInput = el("input", { type: "password", placeholder: "Пароль" });
    const adminCheck = el("input", { type: "checkbox", id: "new-user-admin" });

    async function add() {
        const username = nameInput.value.trim();
        if (!username || !passInput.value) return;
        try {
            const resp = await fetch("/api/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username,
                    password: passInput.value,
                    is_admin: adminCheck.checked,
                }),
            });
            if (!resp.ok) throw new Error((await resp.json()).detail || "Ошибка");
            toast("Пользователь добавлен");
            renderUsers();
        } catch (e) {
            toast(e.message, true);
        }
    }
    passInput.addEventListener("keydown", (e) => { if (e.key === "Enter") add(); });

    async function changeRole(user, isAdmin) {
        try {
            const resp = await fetch(`/api/users/${user.id}/role`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ is_admin: isAdmin }),
            });
            if (!resp.ok) throw new Error((await resp.json()).detail || "Ошибка");
            toast("Роль изменена");
        } catch (e) {
            toast(e.message, true);
        }
        renderUsers();
    }

    async function resetPassword(user) {
        const password = prompt(`Новый пароль для «${user.username}»:`);
        if (!password) return;
        try {
            const resp = await fetch(`/api/users/${user.id}/password`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password }),
            });
            if (!resp.ok) throw new Error((await resp.json()).detail || "Ошибка");
            toast("Пароль изменён");
        } catch (e) {
            toast(e.message, true);
        }
    }

    async function remove(user) {
        if (!confirm(`Удалить пользователя «${user.username}»?`)) return;
        try {
            const resp = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
            if (!resp.ok) throw new Error((await resp.json()).detail || "Ошибка");
            renderUsers();
        } catch (e) {
            toast(e.message, true);
        }
    }

    const roleSelect = (user) => {
        const select = el("select", {},
            el("option", { value: "", selected: user.is_admin ? null : "" }, "Пользователь"),
            el("option", { value: "admin", selected: user.is_admin ? "" : null }, "Администратор"),
        );
        select.addEventListener("change", () => changeRole(user, select.value === "admin"));
        return select;
    };

    app.replaceChildren(
        el("div", { class: "report-header" },
            el("h1", {}, "Пользователи"),
            el("button", { class: "btn", onclick: () => history.length > 1 ? history.back() : location.hash = "#/" },
                "← Назад"),
        ),
        el("div", { class: "card" },
            el("h2", {}, "Учётные записи"),
            users.length
                ? el("table", { class: "data" }, el("tbody", {},
                    ...users.map(u => el("tr", {},
                        el("td", {}, u.username, u.id === currentUser.id ? " (вы)" : ""),
                        el("td", {}, roleSelect(u)),
                        el("td", {},
                            el("button", { class: "btn small", onclick: () => resetPassword(u) },
                                "Сменить пароль")),
                        el("td", { class: "row-del" },
                            el("button", { class: "del-row", title: "Удалить",
                                onclick: () => remove(u) }, "✕")),
                    ))))
                : el("p", { class: "empty-hint" }, "Пользователей нет."),
            el("div", { class: "field-row add-control" },
                nameInput,
                passInput,
                el("label", { class: "checkbox-label", for: "new-user-admin" },
                    adminCheck, "Администратор"),
                el("button", { class: "btn primary", onclick: add }, "Добавить"),
            ),
        ),
        el("p", { class: "empty-hint" },
            "Администраторы управляют учётными записями; остальные пользователи работают с журналом."),
    );
}

// ---------- Неисправности ----------

const PLANTS = ["Dry", "Wet", "Utl"];

async function renderMalfunctions() {
    app.replaceChildren(el("p", { class: "empty-hint" }, "Загрузка…"));
    let malfunctions = [];
    let areas = [];
    let controls = [];
    try {
        [malfunctions, areas, controls] = await Promise.all([
            api("/api/malfunctions"),
            api("/api/areas"),
            api("/api/controls"),
        ]);
        malfunctions = malfunctions || [];
        areas = areas || [];
        controls = controls || [];
    } catch (e) {
        toast(e.message, true);
    }

    const today = new Date();
    const dateInput = el("input", { type: "date",
        value: isoDate(today.getFullYear(), today.getMonth(), today.getDate()) });
    const plantSelect = el("select", {}, PLANTS.map(p => el("option", { value: p }, p)));
    const areaInput = el("input", { type: "text", list: "areas-datalist",
        placeholder: "Участок" });
    const authorInput = el("input", { type: "text", list: "controls-datalist",
        placeholder: "Фамилия И.О." });
    const descInput = el("textarea", { rows: "2", placeholder: "Описание неисправности" });

    async function add() {
        try {
            const resp = await fetch("/api/malfunctions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    date: dateInput.value,
                    plant: plantSelect.value,
                    area: areaInput.value.trim(),
                    description: descInput.value.trim(),
                    author: authorInput.value.trim(),
                }),
            });
            if (!resp.ok) throw new Error((await resp.json()).detail || "Ошибка");
            toast("Неисправность добавлена");
            renderMalfunctions();
        } catch (e) {
            toast(e.message, true);
        }
    }

    async function remove(m) {
        if (!confirm("Удалить неисправность из списка?")) return;
        try {
            await api(`/api/malfunctions/${m.id}`, { method: "DELETE" });
            renderMalfunctions();
        } catch (e) {
            toast(e.message, true);
        }
    }

    async function resolve(m, resolvedBy) {
        try {
            const resp = await fetch(`/api/malfunctions/${m.id}/resolve`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ resolved_by: resolvedBy }),
            });
            if (!resp.ok) throw new Error((await resp.json()).detail || "Ошибка");
            toast("Неисправность переведена в «Сделано»");
            renderMalfunctions();
        } catch (e) {
            toast(e.message, true);
        }
    }

    // ---- фильтры и таблица ----
    let resolvingId = null;
    const statusFilter = el("select", {},
        el("option", { value: "" }, "Все статусы"),
        el("option", { value: "open" }, "В работе"),
        el("option", { value: "done" }, "Сделано"),
    );
    const plantFilter = el("select", {},
        el("option", { value: "" }, "Все заводы"),
        ...PLANTS.map(p => el("option", { value: p }, p)),
    );
    const areaFilter = el("input", { type: "text", list: "areas-datalist",
        placeholder: "Участок" });
    const searchFilter = el("input", { type: "text",
        placeholder: "Поиск по описанию, автору…" });
    statusFilter.onchange = plantFilter.onchange = redrawTable;
    areaFilter.oninput = searchFilter.oninput = redrawTable;
    const tableWrap = el("div");

    function statusCell(m) {
        if (m.status === "done") {
            return el("td", {},
                el("span", { class: "status-badge done" }, "Сделано"),
                m.resolved_by ? el("div", { class: "resolved-by" }, m.resolved_by) : "",
            );
        }
        if (resolvingId === m.id) {
            const whoInput = el("input", { type: "text", list: "controls-datalist",
                placeholder: "Кто выполнил?" });
            const cell = el("td", {}, el("div", { class: "resolve-row" },
                whoInput,
                el("button", { class: "btn small primary", title: "Подтвердить",
                    onclick: () => resolve(m, whoInput.value.trim()) }, "ОК"),
                el("button", { class: "btn small", title: "Отмена",
                    onclick: () => { resolvingId = null; redrawTable(); } }, "✕"),
            ));
            setTimeout(() => whoInput.focus(), 0);
            return cell;
        }
        return el("td", {},
            el("span", { class: "status-badge open" }, "В работе"),
            el("button", { class: "btn small resolve-btn", title: "Перевести в «Сделано»",
                onclick: () => { resolvingId = m.id; redrawTable(); } }, "✓ Сделано"),
        );
    }

    function redrawTable() {
        const area = areaFilter.value.trim().toLowerCase();
        const q = searchFilter.value.trim().toLowerCase();
        const filtered = malfunctions.filter(m =>
            (!statusFilter.value || m.status === statusFilter.value)
            && (!plantFilter.value || m.plant === plantFilter.value)
            && (!area || m.area.toLowerCase().includes(area))
            && (!q || `${m.description} ${m.author} ${m.resolved_by}`
                .toLowerCase().includes(q)));
        tableWrap.replaceChildren(
            filtered.length
                ? el("table", { class: "data" },
                    el("thead", {}, el("tr", {},
                        el("th", { style: "width:110px" }, "Дата"),
                        el("th", { style: "width:80px" }, "Завод"),
                        el("th", {}, "Участок"),
                        el("th", { style: "width:38%" }, "Описание"),
                        el("th", {}, "Автор"),
                        el("th", { style: "width:160px" }, "Статус"),
                        el("th", { class: "row-del" }),
                    )),
                    el("tbody", {}, filtered.map(m => el("tr", {},
                        el("td", {}, fmtDot(m.date)),
                        el("td", {}, m.plant),
                        el("td", {}, m.area),
                        el("td", {}, m.description),
                        el("td", {}, m.author),
                        statusCell(m),
                        el("td", { class: "row-del" },
                            el("button", { class: "del-row", title: "Удалить",
                                onclick: () => remove(m) }, "✕")),
                    ))),
                )
                : el("p", { class: "empty-hint" }, malfunctions.length
                    ? "Ничего не найдено по заданным фильтрам."
                    : "Список пуст. Добавьте первую неисправность."),
        );
    }
    redrawTable();

    app.replaceChildren(
        el("div", { class: "report-header" },
            el("h1", {}, "Неисправности"),
            el("button", { class: "btn", onclick: () => history.length > 1 ? history.back() : location.hash = "#/" },
                "← Назад"),
        ),
        el("datalist", { id: "areas-datalist" }, areas.map(a => el("option", { value: a.name }))),
        el("datalist", { id: "controls-datalist" }, controls.map(o => el("option", { value: o.name }))),
        el("div", { class: "card" },
            el("h2", {}, "Новая неисправность"),
            el("div", { class: "form-grid" },
                el("div", { class: "field" }, el("label", {}, "Дата"), dateInput),
                el("div", { class: "field" }, el("label", {}, "Завод"), plantSelect),
                el("div", { class: "field" }, el("label", {}, "Участок"), areaInput),
                el("div", { class: "field" }, el("label", {}, "Автор"), authorInput),
            ),
            el("div", { class: "field-row add-control full" },
                descInput,
                el("button", { class: "btn primary", onclick: add }, "Добавить"),
            ),
        ),
        el("div", { class: "card" },
            el("h2", {}, "Список неисправностей"),
            el("div", { class: "form-grid malfunction-filters" },
                el("div", { class: "field" }, el("label", {}, "Статус"), statusFilter),
                el("div", { class: "field" }, el("label", {}, "Завод"), plantFilter),
                el("div", { class: "field" }, el("label", {}, "Участок"), areaFilter),
                el("div", { class: "field" }, el("label", {}, "Поиск"), searchFilter),
            ),
            tableWrap,
        ),
    );
}

// ---------- Участки и оборудование ----------

async function renderAreas(opts = {}) {
    const { keepScroll = false, focusAreaId = null } = opts;
    const scrollY = window.scrollY;
    if (!keepScroll) app.replaceChildren(el("p", { class: "empty-hint" }, "Загрузка…"));
    let areas = [];
    try {
        areas = await api("/api/areas") || [];
    } catch (e) {
        toast(e.message, true);
    }

    async function post(url, name) {
        const resp = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
        });
        if (!resp.ok) throw new Error((await resp.json()).detail || "Ошибка");
    }

    const areaInput = el("input", { type: "text", placeholder: "Название участка, например: РП-1" });
    async function addArea() {
        const name = areaInput.value.trim();
        if (!name) return;
        try {
            await post("/api/areas", name);
            toast("Участок добавлен");
            renderAreas({ keepScroll: true });
        } catch (e) {
            toast(e.message, true);
        }
    }
    areaInput.addEventListener("keydown", (e) => { if (e.key === "Enter") addArea(); });

    async function removeArea(area) {
        if (!confirm(`Удалить участок «${area.name}» вместе с его оборудованием?`)) return;
        try {
            await api(`/api/areas/${area.id}`, { method: "DELETE" });
            renderAreas({ keepScroll: true });
        } catch (e) {
            toast(e.message, true);
        }
    }

    async function removeUnit(unit) {
        if (!confirm(`Удалить оборудование «${unit.name}»?`)) return;
        try {
            await api(`/api/equipment/${unit.id}`, { method: "DELETE" });
            renderAreas({ keepScroll: true });
        } catch (e) {
            toast(e.message, true);
        }
    }

    const unitInputs = new Map();

    function areaCard(area) {
        const unitInput = el("input", { type: "text", placeholder: "Единица оборудования" });
        unitInputs.set(area.id, unitInput);
        async function addUnit() {
            const name = unitInput.value.trim();
            if (!name) return;
            try {
                await post(`/api/areas/${area.id}/equipment`, name);
                toast("Оборудование добавлено");
                renderAreas({ keepScroll: true, focusAreaId: area.id });
            } catch (e) {
                toast(e.message, true);
            }
        }
        unitInput.addEventListener("keydown", (e) => { if (e.key === "Enter") addUnit(); });

        return el("div", { class: "card" },
            el("div", { class: "area-card-header" },
                el("h2", {}, area.name),
                el("button", { class: "btn small danger", onclick: () => removeArea(area) },
                    "Удалить участок"),
            ),
            area.equipment.length
                ? el("table", { class: "data" }, el("tbody", {},
                    ...area.equipment.map(u => {
                        const descInput = el("input", { type: "text", value: u.description || "",
                            placeholder: "Подсказка при наведении в отчёте" });
                        descInput.addEventListener("change", async () => {
                            try {
                                await api(`/api/equipment/${u.id}/description`, {
                                    method: "PUT",
                                    body: JSON.stringify({ description: descInput.value.trim() }),
                                });
                                toast("Подсказка сохранена");
                            } catch (e) {
                                toast(e.message, true);
                            }
                        });
                        return el("tr", {},
                            el("td", {}, u.name),
                            el("td", { class: "unit-hint-cell" }, descInput),
                            el("td", { class: "row-del" },
                                el("button", { class: "del-row", title: "Удалить",
                                    onclick: () => removeUnit(u) }, "✕")),
                        );
                    })))
                : el("p", { class: "empty-hint" }, "На участке пока нет оборудования."),
            el("div", { class: "field-row add-control" },
                unitInput,
                el("button", { class: "btn primary", onclick: addUnit }, "Добавить"),
            ),
        );
    }

    app.replaceChildren(
        el("div", { class: "report-header" },
            el("h1", {}, "Участки и оборудование"),
            el("button", { class: "btn", onclick: () => history.length > 1 ? history.back() : location.hash = "#/" },
                "← Назад"),
        ),
        el("div", { class: "card" },
            el("h2", {}, "Новый участок"),
            el("div", { class: "field-row add-control" },
                areaInput,
                el("button", { class: "btn primary", onclick: addArea }, "Добавить участок"),
            ),
        ),
        ...(areas.length
            ? areas.map(areaCard)
            : [el("p", { class: "empty-hint" }, "Справочник пуст. Добавьте первый участок.")]),
        el("p", { class: "empty-hint" },
            "Изменение справочника не меняет уже сохранённые отчёты — названия в них остаются."),
    );

    if (keepScroll) window.scrollTo(0, scrollY);
    if (focusAreaId !== null) unitInputs.get(focusAreaId)?.focus({ preventScroll: true });
}

// ---------- Группы обхода ----------

async function renderRoundGroups(opts = {}) {
    const { keepScroll = false, focusGroup = null } = opts;
    const scrollY = window.scrollY;
    if (!keepScroll) app.replaceChildren(el("p", { class: "empty-hint" }, "Загрузка…"));
    let groups = [];
    let areas = [];
    try {
        [groups, areas] = await Promise.all([
            api("/api/round-groups"),
            api("/api/areas"),
        ]);
        groups = groups || [];
        areas = areas || [];
    } catch (e) {
        toast(e.message, true);
    }

    async function saveGroup(group, newAreas, focus) {
        try {
            await api(`/api/round-groups/${group}`, {
                method: "PUT",
                body: JSON.stringify({ areas: newAreas }),
            });
            toast("Группа сохранена");
            renderRoundGroups({ keepScroll: true, focusGroup: focus ? group : null });
        } catch (e) {
            toast(e.message, true);
        }
    }

    // Подсказка при вводе — участки из справочника
    const datalist = el("datalist", { id: "areas-datalist" },
        areas.map(a => el("option", { value: a.name })));

    const groupInputs = new Map();

    function groupCard(g) {
        const input = el("input", { type: "text", list: "areas-datalist",
            placeholder: "Название участка" });
        groupInputs.set(g.group, input);
        function add() {
            const name = input.value.trim();
            if (!name) return;
            if (g.areas.includes(name)) {
                toast("Этот участок уже есть в группе", true);
                return;
            }
            saveGroup(g.group, [...g.areas, name], true);
        }
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") add(); });

        function remove(name) {
            if (!confirm(`Убрать участок «${name}» из группы ${g.group}?`)) return;
            saveGroup(g.group, g.areas.filter(a => a !== name));
        }

        return el("div", { class: "card" },
            el("h2", {}, `Группа ${g.group}`),
            g.areas.length
                ? el("table", { class: "data" }, el("tbody", {},
                    ...g.areas.map(name => el("tr", {},
                        el("td", {}, name),
                        el("td", { class: "row-del" },
                            el("button", { class: "del-row", title: "Убрать из группы",
                                onclick: () => remove(name) }, "✕")),
                    ))))
                : el("p", { class: "empty-hint" }, "В группе пока нет участков."),
            el("div", { class: "field-row add-control" },
                input,
                el("button", { class: "btn primary", onclick: add }, "Добавить"),
            ),
        );
    }

    app.replaceChildren(
        el("div", { class: "report-header" },
            el("h1", {}, "Группы обхода"),
            el("button", { class: "btn", onclick: () => history.length > 1 ? history.back() : location.hash = "#/" },
                "← Назад"),
        ),
        el("p", { class: "empty-hint" },
            "Все участки разбиты на 8 групп: одна группа обходится за дневную + ночную смену, " +
            "за месяц дежурный обходит все группы."),
        datalist,
        ...groups.map(groupCard),
    );

    if (keepScroll) window.scrollTo(0, scrollY);
    if (focusGroup !== null) groupInputs.get(focusGroup)?.focus({ preventScroll: true });
}

// ---------- Поиск происшествий ----------

async function renderSearch() {
    app.replaceChildren(el("p", { class: "empty-hint" }, "Загрузка…"));
    let controls = [];
    let areas = [];
    try {
        [controls, areas] = await Promise.all([
            api("/api/controls"),
            api("/api/areas"),
        ]);
        controls = controls || [];
        areas = areas || [];
    } catch (e) {
        toast(e.message, true);
    }

    const dateFrom = el("input", { type: "date" });
    const dateTo = el("input", { type: "date" });
    const areaSelect = el("select", {},
        el("option", { value: "" }, "— любой —"),
        areas.map(a => el("option", { value: a.name }, a.name)),
    );
    const controlSelect = el("select", {},
        el("option", { value: "" }, "— любой —"),
        controls.map(o => el("option", { value: o.name }, o.name)),
    );
    const wordInput = el("input", { type: "text",
        placeholder: "Слово в описании, оборудовании, SAP GRD" });

    const results = el("div", {});
    const PAGE_SIZE = 20;

    async function search(page = 1) {
        results.replaceChildren(el("p", { class: "empty-hint" }, "Поиск…"));
        const params = new URLSearchParams();
        if (dateFrom.value) params.set("date_from", dateFrom.value);
        if (dateTo.value) params.set("date_to", dateTo.value);
        if (areaSelect.value) params.set("area", areaSelect.value);
        if (controlSelect.value) params.set("control", controlSelect.value);
        if (wordInput.value.trim()) params.set("query", wordInput.value.trim());
        params.set("page", page);
        params.set("page_size", PAGE_SIZE);
        let data;
        try {
            data = await api(`/api/search/incidents?${params}`) || { items: [], total: 0, page: 1, pages: 1 };
        } catch (e) {
            toast(e.message, true);
            results.replaceChildren();
            return;
        }
        const found = data.items || [];
        if (!found.length) {
            results.replaceChildren(el("p", { class: "empty-hint" }, "Ничего не найдено."));
            return;
        }
        const pager = data.pages > 1
            ? el("div", { class: "pager" },
                el("button", { class: "btn", disabled: data.page <= 1 ? "" : null,
                    onclick: () => search(data.page - 1) }, "← Пред."),
                el("span", { class: "pager-info" }, `Страница ${data.page} из ${data.pages}`),
                el("button", { class: "btn", disabled: data.page >= data.pages ? "" : null,
                    onclick: () => search(data.page + 1) }, "След. →"),
            )
            : null;
        results.replaceChildren(el("div", { class: "card" },
            el("h2", {}, `Найдено происшествий: ${data.total}`),
            el("table", { class: "data search-results" },
                el("thead", {}, el("tr", {},
                    el("th", { style: "width:140px" }, "Дата / смена"),
                    el("th", { style: "width:110px" }, "Время"),
                    el("th", {}, "Участок"),
                    el("th", {}, "Оборудование"),
                    el("th", { style: "width:38%" }, "Описание"),
                    el("th", {}, "Дежурный"),
                )),
                el("tbody", {}, found.map(i => el("tr", {},
                    el("td", {},
                        el("a", { href: `#/shift/${i.date}/${i.shift_type}` }, fmtDot(i.date)),
                        " ",
                        el("span", { class: `badge ${i.shift_type}` }, i.shift_type === "day" ? "день" : "ночь"),
                    ),
                    el("td", {}, [i.time_from, i.time_to].filter(Boolean).join(" – ")),
                    el("td", {}, i.area),
                    el("td", {}, i.equipment),
                    el("td", {}, i.description),
                    el("td", {}, i.duty_control),
                ))),
            ),
            pager,
        ));
        results.scrollIntoView({ block: "start" });
    }
    wordInput.addEventListener("keydown", (e) => { if (e.key === "Enter") search(1); });

    app.replaceChildren(
        el("div", { class: "report-header" },
            el("h1", {}, "Поиск происшествий"),
            el("button", { class: "btn", onclick: () => history.length > 1 ? history.back() : location.hash = "#/" },
                "← Назад"),
        ),
        el("div", { class: "card" },
            el("div", { class: "form-grid" },
                el("div", { class: "field" }, el("label", {}, "Период с"), dateFrom),
                el("div", { class: "field" }, el("label", {}, "Период по"), dateTo),
                el("div", { class: "field" }, el("label", {}, "Участок"), areaSelect),
                el("div", { class: "field" }, el("label", {}, "Дежурный"), controlSelect),
            ),
            el("div", { class: "field-row add-control" },
                wordInput,
                el("button", { class: "btn primary", onclick: () => search(1) }, "Найти"),
            ),
        ),
        results,
    );
}

// ---------- Отчёт по смене ----------

const INCIDENT_COLS = [
    { key: "time_range", label: "Время с / по", type: "timerange", width: "200px" },
    { key: "area", label: "Участок", width: "170px" },
    { key: "equipment", label: "Оборудование", width: "170px" },
    // Без width — гибкая колонка, забирает всё свободное место таблицы
    { key: "description", label: "Неисправность/Принятые меры по устранению/Проводимые работы/Замечания",
      type: "textarea" },
    { key: "part_code", label: "SAP GRD", width: "110px" },
    { key: "quantity", label: "Кол-во", width: "80px" },
];

function blankRow(cols) {
    const row = {};
    for (const c of cols) {
        if (c.type === "timerange") { row.time_from = ""; row.time_to = ""; }
        else row[c.key] = c.type === "select" ? c.options[0] : "";
    }
    return row;
}

// Тип смены открытого отчёта — для проверки, что время попадает в смену
let activeShiftType = "day";

function timeInShift(t) {
    if (!t) return true;
    const [start, end] = SHIFT_TIMES[activeShiftType];
    // Ночная смена переходит через полночь: допустимо 20:30–23:59 и 00:00–08:30
    return activeShiftType === "day" ? (t >= start && t <= end) : (t >= start || t <= end);
}

// Текстовое поле с маской ЧЧ:ММ вместо type="time": браузер показывает
// нативное поле в 12- или 24-часовом формате по локали ОС, а формат
// должен быть всегда 24-часовым
// Общий datalist с временами текущей смены (шаг 30 минут) — выпадающий
// список подсказок у полей времени
let timeOptionsShift = null;
function ensureTimeOptions() {
    let dl = document.getElementById("time-options");
    if (!dl) {
        dl = el("datalist", { id: "time-options" });
        document.body.append(dl);
    }
    if (timeOptionsShift === activeShiftType) return;
    timeOptionsShift = activeShiftType;
    let [h, m] = SHIFT_TIMES[activeShiftType][0].split(":").map(Number);
    const opts = [];
    for (let i = 0; i <= 144; i++) { // 12 часов смены с шагом 5 минут
        opts.push(el("option", {
            value: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
        }));
        m += 5;
        if (m >= 60) { m -= 60; h = (h + 1) % 24; }
    }
    dl.replaceChildren(...opts);
}

function timeInput(value) {
    ensureTimeOptions();
    const input = el("input", {
        type: "text", value, inputmode: "numeric", list: "time-options",
        placeholder: "чч:мм", maxlength: "5", autocomplete: "off",
    });
    input.addEventListener("input", () => {
        let d = input.value.replace(/\D/g, "").slice(0, 4);
        if (d.length >= 3) d = d.slice(0, 2) + ":" + d.slice(2);
        input.value = d;
    });
    return input;
}

function validTime(t) {
    if (!/^\d{2}:\d{2}$/.test(t)) return false;
    return Number(t.slice(0, 2)) < 24 && Number(t.slice(3)) < 60;
}

function bindTimeLimit(input) {
    const check = () => {
        const t = input.value;
        const bad = t !== "" && (!validTime(t) || !timeInShift(t));
        input.classList.toggle("invalid", bad);
        input.title = bad
            ? `Время в формате чч:мм в пределах смены (${SHIFT_TIMES[activeShiftType][0]}–${SHIFT_TIMES[activeShiftType][1]})`
            : "";
    };
    input.addEventListener("input", check);
    check();
    return input;
}

function durationText(from, to) {
    if (!/^\d{2}:\d{2}$/.test(from) || !/^\d{2}:\d{2}$/.test(to)) return "";
    const [fh, fm] = from.split(":").map(Number);
    const [th, tm] = to.split(":").map(Number);
    let mins = th * 60 + tm - (fh * 60 + fm);
    if (mins < 0) mins += 24 * 60; // переход через полночь
    return `Длительность: ${Math.floor(mins / 60)} ч ${String(mins % 60).padStart(2, "0")} мин`;
}

async function renderReport(iso, shiftType) {
    app.replaceChildren(el("p", { class: "empty-hint" }, "Загрузка…"));

    let data = null;
    let controls = [];
    let areas = [];
    let groups = [];
    try {
        [data, controls, areas, groups] = await Promise.all([
            api(`/api/shifts/${iso}/${shiftType}`),
            api("/api/controls"),
            api("/api/areas"),
            api("/api/round-groups"),
        ]);
    } catch (e) {
        toast(e.message, true);
    }
    const groupNum = roundGroupFor(iso, shiftType);
    const isNew = data === null;
    if (isNew) {
        data = {
            duty_control: "",
            designation: designationFor(iso, shiftType),
            rounds: [],
            incidents: [],
        };
        // В новом отчёте показываем только участки текущей группы обхода
        const group = (groups || []).find(g => g.group === groupNum);
        for (const name of group?.areas || []) {
            const area = (areas || []).find(a => a.name === name);
            if (area && area.equipment.length) {
                for (const u of area.equipment) {
                    data.rounds.push({ area: name, equipment: u.name, status: "", comment: "" });
                }
            } else {
                // Участка нет в справочнике или он без оборудования — оставляем
                // строку, чтобы обход по нему всё равно можно было отметить
                data.rounds.push({ area: name, equipment: "", status: "", comment: "" });
            }
        }
    }
    // Время смены фиксированное и не редактируется
    activeShiftType = shiftType;
    data.start_time = SHIFT_TIMES[shiftType][0];
    data.end_time = SHIFT_TIMES[shiftType][1];

    const controlField = () => {
        const names = (controls || []).map(o => o.name);
        if (data.duty_control && !names.includes(data.duty_control)) names.unshift(data.duty_control);
        const select = el("select", {},
            el("option", { value: "", selected: data.duty_control ? null : "" }, "— не выбран —"),
            names.map(n => el("option", { value: n, selected: data.duty_control === n ? "" : null }, n)),
        );
        select.addEventListener("change", () => data.duty_control = select.value);
        return el("div", { class: "field" },
            el("label", {}, "Дежурный"),
            el("div", { class: "field-row" },
                select,
                currentUser?.is_admin
                    ? el("button", { class: "btn small", title: "Список дежурных ведётся на отдельной странице",
                        onclick: () => location.hash = "#/controls" }, "...")
                    : null,
            ),
        );
    };

    const fixedField = (label, value) => el("div", { class: "field" },
        el("label", {}, label),
        el("input", { type: "text", value, readonly: "", tabindex: "-1", class: "readonly" }),
    );

    // Смена определяется графиком автоматически и не редактируется
    const designationField = () => {
        data.designation = designationFor(iso, shiftType);
        return el("div", { class: "field" },
            el("label", {}, "Смена"),
            el("input", { type: "text", value: data.designation, readonly: "",
                tabindex: "-1", class: "readonly" }),
        );
    };

    // Поле «Участок» в происшествиях — выпадающий список из справочника участков
    const incidentCols = INCIDENT_COLS.map(c => c.key === "area"
        ? { ...c, type: "select", options: ["", ...(areas || []).map(a => a.name)],
            emptyLabel: "— не выбран —" }
        : c);

    const sections = [
        renderRoundsSection(data.rounds, areas || [], groupNum),
        renderSection({ title: "Происшествия за смену", items: data.incidents, cols: incidentCols,
            addLabel: "Добавить происшествие", empty: "Происшествий не зафиксировано." }),
    ];

    async function save() {
        if (document.querySelector("input.invalid")) {
            toast(`Есть время вне пределов смены (${SHIFT_TIMES[shiftType][0]}–${SHIFT_TIMES[shiftType][1]}) — исправьте выделенные поля`, true);
            return;
        }
        try {
            await api(`/api/shifts/${iso}/${shiftType}`, {
                method: "PUT",
                body: JSON.stringify(data),
            });
            toast("Отчёт сохранён");
        } catch (e) {
            toast(e.message, true);
        }
    }

    async function removeShift() {
        if (!confirm("Удалить отчёт по этой смене целиком?")) return;
        try {
            await api(`/api/shifts/${iso}/${shiftType}`, { method: "DELETE" });
            toast("Отчёт удалён");
            location.hash = `#/calendar/${iso.slice(0, 4)}`;
        } catch (e) {
            toast(e.message, true);
        }
    }

    app.replaceChildren(
        el("div", { class: "report-header" },
            el("div", { class: "report-title" },
                `Отчёт за ${fmtDate(iso)}`,
                el("span", { class: `badge ${shiftType}` }, SHIFT_NAMES[shiftType]),
            ),
            el("div", { class: "field-row" },
                el("button", { class: "btn", onclick: () => printReport(data, iso, shiftType, areas || []) }, "🖨 Печать"),
                el("button", { class: "btn", onclick: () => location.hash = `#/calendar/${iso.slice(0, 4)}` },
                    "← К календарю"),
            ),
        ),
        el("div", { class: "card" },
            el("h2", {}, "Данные смены"),
            el("div", { class: "form-grid" },
                fixedField("Начало смены", data.start_time),
                fixedField("Конец смены", data.end_time),
                controlField(),
                designationField(),
            ),
        ),
        ...sections,
        el("div", { class: "save-bar" },
            isNew ? null : el("button", { class: "btn danger", onclick: removeShift }, "Удалить отчёт"),
            el("button", { class: "btn primary", onclick: save }, "Сохранить отчёт"),
        ),
    );
}

// ---------- Конструктор макета печати ----------

// Прежнее хранилище макета в браузере; используется только для одноразового
// переноса в БД
const PRINT_LAYOUT_KEY = "printLayout.v2";
const PAGE_W = 297, PAGE_H = 210;   // лист A4 в альбомной ориентации, мм

// Сохранённый макет с сервера; null — макет ещё не сохранялся. Если в БД
// пусто, а в localStorage остался макет со старых версий — переносим его в БД.
async function fetchSavedPrintLayout() {
    let saved = await api("/api/print-layout");
    if (saved) {
        localStorage.removeItem(PRINT_LAYOUT_KEY);
        return saved;
    }
    try {
        saved = JSON.parse(localStorage.getItem(PRINT_LAYOUT_KEY));
    } catch { saved = null; }
    // Сохранять макет в БД могут только администраторы
    if (saved && currentUser?.is_admin) {
        await api("/api/print-layout", { method: "PUT", body: JSON.stringify(saved) });
        localStorage.removeItem(PRINT_LAYOUT_KEY);
    }
    return saved;
}

function savePrintLayout(layout) {
    api("/api/print-layout", { method: "PUT", body: JSON.stringify(layout) })
        .catch(e => toast(e.message, true));
}
const PX_PER_MM = 96 / 25.4;

function printElLabel(id) {
    const names = {
        head: "Шапка смены",
        caption: "Заголовок «Осмотр оборудования»",
        incidents: "Происшествия за смену",
        signatures: "Подписи сдал/принял",
    };
    return names[id] || `Участок «${id.slice(5)}»`;
}

function clampNum(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
function snapMm(v) { return Math.round(v * 2) / 2; }

// Ширины столбцов хранятся в процентах от ширины блока; null — гибкий
// столбец, забирающий остаток
function resolveCols(cols) {
    const fixed = cols.reduce((s, c) => s + (c || 0), 0);
    const flexCount = cols.filter(c => c === null).length || 1;
    const flexW = Math.max(2, (100 - fixed) / flexCount);
    return cols.map(c => c === null ? flexW : c);
}

function colgroupFor(cols) {
    return el("colgroup", {}, cols.map(c =>
        el("col", c === null ? {} : { style: `width:${c}%` })));
}

// Макет по умолчанию повторяет исходный дизайн: шапка и обход на листе 1
// (4 колонки, слева поле 22 мм под дырокол), происшествия и подписи на
// листе 2. areaSizes: [{name, count}] — участки и число строк оборудования
function defaultPrintLayout(areaSizes) {
    const elements = {
        head: { page: 0, x: 22, y: 8, w: 110, fs: 8, cols: [18, null, null, 18] },
        caption: { page: 0, x: 22, y: 24, w: 90, fs: 8 },
        incidents: { page: 1, x: 12, y: 8, w: 263, fs: 8.5,
            cols: [6.5, 5.9, 5.9, 10, 10, null, 10, 3.8] },
        signatures: { page: 1, x: 12, y: 192, w: 263, fs: 9 },
    };
    const colX = [22, 88, 154, 220], colW = 64;
    const topY = 29, bottomY = 202;
    let col = 0, y = topY;
    for (const a of areaSizes) {
        const h = 4 + Math.max(a.count, 1) * 3.2;   // оценка высоты таблицы
        if (y + h > bottomY && col < colX.length - 1) { col++; y = topY; }
        elements["area:" + a.name] = { page: 0, x: colX[col], y, w: colW, fs: 6.5,
            cols: [46, 9, null] };
        y += h + 1;
    }
    return { version: 2, pageCount: 2, elements };
}

// Сохранённый макет дополняется по умолчанию: новые участки получают
// стандартное место, удалённые из справочника — пропадают
function loadPrintLayout(areaSizes, saved) {
    const def = defaultPrintLayout(areaSizes);
    if (!saved || saved.version !== 2 || typeof saved.elements !== "object") return def;
    const pc = saved.pageCount | 0;
    const layout = { version: 2, pageCount: pc >= 1 && pc <= 8 ? pc : 2, elements: {} };
    for (const [id, d] of Object.entries(def.elements)) {
        const s = saved.elements[id];
        if (s && Number.isFinite(s.x) && Number.isFinite(s.y)) {
            const cols = Array.isArray(s.cols) && d.cols && s.cols.length === d.cols.length
                ? s.cols : d.cols;
            layout.elements[id] = { ...d, ...s, cols };
        } else {
            layout.elements[id] = d;
        }
    }
    return layout;
}

// Предельная высота таблицы происшествий (вместе с шапкой): до блока
// подписей (если он ниже на том же листе) или до низа листа
function incidentsMaxMm(layout) {
    const inc = layout.elements.incidents, sig = layout.elements.signatures;
    const limit = (sig && sig.page === inc.page && sig.y > inc.y) ? sig.y : PAGE_H - 6;
    return Math.max(0, limit - inc.y);
}

async function renderPrintLayout() {
    app.replaceChildren(el("p", { class: "empty-hint" }, "Загрузка…"));
    let areasDir = [], savedLayout = null;
    try {
        areasDir = await api("/api/areas") || [];
        savedLayout = await fetchSavedPrintLayout();
    } catch (e) {
        toast(e.message, true);
    }

    // Образец для предпросмотра: реальный справочник, пустой отчёт за сегодня
    const today = new Date();
    const iso = isoDate(today.getFullYear(), today.getMonth(), today.getDate());
    const sample = {
        duty_control: "Иванов И.И.",
        designation: designationFor(iso, "day"),
        start_time: SHIFT_TIMES.day[0],
        end_time: SHIFT_TIMES.day[1],
        rounds: [],
        incidents: [],
    };
    const blocks = computeAreaBlocks(sample, areasDir);
    const areaSizes = blocks.map(b => ({ name: b.area, count: b.rows.length }));
    let layout = loadPrintLayout(areaSizes, savedLayout);

    const persist = () => savePrintLayout(layout);

    const selectedIds = new Set();
    const scale = Math.min(1, ((app.clientWidth || 1160) - 10) / (PAGE_W * PX_PER_MM));
    const mmPerPx = 1 / (scale * PX_PER_MM);

    // --- Панель выбранного блока ---
    const fsInput = el("input", { type: "number", min: "4", max: "24", step: "0.5" });
    const wInput = el("input", { type: "number", min: "15", max: String(PAGE_W), step: "1" });
    const selLabel = el("span", { class: "layout-sel-name" }, "—");
    const selectedCfgs = () =>
        [...selectedIds].map(id => layout.elements[id]).filter(Boolean);
    fsInput.addEventListener("change", () => {
        const cfgs = selectedCfgs();
        if (!cfgs.length) return;
        for (const cfg of cfgs) cfg.fs = clampNum(Number(fsInput.value) || cfg.fs, 4, 24);
        persist();
        redraw();
        toast("Макет сохранён");
    });
    wInput.addEventListener("change", () => {
        const cfgs = selectedCfgs();
        if (!cfgs.length) return;
        for (const cfg of cfgs) cfg.w = clampNum(Number(wInput.value) || cfg.w, 15, PAGE_W);
        persist();
        redraw();
        toast("Макет сохранён");
    });
    const toolbar = el("div", { class: "card layout-toolbar" },
        el("span", { class: "layout-sel-cap" }, "Блок:"),
        selLabel,
        el("label", {}, "Шрифт, pt"), fsInput,
        el("label", {}, "Ширина, мм"), wInput,
    );

    function updateToolbar() {
        const cfgs = selectedCfgs();
        if (!cfgs.length) {
            selLabel.textContent = "щёлкните по блоку на листе";
        } else if (cfgs.length === 1) {
            selLabel.textContent = printElLabel([...selectedIds][0]);
        } else {
            selLabel.textContent = `выбрано блоков: ${cfgs.length}`;
        }
        selLabel.classList.toggle("muted", !cfgs.length);
        // При разных значениях у выбранных блоков поле остаётся пустым
        const uniform = (key) =>
            cfgs.length && cfgs.every(c => c[key] === cfgs[0][key]) ? cfgs[0][key] : "";
        fsInput.value = uniform("fs");
        wInput.value = uniform("w");
        fsInput.disabled = wInput.disabled = !cfgs.length;
    }

    // --- Листы ---
    const pagesWrap = el("div", { class: "layout-pages-abs" });
    const canvases = [];
    const wrapById = new Map();

    function buildPages() {
        canvases.length = 0;
        const items = [];
        for (let p = 0; p < layout.pageCount; p++) {
            const canvas = el("div", { class: "p-scope layout-canvas" });
            canvas.style.width = PAGE_W + "mm";
            canvas.style.height = PAGE_H + "mm";
            canvas.style.transform = `scale(${scale})`;
            canvas.addEventListener("pointerdown", (e) => {
                if (e.target === canvas) startLasso(e, canvas, p);
            });
            canvases.push(canvas);
            const frame = el("div", { class: "layout-canvas-frame" }, canvas);
            frame.style.width = PAGE_W * PX_PER_MM * scale + "px";
            frame.style.height = PAGE_H * PX_PER_MM * scale + "px";
            items.push(el("div", {},
                el("div", { class: "layout-page-label" }, `Лист ${p + 1}`),
                frame));
        }
        pagesWrap.replaceChildren(...items);
    }

    function buildContent(id, cfg) {
        if (id === "head") return buildPrintHead(sample, iso, "day", cfg.cols);
        if (id === "caption") return el("div", { class: "p-rounds-caption" }, "Осмотр оборудования");
        if (id === "incidents") {
            return buildPrintIncidents(sample, iso, "day", cfg, incidentsMaxMm(layout));
        }
        if (id === "signatures") return buildPrintSignatures(sample, iso, "day");
        const block = blocks.find(b => "area:" + b.area === id);
        return block ? buildAreaTable(block, cfg.cols) : null;
    }

    function applyCols(wrap, cols) {
        const colEls = wrap.querySelectorAll("colgroup col");
        cols.forEach((c, i) => {
            if (c !== null && colEls[i]) colEls[i].style.width = c + "%";
        });
        const res = resolveCols(cols);
        let cum = 0;
        wrap.querySelectorAll(".col-div").forEach((d, i) => {
            cum += res[i];
            d.style.left = cum + "%";
        });
    }

    function elementNode(id, cfg) {
        const content = buildContent(id, cfg);
        if (!content) return null;
        const wrap = el("div", { class: "p-el" + (selectedIds.has(id) ? " selected" : "") }, content);
        wrap.style.left = cfg.x + "mm";
        wrap.style.top = cfg.y + "mm";
        wrap.style.width = cfg.w + "mm";
        wrap.style.fontSize = cfg.fs + "pt";
        wrap.append(el("div", { class: "el-resize", title: "Потянуть — изменить ширину блока" }));
        if (cfg.cols) {
            const res = resolveCols(cfg.cols);
            let cum = 0;
            for (let i = 0; i < cfg.cols.length - 1; i++) {
                cum += res[i];
                wrap.append(el("div", { class: "col-div", "data-i": String(i),
                    style: `left:${cum}%`, title: "Потянуть — изменить ширину столбца" }));
            }
        }
        wrap.addEventListener("pointerdown", (e) => startDrag(e, id, wrap));
        return wrap;
    }

    function redraw() {
        wrapById.clear();
        canvases.forEach((canvas, p) => {
            const nodes = [];
            for (const [id, cfg] of Object.entries(layout.elements)) {
                if (Math.min(cfg.page, layout.pageCount - 1) !== p) continue;
                const node = elementNode(id, cfg);
                if (node) { nodes.push(node); wrapById.set(id, node); }
            }
            canvas.replaceChildren(...nodes);
        });
        updateToolbar();
    }

    // --- Перетаскивание: перенос (в т.ч. группой), ширина блока, границы столбцов ---
    function startDrag(e, id, wrap) {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        e.preventDefault();
        const multiKey = e.ctrlKey || e.metaKey || e.shiftKey;
        if (multiKey) {
            // Ctrl/Shift+щелчок добавляет блок к выделению или убирает из него
            if (selectedIds.has(id)) selectedIds.delete(id);
            else selectedIds.add(id);
            redraw();
            return;
        }
        if (!selectedIds.has(id)) {
            selectedIds.clear();
            selectedIds.add(id);
            redraw();
            return;
        }
        const cfg = layout.elements[id];
        const mode = e.target.classList.contains("el-resize") ? "resize"
            : e.target.classList.contains("col-div") ? "col" : "move";
        const colIdx = mode === "col" ? Number(e.target.dataset.i) : -1;
        const startX = e.clientX, startY = e.clientY;
        const startW = cfg.w;
        const startCols = cfg.cols ? [...cfg.cols] : null;
        // Стартовые позиции всех выделенных блоков — двигаются вместе
        const group = [...selectedIds]
            .map(gid => ({ cfg: layout.elements[gid], wrap: wrapById.get(gid) }))
            .filter(g => g.cfg && g.wrap)
            .map(g => ({ ...g, x0: g.cfg.x, y0: g.cfg.y }));
        // За какую точку блока схватили (мм от его левого верхнего угла)
        const rect = wrap.getBoundingClientRect();
        const grabX = (startX - rect.left) * mmPerPx;
        const grabY = (startY - rect.top) * mmPerPx;
        let moved = false;

        function onMove(ev) {
            const dx = (ev.clientX - startX) * mmPerPx;
            const dy = (ev.clientY - startY) * mmPerPx;
            if (!moved && Math.abs(dx) < 0.4 && Math.abs(dy) < 0.4) return;
            moved = true;
            if (mode === "move" && group.length > 1) {
                // Групповой перенос: общий сдвиг в пределах своих листов
                for (const g of group) {
                    g.cfg.x = snapMm(clampNum(g.x0 + dx, 0, PAGE_W - 5));
                    g.cfg.y = snapMm(clampNum(g.y0 + dy, 0, PAGE_H - 5));
                    g.wrap.style.left = g.cfg.x + "mm";
                    g.wrap.style.top = g.cfg.y + "mm";
                }
            } else if (mode === "move") {
                // Лист, над которым курсор: блок можно утащить на другой лист
                let page = cfg.page;
                canvases.forEach((c, p) => {
                    const r = c.getBoundingClientRect();
                    if (ev.clientX >= r.left && ev.clientX <= r.right
                        && ev.clientY >= r.top && ev.clientY <= r.bottom) page = p;
                });
                const r = canvases[page].getBoundingClientRect();
                cfg.page = page;
                cfg.x = snapMm(clampNum((ev.clientX - r.left) * mmPerPx - grabX, 0, PAGE_W - 5));
                cfg.y = snapMm(clampNum((ev.clientY - r.top) * mmPerPx - grabY, 0, PAGE_H - 5));
                if (wrap.parentElement !== canvases[page]) canvases[page].append(wrap);
                wrap.style.left = cfg.x + "mm";
                wrap.style.top = cfg.y + "mm";
            } else if (mode === "resize") {
                cfg.w = snapMm(clampNum(startW + dx, 15, PAGE_W - cfg.x));
                wrap.style.width = cfg.w + "mm";
            } else {
                const dPct = dx / cfg.w * 100;
                const cols = [...startCols];
                if (cols[colIdx] !== null) {
                    cols[colIdx] = clampNum(startCols[colIdx] + dPct, 2, 90);
                } else if (cols[colIdx + 1] !== null) {
                    cols[colIdx + 1] = clampNum(startCols[colIdx + 1] - dPct, 2, 90);
                }
                cfg.cols = cols;
                applyCols(wrap, cols);
            }
        }
        function onUp() {
            document.removeEventListener("pointermove", onMove);
            if (moved) {
                persist();
                toast("Макет сохранён");
            }
            redraw();
        }
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp, { once: true });
    }

    // --- Рамка выделения: протянуть по пустому месту листа, чтобы выбрать несколько блоков ---
    function startLasso(e, canvas, page) {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        e.preventDefault();
        const keep = e.ctrlKey || e.metaKey || e.shiftKey;
        const r = canvas.getBoundingClientRect();
        const x0 = (e.clientX - r.left) * mmPerPx;
        const y0 = (e.clientY - r.top) * mmPerPx;
        const box = el("div", { class: "layout-lasso" });
        let moved = false;

        function onMove(ev) {
            const x1 = clampNum((ev.clientX - r.left) * mmPerPx, 0, PAGE_W);
            const y1 = clampNum((ev.clientY - r.top) * mmPerPx, 0, PAGE_H);
            if (!moved && Math.abs(x1 - x0) < 0.8 && Math.abs(y1 - y0) < 0.8) return;
            if (!moved) { moved = true; canvas.append(box); }
            const L = Math.min(x0, x1), T = Math.min(y0, y1);
            const W = Math.abs(x1 - x0), H = Math.abs(y1 - y0);
            box.style.left = L + "mm";
            box.style.top = T + "mm";
            box.style.width = W + "mm";
            box.style.height = H + "mm";
            if (!keep) selectedIds.clear();
            for (const [id, cfg] of Object.entries(layout.elements)) {
                if (Math.min(cfg.page, layout.pageCount - 1) !== page) continue;
                const wrap = wrapById.get(id);
                const h = wrap ? wrap.getBoundingClientRect().height * mmPerPx : 5;
                if (cfg.x < L + W && cfg.x + cfg.w > L && cfg.y < T + H && cfg.y + h > T) {
                    selectedIds.add(id);
                }
            }
            for (const [id, wrap] of wrapById) {
                wrap.classList.toggle("selected", selectedIds.has(id));
            }
        }
        function onUp() {
            document.removeEventListener("pointermove", onMove);
            box.remove();
            if (!moved && !keep) selectedIds.clear();
            redraw();
        }
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp, { once: true });
    }

    // --- Управление листами и сброс ---
    function addPage() {
        if (layout.pageCount >= 8) return;
        layout.pageCount++;
        persist();
        buildPages();
        redraw();
    }

    function removePage() {
        if (layout.pageCount <= 1) return;
        const last = layout.pageCount - 1;
        if (Object.values(layout.elements).some(c => Math.min(c.page, last) === last)) {
            toast("На последнем листе есть блоки — сначала перетащите их", true);
            return;
        }
        layout.pageCount--;
        persist();
        buildPages();
        redraw();
    }

    function reset() {
        if (!confirm("Вернуть макет печати к виду по умолчанию?")) return;
        api("/api/print-layout", { method: "DELETE" }).catch(e => toast(e.message, true));
        layout = loadPrintLayout(areaSizes, null);
        selectedIds.clear();
        buildPages();
        redraw();
        toast("Макет сброшен по умолчанию");
    }

    app.replaceChildren(
        el("div", { class: "report-header" },
            el("h1", {}, "Конструктор макета печати"),
            el("div", { class: "field-row" },
                el("button", { class: "btn", onclick: addPage }, "+ Лист"),
                el("button", { class: "btn", onclick: removePage }, "− Лист"),
                el("button", { class: "btn", onclick: reset }, "Сбросить"),
                el("button", { class: "btn", onclick: () => history.length > 1 ? history.back() : location.hash = "#/" },
                    "← Назад"),
            ),
        ),
        el("p", { class: "empty-hint" },
            "Щёлкните блок, чтобы выбрать его, затем перетаскивайте мышкой по листу и между " +
            "листами. Ctrl+щелчок добавляет блок к выделению, рамка по пустому месту листа " +
            "выделяет несколько блоков сразу — выделенные двигаются вместе. Правый край блока " +
            "меняет его ширину, границы между столбцами — ширину столбцов; шрифт и точная " +
            "ширина — на панели ниже. Макет сохраняется автоматически и применяется при печати " +
            "любого отчёта."),
        toolbar,
        pagesWrap,
    );
    buildPages();
    redraw();
}

// ---------- Печать отчёта ----------

const NBSP = " ";

function fmtDot(iso) {
    const [y, m, d] = iso.split("-");
    return `${d}.${m}.${y}`;
}

function isoPlusDays(iso, days) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// Дата передачи смены — дата её окончания: ночная заканчивается утром следующего дня
function handoverDate(iso, shiftType) {
    return fmtDot(shiftType === "night" ? isoPlusDays(iso, 1) : iso);
}

// Дата события внутри смены: у ночной смены времена после полуночи — следующий день
function eventDate(iso, shiftType, time) {
    if (shiftType === "night" && time && time <= "12:00") return fmtDot(isoPlusDays(iso, 1));
    return fmtDot(iso);
}

function minutesBetween(from, to) {
    if (!/^\d{2}:\d{2}$/.test(from) || !/^\d{2}:\d{2}$/.test(to)) return null;
    const [fh, fm] = from.split(":").map(Number);
    const [th, tm] = to.split(":").map(Number);
    let mins = th * 60 + tm - (fh * 60 + fm);
    if (mins < 0) mins += 24 * 60; // переход через полночь
    return mins;
}

function fmtMins(mins) {
    return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")}`;
}

// Подпись одной стороны: «сдал/принял», линия с фамилией, дата, время
function printSignature(label, name, date) {
    return el("div", { class: "p-sig" },
        el("span", { class: "p-sig-label" }, label),
        el("span", { class: "p-sig-line p-sig-name" }, name || NBSP),
        el("span", { class: "p-sig-line p-sig-autograph" }, NBSP),
        el("span", { class: "p-sig-cap" }, "Дата"),
        el("span", { class: "p-sig-line" }, date),
        el("span", { class: "p-sig-cap" }, "Время"),
        el("span", { class: "p-sig-line p-sig-time" }, NBSP),
    );
}

// --- Блок «Шапка смены» ---
function buildPrintHead(data, iso, shiftType, cols) {
    return el("table", { class: "p-table p-head" },
        colgroupFor(cols),
        el("tr", {},
            el("td", { class: "p-b" }, "ДАТА"),
            el("td", { class: "p-c" }, fmtDot(iso)),
            el("td", { class: "p-c" }, shiftType === "day" ? "смена день" : "смена ночь"),
            el("td", { class: "p-b p-c" }, "Смена"),
        ),
        el("tr", {},
            el("td", { class: "p-b" }, "Дежурный"),
            el("td", { class: "p-c p-hl" }, data.duty_control || ""),
            el("td", { class: "p-c" }, `${data.start_time}-${data.end_time}`),
            el("td", { class: "p-c p-hl" }, data.designation || ""),
        ),
    );
}

// --- Блоки участков «Осмотр оборудования» ---
// На печать идут ВСЕ участки справочника; подсвечиваются те, что были в
// обходе этой смены. Оценки/замечания берутся из отчёта.
function computeAreaBlocks(data, areasDir) {
    const roundKey = (a, e) => `${a}||${e}`;
    const roundByKey = new Map(data.rounds.map(r => [roundKey(r.area, r.equipment), r]));
    const visitedAreas = new Set(data.rounds.map(r => r.area));

    const areaBlocks = (areasDir || []).map(a => {
        const rows = a.equipment.map(u =>
            roundByKey.get(roundKey(a.name, u.name))
            || { equipment: u.name, status: "", comment: "" });
        // Оборудование из обхода, которого нет в справочнике
        for (const r of data.rounds) {
            if (r.area === a.name && !a.equipment.some(u => u.name === r.equipment)) rows.push(r);
        }
        return { area: a.name, visited: visitedAreas.has(a.name), rows };
    });
    // Участки из обхода, которых нет в справочнике
    for (const r of data.rounds) {
        if (!areaBlocks.some(b => b.area === r.area)) {
            areaBlocks.push({
                area: r.area, visited: true,
                rows: data.rounds.filter(x => x.area === r.area),
            });
        }
    }
    return areaBlocks;
}

// Таблица одного участка; ширины через <col> — шапка с colspan не даёт
// задать их ячейками
function buildAreaTable(g, cols) {
    return el("table", { class: "p-table p-area" + (g.visited ? " p-visited" : "") },
        colgroupFor(cols),
        el("tr", {},
            el("th", { class: "p-area-name", colspan: "2" }, g.area || "Без участка"),
            el("th", { class: "p-area-remark" }, "замечания"),
        ),
        (g.rows.length ? g.rows : [{ equipment: "", status: "", comment: "" }]).map(r =>
            el("tr", { class: r.status ? `p-st-${r.status}` : "" },
                el("td", { class: "p-eq" }, r.equipment || NBSP),
                el("td", { class: "p-st" },
                    r.status === "ok" ? "ok" : r.status === "not_ok" ? "не ok" : NBSP),
                el("td", { class: "p-re" }, r.comment || NBSP),
            )),
    );
}

// --- Блок «Происшествия за смену» ---
// maxMm: предельная высота таблицы — пустые строки добивают её до этой
// высоты по фактическому замеру (обычно до блока подписей, см. incidentsMaxMm)
function buildPrintIncidents(data, iso, shiftType, cfg, maxMm) {
    // Каждое происшествие — две строки: начало/конец, под ними —
    // объединённая ячейка с длительностью; остальные ячейки на обе строки
    const incRows = data.incidents.flatMap(i => {
        const mins = minutesBetween(i.time_from, i.time_to);
        return [
            el("tr", {},
                el("td", { class: "p-c", rowspan: "2" }, i.time_from ? eventDate(iso, shiftType, i.time_from) : fmtDot(iso)),
                el("td", { class: "p-c p-half" }, i.time_from || NBSP),
                el("td", { class: "p-c p-half" }, i.time_to || NBSP),
                el("td", { class: "p-c", rowspan: "2" }, i.area || NBSP),
                el("td", { class: "p-c", rowspan: "2" }, i.equipment || NBSP),
                el("td", { rowspan: "2" }, i.description || NBSP),
                el("td", { rowspan: "2" }, i.part_code || NBSP),
                el("td", { class: "p-c", rowspan: "2" }, i.quantity || NBSP),
            ),
            el("tr", {},
                el("td", { class: "p-c p-half", colspan: "2" }, mins === null ? NBSP : fmtMins(mins)),
            ),
        ];
    });
    // При table-layout:fixed ширины колонок задаются через <col>,
    // потому что первая строка шапки содержит объединённые ячейки
    const incTable = el("table", { class: "p-table p-inc" },
        colgroupFor(cfg.cols),
        el("tr", {},
            el("th", { rowspan: "2" }, "Дата"),
            el("th", { colspan: "2" }, "Время"),
            el("th", { rowspan: "2" }, "Участок"),
            el("th", { rowspan: "2" }, "Оборудование"),
            el("th", { rowspan: "2" },
                "Неисправность/Принятые меры по устранению/Проводимые работы/Замечания"),
            el("th", { rowspan: "2" }, "Запчасть SAP наименование/номер"),
            el("th", { rowspan: "2" }, "Кол-во"),
        ),
        el("tr", {},
            el("th", { class: "p-w-time" }, "начало"),
            el("th", { class: "p-w-time" }, "конец"),
        ),
        incRows,
    );
    // Таблица подгоняется под maxMm по фактическому замеру во временном
    // скрытом контейнере с шириной и шрифтом блока: происшествия, не
    // влезающие до подписей, убираются с конца (парами строк), а остаток
    // места добивается пустыми строками по одной
    const inner = el("div", {}, incTable);
    inner.style.width = cfg.w + "mm";
    inner.style.fontSize = cfg.fs + "pt";
    const probe = el("div", { class: "p-scope" }, inner);
    probe.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden";
    document.body.append(probe);
    const maxPx = maxMm * PX_PER_MM;
    const fits = () => incTable.getBoundingClientRect().height <= maxPx;
    while (!fits() && incRows.length >= 2) {
        incRows.pop().remove();
        incRows.pop().remove();
    }
    const emptyRow = () =>
        el("tr", {}, Array.from({ length: 8 }, () => el("td", {}, NBSP)));
    if (!incRows.length) incTable.append(emptyRow());
    for (let k = 0; k < 200; k++) {
        const row = emptyRow();
        incTable.append(row);
        if (!fits()) {
            row.remove();
            break;
        }
    }
    probe.remove();
    inner.replaceChildren();
    return incTable;
}

// --- Блок «Подписи сдал/принял» ---
function buildPrintSignatures(data, iso, shiftType) {
    const hd = handoverDate(iso, shiftType);
    return el("div", { class: "p-sig-row" },
        printSignature("Смену и ключи сдал", data.duty_control, hd),
        printSignature("Смену и ключи принял", "", hd),
    );
}

// Обёртка блока: абсолютная позиция на листе (мм) и размер шрифта (pt)
function placePrintEl(node, cfg) {
    const wrap = el("div", { class: "p-el" }, node);
    wrap.style.left = cfg.x + "mm";
    wrap.style.top = cfg.y + "mm";
    wrap.style.width = cfg.w + "mm";
    wrap.style.fontSize = cfg.fs + "pt";
    return wrap;
}

async function printReport(data, iso, shiftType, areasDir) {
    document.getElementById("print-view")?.remove();

    // Позиции, размеры и шрифты блоков настраиваются в конструкторе
    // («Макет печати») и хранятся в БД; пустые листы не печатаются
    let saved = null;
    try {
        saved = await fetchSavedPrintLayout();
    } catch (e) {
        toast(e.message, true);
    }
    const blocks = computeAreaBlocks(data, areasDir);
    const layout = loadPrintLayout(blocks.map(b => ({ name: b.area, count: b.rows.length })), saved);
    const els = layout.elements;

    const nodes = {
        head: buildPrintHead(data, iso, shiftType, els.head.cols),
        caption: el("div", { class: "p-rounds-caption" }, "Осмотр оборудования"),
        incidents: buildPrintIncidents(data, iso, shiftType, els.incidents,
            incidentsMaxMm(layout)),
        signatures: buildPrintSignatures(data, iso, shiftType),
    };
    for (const b of blocks) {
        const cfg = els["area:" + b.area];
        if (cfg) nodes["area:" + b.area] = buildAreaTable(b, cfg.cols);
    }

    const pages = Array.from({ length: layout.pageCount }, () => []);
    for (const [id, node] of Object.entries(nodes)) {
        const cfg = els[id];
        if (!cfg) continue;
        pages[Math.min(cfg.page, pages.length - 1)].push(placePrintEl(node, cfg));
    }

    const view = el("div", { id: "print-view", class: "p-scope" },
        pages.filter(p => p.length).map(p => el("div", { class: "print-page" }, p)));
    document.body.append(view);
    window.addEventListener("afterprint", () => view.remove(), { once: true });
    window.print();
}

function renderRoundsSection(items, areas, groupNum) {
    // Подсказки из справочника: «участок → оборудование» → описание
    const hints = new Map();
    for (const a of areas) {
        for (const u of a.equipment) {
            if (u.description) hints.set(`${a.name}||${u.name}`, u.description);
        }
    }
    const body = el("tbody");
    const table = el("table", { class: "data rounds" },
        el("thead", {}, el("tr", {},
            el("th", {}, "Оборудование"),
            el("th", { style: "width:130px" }, "Оценка"),
            el("th", { style: "width:45%" }, "Замечание"),
            el("th", { style: "width:34px" }),
        )),
        body,
    );
    const emptyHint = el("p", { class: "empty-hint" },
        "Список обхода пуст. Добавьте участок — его оборудование появится в таблице.");

    function statusToggle(row) {
        const okBtn = el("button", { class: "status-btn ok" }, "ОК");
        const badBtn = el("button", { class: "status-btn bad" }, "Не ОК");
        const update = () => {
            okBtn.classList.toggle("active", row.status === "ok");
            badBtn.classList.toggle("active", row.status === "not_ok");
        };
        okBtn.addEventListener("click", () => { row.status = row.status === "ok" ? "" : "ok"; update(); });
        badBtn.addEventListener("click", () => { row.status = row.status === "not_ok" ? "" : "not_ok"; update(); });
        update();
        return el("div", { class: "status-toggle" }, okBtn, badBtn);
    }

    function refresh() {
        const rows = [];
        let prevArea = null;
        items.forEach((row, idx) => {
            if (row.area !== prevArea) {
                prevArea = row.area;
                rows.push(el("tr", { class: "area-row" },
                    el("td", { colspan: "3" }, row.area || "Без участка"),
                    el("td", { class: "row-del" },
                        el("button", { class: "del-row", title: "Удалить участок из обхода",
                            onclick: () => {
                                for (let i = items.length - 1; i >= 0; i--) {
                                    if (items[i].area === row.area) items.splice(i, 1);
                                }
                                refresh();
                            } }, "✕")),
                ));
            }
            const comment = el("input", { type: "text", value: row.comment,
                placeholder: "Замечаний нет" });
            comment.addEventListener("input", () => row.comment = comment.value);
            const hint = hints.get(`${row.area}||${row.equipment}`);
            rows.push(el("tr", {},
                el("td", { class: "unit-name" }, row.equipment || "Обход участка", hint ? hintIcon(hint) : null),
                el("td", {}, statusToggle(row)),
                el("td", {}, comment),
                el("td", { class: "row-del" },
                    el("button", { class: "del-row", title: "Удалить строку",
                        onclick: () => { items.splice(idx, 1); refresh(); } }, "✕")),
            ));
        });
        body.replaceChildren(...rows);
        table.style.display = items.length ? "" : "none";
        emptyHint.style.display = items.length ? "none" : "";
    }
    refresh();

    const select = el("select", {},
        el("option", { value: "" }, "— выберите участок —"),
        areas.map(a => el("option", { value: a.name }, a.name)),
    );

    function addArea() {
        const area = areas.find(a => a.name === select.value);
        if (!area) return;
        if (items.some(r => r.area === area.name)) {
            toast("Этот участок уже добавлен в обход", true);
            return;
        }
        if (!area.equipment.length) {
            toast("На участке нет оборудования — добавьте его в справочнике", true);
            return;
        }
        for (const u of area.equipment) {
            items.push({ area: area.name, equipment: u.name, status: "", comment: "" });
        }
        select.value = "";
        refresh();
    }

    return el("div", { class: "card" },
        el("h2", {}, `Оборудование на обходе — группа ${groupNum}`,
            hintIcon("Состав групп настраивается на странице «Группы обхода».")),
        table,
        emptyHint,
        el("div", { class: "field-row add-area-row" },
            select,
            el("button", { class: "btn small", onclick: addArea }, "+ Добавить участок"),
        ),
    );
}

function renderSection({ title, items, cols, addLabel, empty }) {
    const body = el("tbody");
    const table = el("table", { class: "data" },
        el("thead", {}, el("tr", {},
            cols.map(c => el("th", { style: c.width ? `width:${c.width}` : null }, c.label)),
            el("th", { style: "width:34px" }),
        )),
        body,
    );
    const emptyHint = el("p", { class: "empty-hint" }, empty);

    function cellInput(row, col) {
        let input;
        if (col.type === "timerange") {
            const from = bindTimeLimit(timeInput(row.time_from));
            const to = bindTimeLimit(timeInput(row.time_to));
            const dur = el("div", { class: "duration" }, durationText(row.time_from, row.time_to));
            const update = () => dur.textContent = durationText(row.time_from, row.time_to);
            from.addEventListener("input", () => { row.time_from = from.value; update(); });
            to.addEventListener("input", () => { row.time_to = to.value; update(); });
            return el("div", {},
                el("div", { class: "field-row" }, from, to),
                dur,
            );
        }
        if (col.type === "select") {
            // Сохранённое значение, которого уже нет в справочнике, не теряем
            const options = [...col.options];
            if (row[col.key] && !options.includes(row[col.key])) options.unshift(row[col.key]);
            input = el("select", {}, options.map(o =>
                el("option", { value: o, selected: row[col.key] === o ? "" : null },
                    o === "" ? (col.emptyLabel || "—") : o)));
            input.addEventListener("change", () => row[col.key] = input.value);
        } else if (col.type === "textarea") {
            input = el("textarea", { rows: "3" }, row[col.key]);
            input.addEventListener("input", () => row[col.key] = input.value);
        } else {
            input = col.type === "time"
                ? bindTimeLimit(timeInput(row[col.key]))
                : el("input", { type: col.type || "text", value: row[col.key] });
            input.addEventListener("input", () => row[col.key] = input.value);
        }
        return input;
    }

    function refresh() {
        body.replaceChildren(...items.map((row, idx) =>
            el("tr", {},
                cols.map(col => el("td", {}, cellInput(row, col))),
                el("td", { class: "row-del" },
                    el("button", { class: "del-row", title: "Удалить строку",
                        onclick: () => { items.splice(idx, 1); refresh(); } }, "✕")),
            )
        ));
        table.style.display = items.length ? "" : "none";
        emptyHint.style.display = items.length ? "none" : "";
    }
    refresh();

    return el("div", { class: "card" },
        el("h2", {}, title),
        table,
        emptyHint,
        el("button", { class: "btn small add-btn",
            onclick: () => { items.push(blankRow(cols)); refresh(); } }, `+ ${addLabel}`),
    );
}

// При загрузке восстанавливаем сессию из куки; без неё api() покажет форму входа
(async function boot() {
    try {
        currentUser = await api("/api/auth/me");
    } catch {
        return; // renderLogin уже показан из api()
    }
    route();
})();
