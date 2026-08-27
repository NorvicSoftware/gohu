# Laravel Gohu

**Run Eloquent & Query Builder queries against your Laravel app — without leaving VS Code.**

Laravel Gohu opens a panel with a code editor on the left and a live result view on the right. Write a snippet like `User::query()->latest()->get()`, hit **Run**, and instantly see the result as JSON — row count, query time, connection details and all. It's a fast, focused way to inspect data, test logic and debug queries while you stay in your editor.

---

## Features

- 🧩 **Eloquent & Query Builder** — run any snippet, from `User::get()` to complex `DB::table(...)` chains.
- ⚡ **Instant JSON results** — total count, execution time, database and connection name, plus the first rows of data.
- 🔎 **Query analysis & N+1 detection** — see how many SQL statements ran and the pure database time, and get an automatic warning when the same query repeats (a classic N+1 problem).
- 🕵️ **Project-wide N+1 scan** — the **Detection N+1** button runs a **static, heuristic** scan of your whole project (controllers, actions, services, ...) and lists every likely N+1 with its file, line, model, relation and a suggested `with(...)` fix. Each finding is clickable and jumps to the exact line.
- ✍️ **Monaco editor** — the same editor that powers VS Code, with PHP syntax highlighting and a draggable split between code and results.
- 🟢 **Server status indicator** — a colored dot tells you at a glance whether PHP boots, Laravel loads and the database is reachable. Click it for the full details.
- 🐘 **Any PHP stack** — works with Laravel Herd, Valet or XAMPP; just point it at your PHP binary.
- 🔤 **Short model names** — `User::get()` resolves just like in an interactive `php artisan tinker`, no full namespaces required.
- 🛡️ **Safe execution** — your code is run through Artisan Tinker via a temporary runner; it never gets pasted into a shell command.

## Requirements

- A **Laravel project** (the folder must contain an `artisan` file).
- **PHP** available on your machine (via Herd, Valet, XAMPP, or your `PATH`).
- **`laravel/tinker`** installed in the project (included by default in new Laravel apps).

## Getting started

1. Open the command palette (`Cmd/Ctrl` + `Shift` + `P`) and run **Laravel Gohu**.
2. Click the **folder** button and select your Laravel project. The path is remembered for next time.
3. Check the **status dot** in the result header — green means you're connected.
4. Write an Eloquent or Query Builder statement in the editor and press **▶ Run**.

### Example

```php
$users = User::query()->where('active', 1)->get();
```

Result:

```json
{
    "success": true,
    "total": 160,
    "total_time": "12.94 ms",
    "database": "my_app",
    "connection_name": "mysql",
    "queries": { "detected_N+1": false, "count": 1, "db_time": "5.80 ms" },
    "data": [
        { "id": 1, "name": "Ada Lovelace", "email": "ada@example.com" }
    ]
}
```

The last expression of your snippet is the result. You can also write an explicit `return`. `data` is capped at the first **20 rows** to keep the view fast, while `total` always reflects the full count.

- **`total_time`** is the whole snippet's wall-clock time; **`queries.db_time`** is the database-only time.
- When the same SQL statement repeats (by default 3+ times), `queries.detected_N+1` turns `true` and adds an `n_plus_one` object with the offending query — a quick way to catch and fix N+1 problems.

## Server status

The dot in the result header reflects your environment for the selected project:

| Indicator | Meaning |
|-----------|---------|
| 🟢 Online | PHP boots, Laravel loads and the database connection responds. |
| 🔴 Offline | No project selected, `artisan` is missing, PHP can't run, or the database isn't reachable. |
| 🟡 Checking | A verification is in progress. |

Click the dot to open a popover with the PHP version, connection, driver and database name — or the exact error when something is off — plus a **Re-check** button.

## Project-wide N+1 scan

The **Detection N+1** button scans your entire project for N+1 query patterns — **without running your app**. It's a **static, heuristic** analysis: it parses your code (via `nikic/php-parser`, already available through Tinker), builds a map of your models' relationships, and flags the classic N+1 shape — a collection query **without** `->with(...)`, iterated in a loop, that accesses a relation inside:

```php
$posts = Post::all();               // no eager loading
foreach ($posts as $post) {
    echo $post->author->name;       // ← relation accessed per row → N+1
}
```

Each finding shows the **file, line, model, relation** and a suggested `with(...)` fix, with a **confidence** level (`high` when the relation is confirmed on the model, `medium` when it's pattern-only). Findings are cards you can click to jump straight to the line, and a header chip lets you reopen the list anytime.

Because it's static, it reports **likely** N+1s (it can't be 100% certain without executing the query). Treat the results as strong candidates — and confirm any of them instantly by running that query in the panel, where the real query count is measured.

## Extension settings

| Setting | Default | Description |
|---------|---------|-------------|
| `laravelTools.projectPath` | `""` | Path to the Laravel project. Set automatically when you pick a folder. |
| `laravelTools.phpBinary` | `php` | PHP binary used to run Artisan. Uses your `PATH` by default (Herd/Valet). On Windows + XAMPP, set the full path, e.g. `C:\xampp\php\php.exe`. |
| `laravelTools.nPlusOneThreshold` | `3` | How many times the same SQL query must repeat within a run before it is flagged as a potential N+1. |

## Commands

| Command | Title |
|---------|-------|
| `gohu.openPanel` | Laravel Gohu |

## How it works

When you run a snippet, Laravel Gohu writes a small temporary PHP runner and executes it with `php artisan tinker`. Running inside Tinker gives you class-alias resolution (so short model names work) and a fully booted framework. The runner uses PHP's tokenizer to reliably capture the value of your last expression — even when it contains closures, strings or comments — normalizes it (Builder → `->get()`, Collection, Model, array or scalar) and returns clean JSON.

## Known limitations

- `data` shows the first 20 rows only; `total` is the complete count. A `->get()` still loads the full result set into memory.
- Multi-statement snippets should end with the expression you want back, or an explicit `return`.

## Release notes

See [CHANGELOG.md](CHANGELOG.md).
