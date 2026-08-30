# Change Log

All notable changes to the **Laravel Gohu** extension are documented in this file.

## [0.0.5]

### Added
- **Project-wide N+1 scan.** The new **Detection N+1** button runs a **static, heuristic** scan of the whole project (controllers, actions, services, ...) and lists every likely N+1 with its file, line, model, relation and a suggested `with(...)` fix, plus a confidence level. Findings are clickable cards that jump to the exact line, shown in a closeable overlay with a header chip that reopens them without re-scanning.

## [0.0.4]

### Added
- **Query performance analysis.** Every run now reports a `queries` block with the total number of SQL statements executed (`count`) and the pure database time (`db_time`).
- **N+1 detection (runtime).** When the same SQL statement repeats within a single run, Laravel Gohu flags it as a potential N+1 problem (`detected_N+1`), including the offending query and how many times it ran.
- New setting `laravelTools.nPlusOneThreshold` (default `3`) to tune when a repeated query is flagged.
- PHP syntax highlighting in the editor.

### Changed
- Renamed `query_time` to `total_time` (total wall-clock time of the snippet) and split out `db_time` (database-only time) inside the new `queries` block.

## [0.0.3]

### Fixed
- The webview HTML is now packaged with the extension, fixing a startup error on the published build.

## [0.0.2]

- Server connection status indicator and query execution against the selected Laravel project.

## [0.0.1]

- Initial release.
